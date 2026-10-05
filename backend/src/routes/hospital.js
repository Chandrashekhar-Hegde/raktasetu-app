import express from 'express';
import { query } from '../db.js';
import { withAuthorizationContext } from '../db/authorizedTransaction.js';
import { respondIfDatabaseDown } from '../db/computeQuota.js';
import { authenticate, requireActiveAccount, requireApprovedHospital, requireRole } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { completeDonation } from '../services/donationService.js';
import { completeRedemption } from '../services/redemptionService.js';
import { bloodRequestPushPayload, sendPushToUser } from '../services/pushDelivery.js';
import { publishToUser } from '../realtime/publisher.js';
import {
  donationCompletionSchema,
  donorSearchQuerySchema,
  hospitalLocationSchema,
  hospitalRequestQuerySchema,
  metricsRangeSchema,
  requestCreateSchema,
  requestIdParamsSchema,
  requestStatusSchema,
  validate,
  verifyRedemptionSchema,
} from '../validation/schemas.js';
import { authorize } from '../auth/policy.js';
import { getMetricsSummary } from '../services/metricsService.js';
import { logAudit } from '../utils/compliance.js';

const router = express.Router();

/**
 * Blood compatibility matrix: which blood groups can DONATE to a given recipient group.
 * Keep identical to donor.js and frontend/src/theme.js (guarded by compatibility-matrix.test.js).
 */
export const GIVERS = {
  'O-':  ['O-'],
  'O+':  ['O-', 'O+'],
  'A-':  ['O-', 'A-'],
  'A+':  ['O-', 'O+', 'A-', 'A+'],
  'B-':  ['O-', 'B-'],
  'B+':  ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
};

const RARE = ['O-', 'AB-'];

/**
 * Haversine distance in km between two lat/lng points
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Generate a reference code for donation verification
 */
function generateRefCode() {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `RS-${timestamp}${random}`;
}

// All hospital routes require hospital role
router.use(authenticate, requireActiveAccount, requireRole('hospital'), requireApprovedHospital);

/**
 * GET /api/hospital/dashboard
 * Live board with active requests + stats
 */
router.get('/dashboard', async (req, res) => {
  try {
    const hospitalResult = await query(
      'SELECT id, latitude IS NOT NULL AND longitude IS NOT NULL AS location_set FROM hospitals WHERE user_id = $1',
      [req.user.id],
    );
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital profile not found' });
    }
    const hospitalId = hospitalResult.rows[0].id;
    const locationSet = hospitalResult.rows[0].location_set;

    // Active requests for this hospital
    const requestsResult = await query(
      `SELECT br.*,
        (SELECT COUNT(*) FROM donor_responses dr WHERE dr.request_id = br.id AND dr.status = 'accepted') AS accepted_count,
        (SELECT COUNT(*) FROM donor_responses dr WHERE dr.request_id = br.id AND dr.status = 'arrived') AS arrived_count,
        (SELECT COUNT(*) FROM notifications n
          WHERE n.type = 'blood_request'
            AND (n.data->>'request_id') = br.id::text) AS donors_pinged,
        (SELECT COALESCE(SUM(units), 0) FROM donations d WHERE d.request_id = br.id AND d.verified_at IS NOT NULL) AS filled_units
       FROM blood_requests br
       WHERE br.hospital_id = $1 AND br.status IN ('open', 'filled')
       ORDER BY br.created_at DESC`,
      [hospitalId]
    );

    // Stats
    const statsResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'open') AS active_requests,
        COUNT(*) FILTER (WHERE status = 'filled') AS filled_requests,
        COALESCE(SUM(units_needed), 0) AS total_units_needed
       FROM blood_requests WHERE hospital_id = $1`,
      [hospitalId]
    );

    // Recent donations (last 30 days)
    const donationsResult = await query(
      `SELECT d.*, u.name AS donor_name
       FROM donations d
       JOIN users u ON u.id = d.donor_id
       WHERE d.hospital_id = $1 AND d.verified_at > NOW() - INTERVAL '30 days'
       ORDER BY d.verified_at DESC`,
      [hospitalId]
    );

    return res.json({
      success: true,
      data: {
        hospital_id: hospitalId,
        location_set: locationSet,
        stats: statsResult.rows[0],
        active_requests: requestsResult.rows,
        recent_donations: donationsResult.rows,
        // Frontend compatibility alias
        requests: requestsResult.rows
      }
    });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Hospital dashboard error:', err?.code || '', err?.message);
    return res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

/**
 * POST /api/hospital/requests
 * Create a new blood request
 */
/**
 * PATCH /api/hospital/location
 * Set the hospital's coordinates (needed before any donor can be matched).
 */
router.patch('/location', validate(hospitalLocationSchema), async (req, res) => {
  const result = await query(
    'UPDATE hospitals SET latitude = $1, longitude = $2, updated_at = NOW() WHERE user_id = $3 RETURNING id',
    [req.body.latitude, req.body.longitude, req.user.id],
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, error: { code: 'HOSPITAL_NOT_FOUND', message: 'Hospital profile not found' } });
  }
  await logAudit({ userId: req.user.id, action: 'HOSPITAL_LOCATION_SET', resourceType: 'hospital', resourceId: result.rows[0].id, req });
  return res.json({ success: true, data: { location_set: true } });
});

router.post('/requests', validate(requestCreateSchema), async (req, res) => {
  try {
    // zod (requestCreateSchema) already bounds every field.
    const { blood_group, units_needed, urgency, radius_km, notes, needed_by } = req.body;
    const isRare = RARE.includes(blood_group);
    const effectiveRadius = isRare ? 25 : radius_km;

    // Request + its notifications commit together: a retry after a failure can't double-ping donors.
    const created = await withAuthorizationContext(
      { userId: req.user.id, role: 'hospital', hospitalId: req.user.hospital_id },
      async (client) => {
        const hospitalResult = await client.query(
          'SELECT id, name, latitude, longitude FROM hospitals WHERE user_id = $1',
          [req.user.id],
        );
        const hospital = hospitalResult.rows[0];
        if (!hospital) return { error: [404, 'HOSPITAL_NOT_FOUND', 'Hospital profile not found'] };
        if (hospital.latitude == null || hospital.longitude == null) {
          // Without coordinates no donor can be matched; say so instead of silently notifying nobody.
          return { error: [409, 'HOSPITAL_LOCATION_MISSING', 'Set your hospital location before creating requests'] };
        }

        const requestId = uuidv4();
        const inserted = await client.query(
          `INSERT INTO blood_requests (id, hospital_id, blood_group, units_needed, urgency, status, radius_km, latitude, longitude, notes, ref_code, needed_by, escalation_level, created_at)
           VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, $12, NOW())
           RETURNING *`,
          [
            requestId, hospital.id, blood_group, units_needed, urgency,
            effectiveRadius, hospital.latitude, hospital.longitude,
            notes || null, generateRefCode(), needed_by ? new Date(needed_by) : null, isRare ? 1 : 0,
          ],
        );

        const donorsResult = await client.query(
          'SELECT id, latitude, longitude FROM hospital_visible_on_call_donors($1)',
          [GIVERS[blood_group]],
        );
        const donorIds = donorsResult.rows
          .filter((d) => haversine(
            parseFloat(hospital.latitude), parseFloat(hospital.longitude),
            parseFloat(d.latitude), parseFloat(d.longitude),
          ) <= effectiveRadius)
          .map((d) => d.id);

        const title = `${urgency.toUpperCase()}: Blood needed at ${hospital.name}`;
        const body = `${blood_group} blood needed${urgency === 'scheduled' ? '' : ' urgently'}. ${units_needed} unit(s) required.`;
        const data = { request_id: requestId, hospital_id: hospital.id, blood_group, urgency };
        await client.query(
          `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
           SELECT uuid_generate_v4(), donor_id, 'blood_request', $2, $3, $4, false, NOW()
           FROM unnest($1::uuid[]) AS donor_id`,
          [donorIds, title, body, JSON.stringify(data)],
        );
        return { request: inserted.rows[0], hospitalName: hospital.name, donorIds };
      },
    );
    if (created.error) {
      const [status, code, message] = created.error;
      return res.status(status).json({ success: false, error: { code, message } });
    }

    const { request, hospitalName, donorIds } = created;
    res.status(201).json({ success: true, data: { request, donors_notified: donorIds.length } });

    // Delivery after commit and after responding: slow or failing pushes never block or undo the request.
    const pushPayload = bloodRequestPushPayload({
      requestId: request.id, bloodGroup: blood_group, urgency, unitsNeeded: units_needed, hospitalName,
    });
    const results = await Promise.allSettled(donorIds.map((id) => sendPushToUser(id, pushPayload)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) console.error(`Push delivery failed for ${failed}/${donorIds.length} donors on request ${request.id}`);
    for (const id of donorIds) {
      publishToUser(id, 'blood_request', {
        request_id: request.id, blood_group, urgency, units_needed, hospital_name: hospitalName,
      });
    }
  } catch (err) {
    if (res.headersSent) return;
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Create request error:', err.code || '', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create request' });
  }
});

/**
 * GET /api/hospital/requests
 * Search requests by ref code (for QR/manual verification)
 */
router.get('/requests', validate(hospitalRequestQuerySchema, 'query'), async (req, res) => {
  try {
    const hospitalResult = await query('SELECT id FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital profile not found' });
    }
    const hospitalId = hospitalResult.rows[0].id;
    const { ref } = req.query;

    if (ref) {
      const requestResult = await query(
        `SELECT br.*,
                dr.donor_id, dr.status AS donor_status, dr.responded_at,
                hospital_donor_blood_group(dr.donor_id) AS donor_blood_group
         FROM blood_requests br
         LEFT JOIN donor_responses dr ON dr.request_id = br.id AND dr.status = 'arrived'
         WHERE br.ref_code = $1 AND br.hospital_id = $2
         ORDER BY dr.responded_at DESC LIMIT 1`,
        [ref, hospitalId],
      );
      if (requestResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }
      const row = requestResult.rows[0];
      return res.json({
        success: true,
        data: {
          donor: row.donor_id ? {
            id: row.donor_id,
            blood_group: row.donor_blood_group,
            ref_code: row.ref_code,
            request_id: row.id,
            responded_at: row.responded_at,
          } : null,
        },
      });
    }

    // No ref provided — list all requests
    const requestsResult = await query(
      `SELECT br.* FROM blood_requests br WHERE br.hospital_id = $1
       ORDER BY br.created_at DESC,br.id DESC LIMIT $2`,
      [hospitalId, req.query.limit]
    );
    return res.json({ success: true, data: { requests: requestsResult.rows } });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Search request error:', err?.code || '', err?.message);
    return res.status(500).json({ success: false, error: 'Failed to search requests' });
  }
});

/**
 * GET /api/hospital/requests/:id
 * Request detail with donor responses
 */
router.get('/requests/:id', validate(requestIdParamsSchema, 'params'), async (req, res) => {
  try {
    const hospitalResult = await query('SELECT id FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital profile not found' });
    }
    const hospitalId = hospitalResult.rows[0].id;
    const { id } = req.params;

    const requestResult = await query(
      `SELECT br.* FROM blood_requests br WHERE br.id = $1 AND br.hospital_id = $2`,
      [id, hospitalId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    const request = requestResult.rows[0];

    // Responses with blood group only (no donor PII via users JOIN)
    const responsesResult = await query(
      `SELECT dr.*, hospital_donor_blood_group(dr.donor_id) AS donor_blood_group
       FROM donor_responses dr
       WHERE dr.request_id = $1
       ORDER BY dr.responded_at DESC`,
      [id],
    );

    return res.json({
      success: true,
      data: { request, responses: responsesResult.rows }
    });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Request detail error:', err?.code || '', err?.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch request detail' });
  }
});

/**
 * PATCH /api/hospital/requests/:id
 * Update request status (open, filled, closed)
 */
router.patch('/requests/:id', validate(requestIdParamsSchema, 'params'), validate(requestStatusSchema), async (req, res) => {
  try {
    const hospitalResult = await query('SELECT id FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital profile not found' });
    }
    const hospitalId = hospitalResult.rows[0].id;
    const { id } = req.params;
    const { status } = req.body;

    if (!['open', 'filled', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be open, filled, or closed' });
    }

    const updates = ['status = $1'];
    const values = [status, id, hospitalId];

    if (status === 'filled') {
      updates.push('filled_at = NOW()');
    }

    const result = await query(
      `UPDATE blood_requests SET ${updates.join(', ')} WHERE id = $2 AND hospital_id = $3 RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    return res.json({ success: true, data: { request: result.rows[0] } });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Update request error:', err?.code || '', err?.message);
    return res.status(500).json({ success: false, error: 'Failed to update request' });
  }
});

/**
 * POST /api/hospital/verify-donation
 * Verify donor arrival (QR scan or manual ref code)
 */
router.post('/verify-donation', validate(donationCompletionSchema), async (req, res) => {
  try {
    const donation = await completeDonation({
      actor: req.user,
      requestId: req.body.request_id,
      donorId: req.body.donor_id,
      units: req.body.units,
      req,
    });
    return res.json({ success: true, data: { donation } });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Verify donation error:', err?.code || '', err?.message);
    return res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'DONATION_COMPLETION_FAILED', message: err.message || 'Failed to verify donation' },
    });
  }
});

/**
 * POST /api/hospital/verify-redemption
 * Complete a credit redemption via one-time RSC- code (hashed lookup).
 */
router.post('/verify-redemption', validate(verifyRedemptionSchema), async (req, res) => {
  try {
    const redemption = await completeRedemption({
      actor: req.user,
      code: req.body.code,
      req,
    });
    return res.json({ success: true, data: { redemption } });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Verify redemption error:', err?.code || '', err?.message);
    return res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'REDEMPTION_COMPLETION_FAILED',
        message: err.message || 'Failed to verify redemption',
      },
    });
  }
});

/**
 * GET /api/hospital/donors
 * Nearby on-call donors
 */
router.get('/donors', validate(donorSearchQuerySchema, 'query'), async (req, res) => {
  try {
    const hospitalResult = await query('SELECT id, latitude, longitude FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital profile not found' });
    }
    const hospital = hospitalResult.rows[0];

    const { radius, blood_group, limit } = req.query;
    const groups = blood_group
      ? [blood_group]
      : ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
    const donorsResult = await query(
      'SELECT id, blood_group, latitude, longitude FROM hospital_visible_on_call_donors($1)',
      [groups],
    );

    const donors = donorsResult.rows
      .map((d) => {
        const dist = haversine(
          parseFloat(hospital.latitude), parseFloat(hospital.longitude),
          parseFloat(d.latitude), parseFloat(d.longitude),
        );
        return {
          id: d.id,
          blood_group: d.blood_group,
          is_on_call: true,
          distance_km: Math.round(dist * 10) / 10,
        };
      })
      .filter((d) => d.distance_km <= parseInt(radius, 10))
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, Math.min(limit || 50, 100));

    return res.json({ success: true, data: { donors } });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Nearby donors error:', err?.code || '', err?.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch nearby donors' });
  }
});

/**
 * GET /api/hospital/metrics/summary
 * Pilot aggregates for the caller's hospital only (no donor PII).
 */
router.get('/metrics/summary', validate(metricsRangeSchema, 'query'), async (req, res) => {
  const hospitalId = req.user.hospital_id;
  const decision = authorize({
    actor: req.user,
    action: 'hospital.metrics.read',
    resource: { hospital_id: hospitalId },
  });
  if (!decision.allowed) {
    return res.status(decision.status).json({
      success: false,
      error: { code: decision.code, message: 'Access denied' },
    });
  }
  try {
    const data = await getMetricsSummary({
      from: req.query.from,
      to: req.query.to,
      hospitalId,
    });
    await logAudit({
      userId: req.user.id,
      action: 'HOSPITAL_VIEW_METRICS_SUMMARY',
      resourceType: 'hospital',
      resourceId: hospitalId,
      details: { from: data.from, to: data.to },
      req,
    });
    return res.json({ success: true, data });
  } catch (error) {
    if (respondIfDatabaseDown(res, error)) return;
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: { code: error.code || 'METRICS_FAILED', message: error.message || 'Metrics failed' },
    });
  }
});

export default router;

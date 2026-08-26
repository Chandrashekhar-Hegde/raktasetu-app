import express from 'express';
import { query } from '../db.js';
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
    const hospitalResult = await query('SELECT id FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital profile not found' });
    }
    const hospitalId = hospitalResult.rows[0].id;

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
        stats: statsResult.rows[0],
        active_requests: requestsResult.rows,
        recent_donations: donationsResult.rows,
        // Frontend compatibility alias
        requests: requestsResult.rows
      }
    });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Hospital dashboard error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

/**
 * POST /api/hospital/requests
 * Create a new blood request
 */
router.post('/requests', validate(requestCreateSchema), async (req, res) => {
  try {
    const hospitalResult = await query('SELECT id, latitude, longitude FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital profile not found' });
    }
    const hospital = hospitalResult.rows[0];

    const { blood_group, units_needed, urgency, radius_km, notes, needed_by } = req.body;

    if (!blood_group || units_needed === undefined || units_needed === null || !urgency) {
      return res.status(400).json({ success: false, error: 'blood_group, units_needed, and urgency are required' });
    }

    const unitsNum = parseInt(units_needed, 10);
    if (isNaN(unitsNum) || unitsNum < 1 || unitsNum > 50) {
      return res.status(400).json({ success: false, error: 'units_needed must be an integer between 1 and 50' });
    }

    if (!['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].includes(blood_group)) {
      return res.status(400).json({ success: false, error: 'Invalid blood group' });
    }

    if (!['scheduled', 'urgent', 'critical'].includes(urgency)) {
      return res.status(400).json({ success: false, error: 'urgency must be scheduled, urgent, or critical' });
    }

    const radiusNum = radius_km !== undefined ? parseInt(radius_km, 10) : 10;
    if (isNaN(radiusNum) || radiusNum < 1 || radiusNum > 100) {
      return res.status(400).json({ success: false, error: 'radius_km must be between 1 and 100' });
    }

    const requestId = uuidv4();
    const refCode = generateRefCode();
    const isRare = RARE.includes(blood_group);
    const effectiveRadius = isRare ? 25 : radiusNum;

    const escalationLevel = isRare ? 1 : 0;
    const result = await query(
      `INSERT INTO blood_requests (id, hospital_id, blood_group, units_needed, urgency, status, radius_km, latitude, longitude, notes, ref_code, needed_by, escalation_level, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       RETURNING *`,
      [
        requestId, hospital.id, blood_group, unitsNum, urgency, 'open',
        effectiveRadius, hospital.latitude, hospital.longitude,
        notes || null, refCode, needed_by ? new Date(needed_by) : null, escalationLevel,
      ]
    );

    const request = result.rows[0];

    // Find compatible on-call donors within radius (minimal fields via SECURITY DEFINER)
    const compatibleDonors = GIVERS[blood_group];
    const donorsResult = await query(
      'SELECT id, blood_group, latitude, longitude FROM hospital_visible_on_call_donors($1)',
      [compatibleDonors],
    );

    const nearbyDonors = donorsResult.rows
      .map((d) => {
        const dist = haversine(
          parseFloat(hospital.latitude), parseFloat(hospital.longitude),
          parseFloat(d.latitude), parseFloat(d.longitude),
        );
        return { id: d.id, blood_group: d.blood_group, distance_km: Math.round(dist * 10) / 10 };
      })
      .filter((d) => d.distance_km <= effectiveRadius);

    const hospitalName = req.user.name || 'Hospital';
    const pushPayload = bloodRequestPushPayload({
      requestId,
      bloodGroup: blood_group,
      urgency,
      unitsNeeded: units_needed,
      hospitalName,
    });

    // Persist notification, push, and optional socket — push failures must not fail the request
    for (const donor of nearbyDonors) {
      const notifId = uuidv4();
      const title = `${urgency.toUpperCase()}: Blood needed at ${hospitalName}`;
      const body = `${blood_group} blood needed urgently. ${units_needed} unit(s) required.`;
      const data = { request_id: requestId, hospital_id: hospital.id, blood_group, urgency };
      await query(
        `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [notifId, donor.id, 'blood_request', title, body, JSON.stringify(data), false],
      );
      try {
        await sendPushToUser(donor.id, pushPayload);
      } catch (pushErr) {
        console.error('Push delivery failed for donor notification:', pushErr.message);
      }
      publishToUser(donor.id, 'blood_request', {
        request_id: requestId,
        blood_group,
        urgency,
        units_needed,
        hospital_name: hospitalName,
      });
    }

    return res.status(201).json({
      success: true,
      data: { request, donors_notified: nearbyDonors.length },
    });
  } catch (err) {
    if (respondIfDatabaseDown(res, err)) return;
    console.error('Create request error:', err);
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
    console.error('Search request error:', err);
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
    console.error('Request detail error:', err);
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
    console.error('Update request error:', err);
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
    console.error('Verify donation error:', err);
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
    console.error('Verify redemption error:', err);
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
    console.error('Nearby donors error:', err);
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

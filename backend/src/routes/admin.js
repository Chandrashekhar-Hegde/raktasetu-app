import express from 'express';
import { query } from '../db.js';
import { withAuthorizationContext } from '../db/authorizedTransaction.js';
import { respondIfDatabaseDown } from '../db/computeQuota.js';
import { authenticate, requireActiveAccount, requireRole } from '../middleware/auth.js';
import { disconnectUser } from '../realtime/publisher.js';
import {
  getMetricsSummary,
  getRareMetrics,
  getResponseTimes,
  responseTimesToCsv,
} from '../services/metricsService.js';
import { logAudit } from '../utils/compliance.js';
import {
  decodeCursor,
  encodeCursor,
  hospitalApprovalSchema,
  metricsRangeSchema,
  paginationSchema,
  validate,
} from '../validation/schemas.js';

const router = express.Router();
router.use(authenticate, requireActiveAccount, requireRole('admin'));

function pageResult(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    has_more: hasMore,
    next_cursor: hasMore ? encodeCursor(items.at(-1)) : null,
  };
}

function cursorWhere(cursor, startIndex = 1) {
  if (!cursor) return { sql: '', params: [] };
  const parsed = decodeCursor(cursor);
  return {
    sql: `AND (created_at, id) < ($${startIndex}::timestamptz, $${startIndex + 1}::uuid)`,
    params: [parsed.created_at, parsed.id],
  };
}

router.get('/users', validate(paginationSchema, 'query'), async (req, res) => {
  const { limit, cursor } = req.query;
  const keyset = cursorWhere(cursor);
  const result = await query(
    `SELECT u.id,u.email,u.phone,u.name,u.role,u.blood_group,u.city,u.is_verified,
            u.is_on_call,u.consent_given,u.account_status,u.created_at,
            h.id AS hospital_id,h.approval_status,h.license_number
     FROM users u LEFT JOIN hospitals h ON h.user_id=u.id
     WHERE u.deleted_at IS NULL ${keyset.sql.replaceAll('created_at', 'u.created_at').replaceAll('id)', 'u.id)')}
     ORDER BY u.created_at DESC,u.id DESC LIMIT $${keyset.params.length + 1}`,
    [...keyset.params, limit + 1],
  );
  await logAudit({
    userId: req.user.id, action: 'ADMIN_VIEW_USERS', resourceType: 'user',
    details: { returned_count: Math.min(result.rowCount, limit) }, req,
  });
  return res.json({ success: true, data: pageResult(result.rows, limit) });
});

router.get('/requests', validate(paginationSchema, 'query'), async (req, res) => {
  const { limit, cursor } = req.query;
  const keyset = cursorWhere(cursor);
  const result = await query(
    `SELECT br.id,br.hospital_id,br.blood_group,br.units_needed,br.urgency,br.status,
            br.radius_km,br.ref_code,br.needed_by,br.created_at,h.name AS hospital_name
     FROM blood_requests br JOIN hospitals h ON h.id=br.hospital_id
     WHERE true ${keyset.sql.replaceAll('created_at', 'br.created_at').replaceAll('id)', 'br.id)')}
     ORDER BY br.created_at DESC,br.id DESC LIMIT $${keyset.params.length + 1}`,
    [...keyset.params, limit + 1],
  );
  await logAudit({
    userId: req.user.id, action: 'ADMIN_VIEW_REQUESTS', resourceType: 'blood_request',
    details: { returned_count: Math.min(result.rowCount, limit) }, req,
  });
  return res.json({ success: true, data: pageResult(result.rows, limit) });
});

router.get('/audit-logs', validate(paginationSchema, 'query'), async (req, res) => {
  const { limit, cursor } = req.query;
  const keyset = cursorWhere(cursor);
  const result = await query(
    `SELECT id,user_id,action,resource_type,resource_id,details,created_at
     FROM audit_logs WHERE true ${keyset.sql}
     ORDER BY created_at DESC,id DESC LIMIT $${keyset.params.length + 1}`,
    [...keyset.params, limit + 1],
  );
  await logAudit({
    userId: req.user.id, action: 'ADMIN_VIEW_AUDIT', resourceType: 'audit_log',
    details: { returned_count: Math.min(result.rowCount, limit) }, req,
  });
  return res.json({ success: true, data: pageResult(result.rows, limit) });
});

router.get('/stats', async (req, res) => {
  const result = await query(
    `SELECT
      (SELECT COUNT(*) FROM users WHERE role='donor' AND deleted_at IS NULL) AS total_donors,
      (SELECT COUNT(*) FROM hospitals) AS total_hospitals,
      (SELECT COUNT(*) FROM hospitals WHERE approval_status='pending') AS pending_hospitals,
      (SELECT COUNT(*) FROM blood_requests) AS total_requests,
      (SELECT COUNT(*) FROM blood_requests WHERE status='open') AS active_requests,
      (SELECT COUNT(*) FROM donations) AS total_donations,
      (SELECT COALESCE(SUM(amount),0) FROM credits WHERE type='earned') AS total_credits_earned`,
  );
  await logAudit({ userId: req.user.id, action: 'ADMIN_VIEW_STATS', resourceType: 'platform', req });
  return res.json({ success: true, data: { stats: result.rows[0] } });
});

router.get('/metrics/summary', validate(metricsRangeSchema, 'query'), async (req, res) => {
  try {
    const data = await getMetricsSummary({ from: req.query.from, to: req.query.to });
    await logAudit({
      userId: req.user.id, action: 'ADMIN_VIEW_METRICS_SUMMARY', resourceType: 'platform',
      details: { from: data.from, to: data.to }, req,
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

router.get('/metrics/response-times', validate(metricsRangeSchema, 'query'), async (req, res) => {
  try {
    const data = await getResponseTimes({ from: req.query.from, to: req.query.to });
    await logAudit({
      userId: req.user.id, action: 'ADMIN_VIEW_METRICS_RESPONSE_TIMES', resourceType: 'platform',
      details: { from: data.from, to: data.to, request_count: data.requests.length }, req,
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

router.get('/metrics/rare', validate(metricsRangeSchema, 'query'), async (req, res) => {
  try {
    const data = await getRareMetrics({ from: req.query.from, to: req.query.to });
    await logAudit({
      userId: req.user.id, action: 'ADMIN_VIEW_METRICS_RARE', resourceType: 'platform',
      details: { from: data.from, to: data.to }, req,
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

router.get('/metrics/export.csv', validate(metricsRangeSchema, 'query'), async (req, res) => {
  try {
    const data = await getResponseTimes({ from: req.query.from, to: req.query.to });
    const csv = responseTimesToCsv(data);
    await logAudit({
      userId: req.user.id, action: 'ADMIN_EXPORT_METRICS_CSV', resourceType: 'platform',
      details: { from: data.from, to: data.to, request_count: data.requests.length }, req,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="raktasetu-pilot-metrics.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    if (respondIfDatabaseDown(res, error)) return;
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: { code: error.code || 'METRICS_FAILED', message: error.message || 'Metrics failed' },
    });
  }
});

router.post('/hospitals/:id/approval', validate(hospitalApprovalSchema), async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid hospital id' } });
  }
  try {
    const result = await withAuthorizationContext(
      { userId: req.user.id, role: 'admin' },
      async (client) => {
        const locked = await client.query(
          `SELECT h.id,h.user_id,h.approval_status,u.account_status
           FROM hospitals h JOIN users u ON u.id=h.user_id
           WHERE h.id=$1 FOR UPDATE OF h,u`,
          [id],
        );
        const hospital = locked.rows[0];
        if (!hospital) return null;
        const approved = req.body.status === 'approved';
        await client.query(
          `UPDATE hospitals SET approval_status=$1,approved_by=$2,
             approved_at=CASE WHEN $4 THEN NOW() ELSE NULL END,updated_at=NOW()
           WHERE id=$3`,
          [req.body.status, req.user.id, id, approved],
        );
        await client.query(
          `UPDATE users SET account_status=$1,token_version=token_version+1,updated_at=NOW()
           WHERE id=$2`,
          [approved ? 'active' : 'suspended', hospital.user_id],
        );
        await logAudit({
          userId: req.user.id,
          action: `HOSPITAL_${req.body.status.toUpperCase()}`,
          resourceType: 'hospital',
          resourceId: id,
          details: { previous_status: hospital.approval_status, reason: req.body.reason || null },
          req,
          client,
        });
        return { userId: hospital.user_id };
      },
    );
    if (!result) return res.status(404).json({ success: false, error: { code: 'HOSPITAL_NOT_FOUND', message: 'Hospital not found' } });
    disconnectUser(result.userId);
    return res.json({ success: true, data: { hospital_id: id, approval_status: req.body.status } });
  } catch (error) {
    if (respondIfDatabaseDown(res, error)) return;
    console.error('Hospital approval failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'HOSPITAL_APPROVAL_FAILED', message: 'Hospital approval failed' } });
  }
});

export default router;

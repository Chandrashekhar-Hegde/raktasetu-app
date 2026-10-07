import { randomUUID as uuidv4 } from 'node:crypto';
import { GIVERS, haversineKm } from '../utils/bloodCompatibility.js';
import { bloodRequestPushPayload, sendPushToUser } from './pushDelivery.js';
import { publishToUser, publishToHospital } from '../realtime/publisher.js';

/** Max escalation_level after two widenings: current → 10 → 25 km. */
export const MAX_ESCALATION_LEVEL = 2;

/** Minutes with zero accepts before the next escalation step. */
export const ESCALATION_WAIT_MINUTES = Object.freeze({
  critical: 10,
  urgent: 30,
  // scheduled requests never auto-escalate
  scheduled: null,
});

/** Target radius (km) after each escalation level. */
export const ESCALATION_RADIUS_KM = Object.freeze({
  1: 10,
  2: 25,
});

/** Open requests older than this (or past needed_by) are expired. */
export const REQUEST_MAX_AGE_HOURS = 24;


/**
 * Minutes to wait since created_at / last_escalated_at before the next step.
 * Returns null when urgency never escalates (scheduled / unknown).
 */
export function waitMinutesForUrgency(urgency) {
  if (!Object.prototype.hasOwnProperty.call(ESCALATION_WAIT_MINUTES, urgency)) {
    return null;
  }
  return ESCALATION_WAIT_MINUTES[urgency];
}

/** Next radius after bumping to nextLevel (never shrinks). */
export function radiusForLevel(currentRadiusKm, nextLevel) {
  const target = ESCALATION_RADIUS_KM[nextLevel];
  if (target == null) return Number(currentRadiusKm) || 0;
  return Math.max(Number(currentRadiusKm) || 0, target);
}

/**
 * Whether this open request is due for one escalation step.
 * Requires zero accepts and elapsed wait since last escalate (or create).
 */
export function isDueForEscalation(request, { now = new Date(), acceptCount = 0 } = {}) {
  if (!request || request.status !== 'open') return false;
  if (Number(acceptCount) > 0) return false;
  if (Number(request.escalation_level) >= MAX_ESCALATION_LEVEL) return false;

  const waitMin = waitMinutesForUrgency(request.urgency);
  if (waitMin == null) return false;

  const anchor = request.last_escalated_at
    ? new Date(request.last_escalated_at)
    : new Date(request.created_at);
  if (Number.isNaN(anchor.getTime())) return false;

  const elapsedMs = now.getTime() - anchor.getTime();
  return elapsedMs >= waitMin * 60 * 1000;
}

/** True when an open request should be auto-expired. */
export function isDueForExpiry(request, { now = new Date() } = {}) {
  if (!request || request.status !== 'open') return false;
  const nowMs = now.getTime();

  if (request.needed_by) {
    const needed = new Date(request.needed_by);
    if (!Number.isNaN(needed.getTime()) && needed.getTime() <= nowMs) return true;
  }

  const created = new Date(request.created_at);
  if (Number.isNaN(created.getTime())) return false;
  return nowMs - created.getTime() >= REQUEST_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * Donors inside newRadius but outside oldRadius (or not yet notified).
 * never returns coordinate fields to callers that persist hospital-facing payloads.
 */
export function selectNewlyInRangeDonors({
  donors,
  requestLat,
  requestLng,
  oldRadiusKm,
  newRadiusKm,
  alreadyNotifiedIds,
}) {
  const notified = new Set((alreadyNotifiedIds || []).map(String));
  const oldR = Number(oldRadiusKm) || 0;
  const newR = Number(newRadiusKm) || 0;
  const lat = parseFloat(requestLat);
  const lng = parseFloat(requestLng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return [];

  return (donors || [])
    .map((d) => {
      const dist = haversineKm(
        lat,
        lng,
        parseFloat(d.latitude),
        parseFloat(d.longitude),
      );
      return {
        id: d.id,
        blood_group: d.blood_group,
        distance_km: Math.round(dist * 10) / 10,
      };
    })
    .filter((d) => {
      if (notified.has(String(d.id))) return false;
      if (d.distance_km > newR) return false;
      // Newly in range: beyond the previous radius, or never notified at all
      // (already filtered by notified). Prefer only those outside old radius
      // when the ring actually widened; if radius unchanged, still allow
      // never-notified donors inside the current radius.
      if (newR > oldR) return d.distance_km > oldR;
      return true;
    });
}

async function loadOpenRequests(client) {
  const result = await client.query(
    `SELECT br.id, br.hospital_id, br.blood_group, br.units_needed, br.urgency,
            br.status, br.radius_km, br.latitude, br.longitude, br.ref_code,
            br.needed_by, br.escalation_level, br.last_escalated_at, br.created_at,
            h.name AS hospital_name,
            (
              SELECT COUNT(*)::int FROM donor_responses dr
              WHERE dr.request_id = br.id
                AND dr.status IN ('accepted', 'arrived', 'completed')
            ) AS accept_count
     FROM blood_requests br
     JOIN hospitals h ON h.id = br.hospital_id
     WHERE br.status = 'open'
     ORDER BY br.created_at ASC`,
  );
  return result.rows;
}

async function alreadyNotifiedDonorIds(client, requestId) {
  const result = await client.query(
    `SELECT DISTINCT user_id::text AS user_id
     FROM notifications
     WHERE type = 'blood_request'
       AND (data->>'request_id') = $1::text`,
    [requestId],
  );
  return result.rows.map((r) => r.user_id);
}

async function loadCompatibleOnCallDonors(client, bloodGroup) {
  const givers = GIVERS[bloodGroup];
  if (!givers) return [];
  // Maintenance / owner connection: direct read (no hospital RLS context).
  // Columns stay minimal — never expose phone/email to callers.
  const result = await client.query(
    `SELECT id, blood_group, latitude, longitude
     FROM users
     WHERE role = 'donor'
       AND account_status = 'active'
       AND is_on_call = true
       AND deleted_at IS NULL
       AND consent_given = true
       AND blood_group = ANY ($1::text[])
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL`,
    [givers],
  );
  return result.rows;
}

async function notifyDonors(client, { request, donors, hospitalName }) {
  for (const donor of donors) {
    const title = `${String(request.urgency).toUpperCase()}: Blood needed at ${hospitalName}`;
    const body = `${request.blood_group} blood needed${request.urgency === 'scheduled' ? '' : ' urgently'}. ${request.units_needed} unit(s) required.`;
    const data = {
      request_id: request.id,
      hospital_id: request.hospital_id,
      blood_group: request.blood_group,
      urgency: request.urgency,
      escalation_level: request.escalation_level,
    };
    await client.query(
      `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, NOW())`,
      [uuidv4(), donor.id, 'blood_request', title, body, JSON.stringify(data)],
    );
  }
  return donors.map((donor) => ({ donorId: donor.id, request, hospitalName }));
}

/** Push + socket delivery; runs only after the notification rows are committed. */
async function deliver(client, deliveries) {
  for (const { donorId, request, hospitalName } of deliveries) {
    try {
      await sendPushToUser(donorId, bloodRequestPushPayload({
        requestId: request.id,
        bloodGroup: request.blood_group,
        urgency: request.urgency,
        unitsNeeded: request.units_needed,
        hospitalName,
      }), { queryFn: (sql, params) => client.query(sql, params) });
    } catch (pushErr) {
      console.error('Escalation push failed:', pushErr.message);
    }
    publishToUser(donorId, 'blood_request', {
      request_id: request.id,
      blood_group: request.blood_group,
      urgency: request.urgency,
      units_needed: request.units_needed,
      hospital_name: hospitalName,
      escalation_level: request.escalation_level,
    });
  }
}

async function escalateOne(client, request, { now = new Date() } = {}) {
  const nextLevel = Number(request.escalation_level) + 1;
  const oldRadius = Number(request.radius_km) || 0;
  const newRadius = radiusForLevel(oldRadius, nextLevel);

  const updated = await client.query(
    `UPDATE blood_requests
     SET radius_km = $1,
         escalation_level = $2,
         last_escalated_at = $3
     WHERE id = $4 AND status = 'open'
     RETURNING *`,
    [newRadius, nextLevel, now, request.id],
  );
  if (updated.rowCount === 0) return { escalated: false, donors_notified: 0 };

  const escalated = { ...request, ...updated.rows[0], escalation_level: nextLevel, radius_km: newRadius };
  const [donors, notifiedIds] = await Promise.all([
    loadCompatibleOnCallDonors(client, request.blood_group),
    alreadyNotifiedDonorIds(client, request.id),
  ]);

  const newlyInRange = selectNewlyInRangeDonors({
    donors,
    requestLat: request.latitude,
    requestLng: request.longitude,
    oldRadiusKm: oldRadius,
    newRadiusKm: newRadius,
    alreadyNotifiedIds: notifiedIds,
  });

  const hospitalName = request.hospital_name || 'Hospital';
  const deliveries = await notifyDonors(client, {
    request: escalated,
    donors: newlyInRange,
    hospitalName,
  });
  const donorsNotified = deliveries.length;

  publishToHospital(request.hospital_id, 'request_escalated', {
    request_id: request.id,
    escalation_level: nextLevel,
    radius_km: newRadius,
    donors_notified: donorsNotified,
  });

  return {
    escalated: true,
    request_id: request.id,
    escalation_level: nextLevel,
    radius_km: newRadius,
    donors_notified: donorsNotified,
    deliveries,
  };
}

async function expireOne(client, request, { now = new Date() } = {}) {
  const updated = await client.query(
    `UPDATE blood_requests
     SET status = 'expired'
     WHERE id = $1 AND status = 'open'
     RETURNING id, hospital_id, status`,
    [request.id],
  );
  if (updated.rowCount === 0) return { expired: false };

  publishToHospital(request.hospital_id, 'request_expired', {
    request_id: request.id,
    expired_at: now.toISOString(),
  });

  return { expired: true, request_id: request.id };
}

/**
 * One escalation + expiry pass. Caller holds the advisory lock; this function owns the transactions:
 * one short transaction per request (so hospital verification never waits on the whole pass),
 * and pushes only after that request's notifications are committed (no re-ping after a rollback).
 */
export async function runEscalationPass(client, { now = new Date() } = {}) {
  const summary = {
    examined: 0,
    escalated: 0,
    expired: 0,
    donors_notified: 0,
    details: [],
  };

  const requests = await loadOpenRequests(client);
  summary.examined = requests.length;

  for (const request of requests) {
    const expire = isDueForExpiry(request, { now });
    if (!expire && !isDueForEscalation(request, { now, acceptCount: request.accept_count })) continue;

    let result;
    await client.query('BEGIN');
    try {
      const locked = await client.query(
        "SELECT id FROM blood_requests WHERE id = $1 AND status = 'open' FOR UPDATE SKIP LOCKED",
        [request.id],
      );
      if (locked.rowCount > 0) {
        result = expire ? await expireOne(client, request, { now }) : await escalateOne(client, request, { now });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
    if (!result) continue; // closed or being verified right now; next tick re-examines it

    if (expire) {
      if (result.expired) {
        summary.expired += 1;
        summary.details.push({ type: 'expired', request_id: request.id });
      }
    } else {
      if (result.escalated) {
        await deliver(client, result.deliveries);
        summary.escalated += 1;
        summary.donors_notified += result.donors_notified;
        summary.details.push({
          type: 'escalated',
          request_id: result.request_id,
          escalation_level: result.escalation_level,
          radius_km: result.radius_km,
          donors_notified: result.donors_notified,
        });
      }
    }
  }

  return summary;
}

export { haversineKm };

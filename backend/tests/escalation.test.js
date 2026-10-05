import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESCALATION_RADIUS_KM,
  ESCALATION_WAIT_MINUTES,
  MAX_ESCALATION_LEVEL,
  REQUEST_MAX_AGE_HOURS,
  haversineKm,
  isDueForEscalation,
  isDueForExpiry,
  radiusForLevel,
  runEscalationPass,
  selectNewlyInRangeDonors,
  waitMinutesForUrgency,
} from '../src/services/escalationService.js';

test('wait minutes: critical 10, urgent 30, scheduled never', () => {
  assert.equal(waitMinutesForUrgency('critical'), 10);
  assert.equal(waitMinutesForUrgency('urgent'), 30);
  assert.equal(waitMinutesForUrgency('scheduled'), null);
  assert.equal(ESCALATION_WAIT_MINUTES.scheduled, null);
});

test('radius ladder: current → 10 → 25, never shrinks', () => {
  assert.equal(radiusForLevel(5, 1), 10);
  assert.equal(radiusForLevel(10, 1), 10);
  assert.equal(radiusForLevel(12, 1), 12);
  assert.equal(radiusForLevel(10, 2), 25);
  assert.equal(radiusForLevel(25, 2), 25);
  assert.equal(ESCALATION_RADIUS_KM[1], 10);
  assert.equal(ESCALATION_RADIUS_KM[2], 25);
  assert.equal(MAX_ESCALATION_LEVEL, 2);
});

test('isDueForEscalation respects urgency, accepts, and max level', () => {
  const now = new Date('2026-07-21T12:20:00Z');
  const base = {
    status: 'open',
    urgency: 'critical',
    escalation_level: 0,
    created_at: '2026-07-21T12:00:00Z',
    last_escalated_at: null,
  };

  assert.equal(isDueForEscalation(base, { now, acceptCount: 0 }), true);
  assert.equal(isDueForEscalation(base, { now, acceptCount: 1 }), false);
  assert.equal(
    isDueForEscalation({ ...base, urgency: 'scheduled' }, { now, acceptCount: 0 }),
    false,
  );
  assert.equal(
    isDueForEscalation({ ...base, escalation_level: 2 }, { now, acceptCount: 0 }),
    false,
  );
  assert.equal(
    isDueForEscalation(
      { ...base, created_at: '2026-07-21T12:15:00Z' },
      { now, acceptCount: 0 },
    ),
    false,
  );

  // Urgent needs 30 minutes
  assert.equal(
    isDueForEscalation(
      { ...base, urgency: 'urgent', created_at: '2026-07-21T12:00:00Z' },
      { now, acceptCount: 0 },
    ),
    false,
  );
  assert.equal(
    isDueForEscalation(
      { ...base, urgency: 'urgent', created_at: '2026-07-21T11:50:00Z' },
      { now, acceptCount: 0 },
    ),
    true,
  );

  // Second step waits from last_escalated_at
  assert.equal(
    isDueForEscalation(
      {
        ...base,
        escalation_level: 1,
        last_escalated_at: '2026-07-21T12:15:00Z',
      },
      { now, acceptCount: 0 },
    ),
    false,
  );
  assert.equal(
    isDueForEscalation(
      {
        ...base,
        escalation_level: 1,
        last_escalated_at: '2026-07-21T12:05:00Z',
      },
      { now, acceptCount: 0 },
    ),
    true,
  );
});

test('isDueForExpiry: needed_by or 24h age', () => {
  const now = new Date('2026-07-21T12:00:00Z');
  assert.equal(REQUEST_MAX_AGE_HOURS, 24);

  assert.equal(
    isDueForExpiry({
      status: 'open',
      created_at: '2026-07-20T11:00:00Z',
      needed_by: null,
    }, { now }),
    true,
  );
  assert.equal(
    isDueForExpiry({
      status: 'open',
      created_at: '2026-07-21T00:00:00Z',
      needed_by: null,
    }, { now }),
    false,
  );
  assert.equal(
    isDueForExpiry({
      status: 'open',
      created_at: '2026-07-21T11:00:00Z',
      needed_by: '2026-07-21T11:30:00Z',
    }, { now }),
    true,
  );
  assert.equal(
    isDueForExpiry({
      status: 'filled',
      created_at: '2026-07-01T00:00:00Z',
      needed_by: '2026-07-01T01:00:00Z',
    }, { now }),
    false,
  );
});

test('selectNewlyInRangeDonors dedupes and keeps only the new ring', () => {
  // Hubballi-ish origin
  const originLat = 15.3647;
  const originLng = 75.1240;

  const near = { id: 'd-near', blood_group: 'O+', latitude: originLat + 0.02, longitude: originLng };
  const mid = { id: 'd-mid', blood_group: 'O+', latitude: originLat + 0.12, longitude: originLng };
  const far = { id: 'd-far', blood_group: 'O+', latitude: originLat + 0.3, longitude: originLng };

  // Sanity: mid is between 5 and 25 km-ish
  const midDist = haversineKm(originLat, originLng, mid.latitude, mid.longitude);
  assert.ok(midDist > 5 && midDist < 25, `midDist=${midDist}`);

  const ring = selectNewlyInRangeDonors({
    donors: [near, mid, far],
    requestLat: originLat,
    requestLng: originLng,
    oldRadiusKm: 5,
    newRadiusKm: 25,
    alreadyNotifiedIds: [near.id],
  });
  const ids = ring.map((d) => d.id);
  assert.ok(ids.includes('d-mid'));
  assert.equal(ids.includes('d-near'), false);
  assert.equal(ids.includes('d-far'), false);

  // Already notified mid → empty for that donor
  const deduped = selectNewlyInRangeDonors({
    donors: [near, mid],
    requestLat: originLat,
    requestLng: originLng,
    oldRadiusKm: 5,
    newRadiusKm: 25,
    alreadyNotifiedIds: [near.id, mid.id],
  });
  assert.equal(deduped.length, 0);
});

test('runEscalationPass expires then escalates with fake client', async () => {
  const now = new Date('2026-07-21T12:20:00Z');
  const expiredId = 'req-expired';
  const escalateId = 'req-escalate';
  const hospitalId = 'hosp-1';

  const state = {
    updates: [],
    notifications: [],
    unlocked: false,
  };

  const client = {
    async query(sql, params) {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        state.locks = (state.locks || 0) + 1;
        return { rowCount: 1, rows: [{ id: params[0] }] };
      }
      if (sql === 'BEGIN' || sql === 'COMMIT') {
        state.tx = [...(state.tx || []), sql];
        return { rows: [] };
      }
      if (sql.includes('FROM blood_requests br') && sql.includes("WHERE br.status = 'open'")) {
        return {
          rows: [
            {
              id: expiredId,
              hospital_id: hospitalId,
              blood_group: 'B+',
              units_needed: 1,
              urgency: 'critical',
              status: 'open',
              radius_km: 5,
              latitude: 15.36,
              longitude: 75.12,
              needed_by: '2026-07-21T11:00:00Z',
              escalation_level: 0,
              last_escalated_at: null,
              created_at: '2026-07-21T10:00:00Z',
              hospital_name: 'Test Hospital',
              accept_count: 0,
            },
            {
              id: escalateId,
              hospital_id: hospitalId,
              blood_group: 'B+',
              units_needed: 2,
              urgency: 'critical',
              status: 'open',
              radius_km: 5,
              latitude: 15.3647,
              longitude: 75.1240,
              needed_by: null,
              escalation_level: 0,
              last_escalated_at: null,
              created_at: '2026-07-21T12:00:00Z',
              hospital_name: 'Test Hospital',
              accept_count: 0,
            },
          ],
        };
      }
      if (sql.includes("SET status = 'expired'")) {
        state.updates.push({ type: 'expire', params });
        return { rowCount: 1, rows: [{ id: params[0], hospital_id: hospitalId, status: 'expired' }] };
      }
      if (sql.includes('SET radius_km')) {
        state.updates.push({ type: 'escalate', params });
        return {
          rowCount: 1,
          rows: [{
            id: params[3],
            radius_km: params[0],
            escalation_level: params[1],
            last_escalated_at: params[2],
            hospital_id: hospitalId,
            blood_group: 'B+',
            units_needed: 2,
            urgency: 'critical',
            status: 'open',
            latitude: 15.3647,
            longitude: 75.1240,
          }],
        };
      }
      if (sql.includes('FROM notifications') && sql.includes('blood_request')) {
        return { rows: [{ user_id: 'already-1' }] };
      }
      if (sql.includes("FROM users") && sql.includes("is_on_call = true")) {
        return {
          rows: [
            { id: 'already-1', blood_group: 'O+', latitude: 15.37, longitude: 75.124 },
            // ~9 km north — inside new 10 km ring, outside old 5 km
            { id: 'new-1', blood_group: 'O+', latitude: 15.3647 + 0.08, longitude: 75.1240 },
            // ~13 km — still outside 10 km after level-1
            { id: 'too-far', blood_group: 'O+', latitude: 15.3647 + 0.12, longitude: 75.1240 },
          ],
        };
      }
      if (sql.includes('INSERT INTO notifications')) {
        state.notifications.push(params);
        return { rowCount: 1 };
      }
      if (sql.includes('deliverable_push_subscriptions') || sql.includes('FROM push')) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const summary = await runEscalationPass(client, { now });
  assert.equal(summary.examined, 2);
  assert.equal(summary.expired, 1);
  assert.equal(summary.escalated, 1);
  assert.equal(summary.donors_notified, 1);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0][1], 'new-1');

  assert.equal(state.locks, 2, 'each due request is locked in its own transaction');
  assert.deepEqual(state.tx, ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  const escalateUpdate = state.updates.find((u) => u.type === 'escalate');
  assert.equal(escalateUpdate.params[0], 10); // radius
  assert.equal(escalateUpdate.params[1], 1); // level
});

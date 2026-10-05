import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hasTestDatabase, loadApp, ownerClient, donorPayload, hospitalAuth } from './helpers/routeDb.js';

test('creating a request notifies only nearby compatible donors, atomically', { skip: !hasTestDatabase }, async () => {
  const { app, pool } = await loadApp();
  const owner = await ownerClient();
  try {
    const body = { blood_group: 'B-', units_needed: 1, urgency: 'critical', radius_km: 10 };

    const noLocation = await hospitalAuth(app, owner, request);
    assert.equal((await request(app).post('/api/hospital/requests').set(noLocation).send(body).expect(409)).body.error.code,
      'HOSPITAL_LOCATION_MISSING');

    const at = { lat: 12.30, lng: 76.64 }; // Mysuru: away from other tests' Hubballi donors
    const donor = async (overrides) => {
      const reg = await request(app).post('/api/auth/register').send(donorPayload(overrides)).expect(201);
      await owner.query('UPDATE users SET is_on_call = true WHERE id = $1', [reg.body.data.user.id]);
      return reg.body.data.user.id;
    };
    const near1 = await donor({ blood_group: 'O-', latitude: 12.31, longitude: 76.65 });
    const near2 = await donor({ blood_group: 'B-', latitude: 12.29, longitude: 76.63 });
    const incompatible = await donor({ blood_group: 'A+', latitude: 12.30, longitude: 76.64 });
    const far = await donor({ blood_group: 'B-', latitude: 13.50, longitude: 77.60 }); // ~150 km

    const hospital = await hospitalAuth(app, owner, request, at);
    const res = await request(app).post('/api/hospital/requests').set(hospital).send(body).expect(201);
    // Rare group: radius widens to 25 km, still excludes the 150 km donor.
    // Assert on this test's donors only; earlier runs may have left donors nearby.
    const notified = new Set((await owner.query(
      "SELECT user_id FROM notifications WHERE type = 'blood_request' AND data->>'request_id' = $1", [res.body.data.request.id],
    )).rows.map((r) => r.user_id));
    assert.equal(res.body.data.donors_notified, notified.size, 'count matches committed notifications');
    assert.ok(notified.has(near1) && notified.has(near2), 'nearby compatible donors notified');
    assert.ok(!notified.has(incompatible) && !notified.has(far), 'incompatible and distant donors skipped');
  } finally {
    await owner.end();
    await pool.end();
  }
});

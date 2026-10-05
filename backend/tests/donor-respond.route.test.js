import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hasTestDatabase, loadApp, ownerClient, donorPayload, openRequest } from './helpers/routeDb.js';

test('donor responses follow the state machine and blood compatibility', { skip: !hasTestDatabase }, async () => {
  const { app, pool } = await loadApp();
  const owner = await ownerClient();
  try {
    const { requestId } = await openRequest(owner, { bloodGroup: 'O-' });
    const as = async (group) => {
      const reg = await request(app).post('/api/auth/register').send(donorPayload({ blood_group: group })).expect(201);
      return { Authorization: `Bearer ${reg.body.data.token}` };
    };
    const respond = (auth, status) => request(app).post(`/api/donor/respond/${requestId}`).set(auth).send({ status });
    const arrived = (auth) => request(app).post(`/api/donor/arrived/${requestId}`).set(auth);

    // O- patients can only receive O-: an A+ donor must not be able to accept by id.
    const incompatible = await as('A+');
    assert.equal((await respond(incompatible, 'accepted').expect(409)).body.error.code, 'BLOOD_GROUP_INCOMPATIBLE');

    const donor = await as('O-');
    await respond(donor, 'declined').expect(200);
    assert.equal((await arrived(donor).expect(409)).body.error.code, 'NOT_ACCEPTED', 'declined cannot arrive');
    await respond(donor, 'accepted').expect(200);
    await arrived(donor).expect(200);
    assert.equal((await respond(donor, 'declined').expect(409)).body.error.code, 'RESPONSE_FINAL', 'arrived is final');

    const rows = await owner.query('SELECT status FROM donor_responses WHERE request_id = $1', [requestId]);
    assert.deepEqual(rows.rows.map((r) => r.status), ['arrived']);
  } finally {
    await owner.end();
    await pool.end();
  }
});

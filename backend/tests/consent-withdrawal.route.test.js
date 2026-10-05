import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hasTestDatabase, loadApp, ownerClient, donorPayload, openRequest } from './helpers/routeDb.js';

test('withdrawing consent takes the donor off call and out of hospital matching', { skip: !hasTestDatabase }, async () => {
  const { app, pool } = await loadApp();
  const owner = await ownerClient();
  try {
    const reg = await request(app).post('/api/auth/register').send(donorPayload({ blood_group: 'AB-' })).expect(201);
    const donorId = reg.body.data.user.id;
    await owner.query('UPDATE users SET is_on_call = true WHERE id = $1', [donorId]);

    const res = await request(app).post('/api/auth/consent')
      .set({ Authorization: `Bearer ${reg.body.data.token}` }).send({ consent_given: false }).expect(200);
    assert.equal(res.body.data.consent.is_on_call, false);

    // Even if something flips is_on_call back, the matching function must still exclude them.
    await owner.query('UPDATE users SET is_on_call = true WHERE id = $1', [donorId]);
    const { hospitalUserId, hospitalId } = await openRequest(owner);
    await owner.query('BEGIN');
    await owner.query('SET LOCAL ROLE raktasetu_rls');
    await owner.query("SELECT set_config('app.user_id',$1,true), set_config('app.role','hospital',true), set_config('app.hospital_id',$2,true)", [hospitalUserId, hospitalId]);
    const visible = await owner.query("SELECT id FROM hospital_visible_on_call_donors(ARRAY['AB-'])");
    await owner.query('ROLLBACK');
    assert.equal(visible.rows.some((r) => r.id === donorId), false);
  } finally {
    await owner.end();
    await pool.end();
  }
});

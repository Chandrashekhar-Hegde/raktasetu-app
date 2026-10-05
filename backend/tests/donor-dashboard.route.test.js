import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hasTestDatabase, loadApp, ownerClient, donorPayload } from './helpers/routeDb.js';

// Regression: donations x credits join multiplied the balance, and reserved (-100) credits raised it.
test('dashboard balance matches the signed credit ledger', { skip: !hasTestDatabase }, async () => {
  const { app, pool } = await loadApp();
  const owner = await ownerClient();
  try {
    const reg = await request(app).post('/api/auth/register').send(donorPayload()).expect(201);
    const donorId = reg.body.data.user.id;
    await owner.query(
      `INSERT INTO donations (donor_id, blood_group, verified_at) VALUES ($1,'O+',NOW()), ($1,'O+',NOW())`,
      [donorId],
    );
    await owner.query(
      `INSERT INTO credits (donor_id, amount, type) VALUES ($1,100,'earned'), ($1,100,'earned'), ($1,-100,'reserved')`,
      [donorId],
    );
    const auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const dash = await request(app).get('/api/donor/dashboard').set(auth).expect(200);
    const credits = await request(app).get('/api/donor/credits').set(auth).expect(200);
    assert.equal(dash.body.data.stats.total_donations, 2);
    assert.equal(dash.body.data.stats.credit_balance, 100);
    assert.equal(dash.body.data.stats.credit_balance, credits.body.data.balance, 'dashboard agrees with /credits');
  } finally {
    await owner.end();
    await pool.end();
  }
});

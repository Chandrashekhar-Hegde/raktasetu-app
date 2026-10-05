import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hasTestDatabase, loadApp, ownerClient, donorPayload, adminToken } from './helpers/routeDb.js';

// Regression: the keyset SQL was built with .replaceAll('id)', 'u.id)'), turning $2::uuid) into $2::uuu.id).
test('admin keyset pagination returns the next page and rejects bad cursors', { skip: !hasTestDatabase }, async () => {
  const { app, pool } = await loadApp();
  const owner = await ownerClient();
  try {
    for (let i = 0; i < 2; i++) await request(app).post('/api/auth/register').send(donorPayload()).expect(201);
    const token = await adminToken(app, owner, request);
    const auth = { Authorization: `Bearer ${token}` };

    for (const path of ['/api/admin/users', '/api/admin/requests', '/api/admin/audit-logs']) {
      const first = await request(app).get(`${path}?limit=1`).set(auth).expect(200);
      const cursor = first.body.data.next_cursor
        ?? Buffer.from(JSON.stringify({ created_at: new Date().toISOString(), id: '00000000-0000-4000-8000-000000000000' })).toString('base64url');
      const second = await request(app).get(`${path}?limit=1&cursor=${cursor}`).set(auth).expect(200);
      if (first.body.data.items.length && second.body.data.items.length) {
        assert.notEqual(second.body.data.items[0].id, first.body.data.items[0].id, `${path} page 2 differs`);
      }
      await request(app).get(`${path}?cursor=not-a-cursor`).set(auth).expect(400);
    }
  } finally {
    await owner.end();
    await pool.end();
  }
});

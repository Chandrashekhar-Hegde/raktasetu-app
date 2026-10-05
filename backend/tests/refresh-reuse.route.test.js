import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hasTestDatabase, loadApp, ownerClient, donorPayload } from './helpers/routeDb.js';

const native = { 'X-Client-Platform': 'native' };

test('refresh: no session is 401; replaying an old rotated token revokes the family', { skip: !hasTestDatabase }, async () => {
  const { app, pool } = await loadApp();
  const owner = await ownerClient();
  try {
    await request(app).post('/api/auth/refresh').expect(401);

    const reg = await request(app).post('/api/auth/register').set(native).send(donorPayload()).expect(201);
    const first = reg.body.data.refresh_token;
    assert.ok(first, 'native register returns a refresh token');

    const second = (await request(app).post('/api/auth/refresh').set(native).send({ refresh_token: first }).expect(200))
      .body.data.refresh_token;

    // A parallel tab replaying the just-rotated token inside the grace window: rejected, but no lockout.
    await request(app).post('/api/auth/refresh').set(native).send({ refresh_token: first }).expect(401);
    const third = (await request(app).post('/api/auth/refresh').set(native).send({ refresh_token: second }).expect(200))
      .body.data.refresh_token;

    // Same replay a minute later looks like theft: the whole family, including the newest token, dies.
    await owner.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL '60 seconds' WHERE revoked_at IS NOT NULL AND family_id = (SELECT family_id FROM refresh_tokens WHERE replaced_by IS NOT NULL ORDER BY revoked_at DESC LIMIT 1)",
    );
    await request(app).post('/api/auth/refresh').set(native).send({ refresh_token: first }).expect(401);
    await request(app).post('/api/auth/refresh').set(native).send({ refresh_token: third }).expect(401);
  } finally {
    await owner.end();
    await pool.end();
  }
});

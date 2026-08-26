import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const testEnv = { NODE_ENV: 'test', SERVE_FRONTEND: 'false' };

test('GET /api/health returns a versioned healthy response without binding a port', async () => {
  const response = await request(createApp({ env: testEnv }))
    .get('/api/health')
    .expect('Content-Type', /json/)
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'healthy');
  assert.equal(typeof response.body.data.version, 'string');
  assert.equal(typeof response.body.data.timestamp, 'string');
});

test('GET /api/health stays 200 when the database ping would fail', async () => {
  const app = createApp({
    env: testEnv,
    pingDatabase: async () => {
      throw Object.assign(new Error('exceeded the compute time quota'), { code: '53000' });
    },
  });

  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.data.status, 'healthy');
});

test('GET /api/health/ready is public and returns 200 without leaking donor identity', async () => {
  const app = createApp({
    env: testEnv,
    pingDatabase: async () => {},
  });

  const response = await request(app)
    .get('/api/health/ready')
    .expect('Content-Type', /json/)
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'ready');
  assert.equal(typeof response.body.data.version, 'string');
  const serialized = JSON.stringify(response.body);
  assert.doesNotMatch(serialized, /phone|email|lat|lng|coordinate/i);
  assert.equal(response.body.data.database, undefined);
});

test('GET /api/health/ready does not require a role and ignores a bogus bearer token', async () => {
  const app = createApp({
    env: testEnv,
    pingDatabase: async () => {},
  });

  const response = await request(app)
    .get('/api/health/ready')
    .set('Authorization', 'Bearer not-a-session')
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.status, 200);
});

test('GET /api/health/ready returns 503 COMPUTE_QUOTA_EXCEEDED without leaking connection details', async () => {
  const app = createApp({
    env: testEnv,
    pingDatabase: async () => {
      throw Object.assign(
        new Error('Your account or project has exceeded the compute time quota. postgresql://raktasetu_app@ep-fancy-king.neon.tech/neondb'),
        { code: '53000' },
      );
    },
  });

  const response = await request(app).get('/api/health/ready').expect(503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'COMPUTE_QUOTA_EXCEEDED');
  const serialized = JSON.stringify(response.body);
  assert.doesNotMatch(serialized, /postgresql:\/\//);
  assert.doesNotMatch(serialized, /neon\.tech/);
  assert.doesNotMatch(serialized, /raktasetu_app/);
});

test('GET /api/health/ready returns 503 DATABASE_UNAVAILABLE on connect failure', async () => {
  const app = createApp({
    env: testEnv,
    pingDatabase: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    },
  });

  const response = await request(app).get('/api/health/ready').expect(503);
  assert.equal(response.body.error.code, 'DATABASE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(response.body), /127\.0\.0\.1/);
});

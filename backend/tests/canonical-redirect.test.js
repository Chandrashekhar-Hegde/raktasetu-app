import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  createCanonicalRedirectMiddleware,
  isCanonicalRedirectExempt,
  parseCanonicalOrigin,
} from '../src/middleware/canonicalRedirect.js';

test('parseCanonicalOrigin normalizes and rejects invalid values', () => {
  assert.deepEqual(parseCanonicalOrigin('https://raktasetu.in/'), {
    origin: 'https://raktasetu.in',
    hostname: 'raktasetu.in',
  });
  assert.equal(parseCanonicalOrigin(''), null);
  assert.equal(parseCanonicalOrigin('not-a-url'), null);
});

test('API and health paths are exempt from canonical redirect', () => {
  assert.equal(isCanonicalRedirectExempt('/api/health'), true);
  assert.equal(isCanonicalRedirectExempt('/api/health/ready'), true);
  assert.equal(isCanonicalRedirectExempt('/api/auth/login'), true);
  assert.equal(isCanonicalRedirectExempt('/health'), true);
  assert.equal(isCanonicalRedirectExempt('/socket.io/'), true);
  assert.equal(isCanonicalRedirectExempt('/'), false);
  assert.equal(isCanonicalRedirectExempt('/login'), false);
});

test('canonical redirect is off when CANONICAL_ORIGIN is unset', async () => {
  const app = createApp({ env: { NODE_ENV: 'test', SERVE_FRONTEND: 'false' } });
  const response = await request(app)
    .get('/login')
    .set('Host', 'raktasetu-production.up.railway.app')
    .expect(404);

  assert.equal(response.headers.location, undefined);
});

test('host mismatch 301s HTML pages to CANONICAL_ORIGIN', async () => {
  const app = createApp({
    env: {
      NODE_ENV: 'test',
      SERVE_FRONTEND: 'false',
      CANONICAL_ORIGIN: 'https://raktasetu.in',
    },
  });

  const response = await request(app)
    .get('/login?role=hospital')
    .set('Host', 'raktasetu-production.up.railway.app')
    .expect(301);

  assert.equal(response.headers.location, 'https://raktasetu.in/login?role=hospital');
});

test('matching host does not redirect', async () => {
  const app = createApp({
    env: {
      NODE_ENV: 'test',
      SERVE_FRONTEND: 'false',
      CANONICAL_ORIGIN: 'https://raktasetu.in',
    },
  });

  await request(app)
    .get('/login')
    .set('Host', 'raktasetu.in')
    .expect(404);
});

test('API health stays 200 on railway host when CANONICAL_ORIGIN is set', async () => {
  const app = createApp({
    env: {
      NODE_ENV: 'test',
      SERVE_FRONTEND: 'false',
      CANONICAL_ORIGIN: 'https://raktasetu.in',
    },
  });

  const response = await request(app)
    .get('/api/health')
    .set('Host', 'raktasetu-production.up.railway.app')
    .expect(200);

  assert.equal(response.body.data.status, 'healthy');
  assert.equal(response.headers.location, undefined);
});

test('API readiness stays on railway host when CANONICAL_ORIGIN is set', async () => {
  const app = createApp({
    env: {
      NODE_ENV: 'test',
      SERVE_FRONTEND: 'false',
      CANONICAL_ORIGIN: 'https://raktasetu.in',
    },
    pingDatabase: async () => {},
  });

  const response = await request(app)
    .get('/api/health/ready')
    .set('Host', 'raktasetu-production.up.railway.app')
    .expect(200);

  assert.equal(response.body.data.status, 'ready');
  assert.equal(response.headers.location, undefined);
});

test('bare /health stays reachable on railway host when CANONICAL_ORIGIN is set', async () => {
  const app = createApp({
    env: {
      NODE_ENV: 'test',
      SERVE_FRONTEND: 'false',
      CANONICAL_ORIGIN: 'https://raktasetu.in',
    },
  });

  const response = await request(app)
    .get('/health')
    .set('Host', 'raktasetu-production.up.railway.app')
    .expect(200);

  assert.equal(response.body.data.status, 'ok');
});

test('createCanonicalRedirectMiddleware is a no-op without CANONICAL_ORIGIN', () => {
  const mw = createCanonicalRedirectMiddleware({});
  let called = false;
  mw({}, {}, () => { called = true; });
  assert.equal(called, true);
});

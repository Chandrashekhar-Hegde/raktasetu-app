import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { apiRateLimitKey } from '../src/middleware/rateLimitKey.js';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/auth/session.js';

process.env.JWT_SECRET ??= 'test-secret-for-rate-limit-key';
const sign = (claims, secret = process.env.JWT_SECRET) => jwt.sign(claims, secret, {
  algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
});

test('apiRateLimitKey prefers verified Bearer sub over IP', () => {
  const token = sign({ sub: 'user-42', role: 'donor' });
  const key = apiRateLimitKey({
    headers: { authorization: `Bearer ${token}` },
    ip: '203.0.113.10',
  });
  assert.equal(key, 'user:user-42');
});

test('apiRateLimitKey falls back to IP when anonymous', () => {
  const key = apiRateLimitKey({
    headers: {},
    ip: '203.0.113.10',
  });
  assert.equal(key, '203.0.113.10');
});

test('apiRateLimitKey ignores malformed Bearer tokens', () => {
  const key = apiRateLimitKey({
    headers: { authorization: 'Bearer not-a-jwt' },
    ip: '198.51.100.7',
  });
  assert.equal(key, '198.51.100.7');
});

test('apiRateLimitKey ignores forged tokens so they cannot mint fresh buckets', () => {
  const forged = sign({ sub: 'attacker-chosen-id' }, 'not-the-server-secret');
  const key = apiRateLimitKey({ headers: { authorization: `Bearer ${forged}` }, ip: '198.51.100.9' });
  assert.equal(key, '198.51.100.9');
});

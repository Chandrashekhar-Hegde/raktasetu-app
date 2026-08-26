import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  COMPUTE_QUOTA_OPERATOR_MESSAGE,
  classifyDatabaseReadinessError,
  handleMaintenanceJobFailure,
  isComputeQuotaError,
  isTransientDatabaseError,
  mapDatabaseHttpError,
  respondIfDatabaseDown,
  wrapDatabaseError,
} from '../src/db/computeQuota.js';

test('isComputeQuotaError matches Postgres 53000, HTTP 402 quota copy, and Neon quota text', () => {
  assert.equal(isComputeQuotaError({ code: '53000' }), true);
  assert.equal(isComputeQuotaError({ code: '402' }), true);
  assert.equal(isComputeQuotaError({
    status: 402,
    message: 'Your account or project has exceeded the compute time quota.',
  }), true);
  assert.equal(isComputeQuotaError({
    message: 'Server error (HTTP status 402): {"message":"Your account or project has exceeded the compute time quota."}',
  }), true);
  assert.equal(isComputeQuotaError({
    status: 402,
    code: 'INSUFFICIENT_CREDITS',
    message: 'Not enough credits',
  }), false);
  assert.equal(isComputeQuotaError({ code: 'ECONNREFUSED' }), false);
  assert.equal(isComputeQuotaError({ code: '28P01' }), false);
  assert.equal(isComputeQuotaError(null), false);
});

test('classifyDatabaseReadinessError maps quota vs generic connect failures', () => {
  assert.equal(classifyDatabaseReadinessError({ code: '53000' }), 'COMPUTE_QUOTA_EXCEEDED');
  assert.equal(classifyDatabaseReadinessError(new Error('connect ECONNREFUSED')), 'DATABASE_UNAVAILABLE');
});

test('mapDatabaseHttpError maps quota and connect failures, not unique violations', () => {
  assert.deepEqual(mapDatabaseHttpError({ code: '53000' }), {
    status: 503,
    code: 'COMPUTE_QUOTA_EXCEEDED',
    message: 'Database compute quota exceeded',
  });
  assert.equal(mapDatabaseHttpError({ code: 'ECONNREFUSED' }).code, 'DATABASE_UNAVAILABLE');
  assert.equal(mapDatabaseHttpError({ code: '23505' }), null);
  assert.equal(isTransientDatabaseError({ code: '08P01' }), true);
});

test('wrapDatabaseError preserves unique-violation codes for callers', () => {
  const unique = Object.assign(new Error('duplicate'), { code: '23505' });
  assert.equal(wrapDatabaseError(unique), unique);
  const wrapped = wrapDatabaseError({ code: '53000', message: 'exceeded the compute time quota' });
  assert.equal(wrapped.code, 'COMPUTE_QUOTA_EXCEEDED');
  assert.equal(wrapped.status, 503);
});

test('respondIfDatabaseDown writes 503 JSON and does not leak connection strings', () => {
  const chunks = [];
  const res = {
    headersSent: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      chunks.push(body);
      return res;
    },
  };
  const sent = respondIfDatabaseDown(res, {
    code: '53000',
    message: 'exceeded the compute time quota postgresql://raktasetu_app@host/neondb',
  });
  assert.equal(sent, true);
  assert.equal(res.statusCode, 503);
  assert.equal(chunks[0].error.code, 'COMPUTE_QUOTA_EXCEEDED');
  assert.doesNotMatch(JSON.stringify(chunks[0]), /postgresql:\/\//);
});

test('handleMaintenanceJobFailure logs quota errors and exits 0 so cron is not CRASHED', () => {
  const previous = process.exitCode;
  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };
  try {
    process.exitCode = 1;
    handleMaintenanceJobFailure({
      code: '53000',
      message: 'Your account or project has exceeded the compute time quota.',
    });
    assert.equal(process.exitCode, 0);
    assert.equal(errors.includes(COMPUTE_QUOTA_OPERATOR_MESSAGE), true);
  } finally {
    console.error = original;
    process.exitCode = previous;
  }
});

test('handleMaintenanceJobFailure rethrows non-quota errors', () => {
  const err = new Error('password authentication failed');
  err.code = '28P01';
  assert.throws(() => handleMaintenanceJobFailure(err), /password authentication failed/);
});

test('POST /api/auth/login returns 503 not LOGIN_FAILED when the database is unreachable', async () => {
  if (process.env.DATABASE_URL) return;
  const response = await request(createApp({ env: { NODE_ENV: 'test', SERVE_FRONTEND: 'false' } }))
    .post('/api/auth/login')
    .send({ email: 'probe@example.com', password: 'not-a-real-password' })
    .expect('Content-Type', /json/);

  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.ok(
    response.body.error.code === 'DATABASE_UNAVAILABLE'
    || response.body.error.code === 'COMPUTE_QUOTA_EXCEEDED',
  );
  assert.notEqual(response.body.error.code, 'LOGIN_FAILED');
  assert.doesNotMatch(JSON.stringify(response.body), /postgresql:\/\//);
});

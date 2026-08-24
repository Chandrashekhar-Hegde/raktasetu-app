import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPUTE_QUOTA_OPERATOR_MESSAGE,
  classifyDatabaseReadinessError,
  handleMaintenanceJobFailure,
  isComputeQuotaError,
} from '../src/db/computeQuota.js';

test('isComputeQuotaError matches Postgres 53000, HTTP 402, and Neon quota copy', () => {
  assert.equal(isComputeQuotaError({ code: '53000' }), true);
  assert.equal(isComputeQuotaError({ status: 402 }), true);
  assert.equal(isComputeQuotaError({ statusCode: 402 }), true);
  assert.equal(isComputeQuotaError({
    message: 'Your account or project has exceeded the compute time quota. Upgrade your plan to increase limits.',
  }), true);
  assert.equal(isComputeQuotaError({
    message: 'Server error (HTTP status 402): {"message":"Your account or project has exceeded the compute time quota."}',
  }), true);
  assert.equal(isComputeQuotaError({ code: 'ECONNREFUSED' }), false);
  assert.equal(isComputeQuotaError({ code: '28P01' }), false);
  assert.equal(isComputeQuotaError(null), false);
});

test('classifyDatabaseReadinessError maps quota vs generic connect failures', () => {
  assert.equal(classifyDatabaseReadinessError({ code: '53000' }), 'COMPUTE_QUOTA_EXCEEDED');
  assert.equal(classifyDatabaseReadinessError(new Error('connect ECONNREFUSED')), 'DATABASE_UNAVAILABLE');
});

test('handleMaintenanceJobFailure logs quota errors and sets exit 1 without throwing', () => {
  const previous = process.exitCode;
  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };
  try {
    process.exitCode = 0;
    handleMaintenanceJobFailure({
      code: '53000',
      message: 'Your account or project has exceeded the compute time quota.',
    });
    assert.equal(process.exitCode, 1);
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

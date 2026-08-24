/** Neon Free compute-hour exhaustion (Postgres 53000 / HTTP 402). */

export const COMPUTE_QUOTA_OPERATOR_MESSAGE =
  'Neon compute quota exceeded (Postgres 53000 / HTTP 402). Upgrade the Neon plan or wait until quota_reset_at. Connections will fail until compute is restored.';

export function isComputeQuotaError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.code === '53000' || err.code === '402') return true;
  const status = err.status || err.statusCode || err.httpStatusCode;
  if (status === 402) return true;
  const message = String(err.message || '');
  return /exceeded the compute time quota/i.test(message);
}

export function classifyDatabaseReadinessError(err) {
  return isComputeQuotaError(err) ? 'COMPUTE_QUOTA_EXCEEDED' : 'DATABASE_UNAVAILABLE';
}

export function handleMaintenanceJobFailure(err) {
  if (isComputeQuotaError(err)) {
    console.error(COMPUTE_QUOTA_OPERATOR_MESSAGE);
    process.exitCode = 1;
    return;
  }
  throw err;
}

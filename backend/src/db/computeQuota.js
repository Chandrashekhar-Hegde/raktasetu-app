/** Neon Free compute-hour exhaustion (Postgres 53000 / HTTP 402). */

export const COMPUTE_QUOTA_OPERATOR_MESSAGE =
  'Neon compute quota exceeded (Postgres 53000 / HTTP 402). Upgrade the Neon plan or wait until quota_reset_at. Connections will fail until compute is restored.';

const TRANSIENT_NODE_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'EPIPE',
]);

export function isComputeQuotaError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.code === 'COMPUTE_QUOTA_EXCEEDED') return true;
  if (err.code === '53000' || err.code === '402') return true;
  const status = err.status || err.statusCode || err.httpStatusCode;
  if (status === 402 && /quota|compute/i.test(String(err.message || ''))) return true;
  const message = String(err.message || '');
  return /exceeded the compute time quota/i.test(message);
}

export function isTransientDatabaseError(err) {
  if (isComputeQuotaError(err)) return true;
  if (!err || typeof err !== 'object') return false;
  if (err.code === 'DATABASE_UNAVAILABLE') return true;
  const code = String(err.code || '');
  if (TRANSIENT_NODE_CODES.has(code)) return true;
  if (code.startsWith('08')) return true;
  if (code === '57P01' || code === '57P03' || code === '53300') return true;
  return false;
}

export function classifyDatabaseReadinessError(err) {
  return isComputeQuotaError(err) ? 'COMPUTE_QUOTA_EXCEEDED' : 'DATABASE_UNAVAILABLE';
}

export function mapDatabaseHttpError(err) {
  if (isComputeQuotaError(err)) {
    return {
      status: 503,
      code: 'COMPUTE_QUOTA_EXCEEDED',
      message: 'Database compute quota exceeded',
    };
  }
  if (isTransientDatabaseError(err)) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database unavailable',
    };
  }
  return null;
}

export function wrapDatabaseError(err) {
  const mapped = mapDatabaseHttpError(err);
  if (!mapped) return err;
  const wrapped = new Error(mapped.message);
  wrapped.status = mapped.status;
  wrapped.code = mapped.code;
  wrapped.cause = err;
  return wrapped;
}

export function respondIfDatabaseDown(res, err) {
  const mapped = mapDatabaseHttpError(err);
  if (!mapped || res.headersSent) return false;
  res.status(mapped.status).json({
    success: false,
    error: { code: mapped.code, message: mapped.message },
  });
  return true;
}

export function handleMaintenanceJobFailure(err) {
  if (isComputeQuotaError(err) || isTransientDatabaseError(err)) {
    if (isComputeQuotaError(err)) {
      console.error(COMPUTE_QUOTA_OPERATOR_MESSAGE);
    } else {
      console.error('Database unavailable; skipping maintenance job:', err?.code || err?.message);
    }
    // Exit 0 so Railway cron ticks are not marked CRASHED while Neon is gated.
    process.exitCode = 0;
    return;
  }
  throw err;
}

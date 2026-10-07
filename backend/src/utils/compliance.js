import { query } from '../db.js';
import { randomUUID as uuidv4 } from 'node:crypto';

/**
 * Security audit logger for sensitive operations and health-related data access.
 * This technical log is one control; it does not establish HIPAA or DPDP compliance.
 */
const SENSITIVE_KEYS = /password|token|secret|authorization|cookie|email|phone|endpoint/i;

function redactDetails(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEYS.test(key) ? '[REDACTED]' : item,
  ]));
}

export async function logAudit({ userId, action, resourceType, resourceId, details, req, client }) {
    const forwarded = req?.headers?.['x-forwarded-for'];
    const ip = req?.ip || (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || null;
    const userAgent = req?.headers?.['user-agent'] || null;
    const execute = client ? client.query.bind(client) : query;
    await execute(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [uuidv4(), userId || null, action, resourceType, resourceId || null, JSON.stringify(redactDetails(details)), ip, userAgent]
    );
}

/**
 * Check if a token JTI is blacklisted (user logged out)
 */
export async function isTokenBlacklisted(jti) {
  try {
    const result = await query(
      'SELECT id FROM token_blacklist WHERE token_jti = $1 AND expires_at > NOW()',
      [jti]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('[AUTH] Token blacklist check failed:', err.message);
    const error = new Error('Session revocation service unavailable');
    error.status = 503;
    error.code = 'REVOCATION_UNAVAILABLE';
    throw error;
  }
}

/**
 * Blacklist a token (secure logout)
 */
export async function blacklistToken(jti, userId, expiresAt) {
  await query(
    `INSERT INTO token_blacklist (id, token_jti, user_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (token_jti) DO NOTHING`,
    [uuidv4(), jti, userId, expiresAt]
  );
}

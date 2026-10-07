import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomUUID as uuidv4 } from 'node:crypto';
import { query } from '../db.js';
import { withAuthorizationContext } from '../db/authorizedTransaction.js';

export const JWT_ISSUER = 'raktasetu-api';
export const JWT_AUDIENCE = 'raktasetu-app';
export const JWT_ALGORITHM = 'HS256';
export const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '30m';

export function issueAccessToken(user) {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: user.id, role: user.role, jti, token_version: Number(user.token_version || 0) },
    process.env.JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL,
    },
  );
  const decoded = jwt.decode(token);
  return { token, jti, expiresAt: new Date(decoded.exp * 1000) };
}

export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function persistRefreshToken(userId, tokenHash, familyId = uuidv4(), client = null) {
  const id = uuidv4();
  const execute = client ? client.query.bind(client) : query;
  const result = await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')
     RETURNING id, family_id, expires_at`,
    [id, userId, tokenHash, familyId],
  );
  return result.rows[0];
}

export async function issueSession(user, client = null) {
  const access = issueAccessToken(user);
  const refresh = createRefreshToken();
  await persistRefreshToken(user.id, refresh.hash, uuidv4(), client);
  return {
    token: access.token,
    refresh_token: refresh.token,
    expires_at: access.expiresAt.toISOString(),
  };
}

export async function resolveSession(token) {
  if (!token || typeof token !== 'string') {
    const error = new Error('Authentication required');
    error.status = 401;
    error.code = 'AUTHENTICATION_REQUIRED';
    throw error;
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    const error = new Error('Invalid token');
    error.status = 401;
    error.code = 'INVALID_TOKEN';
    throw error;
  }

  if (!decoded.jti) {
    const error = new Error('Token revoked');
    error.status = 401;
    error.code = 'TOKEN_REVOKED';
    throw error;
  }

  const user = await withAuthorizationContext(
    { userId: decoded.sub, role: 'session' },
    async (client) => {
      const revoked = await client.query(
        'SELECT 1 FROM token_blacklist WHERE token_jti = $1 AND expires_at > NOW()',
        [decoded.jti],
      );
      if (revoked.rowCount) return null;
      const result = await client.query(
        `SELECT u.id, u.email, u.name, u.role, u.is_verified, u.token_version,
                u.account_status, u.deleted_at, h.id AS hospital_id,
                h.approval_status
         FROM users u
         LEFT JOIN hospitals h ON h.user_id = u.id
         WHERE u.id = $1`,
        [decoded.sub],
      );
      return result.rows[0];
    },
  );
  if (!user || user.deleted_at || user.account_status !== 'active' ||
      Number(decoded.token_version) !== Number(user.token_version)) {
    const error = new Error('Session is no longer active');
    error.status = 401;
    error.code = 'SESSION_INACTIVE';
    throw error;
  }
  if (user.role === 'hospital' && user.approval_status !== 'approved') {
    const error = new Error('Hospital approval required');
    error.status = 403;
    error.code = 'HOSPITAL_APPROVAL_REQUIRED';
    throw error;
  }
  return { user, claims: decoded };
}

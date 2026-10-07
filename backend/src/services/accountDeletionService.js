import bcrypt from 'bcryptjs';
import { randomUUID as uuidv4 } from 'node:crypto';
import { logAudit } from '../utils/compliance.js';

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/** Google-onboarded donors receive an opaque password they never chose — no password login path. */
export function hasPasswordLoginPath(user) {
  return !(user.google_sub && user.consent_source === 'google_onboarding');
}

export function isWithinDeletionGrace(deletedAt, now = new Date()) {
  if (!deletedAt) return false;
  const deleted = deletedAt instanceof Date ? deletedAt : new Date(deletedAt);
  if (Number.isNaN(deleted.getTime())) return false;
  const deadline = new Date(deleted.getTime());
  deadline.setUTCDate(deadline.getUTCDate() + ACCOUNT_DELETION_GRACE_DAYS);
  return now < deadline;
}

export async function revokeUserSessions(client, { userId, accessClaims }) {
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
  if (accessClaims?.jti && accessClaims?.exp) {
    await client.query(
      `INSERT INTO token_blacklist (id, token_jti, user_id, expires_at)
       VALUES ($1,$2,$3,to_timestamp($4))
       ON CONFLICT (token_jti) DO NOTHING`,
      [uuidv4(), accessClaims.jti, userId, accessClaims.exp],
    );
  }
}

export async function requestAccountDeletion(client, {
  userId,
  password,
  accessClaims,
  req,
}) {
  const locked = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const user = locked.rows[0];
  if (!user || user.deleted_at || user.account_status === 'deactivated' || user.account_status === 'deleted') {
    throw serviceError(409, 'ACCOUNT_ALREADY_DEACTIVATED', 'Account is already deactivated');
  }

  if (hasPasswordLoginPath(user)) {
    if (!password || !await bcrypt.compare(password, user.password_hash)) {
      throw serviceError(401, 'RECENT_AUTH_REQUIRED', 'Current password is required to delete this account');
    }
  }

  const blockers = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM redemptions
         WHERE donor_id = $1 AND status = 'active'
       ) AS has_active_redemption,
       EXISTS (
         SELECT 1 FROM donor_responses
         WHERE donor_id = $1 AND status IN ('accepted', 'arrived')
       ) AS has_open_response`,
    [userId],
  );
  const { has_active_redemption: hasActiveRedemption, has_open_response: hasOpenResponse } = blockers.rows[0];
  if (hasActiveRedemption || hasOpenResponse) {
    const parts = [];
    if (hasActiveRedemption) parts.push('cancel or complete your active credit redemption');
    if (hasOpenResponse) parts.push('finish or cancel your accepted blood-request response');
    throw serviceError(
      409,
      'ACCOUNT_DELETION_BLOCKED',
      `Before deleting your account, please ${parts.join(' and ')}.`,
    );
  }

  await client.query(
    `UPDATE users SET
       account_status = 'deactivated',
       deleted_at = NOW(),
       is_on_call = false,
       token_version = token_version + 1,
       updated_at = NOW()
     WHERE id = $1`,
    [userId],
  );
  await revokeUserSessions(client, { userId, accessClaims });
  await logAudit({
    userId,
    action: 'ACCOUNT_DELETION_REQUESTED',
    resourceType: 'user',
    resourceId: userId,
    details: { grace_days: ACCOUNT_DELETION_GRACE_DAYS },
    req,
    client,
  });
  return { grace_days: ACCOUNT_DELETION_GRACE_DAYS };
}

export async function restoreAccount(client, { email, phone, password, req }) {
  const found = await client.query(
    `SELECT * FROM users
     WHERE deleted_at IS NOT NULL
       AND account_status = 'deactivated'
       AND (${email ? 'lower(email) = $1' : 'phone = $1'})
     FOR UPDATE`,
    [email || phone],
  );
  const user = found.rows[0];
  if (!user) {
    throw serviceError(410, 'ACCOUNT_GONE', 'This account cannot be restored');
  }
  if (!isWithinDeletionGrace(user.deleted_at)) {
    throw serviceError(410, 'ACCOUNT_GONE', 'The restore window has expired');
  }
  if (!hasPasswordLoginPath(user)) {
    throw serviceError(
      403,
      'PASSWORD_RESTORE_UNAVAILABLE',
      'This Google-only account cannot be restored with a password. Contact privacy@raktasetu.org within the restore window.',
    );
  }
  if (!await bcrypt.compare(password, user.password_hash)) {
    throw serviceError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  // Refuse restore if email/phone was claimed by a new active account (partial unique indexes).
  const conflict = await client.query(
    `SELECT 1 FROM users
     WHERE id <> $1 AND deleted_at IS NULL
       AND (lower(email) = lower($2) OR phone = $3)
     LIMIT 1`,
    [user.id, user.email, user.phone],
  );
  if (conflict.rowCount) {
    throw serviceError(409, 'IDENTITY_ALREADY_EXISTS', 'Email or phone is already registered to another account');
  }

  await client.query(
    `UPDATE users SET
       account_status = 'active',
       deleted_at = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [user.id],
  );
  const refreshed = await client.query('SELECT * FROM users WHERE id = $1', [user.id]);
  await logAudit({
    userId: user.id,
    action: 'ACCOUNT_RESTORED',
    resourceType: 'user',
    resourceId: user.id,
    details: { method: 'password' },
    req,
    client,
  });
  return refreshed.rows[0];
}

/**
 * Anonymize accounts past the grace period. Keeps donations, credits, and audit_logs
 * pointing at the anonymized user id for blood-bank traceability.
 */
export async function anonymizeExpiredDeletions(client, { batchSize = 100 } = {}) {
  let total = 0;
  for (;;) {
    const batch = await client.query(
      `SELECT id FROM users
       WHERE account_status = 'deactivated'
         AND deleted_at IS NOT NULL
         AND deleted_at < NOW() - ($1 * INTERVAL '1 day')
         AND email NOT LIKE 'deleted_%@anonymized.invalid'
       ORDER BY deleted_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [ACCOUNT_DELETION_GRACE_DAYS, batchSize],
    );
    if (batch.rowCount === 0) break;

    for (const row of batch.rows) {
      await client.query('DELETE FROM push_subscriptions WHERE user_id = $1', [row.id]);
      await client.query('DELETE FROM family_members WHERE donor_id = $1', [row.id]);
      await client.query(
        `UPDATE users SET
           name = 'Deleted User',
           email = $1,
           phone = $2,
           aadhaar_hash = NULL,
           latitude = NULL,
           longitude = NULL,
           date_of_birth = NULL,
           sex = NULL,
           google_sub = NULL,
           password_hash = '[DELETED]',
           is_on_call = false,
           is_verified = false,
           consent_given = false,
           consent_given_at = NULL,
           consent_policy_version = NULL,
           consent_source = 'account_deletion_purge',
           account_status = 'deleted',
           token_version = token_version + 1,
           updated_at = NOW()
         WHERE id = $3`,
        [
          `deleted_${row.id}@anonymized.invalid`,
          `deleted_${row.id.replaceAll('-', '').slice(0, 12)}`,
          row.id,
        ],
      );
      await logAudit({
        userId: row.id,
        action: 'ACCOUNT_ANONYMIZED',
        resourceType: 'user',
        resourceId: row.id,
        details: { retention_days: ACCOUNT_DELETION_GRACE_DAYS },
        client,
      });
      total += 1;
    }
    if (batch.rowCount < batchSize) break;
  }
  return total;
}

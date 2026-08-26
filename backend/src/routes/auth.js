import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import { withAuthorizationContext } from '../db/authorizedTransaction.js';
import { authenticate } from '../middleware/auth.js';
import { issueSession, createRefreshToken, hashRefreshToken, issueAccessToken } from '../auth/session.js';
import {
  clearRefreshCookie,
  deliverSession,
  readRefreshToken,
} from '../auth/refreshCookie.js';
import { createOneTimeToken, decideGoogleFlow, hashOneTimeToken, verifyGoogleIdentity } from '../auth/google.js';
import { logAudit } from '../utils/compliance.js';
import { buildAccountExport } from '../utils/dataExport.js';
import { disconnectUser } from '../realtime/publisher.js';
import { mapDatabaseHttpError } from '../db/computeQuota.js';
import {
  consentSchema,
  deleteAccountSchema,
  googleLinkSchema,
  googleOnboardingSchema,
  googleTokenSchema,
  loginSchema,
  registrationSchema,
  restoreAccountSchema,
  validate,
} from '../validation/schemas.js';
import {
  isWithinDeletionGrace,
  requestAccountDeletion,
  restoreAccount,
} from '../services/accountDeletionService.js';

const router = express.Router();

function failure(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

function failureFromCaught(res, error, fallbackStatus, fallbackCode, fallbackMessage) {
  const mapped = mapDatabaseHttpError(error);
  if (mapped) return failure(res, mapped.status, mapped.code, mapped.message);
  if (error?.status && error?.code && typeof error.code === 'string' && /[A-Z_]/.test(error.code)) {
    return failure(res, error.status, error.code, error.message);
  }
  return failure(res, fallbackStatus, fallbackCode, fallbackMessage);
}

function publicUser(user) {
  const safe = { ...user };
  delete safe.password_hash;
  delete safe.google_sub;
  delete safe.token_version;
  delete safe.deleted_at;
  return safe;
}

function sessionResponse(res, req, status, user, session, extra = {}) {
  const delivered = deliverSession(res, session, req);
  return res.status(status).json({
    success: true,
    data: { user: publicUser(user), ...delivered, ...extra },
  });
}

router.post('/register', validate(registrationSchema), async (req, res) => {
  const input = req.body;
  try {
    const result = await withAuthorizationContext({ role: 'auth' }, async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM users
         WHERE (lower(email) = $1 OR phone = $2)
           AND (
             deleted_at IS NULL
             OR (
               account_status = 'deactivated'
               AND deleted_at > NOW() - INTERVAL '30 days'
             )
           )`,
        [input.email, input.phone],
      );
      if (existing.rowCount) return { conflict: true };

      const userId = uuidv4();
      const now = new Date();
      const passwordHash = await bcrypt.hash(input.password, 12);
      const inserted = await client.query(
        `INSERT INTO users (
           id, email, phone, password_hash, name, role, blood_group, date_of_birth, sex,
           latitude, longitude, city, state, is_verified, is_on_call, ping_radius_km,
           consent_given, consent_given_at, consent_policy_version, consent_source,
           token_version, account_status, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14,$15,
           true,$16,$17,'registration_form',0,'active',$16,$16
         ) RETURNING *`,
        [
          userId, input.email, input.phone, passwordHash, input.name, input.role,
          input.blood_group || null, input.date_of_birth || null, input.sex || null,
          input.latitude ?? null, input.longitude ?? null, input.city, input.state,
          input.role === 'donor' ? false : null,
          input.role === 'donor' ? 10 : null,
          now, input.consent_policy_version,
        ],
      );
      const user = inserted.rows[0];
      if (input.role === 'hospital') {
        await client.query(
          `INSERT INTO hospitals (
             id, user_id, name, address, license_number, latitude, longitude,
             city, state, phone, is_verified, approval_status, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,'pending',$11,$11)`,
          [
            uuidv4(), userId, input.hospital_name, input.address, input.license_number,
            input.latitude ?? null, input.longitude ?? null, input.city, input.state,
            input.phone, now,
          ],
        );
      }
      await logAudit({
        userId,
        action: input.role === 'hospital' ? 'HOSPITAL_REGISTERED_PENDING' : 'DONOR_REGISTERED',
        resourceType: 'user',
        resourceId: userId,
        details: { role: input.role },
        req,
        client,
      });
      if (input.role === 'hospital') return { pending: true };
      return { user, session: await issueSession(user, client) };
    });

    if (result.conflict) return failure(res, 409, 'IDENTITY_ALREADY_EXISTS', 'Email or phone is already registered');
    if (result.pending) {
      return res.status(202).json({ success: true, data: { status: 'pending_approval' } });
    }
    return sessionResponse(res, req, 201, result.user, result.session);
  } catch (error) {
    console.error('Registration failed:', error.message);
    return failureFromCaught(res, error, 500, 'REGISTRATION_FAILED', 'Registration failed');
  }
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, phone, password } = req.body;
  try {
    const result = await withAuthorizationContext({ role: 'auth' }, async (client) => {
      const found = await client.query(
        `SELECT u.*, h.id AS hospital_id, h.approval_status
         FROM users u
         LEFT JOIN hospitals h ON h.user_id = u.id
         WHERE (${email ? 'lower(u.email) = $1' : 'u.phone = $1'})
         ORDER BY CASE WHEN u.deleted_at IS NULL THEN 0 ELSE 1 END, u.created_at DESC
         LIMIT 1`,
        [email || phone],
      );
      const user = found.rows[0];
      if (!user || !user.password_hash || user.password_hash === '[DELETED]'
          || !await bcrypt.compare(password, user.password_hash)) {
        await logAudit({
          action: 'LOGIN_FAILED',
          resourceType: 'session',
          details: { category: 'invalid_credentials' },
          req,
          client,
        });
        return { invalid: true };
      }
      if (user.deleted_at || user.account_status === 'deactivated' || user.account_status === 'deleted') {
        if (user.account_status === 'deactivated' && isWithinDeletionGrace(user.deleted_at)) {
          return { restorable: true };
        }
        return { gone: true };
      }
      if (user.account_status !== 'active') return { inactive: user.account_status };
      if (user.role === 'hospital' && user.approval_status !== 'approved') {
        return { hospitalPending: user.approval_status || 'pending' };
      }
      const session = await issueSession(user, client);
      await logAudit({
        userId: user.id,
        action: 'LOGIN_SUCCEEDED',
        resourceType: 'session',
        resourceId: user.id,
        details: { method: 'password' },
        req,
        client,
      });
      return { user, session };
    });
    if (result.invalid) return failure(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    if (result.restorable) {
      return failure(
        res,
        403,
        'ACCOUNT_RESTORABLE',
        'This account was scheduled for deletion. You can restore it within 30 days using Restore account.',
      );
    }
    if (result.gone) {
      return failure(res, 410, 'ACCOUNT_GONE', 'This account has been permanently deleted');
    }
    if (result.inactive) return failure(res, 403, 'ACCOUNT_NOT_ACTIVE', 'Account is not active');
    if (result.hospitalPending) {
      return failure(res, 403, 'HOSPITAL_APPROVAL_PENDING', 'Hospital access is pending administrator approval');
    }
    return sessionResponse(res, req, 200, result.user, result.session);
  } catch (error) {
    console.error('Login failed:', error.message);
    return failureFromCaught(res, error, 500, 'LOGIN_FAILED', 'Login failed');
  }
});

router.post('/google', validate(googleTokenSchema), async (req, res) => {
  try {
    const identity = await verifyGoogleIdentity(req.body.id_token);
    const result = await withAuthorizationContext({ role: 'auth' }, async (client) => {
      const matches = await client.query(
        `SELECT id, email, name, role, token_version, account_status, google_sub, deleted_at,
                consent_source
         FROM users
         WHERE google_sub = $1 OR lower(email) = $2
         ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, created_at DESC`,
        [identity.googleSub, identity.email],
      );
      const activeRows = matches.rows.filter((row) => !row.deleted_at);
      const googleMatch = activeRows.find((row) => row.google_sub === identity.googleSub) || null;
      const emailMatch = activeRows.find((row) => row.email.toLowerCase() === identity.email) || null;

      if (!googleMatch && !emailMatch) {
        const deactivated = matches.rows.find((row) => (
          row.deleted_at
          && row.account_status === 'deactivated'
          && row.google_sub === identity.googleSub
          && isWithinDeletionGrace(row.deleted_at)
        ));
        if (deactivated) {
          await client.query(
            `UPDATE users SET account_status = 'active', deleted_at = NULL, updated_at = NOW()
             WHERE id = $1`,
            [deactivated.id],
          );
          await logAudit({
            userId: deactivated.id,
            action: 'ACCOUNT_RESTORED',
            resourceType: 'user',
            resourceId: deactivated.id,
            details: { method: 'google' },
            req,
            client,
          });
          const restored = { ...deactivated, account_status: 'active', deleted_at: null };
          const session = await issueSession(restored, client);
          return { flow: 'session', user: restored, session, restored: true };
        }
        const restorableHint = matches.rows.find((row) => (
          row.deleted_at
          && row.account_status === 'deactivated'
          && row.email?.toLowerCase() === identity.email
          && isWithinDeletionGrace(row.deleted_at)
        ));
        if (restorableHint) return { flow: 'restorable' };
      }

      const decision = decideGoogleFlow({ googleMatch, emailMatch });
      if (decision.flow === 'session') {
        const session = await issueSession(googleMatch, client);
        await logAudit({
          userId: googleMatch.id,
          action: 'LOGIN_GOOGLE_SUCCEEDED',
          resourceType: 'session',
          resourceId: googleMatch.id,
          req,
          client,
        });
        return { ...decision, user: googleMatch, session };
      }
      if (decision.flow === 'onboarding_required') {
        const oneTime = createOneTimeToken();
        await client.query(
          `INSERT INTO pending_google_registrations
             (id, token_hash, google_sub, email, display_name, expires_at)
           VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '15 minutes')
           ON CONFLICT (google_sub) DO UPDATE SET
             token_hash = EXCLUDED.token_hash, email = EXCLUDED.email,
             display_name = EXCLUDED.display_name, expires_at = EXCLUDED.expires_at,
             consumed_at = NULL`,
          [uuidv4(), oneTime.hash, identity.googleSub, identity.email, identity.name],
        );
        return { ...decision, onboarding_token: oneTime.token };
      }
      return decision;
    });
    if (result.flow === 'restorable') {
      return failure(
        res,
        403,
        'ACCOUNT_RESTORABLE',
        'This account was scheduled for deletion. Restore it within 30 days from the sign-in page.',
      );
    }
    if (result.flow === 'privileged_link_denied') {
      return failure(res, 403, 'PRIVILEGED_GOOGLE_LINK_DENIED', 'This Google flow is for donor accounts only');
    }
    if (result.flow === 'link_required') {
      return failure(res, 409, 'ACCOUNT_LINK_REQUIRED', 'Sign in with your donor password to link Google');
    }
    if (result.flow === 'session') {
      return sessionResponse(res, req, 200, result.user, result.session, { flow: 'session' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    return failureFromCaught(res, error, 401, 'GOOGLE_SIGN_IN_FAILED', 'Google Sign-In failed');
  }
});

router.post('/google/onboarding', validate(googleOnboardingSchema), async (req, res) => {
  try {
    const input = req.body;
    const result = await withAuthorizationContext({ role: 'auth' }, async (client) => {
      const pendingResult = await client.query(
        `SELECT * FROM pending_google_registrations
         WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [hashOneTimeToken(input.onboarding_token)],
      );
      const pending = pendingResult.rows[0];
      if (!pending) return { invalid: true };
      const conflict = await client.query(
        'SELECT 1 FROM users WHERE (lower(email) = $1 OR phone = $2 OR google_sub = $3) AND deleted_at IS NULL',
        [pending.email.toLowerCase(), input.phone, pending.google_sub],
      );
      if (conflict.rowCount) return { conflict: true };
      const userId = uuidv4();
      const opaquePassword = await bcrypt.hash(uuidv4() + uuidv4(), 12);
      const inserted = await client.query(
        `INSERT INTO users (
           id,email,phone,password_hash,name,role,blood_group,date_of_birth,sex,city,state,
           is_verified,is_on_call,ping_radius_km,consent_given,consent_given_at,
           consent_policy_version,consent_source,token_version,google_sub,account_status
         ) VALUES ($1,$2,$3,$4,$5,'donor',$6,$7,$8,$9,$10,false,false,10,true,NOW(),$11,'google_onboarding',0,$12,'active')
         RETURNING *`,
        [
          userId, pending.email.toLowerCase(), input.phone, opaquePassword, pending.display_name,
          input.blood_group, input.date_of_birth, input.sex, input.city, input.state,
          input.consent_policy_version, pending.google_sub,
        ],
      );
      await client.query('UPDATE pending_google_registrations SET consumed_at = NOW() WHERE id = $1', [pending.id]);
      await logAudit({
        userId,
        action: 'GOOGLE_ONBOARDING_COMPLETED',
        resourceType: 'user',
        resourceId: userId,
        req,
        client,
      });
      const user = inserted.rows[0];
      return { user, session: await issueSession(user, client) };
    });
    if (result.invalid) return failure(res, 401, 'ONBOARDING_TOKEN_INVALID', 'Onboarding session expired');
    if (result.conflict) return failure(res, 409, 'IDENTITY_ALREADY_EXISTS', 'This identity is already registered');
    return sessionResponse(res, req, 201, result.user, result.session);
  } catch (error) {
    console.error('Google onboarding failed:', error.message);
    return failureFromCaught(res, error, 500, 'GOOGLE_ONBOARDING_FAILED', 'Google onboarding failed');
  }
});

router.post('/google/link', authenticate, validate(googleLinkSchema), async (req, res) => {
  if (req.user.role !== 'donor') {
    return failure(res, 403, 'PRIVILEGED_GOOGLE_LINK_DENIED', 'Only donor accounts can link Google');
  }
  try {
    const identity = await verifyGoogleIdentity(req.body.id_token);
    if (identity.email !== req.user.email.toLowerCase()) {
      return failure(res, 409, 'GOOGLE_EMAIL_MISMATCH', 'Google email must match your donor account');
    }
    const result = await withAuthorizationContext(
      { userId: req.user.id, role: 'donor' },
      async (client) => {
        const locked = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
        const user = locked.rows[0];
        if (!user || !await bcrypt.compare(req.body.password, user.password_hash)) return { invalidPassword: true };
        const conflict = await client.query(
          'SELECT 1 FROM users WHERE google_sub = $1 AND id <> $2 AND deleted_at IS NULL',
          [identity.googleSub, req.user.id],
        );
        if (conflict.rowCount) return { conflict: true };
        await client.query('UPDATE users SET google_sub = $1, updated_at = NOW() WHERE id = $2', [identity.googleSub, req.user.id]);
        await logAudit({
          userId: req.user.id,
          action: 'GOOGLE_ACCOUNT_LINKED',
          resourceType: 'user',
          resourceId: req.user.id,
          req,
          client,
        });
        return { linked: true };
      },
    );
    if (result.invalidPassword) return failure(res, 401, 'RECENT_AUTH_REQUIRED', 'Password confirmation failed');
    if (result.conflict) return failure(res, 409, 'GOOGLE_IDENTITY_ALREADY_LINKED', 'Google identity is already linked');
    return res.json({ success: true, data: { linked: true } });
  } catch (error) {
    return failureFromCaught(res, error, 500, 'GOOGLE_LINK_FAILED', 'Google linking failed');
  }
});

router.post('/refresh', async (req, res) => {
  const refreshToken = readRefreshToken(req);
  const bodyKeys = Object.keys(req.body || {});
  const invalidBody = bodyKeys.some((key) => key !== 'refresh_token');
  if (!refreshToken || invalidBody) {
    return failure(res, 400, 'VALIDATION_ERROR', 'A valid refresh token is required');
  }
  try {
    const result = await withAuthorizationContext({ role: 'auth' }, async (client) => {
      const found = await client.query(
        `SELECT rt.*, u.id AS account_id, u.role, u.token_version, u.account_status, u.deleted_at,
                h.id AS hospital_id, h.approval_status
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         LEFT JOIN hospitals h ON h.user_id = u.id
         WHERE rt.token_hash = $1
         FOR UPDATE OF rt`,
        [hashRefreshToken(refreshToken)],
      );
      const record = found.rows[0];
      if (!record || record.revoked_at || record.expires_at <= new Date()) return { invalid: true };
      if (record.account_status !== 'active' || record.deleted_at ||
          (record.role === 'hospital' && record.approval_status !== 'approved')) {
        return { inactive: true };
      }
      const nextRefresh = createRefreshToken();
      const nextId = uuidv4();
      await client.query(
        `INSERT INTO refresh_tokens (id,user_id,token_hash,family_id,expires_at)
         VALUES ($1,$2,$3,$4,NOW() + INTERVAL '30 days')`,
        [nextId, record.user_id, nextRefresh.hash, record.family_id],
      );
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $1 WHERE id = $2',
        [nextId, record.id],
      );
      const access = issueAccessToken({
        id: record.account_id,
        role: record.role,
        token_version: record.token_version,
      });
      return { token: access.token, refresh_token: nextRefresh.token, expires_at: access.expiresAt.toISOString() };
    });
    if (result.invalid || result.inactive) {
      clearRefreshCookie(res);
      return failure(res, 401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
    }
    const delivered = deliverSession(res, result, req);
    return res.json({ success: true, data: delivered });
  } catch (error) {
    console.error('Token refresh failed:', error.message);
    return failureFromCaught(res, error, 500, 'TOKEN_REFRESH_FAILED', 'Token refresh failed');
  }
});

router.post('/logout', authenticate, async (req, res) => {
  try {
    const refreshToken = readRefreshToken(req);
    await withAuthorizationContext(
      { userId: req.user.id, role: req.user.role, hospitalId: req.user.hospital_id || '' },
      async (client) => {
        await client.query(
          `INSERT INTO token_blacklist (id, token_jti, user_id, expires_at)
           VALUES ($1,$2,$3,to_timestamp($4))
           ON CONFLICT (token_jti) DO NOTHING`,
          [uuidv4(), req.auth.claims.jti, req.user.id, req.auth.claims.exp],
        );
        if (refreshToken) {
          await client.query(
            'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL',
            [req.user.id, hashRefreshToken(refreshToken)],
          );
        }
        await logAudit({
          userId: req.user.id,
          action: 'LOGOUT_SESSION_REVOKED',
          resourceType: 'session',
          resourceId: req.user.id,
          req,
          client,
        });
      },
    );
    disconnectUser(req.user.id);
    clearRefreshCookie(res);
    return res.json({ success: true, data: { message: 'Logged out' } });
  } catch (error) {
    console.error('Logout failed:', error.message);
    return failureFromCaught(res, error, 503, 'LOGOUT_REVOCATION_FAILED', 'Could not revoke this session');
  }
});

router.post('/consent', authenticate, validate(consentSchema), async (req, res) => {
  const result = await query(
    `UPDATE users SET consent_given = $1, consent_given_at = NOW(),
       consent_policy_version = $2, consent_source = 'account_settings', updated_at = NOW()
     WHERE id = $3
     RETURNING consent_given, consent_given_at, consent_policy_version, consent_source`,
    [req.body.consent_given, '2026-07-15', req.user.id],
  );
  await logAudit({
    userId: req.user.id,
    action: req.body.consent_given ? 'CONSENT_GIVEN' : 'CONSENT_WITHDRAWN',
    resourceType: 'user',
    resourceId: req.user.id,
    req,
  });
  return res.json({ success: true, data: { consent: result.rows[0] } });
});

router.get('/me', authenticate, async (req, res) => {
  const result = await query(
    `SELECT u.id,u.email,u.phone,u.name,u.role,u.blood_group,u.date_of_birth,u.sex,u.latitude,u.longitude,
            u.city,u.state,u.is_verified,u.is_on_call,u.ping_radius_km,u.last_donation_date,
            u.next_eligible_date,u.consent_given,u.consent_given_at,u.consent_policy_version,
            u.account_status,u.created_at,u.updated_at,h.id AS hospital_id,h.name AS hospital_name,
            h.approval_status
     FROM users u LEFT JOIN hospitals h ON h.user_id = u.id WHERE u.id = $1`,
    [req.user.id],
  );
  return res.json({ success: true, data: { user: result.rows[0] } });
});

async function readAll(execute, sql, params) {
  const pageSize = 250;
  const rows = [];
  let offset = 0;
  for (;;) {
    const result = await execute(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, offset]);
    rows.push(...result.rows);
    if (result.rowCount < pageSize) return rows;
    offset += pageSize;
  }
}

router.get('/export', authenticate, async (req, res) => {
  const execute = query;
  const [user, hospitalResult] = await Promise.all([
    query(`SELECT id,email,phone,name,role,blood_group,date_of_birth,sex,latitude,longitude,city,state,
                  is_verified,is_on_call,ping_radius_km,last_donation_date,next_eligible_date,
                  consent_given,consent_given_at,consent_policy_version,consent_source,created_at,updated_at
           FROM users WHERE id = $1`, [req.user.id]),
    query('SELECT * FROM hospitals WHERE user_id = $1', [req.user.id]),
  ]);
  const hospital = hospitalResult.rows[0] || null;
  const [donations, responses, credits, familyMembers, notifications, bloodRequests] = await Promise.all([
    readAll(execute, 'SELECT * FROM donations WHERE donor_id = $1 ORDER BY created_at DESC,id DESC', [req.user.id]),
    readAll(execute, 'SELECT * FROM donor_responses WHERE donor_id = $1 ORDER BY created_at DESC,id DESC', [req.user.id]),
    readAll(execute, 'SELECT * FROM credits WHERE donor_id = $1 ORDER BY created_at DESC,id DESC', [req.user.id]),
    readAll(execute, 'SELECT * FROM family_members WHERE donor_id = $1 ORDER BY created_at DESC,id DESC', [req.user.id]),
    readAll(execute, 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC,id DESC', [req.user.id]),
    hospital ? readAll(execute, 'SELECT * FROM blood_requests WHERE hospital_id = $1 ORDER BY created_at DESC,id DESC', [hospital.id]) : [],
  ]);
  await logAudit({
    userId: req.user.id,
    action: 'ACCOUNT_DATA_EXPORTED',
    resourceType: 'user',
    resourceId: req.user.id,
    req,
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    success: true,
    data: buildAccountExport({
      user: user.rows[0], hospital, donations, responses, credits,
      familyMembers, notifications, bloodRequests,
    }),
  });
});

router.delete('/me', authenticate, validate(deleteAccountSchema), async (req, res) => {
  // Legacy alias — prefer POST /api/auth/delete-account.
  return deleteAccountHandler(req, res);
});

router.post('/delete-account', authenticate, validate(deleteAccountSchema), async (req, res) => {
  return deleteAccountHandler(req, res);
});

async function deleteAccountHandler(req, res) {
  try {
    const result = await withAuthorizationContext(
      { userId: req.user.id, role: req.user.role, hospitalId: req.user.hospital_id || '' },
      async (client) => requestAccountDeletion(client, {
        userId: req.user.id,
        password: req.body.password,
        accessClaims: req.auth?.claims,
        req,
      }),
    );
    disconnectUser(req.user.id);
    clearRefreshCookie(res);
    return res.json({
      success: true,
      data: {
        message: 'Account deactivated. You can restore within 30 days.',
        grace_days: result.grace_days,
      },
    });
  } catch (error) {
    if (error.status && error.code) {
      return failure(res, error.status, error.code, error.message);
    }
    console.error('Account deletion failed:', error.message);
    return failureFromCaught(res, error, 500, 'ACCOUNT_DELETION_FAILED', 'Account deletion failed');
  }
}

router.post('/restore-account', validate(restoreAccountSchema), async (req, res) => {
  const { email, phone, password } = req.body;
  try {
    const result = await withAuthorizationContext({ role: 'auth' }, async (client) => {
      const user = await restoreAccount(client, { email, phone, password, req });
      const session = await issueSession(user, client);
      return { user, session };
    });
    return sessionResponse(res, req, 200, result.user, result.session, { restored: true });
  } catch (error) {
    if (error.status && error.code) {
      return failure(res, error.status, error.code, error.message);
    }
    console.error('Account restore failed:', error.message);
    return failureFromCaught(res, error, 500, 'ACCOUNT_RESTORE_FAILED', 'Account restore failed');
  }
});

router.get('/policy-version', (req, res) => {
  res.json({ success: true, data: { version: '2026-07-15' } });
});

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  return failureFromCaught(res, error, 500, 'AUTH_ERROR', 'Authentication operation failed');
});

export default router;

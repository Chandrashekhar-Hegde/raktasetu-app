import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { randomUUID as uuidv4 } from 'node:crypto';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  anonymizeExpiredDeletions,
  hasPasswordLoginPath,
  isWithinDeletionGrace,
  requestAccountDeletion,
  restoreAccount,
  revokeUserSessions,
} from '../src/services/accountDeletionService.js';

const { Client } = pg;
const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL?.startsWith('postgres'));

test('hasPasswordLoginPath is false only for Google-onboarded donors', () => {
  assert.equal(hasPasswordLoginPath({ google_sub: null, consent_source: 'registration_form' }), true);
  assert.equal(hasPasswordLoginPath({ google_sub: 'g1', consent_source: 'registration_form' }), true);
  assert.equal(hasPasswordLoginPath({ google_sub: 'g1', consent_source: 'google_onboarding' }), false);
});

test('isWithinDeletionGrace respects 30-day window', () => {
  const now = new Date('2026-07-21T12:00:00Z');
  assert.equal(isWithinDeletionGrace(new Date('2026-07-01T12:00:00Z'), now), true);
  assert.equal(isWithinDeletionGrace(new Date('2026-06-20T12:00:00Z'), now), false);
  assert.equal(isWithinDeletionGrace(null, now), false);
  assert.equal(ACCOUNT_DELETION_GRACE_DAYS, 30);
});

function deletionFakeClient({
  user,
  activeRedemption = false,
  openResponse = false,
} = {}) {
  const state = {
    updates: [],
    revokedRefresh: false,
    blacklisted: false,
    audits: [],
  };
  return {
    state,
    async query(sql, params) {
      if (sql.includes('FROM users') && sql.includes('FOR UPDATE') && sql.includes('WHERE id')) {
        return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
      }
      if (sql.includes('has_active_redemption')) {
        return {
          rows: [{
            has_active_redemption: activeRedemption,
            has_open_response: openResponse,
          }],
        };
      }
      if (sql.includes("account_status = 'deactivated'")) {
        state.updates.push({ sql, params });
        return { rowCount: 1 };
      }
      if (sql.includes('UPDATE refresh_tokens SET revoked_at')) {
        state.revokedRefresh = true;
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO token_blacklist')) {
        state.blacklisted = true;
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        state.audits.push(params);
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

test('deletion revokes sessions immediately and bumps token version path', async () => {
  const passwordHash = await bcrypt.hash('ValidPass123!', 4);
  const user = {
    id: 'donor-1',
    password_hash: passwordHash,
    google_sub: null,
    consent_source: 'registration_form',
    deleted_at: null,
    account_status: 'active',
  };
  const client = deletionFakeClient({ user });
  const result = await requestAccountDeletion(client, {
    userId: user.id,
    password: 'ValidPass123!',
    accessClaims: { jti: 'jti-1', exp: Math.floor(Date.now() / 1000) + 3600 },
  });
  assert.equal(result.grace_days, 30);
  assert.equal(client.state.revokedRefresh, true);
  assert.equal(client.state.blacklisted, true);
  assert.equal(client.state.audits.length, 1);
  assert.equal(client.state.audits[0][2], 'ACCOUNT_DELETION_REQUESTED');
});

test('blocked deletion returns 409 for active redemption', async () => {
  const passwordHash = await bcrypt.hash('ValidPass123!', 4);
  const client = deletionFakeClient({
    user: {
      id: 'donor-1',
      password_hash: passwordHash,
      google_sub: null,
      consent_source: 'registration_form',
      deleted_at: null,
      account_status: 'active',
    },
    activeRedemption: true,
  });
  await assert.rejects(
    () => requestAccountDeletion(client, {
      userId: 'donor-1',
      password: 'ValidPass123!',
      accessClaims: { jti: 'jti-1', exp: 9999999999 },
    }),
    (error) => error.status === 409 && error.code === 'ACCOUNT_DELETION_BLOCKED',
  );
});

test('blocked deletion returns 409 for accepted uncompleted response', async () => {
  const passwordHash = await bcrypt.hash('ValidPass123!', 4);
  const client = deletionFakeClient({
    user: {
      id: 'donor-1',
      password_hash: passwordHash,
      google_sub: null,
      consent_source: 'registration_form',
      deleted_at: null,
      account_status: 'active',
    },
    openResponse: true,
  });
  await assert.rejects(
    () => requestAccountDeletion(client, {
      userId: 'donor-1',
      password: 'ValidPass123!',
      accessClaims: null,
    }),
    (error) => error.status === 409 && error.code === 'ACCOUNT_DELETION_BLOCKED',
  );
});

test('Google-only accounts can delete without password', async () => {
  const client = deletionFakeClient({
    user: {
      id: 'donor-g',
      password_hash: await bcrypt.hash(uuidv4(), 4),
      google_sub: 'google-sub-1',
      consent_source: 'google_onboarding',
      deleted_at: null,
      account_status: 'active',
    },
  });
  const result = await requestAccountDeletion(client, {
    userId: 'donor-g',
    password: undefined,
    accessClaims: null,
  });
  assert.equal(result.grace_days, 30);
});

test('revokeUserSessions blacklists jti and revokes refresh tokens', async () => {
  const client = deletionFakeClient({});
  await revokeUserSessions(client, {
    userId: 'u1',
    accessClaims: { jti: 'abc', exp: 9999999999 },
  });
  assert.equal(client.state.revokedRefresh, true);
  assert.equal(client.state.blacklisted, true);
});

test('account deletion integration: deactivate, hide from matching, restore, purge', {
  skip: !hasTestDatabase,
}, async () => {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: (process.env.TEST_DATABASE_URL.includes('localhost')
      || process.env.TEST_DATABASE_URL.includes('127.0.0.1'))
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();

  const hospitalUserId = uuidv4();
  const hospitalId = uuidv4();
  const donorId = uuidv4();
  const password = 'ValidPass123!';
  const passwordHash = await bcrypt.hash(password, 4);
  const donationId = uuidv4();
  const phone = `+91${donorId.replaceAll('-', '').slice(0, 10)}`;
  const email = `${donorId}@deletion.test`;

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,blood_group,latitude,longitude,
         date_of_birth,sex,aadhaar_hash,is_verified,is_on_call,consent_given,consent_source,
         token_version,account_status,created_at,updated_at
       ) VALUES
       ($1,$2,$3,'x','Hospital','hospital','Hubli','KA',NULL,NULL,NULL,NULL,NULL,NULL,true,false,true,'registration_form',0,'active',NOW(),NOW()),
       ($4,$5,$6,$7,'Donor Delete','donor','Hubli','KA','O+',15.36,75.12,'1990-01-01','male','aadhaar-hash',
        true,true,true,'registration_form',0,'active',NOW(),NOW())`,
      [
        hospitalUserId, `${hospitalUserId}@h.test`, `+91${hospitalUserId.replaceAll('-', '').slice(0, 10)}`,
        donorId, email, phone, passwordHash,
      ],
    );
    await client.query(
      `INSERT INTO hospitals (
         id,user_id,name,license_number,address,city,state,latitude,longitude,
         is_verified,approval_status,created_at,updated_at
       ) VALUES ($1,$2,'H','LIC','Addr','Hubli','KA',15.36,75.12,true,'approved',NOW(),NOW())`,
      [hospitalId, hospitalUserId],
    );
    await client.query(
      `INSERT INTO donations (id, donor_id, hospital_id, blood_group, units, verified_by, verified_at, created_at)
       VALUES ($1,$2,$3,'O+',1,$4,NOW(),NOW())`,
      [donationId, donorId, hospitalId, hospitalUserId],
    );
    await client.query(
      `INSERT INTO refresh_tokens (id,user_id,token_hash,family_id,expires_at)
       VALUES ($1,$2,'hash-del',$3,NOW() + INTERVAL '7 days')`,
      [uuidv4(), donorId, uuidv4()],
    );
    await client.query('COMMIT');

    await client.query('BEGIN');
    await requestAccountDeletion(client, {
      userId: donorId,
      password,
      accessClaims: { jti: `jti-${donorId}`, exp: Math.floor(Date.now() / 1000) + 3600 },
    });
    await client.query('COMMIT');

    const afterDelete = await client.query(
      'SELECT account_status, deleted_at, is_on_call, token_version, email, name FROM users WHERE id = $1',
      [donorId],
    );
    assert.equal(afterDelete.rows[0].account_status, 'deactivated');
    assert.ok(afterDelete.rows[0].deleted_at);
    assert.equal(afterDelete.rows[0].is_on_call, false);
    assert.equal(Number(afterDelete.rows[0].token_version) > 0, true);
    assert.equal(afterDelete.rows[0].email, email);

    const revoked = await client.query(
      'SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NOT NULL',
      [donorId],
    );
    assert.equal(revoked.rows[0].n >= 1, true);

    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE raktasetu_rls');
    await client.query("SELECT set_config('app.user_id',$1,true)", [hospitalUserId]);
    await client.query("SELECT set_config('app.role','hospital',true)");
    await client.query("SELECT set_config('app.hospital_id',$1,true)", [hospitalId]);
    const visible = await client.query(
      'SELECT id FROM hospital_visible_on_call_donors($1)',
      [['O+', 'O-']],
    );
    assert.equal(visible.rows.some((row) => row.id === donorId), false);
    await client.query('ROLLBACK');

    await client.query('BEGIN');
    const restored = await restoreAccount(client, { email, password });
    assert.equal(restored.account_status, 'active');
    assert.equal(restored.deleted_at, null);
    await client.query('COMMIT');

    // Soft-delete again and backdate past grace for purge.
    await client.query('BEGIN');
    await requestAccountDeletion(client, {
      userId: donorId,
      password,
      accessClaims: null,
    });
    await client.query(
      `UPDATE users SET deleted_at = NOW() - INTERVAL '31 days' WHERE id = $1`,
      [donorId],
    );
    await client.query('COMMIT');

    await client.query(
      `INSERT INTO family_members (id, donor_id, name, relation, created_at)
       VALUES ($1,$2,'Fam','spouse',NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), donorId],
    ).catch(() => {});
    await client.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES ($1,$2,'https://example.com/push','p256','auth',NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), donorId],
    ).catch(() => {});

    await client.query('BEGIN');
    const purged = await anonymizeExpiredDeletions(client, { batchSize: 50 });
    assert.equal(purged >= 1, true);
    await client.query('COMMIT');

    const anonymized = await client.query(
      `SELECT name, email, phone, aadhaar_hash, latitude, longitude, date_of_birth, sex, account_status
       FROM users WHERE id = $1`,
      [donorId],
    );
    const row = anonymized.rows[0];
    assert.equal(row.name, 'Deleted User');
    assert.match(row.email, /^deleted_/);
    assert.equal(row.aadhaar_hash, null);
    assert.equal(row.latitude, null);
    assert.equal(row.longitude, null);
    assert.equal(row.date_of_birth, null);
    assert.equal(row.sex, null);
    assert.equal(row.account_status, 'deleted');

    const donations = await client.query('SELECT id FROM donations WHERE donor_id = $1', [donorId]);
    assert.equal(donations.rowCount >= 1, true);

    await client.query('BEGIN');
    await assert.rejects(
      () => restoreAccount(client, { email: row.email, password }),
      (error) => error.status === 410 && error.code === 'ACCOUNT_GONE',
    );
    await client.query('ROLLBACK');
  } finally {
    await client.query('BEGIN');
    await client.query('DELETE FROM donations WHERE donor_id = $1', [donorId]).catch(() => {});
    await client.query('DELETE FROM push_subscriptions WHERE user_id = $1', [donorId]).catch(() => {});
    await client.query('DELETE FROM family_members WHERE donor_id = $1', [donorId]).catch(() => {});
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [donorId]).catch(() => {});
    await client.query('DELETE FROM token_blacklist WHERE user_id = $1', [donorId]).catch(() => {});
    await client.query('DELETE FROM audit_logs WHERE user_id = $1', [donorId]).catch(() => {});
    await client.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]).catch(() => {});
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[hospitalUserId, donorId]]).catch(() => {});
    await client.query('COMMIT');
    await client.end();
  }
});

test('restore returns 410 after grace window (unit)', async () => {
  const passwordHash = await bcrypt.hash('ValidPass123!', 4);
  const old = new Date();
  old.setUTCDate(old.getUTCDate() - 31);
  const client = {
    async query(sql) {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 'd1',
            email: 'a@b.com',
            phone: '+919999999999',
            password_hash: passwordHash,
            deleted_at: old,
            account_status: 'deactivated',
            google_sub: null,
            consent_source: 'registration_form',
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  await assert.rejects(
    () => restoreAccount(client, { email: 'a@b.com', password: 'ValidPass123!' }),
    (error) => error.status === 410 && error.code === 'ACCOUNT_GONE',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID as uuidv4 } from 'node:crypto';
import {
  cancelRedemptionInTransaction,
  createRedemptionInTransaction,
  completeRedemptionInTransaction,
  generateRedemptionCode,
  REDEMPTION_CREDITS,
} from '../src/services/redemptionService.js';
import { hashRefreshToken } from '../src/auth/session.js';
import { authorize } from '../src/auth/policy.js';

const { Client } = pg;
const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL?.startsWith('postgres'));

test('generateRedemptionCode is RSC- plus 8 uppercase alphanumerics', () => {
  const code = generateRedemptionCode();
  assert.match(code, /^RSC-[A-Z0-9]{8}$/);
});

test('access matrix: donor owns redemption actions; hospital verifies only own hospital', () => {
  const donor = { id: 'donor-a', role: 'donor', account_status: 'active' };
  const hospital = {
    id: 'hospital-user-a',
    role: 'hospital',
    account_status: 'active',
    hospital_id: 'hospital-a',
    approval_status: 'approved',
  };
  assert.equal(authorize({ actor: donor, action: 'donor.redemption.create', resource: { user_id: donor.id } }).allowed, true);
  assert.equal(authorize({ actor: donor, action: 'donor.redemption.create', resource: { user_id: 'donor-b' } }).allowed, false);
  assert.equal(authorize({ actor: hospital, action: 'donor.redemption.create', resource: { user_id: donor.id } }).allowed, false);
  assert.equal(authorize({ actor: hospital, action: 'hospital.redemption.verify', resource: { hospital_id: 'hospital-a' } }).allowed, true);
  assert.equal(authorize({ actor: hospital, action: 'hospital.redemption.verify', resource: { hospital_id: 'hospital-b' } }).allowed, false);
});

function fakeCreateClient({ balance = 100, active = false, familyOk = true } = {}) {
  const state = { inserts: [], updates: [] };
  return {
    state,
    async query(sql, params) {
      if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) return { rows: [{ id: params[0] }] };
      if (sql.includes('SUM(amount)')) return { rows: [{ balance }] };
      if (sql.includes("status = 'active'") && sql.includes('FROM redemptions')) {
        return { rows: active ? [{ id: 'active-1' }] : [] };
      }
      if (sql.includes('FROM family_members')) {
        return { rows: familyOk ? [{ id: params[0] }] : [] };
      }
      if (sql.includes('INSERT INTO redemptions')) {
        state.inserts.push({ sql, params });
        return {
          rows: [{
            id: params[0],
            donor_id: params[1],
            family_member_id: params[2],
            status: 'active',
            credits_amount: params[4],
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          }],
        };
      }
      if (sql.includes('INSERT INTO credits')) {
        state.inserts.push({ sql, params });
        return { rows: [{}] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
}

test('insufficient balance returns 402', async () => {
  const client = fakeCreateClient({ balance: 50 });
  await assert.rejects(
    () => createRedemptionInTransaction(client, { donorId: 'donor-a' }),
    (error) => error.status === 402 && error.code === 'INSUFFICIENT_CREDITS',
  );
  assert.equal(client.state.inserts.length, 0);
});

test('active redemption blocks a second create with 409', async () => {
  const client = fakeCreateClient({ balance: 200, active: true });
  await assert.rejects(
    () => createRedemptionInTransaction(client, { donorId: 'donor-a' }),
    (error) => error.status === 409 && error.code === 'ACTIVE_REDEMPTION_EXISTS',
  );
});

test('create reserves 100 credits and returns plaintext code once', async () => {
  const client = fakeCreateClient({ balance: 150 });
  const result = await createRedemptionInTransaction(client, { donorId: 'donor-a' });
  assert.match(result.code, /^RSC-[A-Z0-9]{8}$/);
  const creditInsert = client.state.inserts.find(({ sql }) => sql.includes('INSERT INTO credits'));
  assert.equal(creditInsert.params[2], -REDEMPTION_CREDITS);
  assert.equal(creditInsert.params.includes('reserved') || creditInsert.sql.includes("'reserved'"), true);
});

test('cancel releases reserved credits', async () => {
  const state = { inserts: [], updates: [] };
  const client = {
    state,
    async query(sql, params) {
      if (sql.includes('FROM redemptions') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: params[0], status: 'active', credits_amount: 100 }] };
      }
      if (sql.includes('UPDATE redemptions')) {
        state.updates.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO credits')) {
        state.inserts.push({ sql, params });
        return { rows: [{}] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const result = await cancelRedemptionInTransaction(client, { donorId: 'donor-a', redemptionId: 'red-1' });
  assert.equal(result.status, 'cancelled');
  assert.equal(state.inserts[0].params[2], 100);
  assert.equal(state.inserts[0].sql.includes('reserve_released'), true);
});

test('completion replay maps to 409', async () => {
  const client = {
    async query(sql) {
      if (sql.includes('FROM hospitals')) return { rows: [{ id: 'hospital-a', approval_status: 'approved' }] };
      if (sql.includes('hospital_complete_redemption')) {
        const error = new Error('REDEMPTION_ALREADY_COMPLETED');
        throw error;
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    () => completeRedemptionInTransaction(client, {
      actor: { id: 'hu', hospital_id: 'hospital-a', role: 'hospital' },
      code: 'RSC-ABCD1234',
      req: {},
    }),
    (error) => error.status === 409 && error.code === 'REDEMPTION_ALREADY_COMPLETED',
  );
});

test('expired redemption maps to 410', async () => {
  const client = {
    async query(sql) {
      if (sql.includes('FROM hospitals')) return { rows: [{ id: 'hospital-a', approval_status: 'approved' }] };
      if (sql.includes('hospital_complete_redemption')) {
        throw new Error('REDEMPTION_EXPIRED');
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    () => completeRedemptionInTransaction(client, {
      actor: { id: 'hu', hospital_id: 'hospital-a', role: 'hospital' },
      code: 'RSC-ABCD1234',
      req: {},
    }),
    (error) => error.status === 410 && error.code === 'REDEMPTION_EXPIRED',
  );
});

test('RLS: hospital cannot SELECT raw redemptions; completes via SECURITY DEFINER', {
  skip: !hasTestDatabase,
}, async () => {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: process.env.TEST_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const hospitalUserId = uuidv4();
  const hospitalId = uuidv4();
  const donorId = uuidv4();
  const redemptionId = uuidv4();
  const code = generateRedemptionCode();
  const codeHash = hashRefreshToken(code);

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,blood_group,
         is_verified,is_on_call,consent_given,token_version,account_status,created_at,updated_at
       ) VALUES
       ($1,$2,$3,'test','Hospital User','hospital','Test','Test',NULL,true,false,true,0,'active',NOW(),NOW()),
       ($4,$5,$6,'test','Donor One','donor','Test','Test','O+',true,true,true,0,'active',NOW(),NOW())`,
      [
        hospitalUserId, `${hospitalUserId}@test.invalid`, `+1${hospitalUserId.replaceAll('-', '').slice(0, 10)}`,
        donorId, `${donorId}@test.invalid`, `+1${donorId.replaceAll('-', '').slice(0, 10)}`,
      ],
    );
    await client.query(
      `INSERT INTO hospitals (
         id,user_id,name,license_number,address,city,state,latitude,longitude,
         is_verified,approval_status,created_at,updated_at
       ) VALUES ($1,$2,'Test Hospital','LIC-R','Addr','Test','Test',12.97,77.59,true,'approved',NOW(),NOW())`,
      [hospitalId, hospitalUserId],
    );
    await client.query(
      `INSERT INTO credits (id, donor_id, amount, type, description, created_at)
       VALUES ($1, $2, 100, 'earned', 'seed', NOW())`,
      [uuidv4(), donorId],
    );
    await client.query(
      `INSERT INTO redemptions (
         id, donor_id, code_hash, status, credits_amount, created_at, expires_at
       ) VALUES ($1, $2, $3, 'active', 100, NOW(), NOW() + INTERVAL '24 hours')`,
      [redemptionId, donorId, codeHash],
    );
    await client.query(
      `INSERT INTO credits (id, donor_id, amount, type, description, related_redemption_id, created_at)
       VALUES ($1, $2, -100, 'reserved', 'Redemption reserved', $3, NOW())`,
      [uuidv4(), donorId, redemptionId],
    );
    await client.query('COMMIT');

    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE raktasetu_rls');
    await client.query("SELECT set_config('app.user_id',$1,true)", [hospitalUserId]);
    await client.query("SELECT set_config('app.role','hospital',true)");
    await client.query("SELECT set_config('app.hospital_id',$1,true)", [hospitalId]);

    const raw = await client.query('SELECT id FROM redemptions WHERE id = $1', [redemptionId]);
    assert.equal(raw.rowCount, 0, 'hospitals must not SELECT raw redemptions');

    const completed = await client.query('SELECT * FROM hospital_complete_redemption($1)', [codeHash]);
    assert.equal(completed.rows[0].status, 'completed');
    assert.equal(completed.rows[0].donor_first_name, 'Donor');
    assert.equal(completed.rows[0].beneficiary_relation, 'Self');
    assert.equal(Object.prototype.hasOwnProperty.call(completed.rows[0], 'code_hash'), false);

    await assert.rejects(
      () => client.query('SELECT * FROM hospital_complete_redemption($1)', [codeHash]),
      (error) => String(error.message).includes('REDEMPTION_ALREADY_COMPLETED'),
    );
    await client.query('ROLLBACK');
  } finally {
    await client.query('BEGIN');
    await client.query('DELETE FROM credits WHERE donor_id = $1', [donorId]);
    await client.query('DELETE FROM redemptions WHERE id = $1', [redemptionId]);
    await client.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]);
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[hospitalUserId, donorId]]);
    await client.query('COMMIT');
    await client.end();
  }
});

test('family cap of 4 enforced in DB', { skip: !hasTestDatabase }, async () => {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: process.env.TEST_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  const donorId = uuidv4();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,
         is_verified,is_on_call,consent_given,token_version,account_status,created_at,updated_at
       ) VALUES ($1,$2,$3,'test','Donor Fam','donor','Test','Test',true,false,true,0,'active',NOW(),NOW())`,
      [donorId, `${donorId}@test.invalid`, `+1${donorId.replaceAll('-', '').slice(0, 10)}`],
    );
    for (let i = 0; i < 4; i += 1) {
      await client.query(
        `INSERT INTO family_members (id, donor_id, name, relation, created_at)
         VALUES ($1, $2, $3, 'other', NOW())`,
        [uuidv4(), donorId, `Member ${i}`],
      );
    }
    await assert.rejects(
      () => client.query(
        `INSERT INTO family_members (id, donor_id, name, relation, created_at)
         VALUES ($1, $2, 'Fifth', 'other', NOW())`,
        [uuidv4(), donorId],
      ),
      (error) => String(error.message).includes('Maximum of 4'),
    );
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
});

test('concurrent create: unique active index allows exactly one winner', { skip: !hasTestDatabase }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const ssl = connectionString.includes('localhost') ? false : { rejectUnauthorized: false };
  const setup = new Client({ connectionString, ssl });
  await setup.connect();
  const donorId = uuidv4();
  try {
    await setup.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,
         is_verified,is_on_call,consent_given,token_version,account_status,created_at,updated_at
       ) VALUES ($1,$2,$3,'test','Donor Race','donor','Test','Test',true,false,true,0,'active',NOW(),NOW())`,
      [donorId, `${donorId}@test.invalid`, `+1${donorId.replaceAll('-', '').slice(0, 10)}`],
    );
    await setup.query(
      `INSERT INTO credits (id, donor_id, amount, type, description, created_at)
       VALUES ($1, $2, 200, 'earned', 'seed', NOW())`,
      [uuidv4(), donorId],
    );

    const run = async () => {
      const client = new Client({ connectionString, ssl });
      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE raktasetu_rls');
        await client.query("SELECT set_config('app.user_id',$1,true)", [donorId]);
        await client.query("SELECT set_config('app.role','donor',true)");
        const result = await createRedemptionInTransaction(client, { donorId });
        await client.query('COMMIT');
        return { ok: true, code: result.code };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return { ok: false, status: error.status, code: error.code, pg: error.code };
      } finally {
        await client.end();
      }
    };

    const [a, b] = await Promise.all([run(), run()]);
    const wins = [a, b].filter((row) => row.ok);
    const losses = [a, b].filter((row) => !row.ok);
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    assert.ok(losses[0].status === 409 || losses[0].pg === '23505' || losses[0].code === 'ACTIVE_REDEMPTION_EXISTS');
  } finally {
    await setup.query('DELETE FROM credits WHERE donor_id = $1', [donorId]);
    await setup.query('DELETE FROM redemptions WHERE donor_id = $1', [donorId]);
    await setup.query('DELETE FROM users WHERE id = $1', [donorId]);
    await setup.end();
  }
});

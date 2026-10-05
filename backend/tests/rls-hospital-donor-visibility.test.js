import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Client } = pg;
const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL?.startsWith('postgres'));

// commit: keep the work (e.g. hospital_record_donor_donation) so the test can read it back as owner.
async function withHospitalContext(client, { hospitalUserId, hospitalId, commit = false }, work) {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE raktasetu_rls');
  await client.query("SELECT set_config('app.user_id',$1,true)", [hospitalUserId]);
  await client.query("SELECT set_config('app.role','hospital',true)");
  await client.query("SELECT set_config('app.hospital_id',$1,true)", [hospitalId]);
  try {
    return await work();
  } finally {
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
  }
}

test('hospital donor visibility under RLS', { skip: !hasTestDatabase }, async () => {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: process.env.TEST_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const hospitalUserId = uuidv4();
  const hospitalId = uuidv4();
  const donorId = uuidv4();
  const otherDonorId = uuidv4();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,blood_group,latitude,longitude,
         is_verified,is_on_call,consent_given,token_version,account_status,created_at,updated_at
       ) VALUES
       ($1,$2,$3,'test','Hospital User','hospital','Test','Test',NULL,NULL,NULL,true,false,true,0,'active',NOW(),NOW()),
       ($4,$5,$6,'test','On Call Donor','donor','Test','Test','O+',12.97,77.59,true,true,true,0,'active',NOW(),NOW()),
       ($7,$8,$9,'test','Off Call Donor','donor','Test','Test','A+',12.97,77.59,true,false,true,0,'active',NOW(),NOW())`,
      [
        hospitalUserId, `${hospitalUserId}@test.invalid`, `+1${hospitalUserId.replaceAll('-', '').slice(0, 10)}`,
        donorId, `${donorId}@test.invalid`, `+1${donorId.replaceAll('-', '').slice(0, 10)}`,
        otherDonorId, `${otherDonorId}@test.invalid`, `+1${otherDonorId.replaceAll('-', '').slice(0, 10)}`,
      ],
    );
    await client.query(
      `INSERT INTO hospitals (
         id,user_id,name,license_number,address,city,state,latitude,longitude,
         is_verified,approval_status,created_at,updated_at
       ) VALUES ($1,$2,'Test Hospital','LIC-TEST','Addr','Test','Test',12.97,77.59,true,'approved',NOW(),NOW())`,
      [hospitalId, hospitalUserId],
    );
    await client.query('COMMIT');

    await withHospitalContext(client, { hospitalUserId, hospitalId }, async () => {
      const direct = await client.query(
        'SELECT id, blood_group, email, phone, name FROM users WHERE id = $1',
        [donorId],
      );
      assert.equal(direct.rowCount, 0, 'hospitals must not SELECT donor rows via users table');

      const visible = await client.query(
        'SELECT id, blood_group, latitude, longitude FROM hospital_visible_on_call_donors($1)',
        [['O+', 'O-']],
      );
      // The DB may hold other seeded donors; assert only on this test's two donors.
      const mine = visible.rows.filter((row) => row.id === donorId || row.id === otherDonorId);
      assert.equal(mine.length, 1, 'only the on-call, compatible donor is visible');
      assert.equal(mine[0].id, donorId);
      assert.equal(mine[0].blood_group, 'O+');
      assert.equal(Object.prototype.hasOwnProperty.call(mine[0], 'email'), false);

      const bloodGroup = await client.query(
        'SELECT hospital_donor_blood_group($1) AS blood_group',
        [donorId],
      );
      assert.equal(bloodGroup.rows[0].blood_group, 'O+');

      const emailLeak = await client.query(
        'SELECT email FROM users WHERE role = $1',
        ['donor'],
      );
      assert.equal(emailLeak.rowCount, 0);
    });

    await client.query(
      `UPDATE users SET account_status = 'deactivated', deleted_at = NOW(), is_on_call = false
       WHERE id = $1`,
      [donorId],
    );
    await withHospitalContext(client, { hospitalUserId, hospitalId }, async () => {
      const hidden = await client.query(
        'SELECT id FROM hospital_visible_on_call_donors($1)',
        [['O+', 'O-']],
      );
      assert.equal(hidden.rows.some((row) => row.id === donorId), false, 'deactivated donors must leave matching');
    });
    await client.query(
      `UPDATE users SET account_status = 'active', deleted_at = NULL, is_on_call = true
       WHERE id = $1`,
      [donorId],
    );

    await client.query('UPDATE users SET sex = $1 WHERE id = $2', ['male', donorId]);
    await withHospitalContext(client, { hospitalUserId, hospitalId, commit: true }, async () => {
      await client.query('SELECT hospital_record_donor_donation($1)', [donorId]);
    });
    const maleEligible = await client.query(
      `SELECT next_eligible_date = last_donation_date + INTERVAL '90 days' AS ok
       FROM users WHERE id = $1`,
      [donorId],
    );
    assert.equal(maleEligible.rows[0].ok, true);

    await client.query(
      'UPDATE users SET sex = $1, last_donation_date = NULL, next_eligible_date = NULL WHERE id = $2',
      ['female', donorId],
    );
    await withHospitalContext(client, { hospitalUserId, hospitalId, commit: true }, async () => {
      await client.query('SELECT hospital_record_donor_donation($1)', [donorId]);
    });
    const femaleEligible = await client.query(
      `SELECT next_eligible_date = last_donation_date + INTERVAL '120 days' AS ok
       FROM users WHERE id = $1`,
      [donorId],
    );
    assert.equal(femaleEligible.rows[0].ok, true);
  } finally {
    await client.query('BEGIN');
    await client.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]);
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[hospitalUserId, donorId, otherDonorId]]);
    await client.query('COMMIT');
    await client.end();
  }
});

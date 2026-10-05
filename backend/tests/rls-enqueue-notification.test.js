import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Client } = pg;
const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL?.startsWith('postgres'));

async function withDonorContext(client, { donorId }, work) {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE raktasetu_rls');
  await client.query("SELECT set_config('app.user_id',$1,true)", [donorId]);
  await client.query("SELECT set_config('app.role','donor',true)");
  try {
    return await work();
  } finally {
    await client.query('ROLLBACK');
  }
}

test('donor can enqueue hospital notification via helper under RLS', { skip: !hasTestDatabase }, async () => {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: process.env.TEST_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const hospitalUserId = uuidv4();
  const hospitalId = uuidv4();
  const donorId = uuidv4();
  const requestId = uuidv4();
  const responseId = uuidv4();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,blood_group,latitude,longitude,
         is_verified,is_on_call,consent_given,token_version,account_status,created_at,updated_at
       ) VALUES
       ($1,$2,$3,'test','Hospital User','hospital','Test','Test',NULL,NULL,NULL,true,false,true,0,'active',NOW(),NOW()),
       ($4,$5,$6,'test','Donor','donor','Test','Test','O+',12.97,77.59,true,true,true,0,'active',NOW(),NOW())`,
      [
        hospitalUserId, `${hospitalUserId}@test.invalid`, `+1${hospitalUserId.replaceAll('-', '').slice(0, 10)}`,
        donorId, `${donorId}@test.invalid`, `+1${donorId.replaceAll('-', '').slice(0, 10)}`,
      ],
    );
    await client.query(
      `INSERT INTO hospitals (
         id,user_id,name,license_number,address,city,state,latitude,longitude,
         is_verified,approval_status,created_at,updated_at
       ) VALUES ($1,$2,'Test Hospital','LIC-ENQ','Addr','Test','Test',12.97,77.59,true,'approved',NOW(),NOW())`,
      [hospitalId, hospitalUserId],
    );
    await client.query(
      `INSERT INTO blood_requests (
         id,hospital_id,blood_group,units_needed,urgency,status,radius_km,latitude,longitude,ref_code,created_at
       ) VALUES ($1,$2,'O+',1,'scheduled','open',10,12.97,77.59,$3,NOW())`,
      [requestId, hospitalId, `RS-${requestId.replaceAll('-', '').slice(0, 8).toUpperCase()}`],
    );
    await client.query(
      `INSERT INTO donor_responses (id,request_id,donor_id,status,responded_at,created_at)
       VALUES ($1,$2,$3,'accepted',NOW(),NOW())`,
      [responseId, requestId, donorId],
    );
    await client.query('COMMIT');

    await withDonorContext(client, { donorId }, async () => {
      // The expected RLS failure aborts the transaction; roll back to here before continuing.
      await client.query('SAVEPOINT direct_insert');
      await assert.rejects(
        () => client.query(
          `INSERT INTO notifications (id,user_id,type,title,body,data,is_read,created_at)
           VALUES ($1,$2,'donor_response','t','b','{}',false,NOW())`,
          [uuidv4(), hospitalUserId],
        ),
        /row-level security/i,
      );
      await client.query('ROLLBACK TO SAVEPOINT direct_insert');

      const enqueued = await client.query(
        `SELECT enqueue_notification($1,'donor_response','t','b',$2::jsonb) AS id`,
        [hospitalUserId, JSON.stringify({ request_id: requestId, donor_id: donorId })],
      );
      assert.ok(enqueued.rows[0].id);
    });
  } finally {
    await client.query('DELETE FROM notifications WHERE user_id = $1', [hospitalUserId]).catch(() => {});
    await client.query('DELETE FROM donor_responses WHERE id = $1', [responseId]).catch(() => {});
    await client.query('DELETE FROM blood_requests WHERE id = $1', [requestId]).catch(() => {});
    await client.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]).catch(() => {});
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[hospitalUserId, donorId]]).catch(() => {});
    await client.end();
  }
});

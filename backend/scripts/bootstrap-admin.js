/**
 * One-time / break-glass admin bootstrap.
 * Requires ALLOW_ADMIN_BOOTSTRAP=1, ADMIN_EMAIL, ADMIN_PASSWORD.
 * Uses MIGRATION_DATABASE_URL or DATABASE_URL (owner/migration preferred).
 * Never logs the password.
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { randomUUID as uuidv4 } from 'node:crypto';

if (process.env.ALLOW_ADMIN_BOOTSTRAP !== '1') {
  throw new Error('Set ALLOW_ADMIN_BOOTSTRAP=1 to run admin bootstrap');
}
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 16) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (min 16 chars) are required');
}
const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL required');

const { Client } = pg;
const client = new Client({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  const hash = await bcrypt.hash(password, 12);
  const existing = await client.query(
    'SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
    [email],
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE users
       SET password_hash=$1, role='admin', account_status='active',
           token_version=token_version+1, updated_at=NOW()
       WHERE id=$2`,
      [hash, existing.rows[0].id],
    );
    console.log('admin_bootstrap: updated existing admin identity');
  } else {
    const id = uuidv4();
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,is_verified,is_on_call,
         consent_given,consent_given_at,consent_policy_version,consent_source,
         account_status,token_version,created_at,updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,'admin','Ops','Ops',true,false,
         true,NOW(),'2026-07-15','admin_bootstrap','active',0,NOW(),NOW()
       )`,
      [id, email, process.env.ADMIN_PHONE || `+1555${String(Date.now()).slice(-7)}`, hash, process.env.ADMIN_NAME || 'Platform Admin'],
    );
    console.log('admin_bootstrap: created admin identity');
  }
} finally {
  await client.end();
}

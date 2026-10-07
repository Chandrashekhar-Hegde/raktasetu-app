import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID as uuidv4 } from 'node:crypto';

const { Client } = pg;
const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL?.startsWith('postgres'));

test('RLS denies missing context and isolates users', { skip: !hasTestDatabase }, async () => {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
    ssl: process.env.TEST_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  const first = uuidv4();
  const second = uuidv4();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,city,state,is_verified,is_on_call,
         consent_given,token_version,account_status,created_at,updated_at
       ) VALUES
       ($1,$2,$3,'test','First','donor','Test','Test',false,false,true,0,'active',NOW(),NOW()),
       ($4,$5,$6,'test','Second','donor','Test','Test',false,false,true,0,'active',NOW(),NOW())`,
      [first, `${first}@test.invalid`, `+1${first.replaceAll('-', '').slice(0, 10)}`, second, `${second}@test.invalid`, `+1${second.replaceAll('-', '').slice(0, 10)}`],
    );
    await client.query('SET LOCAL ROLE raktasetu_rls');
    const noContext = await client.query('SELECT id FROM users WHERE id IN ($1,$2)', [first, second]);
    assert.equal(noContext.rowCount, 0);

    await client.query("SELECT set_config('app.user_id',$1,true)", [first]);
    await client.query("SELECT set_config('app.role','donor',true)");
    const scoped = await client.query('SELECT id FROM users WHERE id IN ($1,$2)', [first, second]);
    assert.deepEqual(scoped.rows.map((row) => row.id), [first]);
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
});

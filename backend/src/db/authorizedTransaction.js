import { pool, applyContext, ensureRlsRole } from '../db.js';
import { wrapDatabaseError } from './computeQuota.js';

export async function withAuthorizationContext(
  { userId = '', role, hospitalId = '' },
  work,
) {
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    throw wrapDatabaseError(error);
  }
  try {
    await ensureRlsRole(client);
    await client.query('BEGIN');
    await applyContext(client, { userId, role, hospitalId });
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw wrapDatabaseError(error);
  } finally {
    client.release();
  }
}

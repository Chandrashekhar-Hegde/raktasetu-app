import { pool } from '../db.js';

export async function pingDatabaseReady() {
  await pool.query('SELECT 1 AS ok');
}

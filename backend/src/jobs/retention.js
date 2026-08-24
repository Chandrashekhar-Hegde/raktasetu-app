import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { postgresSslConfig } from '../db/ssl.js';
import { handleMaintenanceJobFailure } from '../db/computeQuota.js';
import { anonymizeExpiredDeletions } from '../services/accountDeletionService.js';

const connectionString = process.env.RETENTION_DATABASE_URL ||
  (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT ? process.env.DATABASE_URL : null);
if (!connectionString) throw new Error('RETENTION_DATABASE_URL is required for production retention jobs');

const { Client } = pg;
const client = new Client({
  connectionString,
  ssl: postgresSslConfig(connectionString),
});
try {
  await client.connect();
  const lock = await client.query('SELECT pg_try_advisory_lock(78254103) AS acquired');
  if (!lock.rows[0].acquired) {
    console.log('retention job already running');
    process.exitCode = 0;
  } else {
    const tasks = [
      ['pending_google_registrations', 'expires_at < NOW() - INTERVAL \'1 day\''],
      ['refresh_tokens', 'expires_at < NOW() - INTERVAL \'7 days\' OR revoked_at < NOW() - INTERVAL \'30 days\''],
      ['token_blacklist', 'expires_at < NOW() - INTERVAL \'1 day\''],
      ['notifications', 'created_at < NOW() - INTERVAL \'365 days\''],
      ['audit_logs', 'created_at < NOW() - INTERVAL \'7 years\' AND legal_hold = false'],
    ];
    for (const [table, condition] of tasks) {
      let total = 0;
      for (;;) {
        const result = await client.query(
          `WITH expired AS (SELECT ctid FROM ${table} WHERE ${condition} LIMIT 1000)
           DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM expired)`,
        );
        total += result.rowCount;
        if (result.rowCount < 1000) break;
      }
      console.log(`${table}: removed ${total}`);
    }

    let expiredRedemptions = 0;
    for (;;) {
      const batch = await client.query(
        `WITH expired AS (
           SELECT id, donor_id, credits_amount
           FROM redemptions
           WHERE status = 'active' AND expires_at < NOW()
           ORDER BY expires_at ASC
           LIMIT 500
           FOR UPDATE SKIP LOCKED
         ),
         marked AS (
           UPDATE redemptions r
           SET status = 'expired'
           FROM expired e
           WHERE r.id = e.id
           RETURNING r.id, r.donor_id, r.credits_amount
         )
         SELECT * FROM marked`,
      );
      if (batch.rowCount === 0) break;
      for (const row of batch.rows) {
        await client.query(
          `INSERT INTO credits (
             id, donor_id, amount, type, description, related_redemption_id, created_at
           )
           SELECT $1, $2, $3, 'reserve_released', 'Redemption expired — credits released', $4, NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM credits c
             WHERE c.related_redemption_id = $4 AND c.type = 'reserve_released'
           )`,
          [uuidv4(), row.donor_id, row.credits_amount, row.id],
        );
      }
      expiredRedemptions += batch.rowCount;
      if (batch.rowCount < 500) break;
    }
    console.log(`redemptions: expired ${expiredRedemptions}`);

    // DPDP: after 30-day grace, anonymize deactivated accounts in place.
    // Donation rows, credits ledger, and audit_logs keep the anonymized user id
    // for blood-bank traceability (see docs/security/security-controls.md).
    const anonymized = await anonymizeExpiredDeletions(client);
    console.log(`account_deletions: anonymized ${anonymized}`);

    await client.query('SELECT pg_advisory_unlock(78254103)');
  }
} catch (err) {
  handleMaintenanceJobFailure(err);
} finally {
  await client.end().catch(() => {});
}

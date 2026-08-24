import pg from 'pg';
import { postgresSslConfig } from '../db/ssl.js';
import { handleMaintenanceJobFailure } from '../db/computeQuota.js';
import { runEscalationPass } from '../services/escalationService.js';

const connectionString = process.env.ESCALATION_DATABASE_URL
  || process.env.RETENTION_DATABASE_URL
  || (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT
    ? process.env.DATABASE_URL
    : null);
if (!connectionString) {
  throw new Error('ESCALATION_DATABASE_URL (or RETENTION_DATABASE_URL) is required for production escalation jobs');
}

const ADVISORY_LOCK_KEY = 78254104;

const { Client } = pg;
const client = new Client({
  connectionString,
  ssl: postgresSslConfig(connectionString),
});
try {
  await client.connect();
  const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [ADVISORY_LOCK_KEY]);
  if (!lock.rows[0].acquired) {
    console.log('escalation job already running');
    process.exitCode = 0;
  } else {
    try {
      await client.query('BEGIN');
      const summary = await runEscalationPass(client);
      await client.query('COMMIT');
      console.log(
        `escalation: examined=${summary.examined} escalated=${summary.escalated} `
        + `expired=${summary.expired} donors_notified=${summary.donors_notified}`,
      );
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  }
} catch (err) {
  handleMaintenanceJobFailure(err);
} finally {
  await client.end().catch(() => {});
}

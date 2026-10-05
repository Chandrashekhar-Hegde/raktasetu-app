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
// Neon can drop the socket mid-run; without a listener pg's 'error' event kills the process.
// The in-flight query still rejects and lands in handleMaintenanceJobFailure.
client.on('error', (err) => console.error('escalation: db connection lost:', err.message));
try {
  await client.connect();
  const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [ADVISORY_LOCK_KEY]);
  if (!lock.rows[0].acquired) {
    console.log('escalation job already running');
    process.exitCode = 0;
  } else {
    try {
      // runEscalationPass owns its per-request transactions.
      const summary = await runEscalationPass(client);
      console.log(
        `escalation: examined=${summary.examined} escalated=${summary.escalated} `
        + `expired=${summary.expired} donors_notified=${summary.donors_notified}`,
      );
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  }
} catch (err) {
  handleMaintenanceJobFailure(err);
} finally {
  await client.end().catch(() => {});
}

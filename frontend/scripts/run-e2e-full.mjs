#!/usr/bin/env node
/**
 * Prep local/CI test DB and run the full-loop + fresh-donor Playwright specs.
 * Refuses remote/production database hosts. Never points at Neon production.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');

const DEFAULT_LOCAL_URL = 'postgresql://cgh@127.0.0.1:5432/raktasetu_test';
const DEFAULT_FIXTURE_PASSWORD = 'test-fixture-pass-12';

function refuseRemoteDb(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('TEST_DATABASE_URL / DATABASE_URL is not a valid postgres URL');
  }
  const host = url.hostname.toLowerCase();
  const blocked = ['neon.tech', 'railway.app', 'amazonaws.com', 'supabase.co'];
  if (blocked.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new Error(`Refusing e2e against remote host ${host} — use a local/CI test database only`);
  }
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
    throw new Error('Refusing e2e full-loop in production environment');
  }
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: opts.cwd || root,
    env: opts.env || process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const testDbUrl = process.env.TEST_DATABASE_URL
  || (process.env.CI ? null : DEFAULT_LOCAL_URL);
if (!testDbUrl) {
  throw new Error('TEST_DATABASE_URL is required in CI');
}
refuseRemoteDb(testDbUrl);

const fixturePassword = process.env.FIXTURE_PASSWORD || DEFAULT_FIXTURE_PASSWORD;
const jwtSecret = process.env.JWT_SECRET || 'ci-e2e-jwt-secret-not-for-production';

const env = {
  ...process.env,
  NODE_ENV: 'test',
  TEST_DATABASE_URL: testDbUrl,
  DATABASE_URL: testDbUrl,
  FIXTURE_PASSWORD: fixturePassword,
  JWT_SECRET: jwtSecret,
  PORT: process.env.PORT || '3001',
  FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173',
  E2E_FULL: '1',
  E2E_HOSPITAL_EMAIL: process.env.E2E_HOSPITAL_EMAIL || 'hospital@test.invalid',
  E2E_DONOR_EMAIL: process.env.E2E_DONOR_EMAIL || 'donor@test.invalid',
  E2E_FIXTURE_PASSWORD: fixturePassword,
};
// Only pass E2E_BASE_URL when the caller already has servers running (skips webServer).
if (process.env.E2E_BASE_URL) {
  env.E2E_BASE_URL = process.env.E2E_BASE_URL;
}

const require = createRequire(path.join(backend, 'package.json'));
const { Client } = require('pg');
const client = new Client({
  connectionString: testDbUrl,
  ssl: testDbUrl.includes('localhost') || testDbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  const tables = await client.query(`SELECT to_regclass('public.users') AS users`);
  if (!tables.rows[0]?.users) {
    console.log('Applying backend/db/schema.sql to empty test database…');
    const schemaPath = path.join(backend, 'db/schema.sql');
    if (!existsSync(schemaPath)) throw new Error(`Missing ${schemaPath}`);
    run('psql', [testDbUrl, '-v', 'ON_ERROR_STOP=1', '-f', schemaPath], { env });
  }
} finally {
  await client.end();
}

run('npm', ['run', 'db:test:migrate'], { cwd: backend, env });
run('npm', ['run', 'db:test:fixtures'], { cwd: backend, env });

run('npx', ['playwright', 'test', '--project=full-loop'], {
  cwd: frontend,
  env,
});

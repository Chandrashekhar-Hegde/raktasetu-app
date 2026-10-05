// Route tests against a real test database: the app's own pool, RLS role and JWT stack.
// node --test runs each file in its own process, so setting env before import is safe.
import crypto from 'crypto';
import pg from 'pg';

export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL?.startsWith('postgres'));

export async function loadApp() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DB_RUNTIME_ROLE = 'raktasetu_rls';
  process.env.JWT_SECRET ??= crypto.randomBytes(32).toString('hex');
  const { createApp } = await import('../../src/app.js');
  const { pool } = await import('../../src/db.js');
  return { app: createApp(), pool };
}

/** Owner connection for arranging data and reading it back past RLS. */
export async function ownerClient() {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, ssl: false });
  await client.connect();
  return client;
}

let counter = 0;
export function donorPayload(overrides = {}) {
  const tag = `${Date.now()}${process.pid}${counter++}`;
  return {
    email: `donor${tag}@test.invalid`,
    phone: `+91${tag.slice(-10).padStart(10, '9')}`,
    password: 'Test-Password-123!',
    name: 'Route Test Donor',
    role: 'donor',
    blood_group: 'O+',
    date_of_birth: '1990-01-01',
    sex: 'male',
    city: 'Hubballi',
    state: 'Karnataka',
    latitude: 15.36,
    longitude: 75.12,
    consent_given: true,
    consent_policy_version: '2026-07-15',
    ...overrides,
  };
}

/** Registers a donor through the API, promotes it to admin as owner, and returns an admin access token. */
export async function adminToken(app, owner, request) {
  const payload = donorPayload();
  const reg = await request(app).post('/api/auth/register').send(payload).expect(201);
  await owner.query("UPDATE users SET role = 'admin', blood_group = NULL WHERE id = $1", [reg.body.data.user.id]);
  const login = await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password }).expect(200);
  return login.body.data.token;
}

/** Inserts an approved hospital and one open request as owner; returns their ids. */
export async function openRequest(owner, { bloodGroup = 'O+', lat = 15.36, lng = 75.12 } = {}) {
  const tag = `${Date.now()}${process.pid}${counter++}`;
  const user = await owner.query(
    `INSERT INTO users (email, phone, password_hash, name, role, city, state, is_verified, consent_given, account_status)
     VALUES ($1, $2, 'x', 'Route Test Hospital', 'hospital', 'Hubballi', 'Karnataka', true, true, 'active') RETURNING id`,
    [`hospital${tag}@test.invalid`, `+91${tag.slice(-10).padStart(10, '8')}`],
  );
  const hospital = await owner.query(
    `INSERT INTO hospitals (user_id, name, license_number, address, city, state, latitude, longitude, is_verified, approval_status)
     VALUES ($1, 'Route Test Hospital', $2, 'Addr 1', 'Hubballi', 'Karnataka', $3, $4, true, 'approved') RETURNING id`,
    [user.rows[0].id, `LIC-${tag}`, lat, lng],
  );
  const request = await owner.query(
    `INSERT INTO blood_requests (hospital_id, blood_group, units_needed, urgency, status, radius_km, latitude, longitude, ref_code)
     VALUES ($1, $2, 1, 'urgent', 'open', 10, $3, $4, $5) RETURNING id`,
    [hospital.rows[0].id, bloodGroup, lat, lng, `RS-${tag.slice(-8)}`],
  );
  return { hospitalUserId: user.rows[0].id, hospitalId: hospital.rows[0].id, requestId: request.rows[0].id };
}

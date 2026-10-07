import bcrypt from 'bcryptjs';
import pg from 'pg';
import { randomUUID as uuidv4 } from 'node:crypto';

if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  throw new Error('Fixture seeding is disabled in production');
}
if (!process.env.TEST_DATABASE_URL || !process.env.FIXTURE_PASSWORD) {
  throw new Error('TEST_DATABASE_URL and FIXTURE_PASSWORD are required');
}

const { Client } = pg;
const client = new Client({
  connectionString: process.env.TEST_DATABASE_URL,
  ssl: (process.env.TEST_DATABASE_URL.includes('localhost') || process.env.TEST_DATABASE_URL.includes('127.0.0.1'))
    ? false
    : { rejectUnauthorized: false },
});

/** Deterministic UUIDs for KLE demo / full-loop e2e (Hubballi coords). */
const DEMO_FIXTURE = {
  donor: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  hospitalUser: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
  admin: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
  hospital: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4',
};
const DEMO_LAT = 15.3647;
const DEMO_LNG = 75.124;

/** Deterministic UUIDs for metrics mini-scenario (stable across re-seeds). */
const METRICS_FIXTURE = {
  hospitalA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  hospitalB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  hospitalUserA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
  hospitalUserB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb0',
  donor1: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  donor2: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
  donor3: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
  request1: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  request2: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  request3: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
  // Staggered funnel (minutes from request created_at):
  // R1: accept 10, arrive 30, complete 60
  // R2: accept 20, arrive 40, complete 90
  // R3: accept 5, arrive 15, complete 45  (O- rare, hospital B — isolation)
};

await client.connect();
try {
  const passwordHash = await bcrypt.hash(process.env.FIXTURE_PASSWORD, 12);
  await client.query('BEGIN');

  // Demo path: approved hospital + on-call O+ donor within request radius (full-loop e2e / KLE demo).
  // Password: FIXTURE_PASSWORD env (local/CI only; script refuses production).
  const upsertDemoUser = async ({
    preferredId, email, phone, name, role, bloodGroup = null, onCall = false, lat = null, lng = null,
  }) => {
    const existing = await client.query(
      'SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
      [email],
    );
    const id = existing.rows[0]?.id || preferredId;
    if (existing.rows[0]) {
      const isDonor = role === 'donor';
      await client.query(
        `UPDATE users SET
           password_hash=$2, name=$3, role=$4, blood_group=$5, phone=$6,
           date_of_birth=CASE WHEN $10 THEN COALESCE(date_of_birth, '1990-01-01'::date) ELSE date_of_birth END,
           sex=CASE WHEN $10 THEN COALESCE(sex, 'male') ELSE sex END,
           city='Hubballi', state='Karnataka',
           latitude=COALESCE($7, latitude), longitude=COALESCE($8, longitude),
           is_verified=true, is_on_call=$9,
           ping_radius_km=CASE WHEN $10 THEN 10 ELSE ping_radius_km END,
           next_eligible_date=CASE WHEN $10 THEN NULL ELSE next_eligible_date END,
           last_donation_date=CASE WHEN $10 THEN NULL ELSE last_donation_date END,
           account_status='active', updated_at=NOW()
         WHERE id=$1`,
        [id, passwordHash, name, role, bloodGroup, phone, lat, lng, onCall, isDonor],
      );
    } else {
      await client.query(
        `INSERT INTO users (
           id,email,phone,password_hash,name,role,blood_group,date_of_birth,sex,city,state,
           latitude,longitude,is_verified,is_on_call,ping_radius_km,consent_given,consent_given_at,
           consent_policy_version,consent_source,account_status,token_version,created_at,updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,
           'Hubballi','Karnataka',$10,$11,true,$12,$13,
           true,NOW(),'2026-07-15','test_fixture','active',0,NOW(),NOW()
         )`,
        [
          id, email, phone, passwordHash, name, role, bloodGroup,
          role === 'donor' ? '1990-01-01' : null,
          role === 'donor' ? 'male' : null,
          lat, lng, onCall,
          role === 'donor' ? 10 : null,
        ],
      );
    }
    return id;
  };

  const donorId = await upsertDemoUser({
    preferredId: DEMO_FIXTURE.donor, email: 'donor@test.invalid', phone: '+15550000001',
    name: 'Fixture Donor', role: 'donor', bloodGroup: 'O+', onCall: true, lat: DEMO_LAT, lng: DEMO_LNG,
  });
  const hospitalUserId = await upsertDemoUser({
    preferredId: DEMO_FIXTURE.hospitalUser, email: 'hospital@test.invalid', phone: '+15550000002',
    name: 'Fixture Hospital', role: 'hospital',
  });
  await upsertDemoUser({
    preferredId: DEMO_FIXTURE.admin, email: 'admin@test.invalid', phone: '+15550000003',
    name: 'Fixture Admin', role: 'admin',
  });

  const existingHospital = await client.query('SELECT id FROM hospitals WHERE user_id = $1', [hospitalUserId]);
  if (existingHospital.rows[0]) {
    await client.query(
      `UPDATE hospitals SET
         name='Fixture Hospital Blood Bank', address='KLE Campus Road', city='Hubballi', state='Karnataka',
         license_number=COALESCE(license_number, 'LIC-DEMO-E2E'), approval_status='approved',
         latitude=$2, longitude=$3, phone='+15550000002', is_verified=true,
         approved_at=COALESCE(approved_at, NOW()), updated_at=NOW()
       WHERE id=$1`,
      [existingHospital.rows[0].id, DEMO_LAT, DEMO_LNG],
    );
  } else {
    await client.query(
      `INSERT INTO hospitals (
         id,user_id,name,address,city,state,license_number,approval_status,latitude,longitude,
         phone,is_verified,approved_at,created_at,updated_at
       ) VALUES (
         $1,$2,'Fixture Hospital Blood Bank','KLE Campus Road','Hubballi','Karnataka','LIC-DEMO-E2E',
         'approved',$3,$4,'+15550000002',true,NOW(),NOW(),NOW()
       )`,
      [DEMO_FIXTURE.hospital, hospitalUserId, DEMO_LAT, DEMO_LNG],
    );
  }

  // Reset demo-path ledger / open requests so full-loop e2e starts from a clean balance.
  const hospitalRow = await client.query('SELECT id FROM hospitals WHERE user_id = $1', [hospitalUserId]);
  const demoHospitalId = hospitalRow.rows[0]?.id;
  if (demoHospitalId) {
    await client.query(
      `DELETE FROM credits WHERE donor_id = $1
         OR related_donation_id IN (SELECT id FROM donations WHERE hospital_id = $2)
         OR related_redemption_id IN (SELECT id FROM redemptions WHERE donor_id = $1)`,
      [donorId, demoHospitalId],
    );
    await client.query('DELETE FROM redemptions WHERE donor_id = $1', [donorId]);
    await client.query('DELETE FROM donations WHERE hospital_id = $1 OR donor_id = $2', [demoHospitalId, donorId]);
    await client.query(
      `DELETE FROM donor_responses WHERE donor_id = $1
         OR request_id IN (SELECT id FROM blood_requests WHERE hospital_id = $2)`,
      [donorId, demoHospitalId],
    );
    await client.query(
      `DELETE FROM notifications WHERE user_id = $1
         OR (type = 'blood_request' AND (data->>'request_id') IN (
           SELECT id::text FROM blood_requests WHERE hospital_id = $2
         ))`,
      [donorId, demoHospitalId],
    );
    await client.query('DELETE FROM blood_requests WHERE hospital_id = $1', [demoHospitalId]);
  }

  // --- Metrics mini-scenario: 3 requests, staggered accept/arrive/complete ---
  const base = new Date('2026-07-10T10:00:00.000Z');
  const t = (minutes) => new Date(base.getTime() + minutes * 60 * 1000);

  const upsertUser = async ({ id, email, phone, name, role, bloodGroup, onCall = false }) => {
    await client.query(
      `INSERT INTO users (
         id,email,phone,password_hash,name,role,blood_group,date_of_birth,sex,city,state,
         latitude,longitude,is_verified,is_on_call,ping_radius_km,consent_given,consent_given_at,
         consent_policy_version,consent_source,account_status,token_version,created_at,updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,'1990-01-01','male','Hubballi','Karnataka',
         15.36,75.12,true,$8,10,true,NOW(),'2026-07-15','test_fixture','active',0,$9,NOW()
       ) ON CONFLICT (id) DO UPDATE SET
         password_hash=EXCLUDED.password_hash, is_on_call=EXCLUDED.is_on_call, updated_at=NOW()`,
      [id, email, phone, passwordHash, name, role, bloodGroup, onCall, t(0)],
    );
  };

  await upsertUser({
    id: METRICS_FIXTURE.hospitalUserA, email: 'metrics-hospital-a@test.invalid',
    phone: '+15550001001', name: 'Metrics Hospital A', role: 'hospital', bloodGroup: null,
  });
  await upsertUser({
    id: METRICS_FIXTURE.hospitalUserB, email: 'metrics-hospital-b@test.invalid',
    phone: '+15550001002', name: 'Metrics Hospital B', role: 'hospital', bloodGroup: null,
  });
  await upsertUser({
    id: METRICS_FIXTURE.donor1, email: 'metrics-donor-1@test.invalid',
    phone: '+15550002001', name: 'Metrics Donor 1', role: 'donor', bloodGroup: 'O+', onCall: true,
  });
  await upsertUser({
    id: METRICS_FIXTURE.donor2, email: 'metrics-donor-2@test.invalid',
    phone: '+15550002002', name: 'Metrics Donor 2', role: 'donor', bloodGroup: 'A+', onCall: true,
  });
  await upsertUser({
    id: METRICS_FIXTURE.donor3, email: 'metrics-donor-3@test.invalid',
    phone: '+15550002003', name: 'Metrics Donor 3', role: 'donor', bloodGroup: 'O-', onCall: false,
  });

  for (const [id, userId, name] of [
    [METRICS_FIXTURE.hospitalA, METRICS_FIXTURE.hospitalUserA, 'Metrics Bank A'],
    [METRICS_FIXTURE.hospitalB, METRICS_FIXTURE.hospitalUserB, 'Metrics Bank B'],
  ]) {
    await client.query(
      `INSERT INTO hospitals (
         id,user_id,name,address,city,state,license_number,approval_status,latitude,longitude,created_at,updated_at
       ) VALUES ($1,$2,$3,'1 Test Road','Hubballi','Karnataka',$4,'approved',15.36,75.12,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET approval_status='approved', updated_at=NOW()`,
      [id, userId, name, `LIC-${id.slice(0, 8)}`],
    );
  }

  // Clear prior metrics scenario rows for idempotent re-seed
  await client.query(
    `DELETE FROM credits WHERE related_donation_id IN (
       SELECT id FROM donations WHERE request_id = ANY($1::uuid[])
     )`,
    [[METRICS_FIXTURE.request1, METRICS_FIXTURE.request2, METRICS_FIXTURE.request3]],
  );
  await client.query(
    'DELETE FROM donations WHERE request_id = ANY($1::uuid[])',
    [[METRICS_FIXTURE.request1, METRICS_FIXTURE.request2, METRICS_FIXTURE.request3]],
  );
  await client.query(
    'DELETE FROM donor_responses WHERE request_id = ANY($1::uuid[])',
    [[METRICS_FIXTURE.request1, METRICS_FIXTURE.request2, METRICS_FIXTURE.request3]],
  );
  await client.query(
    'DELETE FROM blood_requests WHERE id = ANY($1::uuid[])',
    [[METRICS_FIXTURE.request1, METRICS_FIXTURE.request2, METRICS_FIXTURE.request3]],
  );

  const requests = [
    {
      id: METRICS_FIXTURE.request1, hospitalId: METRICS_FIXTURE.hospitalA, blood: 'O+',
      units: 2, urgency: 'urgent', escalation: 0, donorId: METRICS_FIXTURE.donor1,
      acceptMin: 10, arriveMin: 30, completeMin: 60,
    },
    {
      id: METRICS_FIXTURE.request2, hospitalId: METRICS_FIXTURE.hospitalA, blood: 'A+',
      units: 1, urgency: 'critical', escalation: 0, donorId: METRICS_FIXTURE.donor2,
      acceptMin: 20, arriveMin: 40, completeMin: 90,
    },
    {
      id: METRICS_FIXTURE.request3, hospitalId: METRICS_FIXTURE.hospitalB, blood: 'O-',
      units: 1, urgency: 'critical', escalation: 1, donorId: METRICS_FIXTURE.donor3,
      acceptMin: 5, arriveMin: 15, completeMin: 45,
    },
  ];

  for (const r of requests) {
    await client.query(
      `INSERT INTO blood_requests (
         id,hospital_id,blood_group,units_needed,urgency,status,radius_km,
         latitude,longitude,ref_code,escalation_level,filled_at,created_at
       ) VALUES ($1,$2,$3,$4,$5,'filled',$6,15.36,75.12,$7,$8,$9,$10)`,
      [
        r.id, r.hospitalId, r.blood, r.units, r.urgency,
        r.blood === 'O-' ? 25 : 10, `MX-${r.id.slice(-4).toUpperCase()}`,
        r.escalation, t(r.completeMin), t(0),
      ],
    );
    await client.query(
      `INSERT INTO donor_responses (
         id,request_id,donor_id,status,responded_at,arrived_at,completed_at,created_at
       ) VALUES ($1,$2,$3,'completed',$4,$5,$6,$7)`,
      [uuidv4(), r.id, r.donorId, t(r.acceptMin), t(r.arriveMin), t(r.completeMin), t(0)],
    );
    const donationId = uuidv4();
    await client.query(
      `INSERT INTO donations (
         id,donor_id,request_id,hospital_id,units,blood_group,verified_at,credits_earned,ref_code,created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,100,$8,$9)`,
      [donationId, r.donorId, r.id, r.hospitalId, r.units, r.blood, t(r.completeMin), `MXD-${r.id.slice(-4)}`, t(r.completeMin)],
    );
    await client.query(
      `INSERT INTO credits (id,donor_id,amount,type,description,related_donation_id,created_at)
       VALUES ($1,$2,100,'earned','Metrics fixture donation',$3,$4)`,
      [uuidv4(), r.donorId, donationId, t(r.completeMin)],
    );
  }

  await client.query('COMMIT');
  console.log('test fixtures created (including metrics mini-scenario)');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

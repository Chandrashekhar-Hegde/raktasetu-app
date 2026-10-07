import { expect, test } from '@playwright/test';

/**
 * The loop a real new donor goes through, with no seeded coordinates:
 * register in the UI → share location → go on call → hospital broadcasts → donor sees and accepts.
 * Before location capture existed, self-registered donors were never matched; this guards that.
 * Requires E2E_FULL=1 (npm run test:e2e:full), same servers and fixtures as full-loop.
 */

const hospitalEmail = process.env.E2E_HOSPITAL_EMAIL || 'hospital@test.invalid';
const fixturePassword = process.env.E2E_FIXTURE_PASSWORD || process.env.FIXTURE_PASSWORD || 'test-fixture-pass-12';
// Fixture hospital location (backend/scripts/seed-fixtures.js DEMO_LAT/DEMO_LNG), ~1 km away.
const NEAR_HOSPITAL = { latitude: 15.372, longitude: 75.128 };

test.beforeEach(() => {
  test.skip(!process.env.E2E_FULL, 'Set E2E_FULL=1 via npm run test:e2e:full');
});

test('a newly registered donor shares location, is matched, and accepts', async ({ browser }) => {
  const tag = Date.now();
  const donorCtx = await browser.newContext({ geolocation: NEAR_HOSPITAL, permissions: ['geolocation'] });
  const hospitalCtx = await browser.newContext();
  const donor = await donorCtx.newPage();
  const hospital = await hospitalCtx.newPage();

  try {
    // --- Register through the real form ---
    await donor.goto('/register');
    await donor.getByLabel('Full name').fill('Fresh E2E Donor');
    await donor.getByLabel('Phone').fill(`+9177${String(tag).slice(-8)}`);
    await donor.getByLabel('Email').fill(`fresh${tag}@test.invalid`);
    await donor.getByLabel('Password').fill('Fresh-Donor-Pass-1!');
    await donor.getByLabel('Date of birth').fill('1992-04-12');
    await donor.getByLabel('Sex').selectOption('female');
    await donor.getByRole('button', { name: 'O-', exact: true }).click();
    await donor.getByLabel('City').fill('Hubballi');
    await donor.getByLabel('State').fill('Karnataka');
    await donor.getByRole('button', { name: /use my current location/i }).click();
    await expect(donor.getByRole('status')).toContainText(/location saved/i);
    await donor.getByLabel(/I have read the/i).check();
    await donor.getByRole('button', { name: /create donor account/i }).click();

    await expect(donor).toHaveURL(/\/home/);
    // Coordinates came with registration, so the "add your location" banner must not show.
    await expect(donor.getByText(/add your location to get blood requests/i)).toHaveCount(0);
    await donor.getByRole('button', { pressed: false }).filter({ hasText: /OFF/ }).click();
    await expect(donor.getByRole('button', { pressed: true }).filter({ hasText: /ON CALL/ })).toBeVisible();

    // --- Hospital broadcasts an A+ request; O- can give to A+ ---
    await hospital.goto('/login?role=hospital');
    await hospital.getByLabel(/phone or email/i).fill(hospitalEmail);
    await hospital.getByLabel(/password/i).fill(fixturePassword);
    await hospital.getByRole('button', { name: /sign in/i }).click();
    await expect(hospital).toHaveURL(/\/console/);
    await hospital.getByRole('button', { name: /new request/i }).click();
    await hospital.getByRole('button', { name: 'A+', exact: true }).click();
    await hospital.getByRole('button', { name: 'Critical', exact: true }).click();
    await hospital.getByRole('button', { name: '5 km', exact: true }).click();
    await hospital.getByRole('button', { name: /broadcast request/i }).click();
    await expect(hospital.getByText(/request broadcast/i)).toBeVisible({ timeout: 15000 });

    // --- The new donor sees it and accepts ---
    await donor.getByRole('link', { name: /^Requests$/ }).click();
    const requestLink = donor.getByRole('link').filter({ hasText: /A\+/ }).first();
    await expect(requestLink).toBeVisible({ timeout: 15000 });
    await requestLink.click();
    await expect(donor).toHaveURL(/\/alert\//);
    await donor.getByRole('button', { name: /accept/i }).click();
    await expect(donor).toHaveURL(/\/on-the-way\//, { timeout: 15000 });
    await expect(donor.getByTestId('verify-ref-text')).toHaveText(/^RS-/);
    const ref = await donor.getByTestId('verify-ref-text').textContent();

    // --- Hospital sees the responder on the request screen, then closes the request ---
    // (also keeps this spec from leaving an open request for full-loop.spec.js)
    await hospital.getByRole('button', { name: /back to live board/i }).click();
    await hospital.getByRole('link', { name: `Open request ${ref}` }).click();
    await expect(hospital.getByText(/Donor 1 · O-/)).toBeVisible();
    await expect(hospital.getByText('Coming', { exact: true })).toBeVisible();
    await hospital.getByRole('button', { name: /close request/i }).click();
    await expect(hospital.getByText('Closed', { exact: true })).toBeVisible();
  } finally {
    await donorCtx.close();
    await hospitalCtx.close();
  }
});

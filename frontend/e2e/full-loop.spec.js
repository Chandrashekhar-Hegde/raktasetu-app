import { expect, test } from '@playwright/test';

/**
 * KLE demo full-loop against local Vite (:5173) + backend (:3001) + test DB.
 * Requires E2E_FULL=1 (set by npm run test:e2e:full).
 *
 * Fixture accounts (see backend/scripts/seed-fixtures.js):
 * - Fixture Hospital / hospital@test.invalid (approved hospital)
 * - Fixture Donor / donor@test.invalid (O+, on call, Hubballi coords)
 * Password: FIXTURE_PASSWORD / E2E_FIXTURE_PASSWORD (see seed-fixtures / run-e2e-full.mjs)
 */

const hospitalEmail = process.env.E2E_HOSPITAL_EMAIL || 'hospital@test.invalid';
const donorEmail = process.env.E2E_DONOR_EMAIL || 'donor@test.invalid';
const fixturePassword = process.env.E2E_FIXTURE_PASSWORD
  || process.env.FIXTURE_PASSWORD
  || 'test-fixture-pass-12';

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  test.skip(!process.env.E2E_FULL, 'Set E2E_FULL=1 via npm run test:e2e:full');
});

async function signIn(page, { email, password, hospital = false }) {
  await page.goto(hospital ? '/login?role=hospital' : '/login');
  await expect(page).toHaveURL(hospital ? /\/login\?role=hospital/ : /\/login(?!\?role=hospital)/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel(/phone or email|ಫೋನ್/i).fill(email);
  await page.getByLabel(/password|ಪಾಸ್/i).fill(password);
  await page.getByRole('button', { name: /sign in|ಸೈನ್ ಇನ್/i }).click();
}

async function openDonorAlert(donor) {
  // Socket may navigate automatically; otherwise open from Requests list
  const navigated = await donor.waitForURL(/\/alert\//, { timeout: 4000 }).then(() => true).catch(() => false);
  if (navigated) return;

  // Bottom nav items are links, translated (the donor switched to Kannada earlier).
  await donor.getByRole('link', { name: /^(Requests|ವಿನಂತಿಗಳು)$/i }).click();
  await expect(donor).toHaveURL(/\/requests/);
  const requestLink = donor.getByRole('link').filter({ hasText: /B\+/ }).first();
  await expect(requestLink).toBeVisible({ timeout: 15000 });
  await requestLink.click();
  await expect(donor).toHaveURL(/\/alert\//, { timeout: 15000 });
}

test('KLE demo full loop: request → accept → verify → credits (+ optional redeem)', async ({ browser }) => {
  const hospitalCtx = await browser.newContext();
  const donorCtx = await browser.newContext();
  const hospital = await hospitalCtx.newPage();
  const donor = await donorCtx.newPage();
  let redemptionRan = false;

  try {
    // --- 1. Hospital signs in, creates B+ critical / 2 units / 5 km ---
    await signIn(hospital, { email: hospitalEmail, password: fixturePassword, hospital: true });
    await expect(hospital).toHaveURL(/\/console/);

    await hospital.getByRole('button', { name: /new request/i }).click();
    await expect(hospital).toHaveURL(/\/console\/new-request/);

    await hospital.getByRole('button', { name: 'B+', exact: true }).click();
    await hospital.getByRole('button', { name: 'Critical', exact: true }).click();
    await hospital.getByRole('button', { name: '5 km', exact: true }).click();
    await hospital.getByRole('button', { name: /broadcast request/i }).click();

    await expect(hospital.getByText(/request broadcast/i)).toBeVisible({ timeout: 15000 });
    await expect(hospital.getByText(/on-call compatible donor/i)).toBeVisible();
    const notifiedText = await hospital.getByText(/on-call compatible donor/i).textContent();
    expect(Number((notifiedText || '').match(/(\d+)/)?.[1] || 0)).toBeGreaterThanOrEqual(1);

    await hospital.getByRole('button', { name: /back to live board/i }).click();
    await expect(hospital).toHaveURL(/\/console$/);
    await expect(hospital.getByText('B+', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(hospital.getByText(/^pinged$/i).first()).toBeVisible();
    await expect(hospital.getByText(/critical/i).first()).toBeVisible();

    // --- 2. Donor signs in; Kannada accept; QR with ref ---
    await signIn(donor, { email: donorEmail, password: fixturePassword, hospital: false });
    await expect(donor).toHaveURL(/\/home/);

    await donor.getByRole('button', { name: /switch language/i }).click();
    await expect(donor.getByText(/ಕನ್ನಡ/)).toBeVisible();

    await openDonorAlert(donor);
    await expect(donor.getByText('B+').first()).toBeVisible();

    const acceptKn = donor.getByRole('button', { name: /ಸಮ್ಮತಿಸಿ, ನಾನು ದಾನ ಮಾಡಬಲ್ಲೆ/ });
    await expect(acceptKn).toBeVisible();
    await acceptKn.click();

    await expect(donor).toHaveURL(/\/on-the-way\//, { timeout: 15000 });
    await expect(donor.getByTestId('verify-qr')).toBeVisible();
    const refCode = await donor.getByTestId('verify-qr').getAttribute('data-ref-code');
    expect(refCode).toMatch(/^RS-/);
    await expect(donor.getByTestId('verify-ref-text')).toHaveText(refCode);

    await donor.getByRole('button', { name: /i'?ve arrived|ತಲುಪಿದೆ/i }).click();
    await expect(donor.getByRole('button', { name: /arrived ✓|ತಲುಪಿದೆ ✓/i })).toBeVisible({ timeout: 10000 });

    // --- 3. Hospital verifies donation via manual ref (no camera) ---
    await hospital.getByRole('button', { name: /verify donor/i }).click();
    await expect(hospital).toHaveURL(/\/console\/verify/);
    await hospital.getByRole('button', { name: /verify donation|ದಾನ ಪರಿಶೀಲಿಸಿ/i }).click();
    const refInput = hospital.getByPlaceholder(/e\.g\. RS-|RS-/i);
    await refInput.fill(refCode);
    await refInput.press('Enter');

    await expect(hospital.getByText(/O\+/)).toBeVisible({ timeout: 15000 });
    await expect(hospital.getByText(/arrived/i).first()).toBeVisible();
    await hospital.getByRole('button', { name: /confirm donation|credit 100/i }).click();
    await expect(hospital.getByText(/donation confirmed|100 credits sent/i)).toBeVisible({ timeout: 15000 });

    // --- 4. Donor credits +100; hospital board 1/2 collected ---
    // Prefer in-app nav (memory access token); full reload relies on refresh cookie.
    await donor.getByRole('link', { name: /^(Credits|ಕ್ರೆಡಿಟ್‌ಗಳು)$/i }).click();
    await expect(donor).toHaveURL(/\/credits/);
    await expect(donor.getByTestId('credits-balance')).toHaveText(/^100$/, { timeout: 15000 });
    await expect(donor.getByText('+100').first()).toBeVisible();

    await hospital.getByRole('button', { name: /back to console/i }).click();
    await expect(hospital).toHaveURL(/\/console$/);
    await expect(hospital.getByText(/1\s*\/\s*2/)).toBeVisible({ timeout: 20000 });

    // --- 5. Optional redemption (feature-gated) ---
    await donor.getByRole('link', { name: /^(Credits|ಕ್ರೆಡಿಟ್‌ಗಳು)$/i }).click();
    await expect(donor).toHaveURL(/\/credits/);
    const redeemSelf = donor.getByRole('button', { name: /^(Self|ಸ್ವಯಂ)$/i });
    const redeemAction = donor.getByTestId('redeem-submit').getByRole('button');
    const modeRedeemChip = hospital.getByRole('button', { name: /redeem credits|ಕ್ರೆಡಿಟ್ ರಿಡೀಮ್/i });

    const redeemUiPresent = (await redeemAction.count()) > 0 && (await redeemSelf.count()) > 0;
    if (redeemUiPresent && await redeemAction.isEnabled()) {
      await redeemSelf.click();
      await redeemAction.click();
      await expect(donor.getByTestId('redeem-code')).toBeVisible({ timeout: 15000 });
      const rscCode = (await donor.getByTestId('redeem-code').textContent() || '').trim();
      expect(rscCode).toMatch(/^RSC-/);

      await hospital.getByRole('button', { name: /verify donor/i }).click();
      await expect(hospital).toHaveURL(/\/console\/verify/);
      if ((await modeRedeemChip.count()) === 0) {
        console.log('full-loop redemption step: SKIPPED (hospital Redeem tab absent)');
      } else {
        await modeRedeemChip.click();
        const rscInput = hospital.getByPlaceholder(/RSC-/i);
        await rscInput.fill(rscCode);
        await rscInput.press('Enter');
        await expect(hospital.getByText(/credits redeemed|replacement unit waived/i)).toBeVisible({ timeout: 15000 });

        await donor.getByRole('link', { name: /^(Credits|ಕ್ರೆಡಿಟ್‌ಗಳು)$/i }).click();
        await expect(donor.getByTestId('credits-balance')).toHaveText(/^0$/, { timeout: 15000 });
        redemptionRan = true;
      }
    }
  } finally {
    console.log(`full-loop redemption step: ${redemptionRan ? 'RAN' : 'SKIPPED'}`);
    test.info().annotations.push({
      type: 'redemption',
      description: redemptionRan ? 'ran' : 'skipped',
    });
    await hospitalCtx.close();
    await donorCtx.close();
  }
});

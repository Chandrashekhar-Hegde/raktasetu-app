import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hasTestDatabase, loadApp, donorPayload } from './helpers/routeDb.js';

// Without RESEND_API_KEY outside production, sendEmail prints the message; capture links from it.
function captureEmails() {
  const links = [];
  const original = console.log;
  console.log = (...args) => {
    const text = args.join(' ');
    const match = text.match(/\/(reset-password|verify-email)\?token=([A-Za-z0-9_-]+)/);
    if (match) links.push({ kind: match[1], token: match[2] });
    else original(...args);
  };
  return { links, restore: () => { console.log = original; } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve)); // emails are sent after the response

// One app/pool per file: the pool is a module singleton, so it can only be ended once.
const ctx = hasTestDatabase ? await loadApp() : null;
test.after(() => ctx?.pool.end());

test('password reset: single-use, expires old sessions, never reveals whether an email exists', { skip: !hasTestDatabase }, async () => {
  const { app } = ctx;
  const mail = captureEmails();
  try {
    const payload = donorPayload();
    const reg = await request(app).post('/api/auth/register').set('X-Client-Platform', 'native').send(payload).expect(201);
    const oldRefresh = reg.body.data.refresh_token;

    await request(app).post('/api/auth/password/forgot').send({ email: 'nobody-here@test.invalid' }).expect(200);
    await request(app).post('/api/auth/password/forgot').send({ email: payload.email }).expect(200);
    await settle();
    const reset = mail.links.filter((l) => l.kind === 'reset-password');
    assert.equal(reset.length, 1, 'only the registered address gets a link');

    await request(app).post('/api/auth/password/reset').send({ token: 'x'.repeat(43), password: 'New-Password-456!' }).expect(400);
    await request(app).post('/api/auth/password/reset').send({ token: reset[0].token, password: 'New-Password-456!' }).expect(200);
    await request(app).post('/api/auth/password/reset').send({ token: reset[0].token, password: 'Other-Password-789!' }).expect(400);

    await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password }).expect(401);
    await request(app).post('/api/auth/login').send({ email: payload.email, password: 'New-Password-456!' }).expect(200);
    await request(app).post('/api/auth/refresh').set('X-Client-Platform', 'native').send({ refresh_token: oldRefresh }).expect(401);
  } finally {
    mail.restore();
  }
});

test('email verification link from sign-up marks the account verified once', { skip: !hasTestDatabase }, async () => {
  const { app } = ctx;
  const mail = captureEmails();
  try {
    const reg = await request(app).post('/api/auth/register').send(donorPayload()).expect(201);
    await settle();
    const verify = mail.links.find((l) => l.kind === 'verify-email');
    assert.ok(verify, 'sign-up sends a verification link');
    const auth = { Authorization: `Bearer ${reg.body.data.token}` };
    assert.equal((await request(app).get('/api/auth/me').set(auth)).body.data.user.is_verified, false);
    await request(app).post('/api/auth/email/verify/confirm').send({ token: verify.token }).expect(200);
    assert.equal((await request(app).get('/api/auth/me').set(auth)).body.data.user.is_verified, true);
    await request(app).post('/api/auth/email/verify/confirm').send({ token: verify.token }).expect(400);
  } finally {
    mail.restore();
  }
});

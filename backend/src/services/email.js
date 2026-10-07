import { isProductionEnv } from '../auth/refreshCookie.js';

/**
 * Public origin for links in emails. Configured only: building it from the request Host header
 * would let anyone send a reset link pointing at their own site.
 */
export function publicAppOrigin(env = process.env) {
  if (env.PUBLIC_APP_ORIGIN) return env.PUBLIC_APP_ORIGIN.replace(/\/$/, '');
  if (env.CANONICAL_ORIGIN) return env.CANONICAL_ORIGIN.replace(/\/$/, '');
  if (env.RAILWAY_PUBLIC_DOMAIN) return `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  return 'http://localhost:5173';
}

/**
 * Sends one transactional email through Resend's HTTP API (no SDK needed).
 * Without RESEND_API_KEY it does not send: development prints the message so links can be
 * followed locally; production only warns (never logs the link, it is a credential).
 */
export async function sendEmail({ to, subject, text }, env = process.env) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (isProductionEnv(env)) console.warn('Email not sent: RESEND_API_KEY / EMAIL_FROM not configured');
    else console.log(`[email:dev] to=${to}\nsubject=${subject}\n${text}`);
    return { sent: false };
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return { sent: true };
}

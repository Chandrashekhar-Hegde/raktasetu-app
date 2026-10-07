// Central config with no React imports or circular dependencies.
// Production (Railway unified): leave VITE_API_URL unset → same-origin /api + Socket.io
// Local Vite without proxy: VITE_API_URL=http://localhost:3001
const envUrl = import.meta.env.VITE_API_URL;
const API_BASE = envUrl === undefined || envUrl === ''
  ? ''
  : String(envUrl).replace(/\/$/, '');
export const API_URL = API_BASE ? `${API_BASE}/api` : '/api';
export const SOCKET_URL = API_BASE || undefined;
/** Must equal backend CURRENT_POLICY_VERSION (backend/src/validation/schemas.js); registration is rejected otherwise. */
export const POLICY_VERSION = '2026-07-15';
/** Public Google OAuth client ID. The button is hidden when unset. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
/**
 * Public contact addresses shown in the policy and help screens. One place to change them.
 * NOTE: raktasetu.org currently has no MX record, so these defaults bounce; set VITE_*_EMAIL to a working inbox.
 */
export const CONTACT = {
  privacy: import.meta.env.VITE_PRIVACY_EMAIL || 'privacy@raktasetu.org',
  support: import.meta.env.VITE_SUPPORT_EMAIL || 'support@raktasetu.org',
  security: import.meta.env.VITE_SECURITY_EMAIL || 'security@raktasetu.org',
};

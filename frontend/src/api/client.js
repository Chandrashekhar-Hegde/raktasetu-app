import axios from 'axios';
import { API_URL } from '../config.js';
import {
  clearSessionTokens,
  getAccessToken,
  getNativeRefreshToken,
  setAccessToken,
  setNativeRefreshToken,
} from '../lib/accessToken.js';
import { isNativePlatform } from '../lib/platform.js';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (isNativePlatform()) {
    config.headers['X-Client-Platform'] = 'native';
  }
  return config;
});

async function refreshSession() {
  if (isNativePlatform()) {
    const refreshToken = getNativeRefreshToken();
    if (!refreshToken) throw new Error('No refresh token');
    const response = await axios.post(
      `${API_URL}/auth/refresh`,
      { refresh_token: refreshToken },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'native',
        },
        withCredentials: false,
      },
    );
    const session = response.data.data;
    setAccessToken(session.token);
    if (session.refresh_token) setNativeRefreshToken(session.refresh_token);
    return session.token;
  }

  const response = await axios.post(
    `${API_URL}/auth/refresh`,
    {},
    { withCredentials: true, headers: { 'Content-Type': 'application/json' } },
  );
  const session = response.data.data;
  setAccessToken(session.token);
  return session.token;
}

// Parallel 401s share one refresh: rotated refresh tokens are single-use.
let refreshing = null;
function refreshOnce() {
  refreshing ??= refreshSession().finally(() => { refreshing = null; });
  return refreshing;
}

// AuthProvider registers this so an expired session clears React state and routes to /login.
let onSessionExpired = () => {};
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

/** Human-readable message from an API error: the backend sends `error` as a string or {code, message}. */
export function errMsg(err, fallback = 'Something went wrong. Please try again.') {
  const error = err?.response?.data?.error;
  if (typeof error === 'string') return error;
  if (error?.issues?.length) return error.issues.map((issue) => issue.message).join('. ');
  if (typeof error?.message === 'string') return error.message;
  if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') return 'Network problem. Check your connection and try again.';
  return fallback;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthOperation = original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/logout');
    const canRefresh = isNativePlatform()
      ? Boolean(getNativeRefreshToken())
      : true;
    if (err.response?.status === 401 && canRefresh && original && !original._retried && !isAuthOperation) {
      original._retried = true;
      try {
        const token = await refreshOnce();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        // Continue into local cleanup below.
      }
    }
    if (err.response?.status === 401 && !isAuthOperation) {
      clearSessionTokens();
      onSessionExpired();
    }
    return Promise.reject(err);
  },
);

export { refreshOnce as refreshSession };
export default api;

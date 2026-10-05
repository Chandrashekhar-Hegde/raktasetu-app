import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import api, { refreshSession, setSessionExpiredHandler } from '../api/client.js';
import {
  clearSessionTokens,
  getAccessToken,
  getNativeRefreshToken,
  setAccessToken,
  setNativeRefreshToken,
} from '../lib/accessToken.js';
import { isNativePlatform } from '../lib/platform.js';

const AuthContext = createContext(null);

function useAuthState() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const storeSession = (payload) => {
    if (!payload?.token) return null;
    setAccessToken(payload.token);
    if (isNativePlatform() && payload.refresh_token) {
      setNativeRefreshToken(payload.refresh_token);
    }
    const nextUser = payload.user;
    setUser(nextUser);
    return nextUser;
  };

  const fetchUser = useCallback(async () => {
    let token = getAccessToken();
    if (!token && !isNativePlatform()) {
      try {
        token = await refreshSession();
      } catch {
        setUser(null);
        setLoading(false);
        return;
      }
    }
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me', { timeout: 8000 });
      setUser(res.data.data?.user || res.data.user);
    } catch (error) {
      // Only a real auth rejection ends the session; a slow or offline network must not log users out.
      if ([401, 403].includes(error.response?.status)) clearSessionTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(() => {});
  }, []);

  const login = async (identifier, password) => {
    const payload = identifier.includes('@')
      ? { email: identifier, password }
      : { phone: identifier, password };
    const { data } = await api.post('/auth/login', payload);
    return storeSession(data.data || data);
  };

  const loginWithGoogle = async (idToken) => {
    try {
      const { data } = await api.post('/auth/google', { id_token: idToken });
      const payload = data.data || data;
      if (payload.flow === 'session') {
        return { flow: 'session', user: storeSession(payload) };
      }
      if (payload.flow === 'onboarding_required') {
        sessionStorage.setItem('google_onboarding_token', payload.onboarding_token);
      }
      return payload;
    } catch (error) {
      const code = error.response?.data?.error?.code;
      if (code === 'ACCOUNT_LINK_REQUIRED') {
        sessionStorage.setItem('google_link_token', idToken);
        return { flow: 'link_required' };
      }
      throw error;
    }
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    const result = data.data || data;
    return result.token ? { user: storeSession(result) } : result;
  };

  const completeGoogleOnboarding = async (payload) => {
    const { data } = await api.post('/auth/google/onboarding', payload);
    return storeSession(data.data || data);
  };

  const linkGoogle = async ({ identifier, password }) => {
    const idToken = sessionStorage.getItem('google_link_token');
    if (!idToken) throw new Error('Google linking session expired');
    const payload = identifier.includes('@')
      ? { email: identifier, password }
      : { phone: identifier, password };
    const { data } = await api.post('/auth/login', payload);
    const session = data.data || data;
    if (!session?.token) throw new Error('Login failed');
    storeSession(session);
    await api.post('/auth/google/link', { id_token: idToken, password });
    sessionStorage.removeItem('google_link_token');
    setUser(session.user);
    return session.user;
  };

  const restoreAccount = async (identifier, password) => {
    const payload = identifier.includes('@')
      ? { email: identifier, password }
      : { phone: identifier, password };
    const { data } = await api.post('/auth/restore-account', payload);
    return storeSession(data.data || data);
  };

  const logout = async () => {
    try {
      if (getAccessToken()) {
        const body = isNativePlatform() && getNativeRefreshToken()
          ? { refresh_token: getNativeRefreshToken() }
          : {};
        await api.post('/auth/logout', body);
      }
    } finally {
      clearSessionTokens();
      setUser(null);
    }
  };

  const updateUser = (patch) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  };

  return {
    user,
    loading,
    login,
    loginWithGoogle,
    completeGoogleOnboarding,
    linkGoogle,
    register,
    restoreAccount,
    logout,
    updateUser,
    refetch: fetchUser,
  };
}

export function AuthProvider({ children }) {
  const value = useAuthState();
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

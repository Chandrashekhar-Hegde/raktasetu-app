import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { t } from '../i18n.js';

/** Shared card layout (index.css .auth-flow) for the three email-link screens. */
function Card({ eyebrow, title, children }) {
  return (
    <main className="auth-flow">
      <section className="auth-flow__card" aria-labelledby="recovery-title">
        <p className="auth-flow__eyebrow">{eyebrow}</p>
        <h1 id="recovery-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      await api.post('/auth/password/forgot', { email });
      setState('sent');
    } catch (err) {
      setError(errMsg(err, t('recovery.failed')));
      setState('idle');
    }
  };

  return (
    <Card eyebrow={t('recovery.eyebrow')} title={t('recovery.forgotTitle')}>
      {state === 'sent' ? (
        <p role="status">{t('recovery.forgotSent', { email })}</p>
      ) : (
        <>
          <p>{t('recovery.forgotBody')}</p>
          {error && <div className="auth-flow__error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <label>{t('register.email')}
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" disabled={state === 'sending'}>{state === 'sending' ? t('recovery.sending') : t('recovery.sendLink')}</button>
          </form>
        </>
      )}
      <Link className="auth-flow__button-link" to="/login">{t('recovery.backToSignIn')}</Link>
    </Card>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState('idle'); // idle | saving | done
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError(t('recovery.mismatch'));
    setState('saving');
    setError('');
    try {
      await api.post('/auth/password/reset', { token, password });
      setState('done');
    } catch (err) {
      setError(errMsg(err, t('recovery.failed')));
      setState('idle');
    }
  };

  return (
    <Card eyebrow={t('recovery.eyebrow')} title={t('recovery.resetTitle')}>
      {state === 'done' ? (
        <p role="status">{t('recovery.resetDone')}</p>
      ) : (
        <>
          {error && <div className="auth-flow__error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <label>{t('recovery.newPassword')}
              <input type="password" required minLength={12} autoComplete="new-password" aria-describedby="pw-help" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <p id="pw-help" style={{ margin: 0, fontSize: 13 }}>{t('register.passwordHelp')}</p>
            <label>{t('recovery.confirmPassword')}
              <input type="password" required minLength={12} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button type="submit" disabled={state === 'saving' || !token}>{state === 'saving' ? t('recovery.saving') : t('recovery.savePassword')}</button>
          </form>
        </>
      )}
      <Link className="auth-flow__button-link" to="/login">{t('recovery.backToSignIn')}</Link>
    </Card>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState('verifying'); // verifying | done | failed
  const [error, setError] = useState('');
  const sent = useRef(false); // StrictMode runs effects twice; the token is single-use

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api.post('/auth/email/verify/confirm', { token })
      .then(() => setState('done'))
      .catch((err) => { setError(errMsg(err, t('recovery.verifyFailed'))); setState('failed'); });
  }, [token]);

  return (
    <Card eyebrow={t('recovery.eyebrow')} title={t('recovery.verifyTitle')}>
      {state === 'verifying' && <p role="status">{t('recovery.verifying')}</p>}
      {state === 'done' && <p role="status">{t('recovery.verifyDone')}</p>}
      {state === 'failed' && <div className="auth-flow__error" role="alert">{error}</div>}
      <Link className="auth-flow__button-link" to="/">{t('notFound.home')}</Link>
    </Card>
  );
}

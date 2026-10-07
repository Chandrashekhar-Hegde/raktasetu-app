import { POLICY_VERSION } from '../config.js';
import { useState } from 'react';
import { errMsg } from '../api/client.js';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { roleHome } from '../lib/roleHome.js';

export default function GoogleOnboarding() {
  const navigate = useNavigate();
  const { completeGoogleOnboarding } = useAuth();
  const [form, setForm] = useState({ phone: '', blood_group: '', date_of_birth: '', sex: '', city: '', state: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = sessionStorage.getItem('google_onboarding_token');

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!token) return setError('This onboarding session expired. Start again from sign in.');
    if (!consent) return setError('Consent is required to create your donor account.');
    setBusy(true);
    setError('');
    try {
      const user = await completeGoogleOnboarding({
        onboarding_token: token,
        ...form,
        consent_given: true,
        consent_policy_version: POLICY_VERSION,
      });
      sessionStorage.removeItem('google_onboarding_token');
      navigate(roleHome(user));
    } catch (requestError) {
      setError(errMsg(requestError, 'Could not create your account'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-flow">
      <section className="auth-flow__card" aria-labelledby="google-onboarding-title">
        <p className="auth-flow__eyebrow">Donor account</p>
        <h1 id="google-onboarding-title">Complete your donor profile</h1>
        <p>Google verified your email. Add the health and contact details RaktaSetu needs before your account is created.</p>
        {error ? <div className="auth-flow__error" role="alert">{error}</div> : null}
        <form onSubmit={submit}>
          <label>Phone<input required autoComplete="tel" value={form.phone} onChange={update('phone')} placeholder="+91 98765 43210" /></label>
          <label>Blood group<select required value={form.blood_group} onChange={update('blood_group')}><option value="" disabled>Choose your blood group</option>{['O-','O+','A-','A+','B-','B+','AB-','AB+'].map((group) => <option key={group}>{group}</option>)}</select></label>
          <label>Date of birth<input required type="date" value={form.date_of_birth} onChange={update('date_of_birth')} /></label>
          <label>Sex (NBTC interval)
            <select required value={form.sex} onChange={update('sex')}>
              <option value="" disabled>Select</option>
              <option value="male">Male (90 days)</option>
              <option value="female">Female (120 days)</option>
            </select>
          </label>
          <label>City<input required value={form.city} onChange={update('city')} /></label>
          <label>State<input required value={form.state} onChange={update('state')} /></label>
          <label className="auth-flow__consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I have read the <Link to="/privacy">Privacy Policy</Link> and consent to processing my donor profile and Google identity for RaktaSetu.</span>
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create donor account'}</button>
        </form>
        <Link to="/login">Cancel and return to sign in</Link>
      </section>
    </main>
  );
}

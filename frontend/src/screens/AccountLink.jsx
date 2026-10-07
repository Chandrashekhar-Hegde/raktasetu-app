import { useState } from 'react';
import { errMsg } from '../api/client.js';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { roleHome } from '../lib/roleHome.js';

export default function AccountLink() {
  const navigate = useNavigate();
  const { linkGoogle } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await linkGoogle({ identifier, password });
      navigate(roleHome(user));
    } catch (requestError) {
      setError(errMsg(requestError, 'Could not link Google'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-flow">
      <section className="auth-flow__card" aria-labelledby="account-link-title">
        <p className="auth-flow__eyebrow">Security check</p>
        <h1 id="account-link-title">Link your donor account</h1>
        <p>An account already uses this verified email. Confirm its current donor password before Google is linked.</p>
        {error ? <div className="auth-flow__error" role="alert">{error}</div> : null}
        <form onSubmit={submit}>
          <label>Phone or email<input required autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label>
          <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? 'Linking…' : 'Confirm and link Google'}</button>
        </form>
        <Link to="/login">Cancel and return to sign in</Link>
      </section>
    </main>
  );
}

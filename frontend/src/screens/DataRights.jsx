import React, { useState } from 'react';
import { CONTACT } from '../config.js';
import { Link, useNavigate } from 'react-router-dom';
import PublicShell from '../components/PublicShell.jsx';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import usePageMeta from '../hooks/usePageMeta.js';
import { t } from '../i18n.js';

export default function DataRights() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');

  usePageMeta({
    title: 'Data Rights Center | RaktaSetu',
    description: 'Request access, export, correction, or deletion of RaktaSetu account data.',
    path: '/data-rights',
  });

  const downloadExport = async () => {
    setBusy('export');
    setStatus('');
    try {
      const response = await api.get('/auth/export');
      const payload = response.data?.data || response.data;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `raktasetu-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(t('dataRights.exportReady'));
    } catch (error) {
      setStatus(errMsg(error, t('dataRights.exportFailed', { email: CONTACT.privacy })));
    } finally {
      setBusy('');
    }
  };

  const deleteAccount = async () => {
    if (confirmation !== 'DELETE') return;
    setBusy('delete');
    setStatus('');
    try {
      const body = { confirm: 'DELETE' };
      if (password) body.password = password;
      await api.post('/auth/delete-account', body);
      await logout();
      navigate('/login', { replace: true, state: { accountDeleted: true } });
    } catch (error) {
      const code = error.response?.data?.error?.code;
      if (code === 'ACCOUNT_DELETION_BLOCKED') {
        setStatus(errMsg(error, t('dataRights.deleteBlocked')));
      } else if (code === 'RECENT_AUTH_REQUIRED') {
        setStatus(t('dataRights.passwordRequired'));
      } else {
        setStatus(errMsg(error, t('dataRights.deleteFailed', { email: CONTACT.privacy })));
      }
      setBusy('');
    }
  };

  return (
    <PublicShell>
      <article className="policy-wrap">
        <p className="policy-kicker">{t('dataRights.kicker')}</p>
        <h1>{t('dataRights.title')}</h1>
        <p className="policy-lede">{t('dataRights.lede')}</p>
        <p className="policy-date">{t('dataRights.reviewed')}</p>

        <div className="policy-callout">{t('dataRights.verifyNote')}</div>

        <section className="policy-section">
          <h2>{t('dataRights.availableTitle')}</h2>
          <ul>
            <li><strong>{t('dataRights.accessLabel')}</strong> {t('dataRights.accessBody')}</li>
            <li><strong>{t('dataRights.correctionLabel')}</strong> {t('dataRights.correctionBody')}</li>
            <li><strong>{t('dataRights.deletionLabel')}</strong> {t('dataRights.deletionBody')}</li>
            <li><strong>{t('dataRights.restrictionLabel')}</strong> {t('dataRights.restrictionBody')}</li>
            <li><strong>{t('dataRights.consentLabel')}</strong> {t('dataRights.consentBody')}</li>
            <li><strong>{t('dataRights.complaintLabel')}</strong> {t('dataRights.complaintBody')}</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>{t('dataRights.toolsTitle')}</h2>
          {user ? (
            <>
              <p>
                {t('dataRights.signedInAs')} <strong>{user.email || user.phone || user.name}</strong>.
                {' '}{t('dataRights.exportScope')}
              </p>
              <div className="rights-actions">
                <button
                  className="rights-action"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={downloadExport}
                >
                  {busy === 'export' ? t('dataRights.exporting') : t('dataRights.download')}
                </button>
                <button
                  className="rights-action rights-action--danger"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setShowDelete((value) => !value)}
                >
                  {t('dataRights.requestDelete')}
                </button>
              </div>
              {showDelete ? (
                <div className="policy-callout" role="group" aria-labelledby="delete-account-title">
                  <h3 id="delete-account-title">{t('dataRights.confirmTitle')}</h3>
                  <ul>
                    <li>{t('dataRights.consequenceDeactivate')}</li>
                    <li>{t('dataRights.consequenceMatching')}</li>
                    <li>{t('dataRights.consequenceRestore')}</li>
                    <li>{t('dataRights.consequenceRetain')}</li>
                    <li>{t('dataRights.consequenceBlockers')}</li>
                  </ul>
                  <label htmlFor="delete-password">{t('dataRights.passwordLabel')}</label>
                  <input
                    id="delete-password"
                    className="rs-field"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    style={{
                      width: '100%',
                      minHeight: 48,
                      marginTop: 8,
                      marginBottom: 12,
                      padding: '12px 14px',
                      border: '1px solid #c9bdb6',
                      borderRadius: 8,
                      font: 'inherit',
                      background: '#fff',
                      color: '#17151A',
                      colorScheme: 'light',
                      caretColor: '#17151A',
                    }}
                  />
                  <label htmlFor="delete-confirmation">
                    {t('dataRights.typeDelete')} <strong>DELETE</strong> {t('dataRights.toContinue')}
                  </label>
                  <input
                    id="delete-confirmation"
                    className="rs-field"
                    type="text"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    style={{
                      width: '100%',
                      minHeight: 48,
                      marginTop: 8,
                      padding: '12px 14px',
                      border: '1px solid #c9bdb6',
                      borderRadius: 8,
                      font: 'inherit',
                      background: '#fff',
                      color: '#17151A',
                      colorScheme: 'light',
                      caretColor: '#17151A',
                    }}
                  />
                  <button
                    className="rights-action rights-action--danger"
                    type="button"
                    disabled={confirmation !== 'DELETE' || Boolean(busy)}
                    onClick={deleteAccount}
                    style={{ width: '100%', marginTop: 12 }}
                  >
                    {busy === 'delete' ? t('dataRights.deleting') : t('dataRights.deleteCta')}
                  </button>
                </div>
              ) : null}
              {status ? <p className="rights-status" role="status">{status}</p> : null}
            </>
          ) : (
            <p>
              <Link to="/login">{t('dataRights.signIn')}</Link> {t('dataRights.signInHint')}
            </p>
          )}
        </section>

        <section className="policy-section">
          <h2>{t('dataRights.emailTitle')}</h2>
          <ol>
            <li>{t('dataRights.emailStep1', { email: CONTACT.privacy })}</li>
            <li>{t('dataRights.emailStep2')}</li>
            <li>{t('dataRights.emailStep3')}</li>
          </ol>
          <p>{t('dataRights.emailFootnote')}</p>
        </section>
      </article>
    </PublicShell>
  );
}

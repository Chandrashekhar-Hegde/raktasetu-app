import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { T } from '../theme.js';
import Card from '../components/Card.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import api, { errMsg } from '../api/client.js';
import { t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";
const STATUS_TONE = { accepted: 'gold', arrived: 'red', completed: 'line', declined: 'line', pending: 'line' };

/** Hospital view of one request: who responded (blood group only, no donor PII) and closing it. */
export default function ConsoleRequest() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/hospital/requests/${requestId}`);
      setData(res.data.data);
      setError('');
    } catch (err) {
      setError(errMsg(err, t('consoleRequest.loadFailed')));
    }
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (status) => {
    setSaving(true);
    try {
      await api.patch(`/hospital/requests/${requestId}`, { status });
      await load();
    } catch (err) {
      setError(errMsg(err, t('consoleRequest.updateFailed')));
    } finally {
      setSaving(false);
    }
  };

  const request = data?.request;
  const responses = data?.responses || [];
  return (
    <div style={{ minHeight: '100vh', background: T.consoleBg, color: '#F0EEE9', padding: '20px 16px 40px' }}>
      <Link to="/console" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, color: T.consoleMut, fontFamily: body, fontSize: 14, textDecoration: 'none' }}>
        <ArrowLeft size={18} aria-hidden="true" /> {t('consoleRequest.back')}
      </Link>
      {error && <p role="alert" style={{ fontFamily: body, color: '#F2879A', margin: '12px 0' }}>{error}</p>}
      {!request && !error && <p style={{ fontFamily: body, color: T.consoleMut }}>{t('consoleRequest.loading')}</p>}
      {request && (
        <>
          <Card dark style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 30, margin: 0, color: '#E4506B' }}>{request.blood_group}</h1>
                <p style={{ fontFamily: body, fontSize: 13, margin: '4px 0 0', color: T.consoleMut }}>
                  {t('consoleRequest.summary', { units: request.units_needed, ref: request.ref_code, km: request.radius_km })}
                </p>
              </div>
              <Chip tone={request.status === 'open' ? 'red' : 'line'} dark>{t(`consoleRequest.status.${request.status}`)}</Chip>
            </div>
          </Card>

          <h2 style={{ fontFamily: display, fontSize: 16, margin: '20px 0 8px' }}>{t('consoleRequest.responders', { count: responses.length })}</h2>
          {responses.length === 0 && <p style={{ fontFamily: body, color: T.consoleMut, fontSize: 14 }}>{t('consoleRequest.noResponders')}</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {responses.map((r, i) => (
              <li key={r.id}>
                <Card dark style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: body, fontSize: 14 }}>
                    {t('consoleRequest.donor', { n: i + 1, group: r.donor_blood_group || '—' })}
                  </span>
                  <Chip tone={STATUS_TONE[r.status] || 'line'} dark>{t(`consoleRequest.response.${r.status}`)}</Chip>
                </Card>
              </li>
            ))}
          </ul>

          <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
            <Btn full onClick={() => navigate('/console/verify')}>{t('consoleRequest.verify')}</Btn>
            {request.status === 'open' && (
              <>
                <Btn full dark kind="ghost" disabled={saving} onClick={() => setStatus('filled')}>{t('consoleRequest.markFilled')}</Btn>
                <Btn full dark kind="ghost" disabled={saving} onClick={() => setStatus('closed')}>{t('consoleRequest.close')}</Btn>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

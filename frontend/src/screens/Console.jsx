import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { T } from '../theme.js';
import Logo from '../components/Logo.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import api from '../api/client.js';
import LocationPrompt from '../components/LocationPrompt.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

function formatNeededBy(neededBy) {
  if (!neededBy) return null;
  const target = new Date(neededBy);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return t('console.neededByOverdue');
  const totalMin = Math.ceil(diffMs / 60000);
  if (totalMin < 60) return t('console.neededByMinutes', { n: totalMin });
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours < 24) return t('console.neededByHours', { h: hours, m: minutes });
  const days = Math.floor(hours / 24);
  return t('console.neededByDays', { n: days });
}

function neededByTone(neededBy) {
  if (!neededBy) return T.consoleMut;
  const diffMs = new Date(neededBy).getTime() - Date.now();
  if (diffMs <= 0) return '#E4506B';
  if (diffMs < 60 * 60 * 1000) return '#E6B84D';
  return T.consoleMut;
}

export default function Console() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('board');
  const [requests, setRequests] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationSet, setLocationSet] = useState(true);

  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/new-request')) setTab('new');
    else if (path.includes('/verify')) setTab('verify');
    else setTab('board');
  }, [location]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboard = async () => {
    try {
      const [{ data: response }, metricsRes] = await Promise.all([
        api.get('/hospital/dashboard'),
        api.get('/hospital/metrics/summary').catch(() => null),
      ]);
      const payload = response.data || response;
      setRequests(payload.requests || []);
      setLocationSet(payload.location_set !== false);
      if (metricsRes?.data?.data) setMetrics(metricsRes.data.data);
    } catch (_err) {
      setError(t('metrics.consoleLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    ['board', '/console', 'Live board'],
    ['new', '/console/new-request', 'New request'],
    ['verify', '/console/verify', 'Verify donor'],
  ];

  const fillPct = metrics?.fill_rate == null ? '—' : `${Math.round(metrics.fill_rate * 100)}%`;

  return (
    <div style={{ minHeight: '100vh', background: T.consoleBg, color: '#F0EEE9', maxWidth: 430, margin: '0 auto', position: 'relative' }}>
      <div style={{ padding: '10px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo size={22} dark />
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: 0 }}>{user?.name || 'Hospital'}</p>
          <p style={{ fontFamily: body, fontSize: 10.5, color: T.consoleMut, margin: 0 }}>Blood bank console</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
        {tabs.map(([k, path, label]) => (
          <button key={k} onClick={() => navigate(path)} style={{
            fontFamily: display, fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 99, cursor: 'pointer',
            background: tab === k ? '#F0EEE9' : 'transparent', color: tab === k ? T.ink : T.consoleMut,
            border: `1px solid ${tab === k ? '#F0EEE9' : T.consoleLine}`,
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <div style={{ padding: '16px 16px 20px' }}>
          {metrics ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                [fillPct, t('metrics.fillRate')],
                [metrics.total_requests ?? 0, t('metrics.consoleRequests')],
                [metrics.donations_count ?? 0, t('metrics.consoleDonations')],
              ].map(([value, label]) => (
                <div key={label} style={{ background: T.consoleCard, border: `1px solid ${T.consoleLine}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <p style={{ fontFamily: display, fontWeight: 800, fontSize: 18, margin: 0, color: '#F0EEE9' }}>{value}</p>
                  <p style={{ fontFamily: body, fontSize: 10, color: T.consoleMut, margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: 0 }}>Live board · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>

          {!locationSet && (
            <Card dark style={{ marginBottom: 12, borderColor: '#E4506B' }}>
              <h2 style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: 0, color: '#F0EEE9' }}>{t('location.consoleTitle')}</h2>
              <p style={{ fontFamily: body, fontSize: 13, color: T.consoleMut, margin: '6px 0 12px' }}>{t('location.consoleBody')}</p>
              <LocationPrompt dark labelKey="location.useHospital" onCoords={async (coords) => {
                await api.patch('/hospital/location', coords);
                setLocationSet(true);
              }} />
            </Card>
          )}
          {loading ? (
            <p style={{ fontFamily: body, fontSize: 13, color: T.consoleMut, textAlign: 'center' }}>Loading...</p>
          ) : error ? (
            <p style={{ fontFamily: body, fontSize: 13, color: '#E4506B', textAlign: 'center' }}>{error}</p>
          ) : requests.length === 0 ? (
            <Card dark>
              <p style={{ fontFamily: body, fontSize: 13, color: T.consoleMut, margin: 0, textAlign: 'center' }}>No active requests. Create a new request to find donors.</p>
            </Card>
          ) : (
            requests.map((req) => (
              <Link key={req.id} to={`/console/requests/${req.id}`} aria-label={t('consoleRequest.open', { ref: req.ref_code })} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
              <Card dark style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontFamily: display, fontWeight: 800, fontSize: 26, color: '#E4506B' }}>{req.blood_group}</span>
                    <div>
                      <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, margin: 0, color: '#F0EEE9' }}>{req.units_needed} units · ref {req.ref_code}</p>
                      <p style={{ fontFamily: body, fontSize: 11.5, color: T.consoleMut, margin: '2px 0 0' }}>
                        Broadcast {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {req.radius_km} km radius
                      </p>
                      {req.needed_by ? (
                        <p style={{ fontFamily: body, fontSize: 11.5, color: neededByTone(req.needed_by), margin: '2px 0 0' }}>
                          {formatNeededBy(req.needed_by)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <Chip tone={req.urgency === 'critical' ? 'red' : req.urgency === 'urgent' ? 'gold' : 'line'} dark>{req.urgency}</Chip>
                    {Number(req.escalation_level) > 0 ? (
                      <Chip tone="gold" dark>
                        {t('console.escalated', { level: req.escalation_level, km: req.radius_km })}
                      </Chip>
                    ) : null}
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: T.consoleLine, margin: '14px 0 8px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (req.filled_units / req.units_needed) * 100)}%`, height: '100%', background: '#E4506B' }} />
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  {[
                    [req.donors_pinged || '0', 'pinged'],
                    [req.accepted_count || '0', 'accepted'],
                    [req.arrived_count || '0', 'arrived'],
                    [`${req.filled_units || 0} / ${req.units_needed}`, 'collected'],
                  ].map(([n, l]) => (
                    <div key={l}>
                      <p style={{ fontFamily: display, fontWeight: 800, fontSize: 15, margin: 0, color: '#F0EEE9' }}>{n}</p>
                      <p style={{ fontFamily: body, fontSize: 10.5, color: T.consoleMut, margin: 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</p>
                    </div>
                  ))}
                </div>
              </Card>
              </Link>
            ))
          )}

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={() => { logout(); navigate('/login'); }} style={{ fontFamily: body, fontSize: 13, color: '#E4506B', background: 'none', border: 'none', cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

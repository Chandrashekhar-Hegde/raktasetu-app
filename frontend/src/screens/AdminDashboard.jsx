import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Building2, Droplet, Award, BarChart3, ArrowLeft, LogOut, Download } from 'lucide-react';
import { T } from '../theme.js';
import Card from '../components/Card.jsx';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import { t } from '../i18n.js';
import { getAccessToken } from '../lib/accessToken.js';
import { API_URL } from '../config.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

function asItems(payload, fallbackKey) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.[fallbackKey])) return payload[fallbackKey];
  if (Array.isArray(payload)) return payload;
  return [];
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function RequestsPerDayChart({ series }) {
  const rows = Array.isArray(series) ? series : [];
  const max = Math.max(1, ...rows.map((r) => r.count || 0));
  const width = Math.max(280, rows.length * 28);
  const height = 120;
  const pad = 8;
  const barW = rows.length ? Math.max(8, (width - pad * 2) / rows.length - 4) : 8;

  if (rows.length === 0) {
    return (
      <p style={{ fontFamily: body, fontSize: 13, color: T.consoleMut, margin: 0 }}>{t('metrics.noDailyData')}</p>
    );
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('metrics.requestsPerDay')}>
      {rows.map((row, i) => {
        const h = ((row.count || 0) / max) * (height - pad * 2 - 16);
        const x = pad + i * ((width - pad * 2) / rows.length);
        const y = height - pad - 14 - h;
        return (
          <g key={row.day}>
            <rect x={x} y={y} width={barW} height={Math.max(1, h)} fill={T.arterial} rx={2} />
            <text x={x + barW / 2} y={height - 2} textAnchor="middle" fill={T.consoleMut} fontSize={8} fontFamily={body}>
              {String(row.day).slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersCursor, setUsersCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState(defaultDateRange);
  const [summary, setSummary] = useState(null);
  const [responseTimes, setResponseTimes] = useState(null);
  const [rare, setRare] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, usersRes, requestsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users', { params: { limit: 100 } }),
        api.get('/admin/requests', { params: { limit: 100 } }),
      ]);
      setStats(statsRes.data.data?.stats || statsRes.data.stats);
      setUsers(asItems(usersRes.data.data || usersRes.data, 'users'));
      setUsersCursor(usersRes.data.data?.next_cursor || null);
      setRequests(asItems(requestsRes.data.data || requestsRes.data, 'requests'));
      setError('');
    } catch (_err) {
      setError(t('metrics.loadFailed'));
      if (_err.response?.status === 403) {
        await logout();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [logout, navigate]);

  // Lists are keyset-paged at 100: without this, pending hospitals past the first page could never be approved.
  const loadMoreUsers = async () => {
    setLoadingMore(true);
    try {
      const res = await api.get('/admin/users', { params: { limit: 100, cursor: usersCursor } });
      setUsers((prev) => [...prev, ...asItems(res.data.data, 'users')]);
      setUsersCursor(res.data.data?.next_cursor || null);
    } catch (err) {
      setError(errMsg(err, t('metrics.loadFailed')));
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const params = {
        from: `${range.from}T00:00:00.000Z`,
        to: `${range.to}T23:59:59.999Z`,
      };
      const [sumRes, rtRes, rareRes] = await Promise.all([
        api.get('/admin/metrics/summary', { params }),
        api.get('/admin/metrics/response-times', { params }),
        api.get('/admin/metrics/rare', { params }),
      ]);
      setSummary(sumRes.data.data);
      setResponseTimes(rtRes.data.data);
      setRare(rareRes.data.data);
      setError('');
    } catch (_err) {
      setError(t('metrics.loadFailed'));
    } finally {
      setMetricsLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (tab === 'metrics') fetchMetrics();
  }, [tab, fetchMetrics]);

  const setHospitalApproval = async (hospitalId, status) => {
    setBusyId(hospitalId);
    setError('');
    try {
      await api.post(`/admin/hospitals/${hospitalId}/approval`, { status });
      await fetchData();
    } catch (_err) {
      setError(errMsg(_err, t('metrics.approvalFailed')));
    } finally {
      setBusyId('');
    }
  };

  const downloadCsv = async () => {
    try {
      const params = new URLSearchParams({
        from: `${range.from}T00:00:00.000Z`,
        to: `${range.to}T23:59:59.999Z`,
      });
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/admin/metrics/export.csv?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'raktasetu-pilot-metrics.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (_err) {
      setError(t('metrics.exportFailed'));
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: body, color: T.mut, background: '#0A0506' }}>
        {t('metrics.loading')}
      </div>
    );
  }

  const donors = users.filter((u) => u.role === 'donor');
  const hospitals = users.filter((u) => u.role === 'hospital');
  const pendingHospitals = hospitals.filter((h) => (h.approval_status || 'pending') === 'pending');
  const openRequests = requests.filter((r) => r.status === 'open');
  const filledRequests = requests.filter((r) => r.status === 'filled');
  const fillPct = summary?.fill_rate == null ? '—' : `${Math.round(summary.fill_rate * 100)}%`;
  const p50Accept = responseTimes?.p50?.minutes_to_first_accept;
  const oNeg = rare?.rare?.['O-'];
  const abNeg = rare?.rare?.['AB-'];

  return (
    <div className="app-shell app-shell--wide" style={{ minHeight: '100vh', background: '#0A0506', color: '#F8F1EF', margin: '0 auto', padding: '20px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9B7B4' }} title="Admin home" aria-label="Admin home">
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 22, margin: 0, color: '#F8F1EF' }}>Admin Console</h1>
        </div>
        <button type="button" onClick={async () => { await logout(); navigate('/login'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E4506B', display: 'flex', alignItems: 'center', gap: 6, fontFamily: body, fontSize: 13 }}>
          <LogOut size={16} /> Sign out
        </button>
      </div>

      {error ? <p role="alert" style={{ fontFamily: body, fontSize: 13, color: '#E4506B', marginBottom: 16 }}>{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          [Users, '#3DBD8A', 'Total Donors', stats?.total_donors || 0],
          [Building2, '#8FB4E8', 'Hospitals', stats?.total_hospitals || 0],
          [Droplet, '#E4506B', 'Active Requests', stats?.active_requests || 0],
          [Award, '#D9B45C', 'Credits Earned', stats?.total_credits_earned || 0],
        ].map(([Icon, color, label, value]) => (
          <Card key={label} dark style={{ background: '#16090C', borderColor: '#3A1A22' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon size={20} color={color} />
              <div>
                <p style={{ fontFamily: body, fontSize: 11, color: '#C9B7B4', margin: 0 }}>{label}</p>
                <p style={{ fontFamily: display, fontWeight: 800, fontSize: 28, margin: '2px 0 0', color: '#F8F1EF' }}>{value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #3A1A22', paddingBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['overview', 'Overview', BarChart3],
          ['metrics', t('metrics.tab'), BarChart3],
          ['pending', `Pending (${pendingHospitals.length})`, Building2],
          ['donors', `Donors (${donors.length})`, Users],
          ['hospitals', `Hospitals (${hospitals.length})`, Building2],
          ['requests', `Requests (${requests.length})`, Droplet],
        ].map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{
            fontFamily: display, fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
            background: tab === k ? '#7A1626' : 'transparent', color: tab === k ? '#fff' : '#C9B7B4',
            border: 'none', display: 'flex', alignItems: 'center', gap: 6, minHeight: 44,
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <p style={{ fontFamily: body, fontSize: 13, color: '#C9B7B4', marginBottom: 12 }}>
            Platform summary · {stats?.pending_hospitals || pendingHospitals.length} hospitals awaiting review · {stats?.total_donations || 0} verified donations
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div style={{ background: '#16090C', borderRadius: 12, padding: 14, border: '1px solid #3A1A22' }}>
              <p style={{ fontFamily: display, fontWeight: 800, fontSize: 24, margin: 0, color: '#E4506B' }}>{openRequests.length}</p>
              <p style={{ fontFamily: body, fontSize: 12, color: '#C9B7B4', margin: '4px 0 0' }}>Open requests</p>
            </div>
            <div style={{ background: '#16090C', borderRadius: 12, padding: 14, border: '1px solid #3A1A22' }}>
              <p style={{ fontFamily: display, fontWeight: 800, fontSize: 24, margin: 0, color: '#3DBD8A' }}>{filledRequests.length}</p>
              <p style={{ fontFamily: body, fontSize: 12, color: '#C9B7B4', margin: '4px 0 0' }}>Filled requests</p>
            </div>
            <div style={{ background: '#16090C', borderRadius: 12, padding: 14, border: '1px solid #3A1A22' }}>
              <p style={{ fontFamily: display, fontWeight: 800, fontSize: 24, margin: 0, color: '#D9B45C' }}>{pendingHospitals.length}</p>
              <p style={{ fontFamily: body, fontSize: 12, color: '#C9B7B4', margin: '4px 0 0' }}>Pending hospitals</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
            <label style={{ fontFamily: body, fontSize: 12, color: T.consoleMut }}>
              {t('metrics.from')}
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.consoleLine}`, background: T.consoleCard, color: '#F8F1EF', fontFamily: body }}
              />
            </label>
            <label style={{ fontFamily: body, fontSize: 12, color: T.consoleMut }}>
              {t('metrics.to')}
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.consoleLine}`, background: T.consoleCard, color: '#F8F1EF', fontFamily: body }}
              />
            </label>
            <button
              type="button"
              onClick={fetchMetrics}
              style={{ minHeight: 40, borderRadius: 10, border: 'none', background: T.oxblood, color: '#fff', padding: '0 14px', cursor: 'pointer', fontFamily: display, fontWeight: 700 }}
            >
              {t('metrics.applyRange')}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              style={{ minHeight: 40, borderRadius: 10, border: `1px solid ${T.consoleLine}`, background: 'transparent', color: '#F8F1EF', padding: '0 14px', cursor: 'pointer', fontFamily: display, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} /> {t('metrics.downloadCsv')}
            </button>
          </div>

          {metricsLoading ? (
            <p style={{ fontFamily: body, color: T.consoleMut }}>{t('metrics.loading')}</p>
          ) : (
            <>
              <p style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: '0 0 12px' }}>{t('metrics.title')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Card dark style={{ background: T.consoleCard, borderColor: T.consoleLine }}>
                  <p style={{ fontFamily: body, fontSize: 11, color: T.consoleMut, margin: 0 }}>{t('metrics.fillRate')}</p>
                  <p style={{ fontFamily: display, fontWeight: 800, fontSize: 28, margin: '4px 0 0', color: '#3DBD8A' }}>{fillPct}</p>
                </Card>
                <Card dark style={{ background: T.consoleCard, borderColor: T.consoleLine }}>
                  <p style={{ fontFamily: body, fontSize: 11, color: T.consoleMut, margin: 0 }}>{t('metrics.p50FirstAccept')}</p>
                  <p style={{ fontFamily: display, fontWeight: 800, fontSize: 28, margin: '4px 0 0', color: '#F8F1EF' }}>
                    {p50Accept == null ? '—' : t('metrics.minutes', { n: p50Accept })}
                  </p>
                </Card>
                <Card dark style={{ background: T.consoleCard, borderColor: T.consoleLine }}>
                  <p style={{ fontFamily: body, fontSize: 11, color: T.consoleMut, margin: 0 }}>{t('metrics.activeDonors')}</p>
                  <p style={{ fontFamily: display, fontWeight: 800, fontSize: 28, margin: '4px 0 0', color: '#D9B45C' }}>
                    {summary?.median_on_call_count ?? '—'}
                  </p>
                </Card>
              </div>

              <Card dark style={{ background: T.consoleCard, borderColor: T.consoleLine, marginBottom: 16 }}>
                <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '0 0 8px' }}>{t('metrics.requestsPerDay')}</p>
                <RequestsPerDayChart series={summary?.requests_by_day} />
              </Card>

              <Card dark style={{ background: T.consoleCard, borderColor: T.consoleLine }}>
                <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>{t('metrics.rareTitle')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['O-', oNeg], ['AB-', abNeg]].map(([group, data]) => (
                    <div key={group} style={{ border: `1px solid ${T.consoleLine}`, borderRadius: 10, padding: 12 }}>
                      <p style={{ fontFamily: display, fontWeight: 800, fontSize: 18, margin: 0, color: T.arterial }}>{group}</p>
                      <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '6px 0 0' }}>
                        {t('metrics.rareCount', { n: data?.request_count ?? 0 })}
                      </p>
                      <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '2px 0 0' }}>
                        {t('metrics.rareFill', { pct: data?.fill_rate == null ? '—' : `${Math.round(data.fill_rate * 100)}%` })}
                      </p>
                      <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '2px 0 0' }}>
                        {t('metrics.rareEscalation', { n: data?.avg_escalation_level ?? 0 })}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'pending' && (
        <div>
          {pendingHospitals.length === 0 ? (
            <p style={{ color: '#C9B7B4' }}>No hospitals are waiting for approval.</p>
          ) : pendingHospitals.map((h) => (
            <Card key={h.id} dark style={{ marginBottom: 8, padding: 12, background: '#16090C', borderColor: '#3A1A22' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, margin: 0, color: '#F8F1EF' }}>{h.name || h.hospital_name}</p>
                  <p style={{ fontFamily: body, fontSize: 12, color: '#C9B7B4', margin: '2px 0 0' }}>{h.phone} · {h.city} · license {h.license_number || 'n/a'}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" disabled={busyId === h.hospital_id} onClick={() => setHospitalApproval(h.hospital_id, 'approved')} style={{ minHeight: 40, borderRadius: 10, border: 'none', background: '#0F6B4A', color: '#fff', padding: '0 12px', cursor: 'pointer' }}>Approve</button>
                  <button type="button" disabled={busyId === h.hospital_id} onClick={() => setHospitalApproval(h.hospital_id, 'rejected')} style={{ minHeight: 40, borderRadius: 10, border: '1px solid #7A1626', background: 'transparent', color: '#E4506B', padding: '0 12px', cursor: 'pointer' }}>Reject</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'donors' && (
        <div>
          {donors.map((d) => (
            <Card key={d.id} dark style={{ marginBottom: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#16090C', borderColor: '#3A1A22' }}>
              <div>
                <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, margin: 0, color: '#F8F1EF' }}>{d.name} · {d.blood_group}</p>
                <p style={{ fontFamily: body, fontSize: 12, color: '#C9B7B4', margin: '2px 0 0' }}>{d.phone} · {d.city} · {d.is_on_call ? 'On call' : 'Off call'}</p>
              </div>
              <span style={{ fontFamily: body, fontSize: 11, color: d.account_status === 'active' ? '#3DBD8A' : '#C9B7B4', padding: '4px 10px', borderRadius: 8, background: '#2B1218' }}>
                {d.account_status || 'active'}
              </span>
            </Card>
          ))}
        </div>
      )}

      {tab === 'hospitals' && (
        <div>
          {hospitals.map((h) => (
            <Card key={h.id} dark style={{ marginBottom: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#16090C', borderColor: '#3A1A22' }}>
              <div>
                <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, margin: 0, color: '#F8F1EF' }}>{h.name || h.hospital_name}</p>
                <p style={{ fontFamily: body, fontSize: 12, color: '#C9B7B4', margin: '2px 0 0' }}>{h.phone} · {h.city} · {h.approval_status || 'pending'}</p>
              </div>
              {h.hospital_id && h.approval_status !== 'approved' ? (
                <button type="button" disabled={busyId === h.hospital_id} onClick={() => setHospitalApproval(h.hospital_id, 'approved')} style={{ minHeight: 40, borderRadius: 10, border: 'none', background: '#7A1626', color: '#fff', padding: '0 12px', cursor: 'pointer' }}>Approve</button>
              ) : (
                <span style={{ fontFamily: body, fontSize: 11, color: '#3DBD8A', padding: '4px 10px', borderRadius: 8, background: '#0F6B4A22' }}>{h.approval_status || 'approved'}</span>
              )}
            </Card>
          ))}
        </div>
      )}

      {usersCursor && ['pending', 'donors', 'hospitals'].includes(tab) && (
        <button type="button" onClick={loadMoreUsers} disabled={loadingMore} style={{
          width: '100%', minHeight: 44, marginTop: 8, borderRadius: 10, cursor: 'pointer',
          background: 'transparent', color: '#F0EEE9', border: '1px solid #3A1A22', fontFamily: display, fontWeight: 700,
        }}>
          {loadingMore ? t('admin.loadingMore') : t('admin.loadMore')}
        </button>
      )}

      {tab === 'requests' && (
        <div>
          {requests.map((r) => (
            <Card key={r.id} dark style={{ marginBottom: 8, padding: 12, background: '#16090C', borderColor: '#3A1A22' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: 0, color: '#E4506B' }}>{r.blood_group} · {r.units_needed} units</p>
                  <p style={{ fontFamily: body, fontSize: 12, color: '#C9B7B4', margin: '3px 0 0' }}>{r.hospital_name || 'Hospital'} · Ref {r.ref_code} · {r.urgency} · {r.status}</p>
                </div>
                <span style={{ fontFamily: body, fontSize: 11, color: r.status === 'open' ? '#E4506B' : '#3DBD8A', padding: '4px 10px', borderRadius: 8, background: r.status === 'open' ? '#E4506B22' : '#0F6B4A22' }}>
                  {r.status}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Droplet, CheckCircle2, ChevronRight } from 'lucide-react';
import { T } from '../theme.js';
import Logo from '../components/Logo.jsx';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import BottomNav from '../components/BottomNav.jsx';
import api from '../api/client.js';
import LocationPrompt from '../components/LocationPrompt.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSocket } from '../hooks/useSocket.js';
import { getLang, t, toggleLang } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

export default function DonorHome() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [onCall, setOnCall] = useState(user?.is_on_call || false);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggleLoading, setToggleLoading] = useState(false);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const fetchDashboard = async () => {
    try {
      const { data: response } = await api.get('/donor/dashboard');
      const payload = response.data || response;
      setDashboard(payload);
      setOnCall(payload.is_on_call);
      updateUser({ is_on_call: payload.is_on_call });
    } catch (_err) {
      setError(t('home.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  const saveLocation = async (coords) => {
    await api.patch('/donor/profile', coords);
    updateUser(coords);
    await fetchDashboard();
  };

  useSocket({
    blood_request: (payload) => {
      if (payload?.request_id) {
        navigateRef.current(`/alert/${payload.request_id}`);
      }
    },
  });

  const toggleOnCall = async () => {
    setToggleLoading(true);
    try {
      const { data: response } = await api.patch('/donor/on-call', { is_on_call: !onCall });
      const payload = response.data || response;
      setOnCall(payload.is_on_call);
      updateUser({ is_on_call: payload.is_on_call });
    } catch (_err) {
      setError(t('home.statusFailed'));
    } finally {
      setToggleLoading(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: body, color: T.mut }}>
      {t('home.loading')}
    </div>
  );

  const name = user?.name || 'Donor';
  const blood = user?.blood_group || 'Not set';
  const credits = dashboard?.credits ?? 0;
  const eligible = dashboard?.eligible ?? true;
  const nextEligibleRaw = dashboard?.user_status?.next_eligible_date;
  const nextEligible = nextEligibleRaw
    ? new Date(nextEligibleRaw).toLocaleDateString(getLang() === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const hasLocation = user?.latitude != null && user?.longitude != null;
  const radius = user?.ping_radius_km || 10;
  const requests = dashboard?.nearby_requests || [];

  return (
    <div style={{ padding: '18px 18px calc(90px + env(safe-area-inset-bottom))', maxWidth: 430, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleLang}
            aria-label={t('lang.toggle')}
            style={{ background: 'none', border: 'none', padding: 0, minHeight: 44, cursor: 'pointer' }}
          >
            <Chip tone="gold">{getLang() === 'en' ? t('home.langChip') : t('home.langChipActive')}</Chip>
          </button>
          <button type="button" onClick={() => navigate('/requests')} aria-label={t('home.openRequests')} style={{ background: 'none', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44 }}>
            <Bell size={19} color={T.mut} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p style={{ fontFamily: body, color: T.mut, fontSize: 13.5, margin: '20px 0 2px' }}>{t('home.greeting', { name })}</p>
      <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 26, margin: 0, color: T.ink, letterSpacing: '-0.02em' }}>
        {onCall ? t('home.onCallTitle', { city: user?.city || 'your city' }) : t('home.offCallTitle')}
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '26px 0 8px' }}>
        <div style={{ position: 'relative', width: 148, height: 148 }}>
          {onCall && (<>
            <span className="rs-pulse" style={{ animationDelay: '0s' }} />
            <span className="rs-pulse" style={{ animationDelay: '1.1s' }} />
          </>)}
          <button
            onClick={toggleOnCall}
            disabled={toggleLoading}
            aria-pressed={onCall}
            style={{
              position: 'absolute', inset: 8, borderRadius: '50%',
              background: onCall ? T.oxblood : '#fff',
              border: `2px solid ${onCall ? T.oxbloodDark : T.line}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', gap: 4, transition: 'background .25s ease',
              boxShadow: onCall ? '0 8px 24px rgba(122,22,38,.35)' : '0 4px 14px rgba(23,21,26,.08)',
            }}
          >
            <Droplet size={40} color={onCall ? '#fff' : T.oxblood} fill={onCall ? '#fff' : 'none'} strokeWidth={1.7} />
            <span style={{ fontFamily: display, fontWeight: 800, fontSize: 13, color: onCall ? '#fff' : T.ink, letterSpacing: '0.06em' }}>
              {onCall ? t('home.onCallChip') : t('home.offCallChip')}
            </span>
          </button>
        </div>
        <p style={{ fontFamily: body, fontSize: 12.5, color: T.faint, marginTop: 10, textAlign: 'center', maxWidth: 250 }}>
          {onCall
            ? t('home.onCallHint', { blood, radius })
            : t('home.offCallHint')}
        </p>
      </div>

      {!hasLocation && (
        <Card style={{ marginTop: 14, borderColor: T.arterial }}>
          <h2 style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: 0, color: T.ink }}>{t('location.homeTitle')}</h2>
          <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: '6px 0 12px' }}>{t('location.homeBody')}</p>
          <LocationPrompt onCoords={saveLocation} />
        </Card>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1, padding: 12 }}>
          <p style={{ fontFamily: body, fontSize: 11, color: T.faint, margin: 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('home.yourGroup')}</p>
          <p style={{ fontFamily: display, fontWeight: 800, fontSize: 22, margin: '2px 0 0', color: T.oxblood }}>{blood}</p>
        </Card>
        <Card style={{ flex: 1, padding: 12 }}>
          <p style={{ fontFamily: body, fontSize: 11, color: T.faint, margin: 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('home.credits')}</p>
          <p style={{ fontFamily: display, fontWeight: 800, fontSize: 22, margin: '2px 0 0', color: T.ink }}>{credits}</p>
        </Card>
        <Card style={{ flex: 1.2, padding: 12 }}>
          <p style={{ fontFamily: body, fontSize: 11, color: T.faint, margin: 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('home.eligibility')}</p>
          <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, margin: '5px 0 0', color: eligible ? T.leaf : T.arterial, display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={15} /> {eligible ? t('home.eligibleNow') : nextEligible ? t('home.eligibleOn', { date: nextEligible }) : t('home.notEligible')}
          </p>
          <p style={{ fontFamily: body, fontSize: 10, color: T.faint, margin: '4px 0 0' }}>{t('home.nbtcNote')}</p>
        </Card>
      </div>

      {requests.length > 0 ? (
        requests.slice(0, 2).map((req) => (
          <Card
            key={req.id}
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/alert/${req.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/alert/${req.id}`); }}
            style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <div>
              <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14.5, margin: 0, color: T.ink }}>
                {t('home.unitsNeeded', { hospital: req.hospital_name, units: req.units_needed })}
              </p>
              <p style={{ fontFamily: body, fontSize: 12.5, color: T.mut, margin: '3px 0 0' }}>
                {t('home.distanceAway', { city: req.city, km: req.distance_km?.toFixed(1) })}
              </p>
            </div>
            <ChevronRight size={18} color={T.faint} />
          </Card>
        ))
      ) : (
        <Card style={{ marginTop: 12 }}>
          <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: 0, textAlign: 'center' }}>{t('home.noRequests')}</p>
        </Card>
      )}

      {error && (
        <p style={{ fontFamily: body, fontSize: 12, color: T.arterial, textAlign: 'center', marginTop: 12 }}>{error}</p>
      )}

      <BottomNav />
    </div>
  );
}

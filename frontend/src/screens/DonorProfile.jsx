import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Clock, Languages, Bell, ArrowRight, History } from 'lucide-react';
import { T } from '../theme.js';
import Card from '../components/Card.jsx';
import BottomNav from '../components/BottomNav.jsx';
import api, { errMsg } from '../api/client.js';
import { t } from '../i18n.js';
import { useAuth } from '../hooks/useAuth.js';
import { enablePushNotifications, notificationsSupported } from '../lib/notifications.js';
import LanguageToggle from '../components/LanguageToggle.jsx';
import LocationPrompt from '../components/LocationPrompt.jsx';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

export default function DonorProfile() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const [history, setHistory] = useState([]);
  const [_loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(user?.ping_radius_km || 10);
  const [notifMsg, setNotifMsg] = useState('');
  const [notifBusy, setNotifBusy] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth?.slice?.(0, 10) || '');
  const [sex, setSex] = useState(user?.sex || '');
  const [profileMsg, setProfileMsg] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data: response } = await api.get('/donor/history');
      const payload = response.data || response;
      setHistory(payload.donations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const [radiusMsg, setRadiusMsg] = useState('');
  const updateRadius = async (r) => {
    const previous = radius;
    setRadius(r);
    setRadiusMsg('');
    try {
      await api.patch('/donor/profile', { ping_radius_km: r });
      updateUser({ ping_radius_km: r });
    } catch (err) {
      setRadius(previous); // never show a radius the server didn't save
      setRadiusMsg(errMsg(err, t('profile.radiusFailed')));
    }
  };

  const saveLocation = async (coords) => {
    await api.patch('/donor/profile', coords);
    updateUser(coords);
  };

  const name = user?.name || 'Donor';
  const blood = user?.blood_group || 'Not set';
  const verified = user?.is_verified || false;
  const nextEligible = user?.next_eligible_date;
  const donationCount = history.length;
  const donorSince = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Not available';

  return (
    <div style={{ padding: '18px 18px calc(90px + env(safe-area-inset-bottom))', maxWidth: 430, margin: '0 auto' }}>
      <h2 style={{ fontFamily: display, fontWeight: 800, fontSize: 22, margin: 0, color: T.ink }}>Profile</h2>
      <p style={{ fontFamily: body, fontSize: 12.5, color: T.mut, margin: '8px 0 0' }}>{t('profile.kannadaNote')}</p>

      <Card style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: T.arterialSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: display, fontWeight: 800, color: T.oxblood, fontSize: 18 }}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: 0, color: T.ink }}>{name} · {blood}</p>
          <p style={{ fontFamily: body, fontSize: 12.5, color: T.mut, margin: '2px 0 0' }}>Donor since {donorSince} · {donationCount} donations · {user?.city || ''}</p>
        </div>
      </Card>

      <Card style={{ marginTop: 10, padding: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
        <ShieldCheck size={17} color={verified ? T.leaf : T.faint} />
        <div>
          <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>
            {verified ? t('profile.verifiedTitle') : t('profile.unverifiedTitle')}
          </p>
          <p style={{ fontFamily: body, fontSize: 12, color: T.faint, margin: '2px 0 0' }}>
            {verified ? t('profile.verifiedBody') : t('profile.unverifiedBody')}
          </p>
        </div>
      </Card>

      {!user?.date_of_birth || !user?.sex ? (
        <Card style={{ marginTop: 10, padding: 13 }}>
          <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: '0 0 4px', color: T.ink }}>Complete donation eligibility</p>
          <p style={{ fontFamily: body, fontSize: 12, color: T.faint, margin: '0 0 10px' }}>
            Date of birth and sex are required for NBTC/NACO intervals (male 90 days, female 120 days).
          </p>
          {!user?.date_of_birth ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                aria-label="Date of birth"
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="rs-field"
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 10,
                  border: `1px solid ${T.line}`,
                  padding: '0 10px',
                  background: T.card,
                  color: T.ink,
                  colorScheme: 'light',
                  fontFamily: body,
                  fontSize: 16,
                }}
              />
              <button type="button" onClick={async () => {
                setProfileMsg('');
                try {
                  const { data: response } = await api.patch('/donor/profile', { date_of_birth: dateOfBirth });
                  updateUser(response.data?.user || {});
                  setProfileMsg('Date of birth saved.');
                } catch (requestError) {
                  setProfileMsg(errMsg(requestError, 'Could not save date of birth.'));
                }
              }}>Save</button>
            </div>
          ) : null}
          {!user?.sex ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                aria-label="Sex"
                value={sex}
                onChange={(event) => setSex(event.target.value)}
                className="rs-field"
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 10,
                  border: `1px solid ${T.line}`,
                  padding: '0 10px',
                  background: T.card,
                  color: T.ink,
                  fontFamily: body,
                  fontSize: 16,
                }}
              >
                <option value="" disabled>Select sex</option>
                <option value="male">Male (90-day gap)</option>
                <option value="female">Female (120-day gap)</option>
              </select>
              <button type="button" onClick={async () => {
                setProfileMsg('');
                try {
                  const { data: response } = await api.patch('/donor/profile', { sex });
                  updateUser(response.data?.user || {});
                  setProfileMsg('Sex saved for NBTC eligibility.');
                } catch (requestError) {
                  setProfileMsg(errMsg(requestError, 'Could not save sex.'));
                }
              }}>Save</button>
            </div>
          ) : null}
          {profileMsg ? <p role="status" style={{ fontFamily: body, fontSize: 12, color: T.mut }}>{profileMsg}</p> : null}
        </Card>
      ) : null}

      <Card style={{ marginTop: 10, padding: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Clock size={17} color={T.mut} />
        <div>
          <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>Next eligible date</p>
          <p style={{ fontFamily: body, fontSize: 12, color: T.faint, margin: '2px 0 0' }}>
            {nextEligible
              ? new Date(nextEligible).toLocaleDateString()
              : user?.sex === 'female'
                ? 'Eligible now (NBTC 120-day gap complete)'
                : 'Eligible now (NBTC 90-day gap complete)'}
          </p>
          <p style={{ fontFamily: body, fontSize: 11, color: T.faint, margin: '4px 0 0' }}>
            Per India NBTC/NACO guidelines: male 90 days, female 120 days after whole-blood donation.
          </p>
        </div>
      </Card>

      <Card style={{ marginTop: 10, padding: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Languages size={17} color={T.mut} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>{t('profile.language')}</p>
          <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '2px 0 0' }}>English · ಕನ್ನಡ</p>
        </div>
        <LanguageToggle />
      </Card>

      <Card style={{ marginTop: 10, padding: 13 }}>
        <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: '0 0 4px', color: T.ink }}>{t('profile.location')}</p>
        <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '0 0 10px' }}>{t('location.why')}</p>
        <LocationPrompt labelKey={user?.latitude != null ? 'profile.updateLocation' : 'location.useMine'} onCoords={saveLocation} />
      </Card>

      <Card style={{ marginTop: 10, padding: 13 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <Bell size={17} color={T.oxblood} />
          <div>
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>{t('profile.notifications')}</p>
            <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '2px 0 0' }}>
              {t('profile.notificationsBody')}
            </p>
          </div>
        </div>
        {notificationsSupported() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              disabled={notifBusy}
              onClick={async () => {
                setNotifBusy(true);
                setNotifMsg('');
                try {
                  await enablePushNotifications();
                  setNotifMsg(t('profile.pushOn'));
                } catch (e) {
                  setNotifMsg(errMsg(e, t('profile.pushFailed')));
                } finally {
                  setNotifBusy(false);
                }
              }}
              style={{
                fontFamily: display, fontWeight: 700, fontSize: 14, minHeight: 44, borderRadius: 10,
                background: T.oxblood, color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              {t('profile.enablePush')}
            </button>
            {notifMsg && (
              <p role="status" style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: 0 }}>{notifMsg}</p>
            )}
          </div>
        ) : (
          <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: 0 }}>
            {t('profile.pushUnsupported')}
          </p>
        )}
      </Card>

      <Card style={{ marginTop: 10, padding: 13 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <Bell size={17} color={T.mut} />
          <div>
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>{t('profile.radius')}</p>
            <p style={{ fontFamily: body, fontSize: 12, color: T.faint, margin: '2px 0 0' }}>{t('profile.radiusBody')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[5, 10, 15, 25].map((r) => (
            <button key={r} type="button" aria-pressed={radius === r} onClick={() => updateRadius(r)} style={{
              flex: 1, fontFamily: display, fontWeight: 700, fontSize: 13, minHeight: 44, borderRadius: 10,
              background: radius === r ? T.oxblood : T.card, color: radius === r ? '#fff' : T.mut,
              border: `1px solid ${radius === r ? T.oxbloodDark : T.line}`, cursor: 'pointer',
            }}>{r} km</button>
          ))}
        </div>
        {radiusMsg && <p role="alert" style={{ fontFamily: body, fontSize: 13, color: T.arterial, margin: '8px 0 0' }}>{radiusMsg}</p>}
      </Card>

      <Card style={{ marginTop: 10, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => navigate('/history')}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <History size={17} color={T.mut} />
          <div>
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>Donation history</p>
            <p style={{ fontFamily: body, fontSize: 12, color: T.faint, margin: '2px 0 0' }}>{donationCount} donations recorded</p>
          </div>
        </div>
        <ArrowRight size={16} color={T.faint} />
      </Card>

      <Card style={{ marginTop: 10, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => navigate('/data-rights')}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ShieldCheck size={17} color={T.oxblood} />
          <div>
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>Privacy and data rights</p>
            <p style={{ fontFamily: body, fontSize: 12, color: T.faint, margin: '2px 0 0' }}>Export or delete your account data</p>
          </div>
        </div>
        <ArrowRight size={16} color={T.faint} />
      </Card>

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <button onClick={() => { logout(); navigate('/login'); }} style={{ fontFamily: body, fontSize: 13, color: T.arterial, background: 'none', border: 'none', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

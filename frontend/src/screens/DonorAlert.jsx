import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Radio, MapPin, Clock, Droplet, ArrowRight } from 'lucide-react';
import { T, GIVERS } from '../theme.js';
import Chip from '../components/Chip.jsx';
import Card from '../components/Card.jsx';
import Btn from '../components/Btn.jsx';
import BottomNav from '../components/BottomNav.jsx';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import { getLang, t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

export default function DonorAlert() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    api.get('/donor/requests')
      .then(({ data: response }) => {
        const payload = response.data || response;
        const found = payload.requests?.find((r) => r.id === requestId);
        if (found) setRequest(found);
        else setError(t('alert.notFound'));
      })
      .catch(() => setError(t('alert.loadFailed')))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleAccept = async () => {
    setResponding(true);
    try {
      await api.post(`/donor/respond/${requestId}`, { status: 'accepted' });
      navigate(`/on-the-way/${requestId}`);
    } catch (_err) {
      setError(errMsg(_err, t('alert.acceptFailed')));
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    setResponding(true);
    try {
      await api.post(`/donor/respond/${requestId}`, { status: 'declined' });
      navigate('/home');
    } catch (_err) {
      setError(errMsg(_err, t('alert.declineFailed')));
    } finally {
      setResponding(false);
    }
  };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: body }}>{t('alert.loading')}</div>;
  if (!request) {
    // Reached from old push links too: always offer a way back instead of a dead end.
    return (
      <div style={{ padding: '40px 18px calc(90px + env(safe-area-inset-bottom))', maxWidth: 430, margin: '0 auto', textAlign: 'center', fontFamily: body }}>
        <p style={{ color: T.mut, fontSize: 15 }}>{error || t('alert.notFound')}</p>
        <Btn kind="ghost" full onClick={() => navigate('/requests')}>{t('alert.seeOpen')}</Btn>
        <BottomNav />
      </div>
    );
  }

  const myGroup = user?.blood_group || t('alert.groupNotSet');
  const compatible = (GIVERS[request.blood_group] || []).includes(user?.blood_group);
  const nextEligible = user?.next_eligible_date ? new Date(user.next_eligible_date) : null;
  const eligible = !nextEligible || nextEligible <= new Date();

  return (
    <div style={{ padding: '18px 18px calc(90px + env(safe-area-inset-bottom))', maxWidth: 430, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Radio size={16} color={T.arterial} />
        <span style={{ fontFamily: display, fontWeight: 800, fontSize: 13, letterSpacing: '.12em', color: T.arterial }}>{t('alert.emergency')}</span>
      </div>

      <Card style={{ marginTop: 14, borderColor: '#F0BFC8', background: '#FFF9FA', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: 0 }}>{t('alert.patientNeeds')}</p>
            <p style={{ fontFamily: display, fontWeight: 800, fontSize: 40, lineHeight: 1, margin: '4px 0 0', color: T.arterial }}>{request.blood_group}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Chip tone="red">{request.urgency}</Chip>
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 15, margin: '8px 0 0', color: T.ink }}>{t('alert.units', { n: request.units_needed })}</p>
            <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
              <Clock size={12} /> {request.needed_by ? new Date(request.needed_by).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('alert.asap')}
            </p>
          </div>
        </div>

        <div style={{ height: 1, background: '#F0BFC8', margin: '14px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={15} color={T.oxblood} />
          <div>
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14.5, margin: 0, color: T.ink }}>{request.hospital_name}</p>
            <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '1px 0 0' }}>
              {t('alert.fromYou', { address: request.hospital_address, km: request.distance_km?.toFixed(1) })}
            </p>
          </div>
        </div>

        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: '#fff', border: `1px dashed ${T.line}`, borderRadius: 12, padding: '10px 12px',
        }}>
          <span style={{ fontFamily: display, fontWeight: 800, color: T.oxblood, fontSize: 15 }}>{t('alert.yourGroup', { group: myGroup })}</span>
          <ArrowRight size={15} color={T.faint} />
          <span style={{ fontFamily: display, fontWeight: 800, color: T.ink, fontSize: 15 }}>{t('alert.patientGroup', { group: request.blood_group })}</span>
          <Chip tone={compatible ? 'green' : 'red'}>{compatible ? t('alert.compatible') : t('alert.notCompatible')}</Chip>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <Btn kind="critical" full onClick={handleAccept} disabled={responding || !compatible || !eligible}>
          <Droplet size={16} aria-hidden="true" /> {t('alert.accept')}
        </Btn>
        {!eligible && (
          <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: 0, textAlign: 'center' }}>
            {t('alert.notEligibleUntil', { date: nextEligible.toLocaleDateString(getLang() === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'short' }) })}
          </p>
        )}
        <Btn kind="ghost" full onClick={handleDecline} disabled={responding}>{t('alert.decline')}</Btn>
      </div>
      <p style={{ fontFamily: body, fontSize: 11.5, color: T.faint, textAlign: 'center', marginTop: 12 }}>
        {t('alert.declineNote', { count: request.donors_pinged ?? '—' })}
      </p>
      {error && <p role="alert" style={{ fontFamily: body, fontSize: 13, color: T.arterial, textAlign: 'center', marginTop: 8 }}>{error}</p>}
      <BottomNav />
    </div>
  );
}

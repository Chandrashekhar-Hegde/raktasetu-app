import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Navigation, Phone, ArrowLeft } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { T } from '../theme.js';
import Card from '../components/Card.jsx';
import Btn from '../components/Btn.jsx';
import BottomNav from '../components/BottomNav.jsx';
import api, { errMsg } from '../api/client.js';
import { t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

export default function DonorOnTheWay() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState('');
  const [arrived, setArrived] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Dedicated endpoint: the open-requests list drops filled or day-old requests.
    api.get(`/donor/responses/${requestId}`)
      .then(({ data }) => {
        const found = data.data.request;
        setRequest(found);
        setQrData(found.ref_code || '');
        setArrived(['arrived', 'completed'].includes(found.response_status));
      })
      .catch((err) => setError(errMsg(err, t('ontheway.loadFailed'))))
      .finally(() => setLoading(false));
  }, [requestId]);

  const openDirections = () => {
    if (!request?.latitude || !request?.longitude) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${request.latitude},${request.longitude}`;
    window.open(url, '_blank');
  };

  const callHospital = () => {
    if (request?.hospital_phone) window.location.href = `tel:${request.hospital_phone}`;
  };

  const markArrived = async () => {
    try {
      setArriving(true);
      await api.post(`/donor/arrived/${requestId}`);
      setArrived(true);
    } catch (_err) {
      setError(errMsg(_err, t('ontheway.arriveFailed')));
    } finally {
      setArriving(false);
    }
  };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: body }}>{t('ontheway.loading')}</div>;

  return (
    <div style={{ padding: '18px 18px calc(90px + env(safe-area-inset-bottom))', maxWidth: 430, margin: '0 auto' }}>
      <button type="button" onClick={() => navigate('/home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, minHeight: 44, fontFamily: body, fontSize: 14, color: T.mut }}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('ontheway.back')}
      </button>

      <Card style={{ background: T.leafSoft, borderColor: '#CBE3D8', display: 'flex', gap: 10, alignItems: 'center' }}>
        <CheckCircle2 size={22} color={T.leaf} />
        <div>
          <p style={{ fontFamily: display, fontWeight: 800, fontSize: 15, margin: 0, color: T.leaf }}>{t('ontheway.confirmed')}</p>
          <p style={{ fontFamily: body, fontSize: 12.5, color: '#3E6B58', margin: '2px 0 0' }}>{t('ontheway.notified')}</p>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <p style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: 0, color: T.ink }}>{request?.hospital_name || t('ontheway.hospital')}</p>
        <p style={{ fontFamily: body, fontSize: 12.5, color: T.mut, margin: '3px 0 12px' }}>{request?.hospital_address || ''} · ref {request?.ref_code || t('ontheway.notAvailable')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn kind="primary" small onClick={openDirections}><Navigation size={14} /> {t('ontheway.directions')}</Btn>
          <Btn kind="ghost" small onClick={callHospital}><Phone size={14} /> {t('ontheway.call')}</Btn>
          <Btn kind="primary" small onClick={markArrived} disabled={arrived || arriving}>
            {arrived ? t('ontheway.arrivedDone') : arriving ? t('ontheway.marking') : t('ontheway.arrived')}
          </Btn>
        </div>
        {error && <p role="alert" style={{ fontFamily: body, fontSize: 13, color: T.arterial, margin: '10px 0 0' }}>{error}</p>}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <p style={{ fontFamily: body, fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>{t('ontheway.before')}</p>
        {[t('ontheway.tipId'), t('ontheway.tipMeal'), t('ontheway.tipAlcohol')].map((tip) => (
          <p key={tip} style={{ fontFamily: body, fontSize: 13.5, color: T.ink, margin: '9px 0 0', display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle2 size={15} color={T.leaf} /> {tip}
          </p>
        ))}
      </Card>

      <Card style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
        {qrData ? (
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 12,
              border: `1.5px solid ${T.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fff',
              padding: 5,
            }}
            aria-label={t('ontheway.qrLabel')}
            data-testid="verify-qr"
            data-ref-code={qrData}
          >
            <QRCodeSVG
              value={qrData}
              size={64}
              bgColor="#FFFFFF"
              fgColor="#17151A"
            />
          </div>
        ) : (
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 12,
              border: `1.5px solid ${T.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: T.porcelain,
              padding: 8,
              textAlign: 'center',
            }}
            role="alert"
          >
            <p style={{ fontFamily: body, fontSize: 11, color: T.mut, margin: 0 }}>{t('ontheway.refUnavailable')}</p>
          </div>
        )}
        <div>
          <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14.5, margin: 0, color: T.ink }}>{t('ontheway.showDesk')}</p>
          <p style={{ fontFamily: body, fontSize: 12.5, color: T.mut, margin: '3px 0 0' }}>
            {t('ontheway.staffScan')}
          </p>
          <p
            style={{ fontFamily: display, fontWeight: 800, fontSize: 13, color: T.oxblood, margin: '6px 0 0' }}
            data-testid="verify-ref-text"
          >
            {qrData || t('ontheway.notAvailable')}
          </p>
          <p style={{ fontFamily: display, fontWeight: 800, fontSize: 13, color: T.oxblood, margin: '6px 0 0' }}>{t('ontheway.creditsOnVerify')}</p>
        </div>
      </Card>

      <div style={{ marginTop: 14 }}>
        <Btn kind="ghost" full onClick={() => navigate('/home')}>{t('ontheway.back')}</Btn>
      </div>
      <BottomNav />
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, CheckCircle2, ArrowLeft, Search } from 'lucide-react';
import { T } from '../theme.js';
import Card from '../components/Card.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import api, { errMsg } from '../api/client.js';
import { Html5Qrcode } from 'html5-qrcode';
import { t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

export default function ConsoleVerify() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('donation');
  const [refCode, setRefCode] = useState('');
  const [donor, setDonor] = useState(null);
  const [redemption, setRedemption] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const resetResults = () => {
    setDonor(null);
    setRedemption(null);
    setDone(false);
    setError('');
  };

  const switchMode = (next) => {
    setMode(next);
    setRefCode('');
    resetResults();
  };

  const searchDonor = async (candidate = refCode) => {
    const code = String(candidate).trim();
    if (!code) return;
    setRefCode(code);
    setLoading(true);
    setError('');
    setRedemption(null);
    setDone(false);
    try {
      const { data: response } = await api.get('/hospital/requests', { params: { ref: code } });
      const payload = response.data || response;
      if (payload.donor) setDonor(payload.donor);
      else setError(t('console.donorNotFound'));
    } catch (err) {
      setError(errMsg(err, t('console.findFailed')));
    } finally {
      setLoading(false);
    }
  };

  const confirmDonation = async () => {
    if (!donor) return;
    setLoading(true);
    try {
      await api.post('/hospital/verify-donation', {
        donor_id: donor.id,
        request_id: donor.request_id,
        units: 1,
      });
      setDone(true);
    } catch (err) {
      setError(errMsg(err, t('console.verifyFailed')));
    } finally {
      setLoading(false);
    }
  };

  const redeemCredits = async (candidate = refCode) => {
    const code = String(candidate).trim().toUpperCase();
    if (!code) return;
    setRefCode(code);
    setLoading(true);
    setError('');
    setDonor(null);
    setDone(false);
    try {
      const { data: response } = await api.post('/hospital/verify-redemption', { code });
      const payload = response.data || response;
      setRedemption(payload.redemption);
      setDone(true);
    } catch (err) {
      setError(errMsg(err, t('console.redeemFailed')));
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (decodedText) => {
    const text = String(decodedText || '').trim();
    if (mode === 'redeem' || /^RSC-/i.test(text)) {
      if (mode !== 'redeem') setMode('redeem');
      await redeemCredits(text);
      return;
    }
    await searchDonor(text);
  };

  const startScanner = async () => {
    setError('');
    try {
      const scanner = new Html5Qrcode('raktasetu-qr-reader');
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          await scanner.stop();
          setScanning(false);
          await handleScan(decodedText);
        },
        () => {},
      );
    } catch (scannerError) {
      setScanning(false);
      setError(scannerError.message || t('console.cameraFailed'));
    }
  };

  useEffect(() => () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    Promise.resolve(scanner.isScanning ? scanner.stop() : undefined)
      .then(() => scanner.clear())
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: T.consoleBg, padding: '14px 16px 20px', maxWidth: 430, margin: '0 auto' }}>
      <button onClick={() => navigate('/console')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontFamily: body, fontSize: 13, color: T.consoleMut }}>
        <ArrowLeft size={16} /> {t('console.back')}
      </button>

      <p style={{ fontFamily: display, fontWeight: 800, fontSize: 18, color: '#F0EEE9', margin: '0 0 4px' }}>{t('console.verifyTitle')}</p>
      <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '0 0 14px' }}>{t('console.verifySubtitle')}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => switchMode('donation')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <Chip tone={mode === 'donation' ? 'green' : 'line'} dark>{t('console.modeDonation')}</Chip>
        </button>
        <button type="button" onClick={() => switchMode('redeem')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <Chip tone={mode === 'redeem' ? 'green' : 'line'} dark>{t('console.modeRedeem')}</Chip>
        </button>
      </div>

      <Card dark style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: 20 }}>
        <div id="raktasetu-qr-reader" style={{ width: '100%', maxWidth: 280, minHeight: 260, borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${T.consoleLine}`, display: 'grid', placeItems: 'center', background: T.consoleCard }}>
          {!scanning ? <QrCode size={48} color="#F0EEE9" aria-hidden="true" /> : null}
        </div>
        {!scanning ? <Btn kind="ghost" dark onClick={startScanner}>{t('console.startScanner')}</Btn> : null}
        <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: 0, textAlign: 'center' }}>
          {t('console.cameraHint')}
        </p>
      </Card>

      <div style={{ marginTop: 16 }}>
        <label htmlFor="verify-code" style={{ display: 'block', fontFamily: body, fontSize: 12, color: T.consoleMut, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 8px' }}>
          {mode === 'redeem' ? t('console.enterRedeemCode') : t('console.enterRefCode')}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="verify-code"
            type="text"
            placeholder={mode === 'redeem' ? 'RSC-XXXXXXXX' : 'e.g. RS-4821'}
            value={refCode}
            onChange={(e) => setRefCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (mode === 'redeem' ? redeemCredits() : searchDonor())}
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.consoleLine}`,
              fontFamily: body, fontSize: 15, background: T.consoleCard, color: '#F0EEE9',
            }}
          />
          <Btn kind="ghost" dark onClick={() => (mode === 'redeem' ? redeemCredits() : searchDonor())} disabled={loading} aria-label={t('console.searchCode')}>
            <Search size={16} aria-hidden="true" />
          </Btn>
        </div>
      </div>

      {error && <p role="alert" style={{ fontFamily: body, fontSize: 13, color: '#F2879A', marginTop: 12 }}>{error}</p>}

      {mode === 'donation' && donor && (
        <Card dark style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: 0, color: '#F0EEE9' }}>{donor.name} · {donor.blood_group}</p>
              <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '3px 0 0' }}>
                {t('console.refArrived', {
                  ref: donor.ref_code,
                  time: new Date(donor.responded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                })}
              </p>
            </div>
            <Chip tone="green" dark>{t('console.arrived')}</Chip>
          </div>
          <div style={{ height: 1, background: T.consoleLine, margin: '13px 0' }} />
          {done ? (
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, color: '#3DBD8A', margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
              <CheckCircle2 size={17} /> {t('console.donationConfirmed')}
            </p>
          ) : (
            <Btn kind="green" full onClick={confirmDonation} disabled={loading}>
              {loading ? t('console.confirming') : t('console.confirmDonation')}
            </Btn>
          )}
        </Card>
      )}

      {mode === 'redeem' && redemption && (
        <Card dark style={{ marginTop: 16 }} data-testid="redeem-confirm-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontFamily: display, fontWeight: 800, fontSize: 16, margin: 0, color: '#F0EEE9' }}>
                {redemption.donor_first_name}
              </p>
              <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '3px 0 0' }}>
                {t('console.beneficiary', {
                  name: redemption.beneficiary_name,
                  relation: redemption.beneficiary_relation,
                })}
              </p>
              <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '3px 0 0' }}>
                {t('console.creditsAmount', { n: redemption.credits_amount })}
              </p>
            </div>
            <Chip tone="green" dark>{t('console.completed')}</Chip>
          </div>
          {done ? (
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14, color: '#3DBD8A', margin: '13px 0 0', display: 'flex', gap: 8, alignItems: 'center' }}>
              <CheckCircle2 size={17} /> {t('console.redeemConfirmed')}
            </p>
          ) : null}
        </Card>
      )}

      <p style={{ fontFamily: body, fontSize: 11.5, color: T.consoleMut, marginTop: 12, lineHeight: 1.5 }}>
        {mode === 'redeem' ? t('console.redeemFootnote') : t('console.donationFootnote')}
      </p>
    </div>
  );
}

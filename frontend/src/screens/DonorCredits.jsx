import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { T } from '../theme.js';
import Card from '../components/Card.jsx';
import Btn from '../components/Btn.jsx';
import Chip from '../components/Chip.jsx';
import BottomNav from '../components/BottomNav.jsx';
import api, { errMsg } from '../api/client.js';
import { t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";
const RELATIONS = ['spouse', 'parent', 'child', 'sibling', 'other'];

function formatCountdown(expiresAt) {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t('redeem.expired');
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return t('redeem.countdown', {
    time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  });
}

function ledgerColor(type, amount) {
  if (type === 'earned' || type === 'reserve_released' || amount > 0) return T.leaf;
  return T.arterial;
}

export default function DonorCredits() {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState([]);
  const [members, setMembers] = useState([]);
  const [activeRedemption, setActiveRedemption] = useState(null);
  const [plainCode, setPlainCode] = useState('');
  const [beneficiary, setBeneficiary] = useState('self');
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState('spouse');
  const [newBloodGroup, setNewBloodGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const refresh = async () => {
    const [creditsRes, familyRes, redemptionsRes] = await Promise.all([
      api.get('/donor/credits'),
      api.get('/donor/family'),
      api.get('/donor/redemptions'),
    ]);
    const credits = creditsRes.data?.data || creditsRes.data || {};
    const family = familyRes.data?.data || familyRes.data || {};
    const redemptions = redemptionsRes.data?.data || redemptionsRes.data || {};
    setBalance(credits.balance || 0);
    setLedger(credits.history || []);
    setMembers(family.members || []);
    const active = (redemptions.redemptions || []).find((row) => row.status === 'active') || null;
    setActiveRedemption(active);
    if (!active) setPlainCode('');
  };

  useEffect(() => {
    refresh()
      .catch(() => setError(t('credits.loadFailed')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeRedemption?.expires_at) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeRedemption?.expires_at]);

  const redeemDisabledReason = useMemo(() => {
    if (activeRedemption) return t('redeem.disabledActive');
    if (balance < 100) return t('redeem.disabledBalance');
    return '';
  }, [activeRedemption, balance]);

  const addFamily = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = { name: newName.trim(), relation: newRelation };
      if (newBloodGroup) payload.blood_group = newBloodGroup;
      const { data: response } = await api.post('/donor/family', payload);
      const member = response.data?.member || response.member;
      setMembers((prev) => [member, ...prev]);
      setBeneficiary(member.id);
      setShowAddFamily(false);
      setNewName('');
      setNewRelation('spouse');
      setNewBloodGroup('');
    } catch (err) {
      setError(errMsg(err, t('family.addFailed')));
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    if (redeemDisabledReason) return;
    setBusy(true);
    setError('');
    try {
      const bodyPayload = {
        family_member_id: beneficiary === 'self' ? null : beneficiary,
      };
      const { data: response } = await api.post('/donor/redemptions', bodyPayload);
      const payload = response.data || response;
      setPlainCode(payload.code || '');
      setActiveRedemption(payload.redemption);
      await refresh();
      setPlainCode(payload.code || '');
      setActiveRedemption(payload.redemption);
    } catch (err) {
      setError(errMsg(err, t('redeem.failed')));
    } finally {
      setBusy(false);
    }
  };

  const cancelRedemption = async () => {
    if (!activeRedemption?.id) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/donor/redemptions/${activeRedemption.id}/cancel`);
      setActiveRedemption(null);
      setPlainCode('');
      await refresh();
    } catch (err) {
      setError(errMsg(err, t('redeem.cancelFailed')));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: body }}>
        {t('credits.loading')}
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 18px calc(90px + env(safe-area-inset-bottom))', maxWidth: 430, margin: '0 auto' }}>
      <h2 style={{ fontFamily: display, fontWeight: 800, fontSize: 22, margin: 0, color: T.ink }}>{t('credits.title')}</h2>
      <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: '4px 0 14px' }}>{t('credits.subtitle')}</p>

      <Card style={{ background: T.oxblood, borderColor: T.oxbloodDark }}>
        <p style={{ fontFamily: body, fontSize: 11.5, color: '#E8B9C2', margin: 0, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('credits.balance')}</p>
        <p style={{ fontFamily: display, fontWeight: 800, fontSize: 42, color: '#fff', margin: '2px 0 0', lineHeight: 1 }} data-testid="credits-balance">{balance}</p>
        <p style={{ fontFamily: body, fontSize: 12.5, color: '#E8B9C2', margin: '10px 0 0' }}>
          {t('credits.rule')}
        </p>
      </Card>

      {plainCode && activeRedemption ? (
        <Card style={{ marginTop: 12 }} data-testid="redeem-success">
          <p style={{ fontFamily: display, fontWeight: 800, fontSize: 15, margin: 0, color: T.ink }}>{t('redeem.showCode')}</p>
          <p style={{ fontFamily: body, fontSize: 12.5, color: T.mut, margin: '4px 0 12px' }}>{t('redeem.showHint')}</p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div
              style={{
                width: 86,
                height: 86,
                borderRadius: 12,
                border: `1.5px solid ${T.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                padding: 6,
              }}
              data-testid="redeem-qr"
              data-ref-code={plainCode}
            >
              <QRCodeSVG value={plainCode} size={72} bgColor="#FFFFFF" fgColor="#17151A" />
            </div>
            <div>
              <p style={{ fontFamily: display, fontWeight: 800, fontSize: 18, margin: 0, color: T.oxblood }} data-testid="redeem-code">{plainCode}</p>
              <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '6px 0 0' }} data-testid="redeem-countdown">
                {formatCountdown(activeRedemption.expires_at) || tick}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Btn kind="ghost" full onClick={cancelRedemption} disabled={busy}>{t('redeem.cancel')}</Btn>
          </div>
        </Card>
      ) : (
        <Card style={{ marginTop: 12 }}>
          <p style={{ fontFamily: display, fontWeight: 700, fontSize: 14.5, margin: '0 0 10px', color: T.ink }}>{t('redeem.title')}</p>
          <p style={{ fontFamily: body, fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>{t('redeem.beneficiary')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => setBeneficiary('self')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <Chip tone={beneficiary === 'self' ? 'green' : 'line'}>{t('redeem.self')}</Chip>
            </button>
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setBeneficiary(member.id)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Chip tone={beneficiary === member.id ? 'green' : 'line'}>
                  {member.name} · {t(`family.relation.${member.relation}`)}
                </Chip>
              </button>
            ))}
          </div>

          {showAddFamily ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('family.namePlaceholder')}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.line}`, fontFamily: body, fontSize: 14 }}
              />
              <select
                value={newRelation}
                onChange={(e) => setNewRelation(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.line}`, fontFamily: body, fontSize: 14 }}
              >
                {RELATIONS.map((rel) => (
                  <option key={rel} value={rel}>{t(`family.relation.${rel}`)}</option>
                ))}
              </select>
              <select
                value={newBloodGroup}
                onChange={(e) => setNewBloodGroup(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.line}`, fontFamily: body, fontSize: 14 }}
              >
                <option value="">{t('family.bloodOptional')}</option>
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn kind="primary" small onClick={addFamily} disabled={busy || newName.trim().length < 2 || members.length >= 4}>
                  {t('family.save')}
                </Btn>
                <Btn kind="ghost" small onClick={() => setShowAddFamily(false)}>{t('family.cancel')}</Btn>
              </div>
              {members.length >= 4 ? (
                <p style={{ fontFamily: body, fontSize: 12, color: T.arterial, margin: 0 }}>{t('family.limit')}</p>
              ) : null}
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <Btn kind="ghost" small onClick={() => setShowAddFamily(true)} disabled={members.length >= 4}>
                {t('credits.addFamily')}
              </Btn>
            </div>
          )}

          <div data-testid="redeem-submit">
            <Btn
              kind="primary"
              full
              onClick={redeem}
              disabled={Boolean(redeemDisabledReason) || busy}
            >
              {t('redeem.action')}
            </Btn>
          </div>
          {redeemDisabledReason ? (
            <p style={{ fontFamily: body, fontSize: 12, color: T.arterial, margin: '8px 0 0' }} data-testid="redeem-disabled-reason">
              {redeemDisabledReason}
            </p>
          ) : null}
        </Card>
      )}

      <p style={{ fontFamily: body, fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '.06em', margin: '18px 0 8px' }}>{t('family.title')}</p>
      {members.length === 0 ? (
        <Card>
          <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: 0 }}>{t('family.empty')}</p>
        </Card>
      ) : (
        members.map((member) => (
          <Card key={member.id} style={{ marginBottom: 8, padding: 13 }}>
            <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>
              {member.name}
            </p>
            <p style={{ fontFamily: body, fontSize: 11.5, color: T.faint, margin: '2px 0 0' }}>
              {t(`family.relation.${member.relation}`)}
              {member.blood_group ? ` · ${member.blood_group}` : ''}
            </p>
          </Card>
        ))
      )}

      <p style={{ fontFamily: body, fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '.06em', margin: '18px 0 8px' }}>{t('credits.ledger')}</p>

      {error && <p style={{ fontFamily: body, fontSize: 12, color: T.arterial }}>{error}</p>}

      {ledger.length === 0 ? (
        <Card>
          <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: 0, textAlign: 'center' }}>{t('credits.empty')}</p>
        </Card>
      ) : (
        ledger.map((r) => (
          <Card key={r.id} style={{ marginBottom: 8, padding: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, margin: 0, color: T.ink }}>{r.description}</p>
              <p style={{ fontFamily: body, fontSize: 11.5, color: T.faint, margin: '2px 0 0' }}>{new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <span style={{ fontFamily: display, fontWeight: 800, fontSize: 15, color: ledgerColor(r.type, r.amount) }}>
              {r.amount >= 0 ? '+' : '−'}{Math.abs(r.amount)}
            </span>
          </Card>
        ))
      )}

      <BottomNav />
    </div>
  );
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Radio, AlertTriangle, Users, CheckCircle2, ArrowLeft } from 'lucide-react';
import { T, GIVERS, RARE, GROUPS } from '../theme.js';
import Btn from '../components/Btn.jsx';
import api, { errMsg } from '../api/client.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

export default function ConsoleNewRequest() {
  const navigate = useNavigate();
  const [group, setGroup] = useState('B+');
  const [units, setUnits] = useState(2);
  const [urgency, setUrgency] = useState('Critical');
  const [radius, setRadius] = useState(5);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [donorsNotified, setDonorsNotified] = useState(0);

  const rare = RARE.includes(group);
  const effectiveRadius = rare ? 25 : radius;

  const handleBroadcast = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: response } = await api.post('/hospital/requests', {
        blood_group: group,
        units_needed: units,
        urgency: urgency.toLowerCase(),
        radius_km: effectiveRadius,
      });
      const payload = response.data || response;
      setDonorsNotified(Number(payload.donors_notified || 0));
      setSent(true);
    } catch (_err) {
      setError(errMsg(_err, 'Failed to broadcast request'));
    } finally {
      setLoading(false);
    }
  };

  const Label = ({ children }) => (
    <p style={{ fontFamily: body, fontSize: 11, color: T.consoleMut, textTransform: 'uppercase', letterSpacing: '.07em', margin: '16px 0 8px' }}>{children}</p>
  );

  if (sent) {
    return (
      <div style={{ minHeight: '100vh', background: T.consoleBg, padding: '40px 20px', textAlign: 'center', maxWidth: 430, margin: '0 auto' }}>
        <CheckCircle2 size={44} color="#3DBD8A" style={{ margin: '0 auto' }} />
        <p style={{ fontFamily: display, fontWeight: 800, fontSize: 18, color: '#F0EEE9', margin: '14px 0 4px' }}>Request broadcast</p>
        <p style={{ fontFamily: body, fontSize: 13, color: T.consoleMut, margin: 0 }}>
          {donorsNotified} on-call compatible donor{donorsNotified === 1 ? '' : 's'} notified for {group} within {effectiveRadius} km.
          Track responses on the live board.
        </p>
        <div style={{ marginTop: 18 }}>
          <Btn kind="ghost" dark small onClick={() => setSent(false)}>New request</Btn>
        </div>
        <div style={{ marginTop: 12 }}>
          <Btn kind="ghost" dark small onClick={() => navigate('/console')}>Back to live board</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.consoleBg, padding: '14px 16px 20px', maxWidth: 430, margin: '0 auto' }}>
      <button onClick={() => navigate('/console')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontFamily: body, fontSize: 13, color: T.consoleMut }}>
        <ArrowLeft size={16} /> Back to console
      </button>

      <p style={{ fontFamily: display, fontWeight: 800, fontSize: 18, color: '#F0EEE9', margin: '0 0 4px' }}>New request</p>
      <p style={{ fontFamily: body, fontSize: 12, color: T.consoleMut, margin: '0 0 14px' }}>Broadcast an emergency blood request to nearby donors</p>

      {error && <p style={{ fontFamily: body, fontSize: 12, color: '#E4506B', marginBottom: 12 }}>{error}</p>}

      <Label>Patient blood group</Label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)} style={{
            fontFamily: display, fontWeight: 800, fontSize: 15, padding: '10px 0', borderRadius: 10,
            background: group === g ? T.arterial : T.consoleCard,
            color: group === g ? '#fff' : '#D8D5CF',
            border: `1px solid ${group === g ? '#A50D26' : T.consoleLine}`, cursor: 'pointer',
          }}>{g}</button>
        ))}
      </div>
      {rare && (
        <p style={{ fontFamily: body, fontSize: 12, color: '#D9B45C', margin: '8px 0 0', display: 'flex', gap: 6, alignItems: 'center' }}>
          <AlertTriangle size={13} /> Rare group: radius expands to 25 km and receives priority.
        </p>
      )}

      <Label>Units needed</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => setUnits(Math.max(1, units - 1))} style={{ width: 38, height: 38, borderRadius: 10, background: T.consoleCard, border: `1px solid ${T.consoleLine}`, color: '#D8D5CF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={16} /></button>
        <span style={{ fontFamily: display, fontWeight: 800, fontSize: 24, color: '#F0EEE9', minWidth: 28, textAlign: 'center' }}>{units}</span>
        <button onClick={() => setUnits(Math.min(6, units + 1))} style={{ width: 38, height: 38, borderRadius: 10, background: T.consoleCard, border: `1px solid ${T.consoleLine}`, color: '#D8D5CF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} /></button>
      </div>

      <Label>Urgency</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        {['Scheduled', 'Urgent', 'Critical'].map((u) => (
          <button key={u} onClick={() => setUrgency(u)} style={{
            flex: 1, fontFamily: display, fontWeight: 700, fontSize: 12.5, padding: '9px 0', borderRadius: 10,
            background: urgency === u ? (u === 'Critical' ? T.arterial : '#3A3F4D') : T.consoleCard,
            color: urgency === u ? '#fff' : '#B9B6B0',
            border: `1px solid ${urgency === u ? (u === 'Critical' ? '#A50D26' : '#4A5061') : T.consoleLine}`, cursor: 'pointer',
          }}>{u}</button>
        ))}
      </div>

      <Label>Ping radius</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        {[3, 5, 10].map((r) => (
          <button key={r} onClick={() => setRadius(r)} disabled={rare} style={{
            flex: 1, fontFamily: display, fontWeight: 700, fontSize: 12.5, padding: '9px 0', borderRadius: 10,
            background: radius === r ? '#3A3F4D' : T.consoleCard, color: radius === r ? '#fff' : '#B9B6B0',
            border: `1px solid ${radius === r ? '#4A5061' : T.consoleLine}`, cursor: rare ? 'not-allowed' : 'pointer',
            opacity: rare ? 0.4 : 1,
          }}>{r} km</button>
        ))}
      </div>

      <div style={{ marginTop: 18, background: '#232734', border: `1px solid ${T.consoleLine}`, borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <Users size={17} color="#8FB4E8" />
        <p style={{ fontFamily: body, fontSize: 13, color: '#D8D5CF', margin: 0 }}>
          Broadcast notifies <b style={{ fontFamily: display }}>on-call donors</b> with compatible groups ({GIVERS[group].join(', ')})
          inside {effectiveRadius} km. The exact count is confirmed after send.
        </p>
      </div>

      <div style={{ marginTop: 14 }}>
        <Btn kind="critical" full onClick={handleBroadcast} disabled={loading}>
          <Radio size={16} /> {loading ? 'Broadcasting...' : 'Broadcast request'}
        </Btn>
      </div>
    </div>
  );
}

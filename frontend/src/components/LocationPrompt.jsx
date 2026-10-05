import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { getApproxPosition } from '../lib/geolocation.js';
import { t } from '../i18n.js';
import { T } from '../theme.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";

/**
 * Asks for location only when the person taps the button (never on page load), then hands the
 * approximate coordinates to `onCoords`, which saves them. `labelKey` lets donors and hospitals word it differently.
 */
export default function LocationPrompt({ onCoords, labelKey = 'location.useMine', dark = false }) {
  const [status, setStatus] = useState('idle');

  const capture = async () => {
    setStatus('locating');
    try {
      const coords = await getApproxPosition();
      await onCoords(coords);
      setStatus('saved');
    } catch (err) {
      setStatus(err.code === 'denied' ? 'denied' : err.code === 'unavailable' ? 'unavailable' : 'failed');
    }
  };

  const message = {
    locating: t('location.locating'),
    saved: t('location.saved'),
    denied: t('location.denied'),
    unavailable: t('location.unavailable'),
    failed: t('location.failed'),
  }[status];

  return (
    <div>
      <button
        type="button"
        onClick={capture}
        disabled={status === 'locating' || status === 'saved'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '10px 16px',
          borderRadius: 10, border: `1px solid ${dark ? T.consoleLine : T.line}`, cursor: 'pointer',
          background: dark ? 'transparent' : '#fff', color: dark ? '#F0EEE9' : T.ink, fontFamily: body, fontSize: 14, fontWeight: 600,
        }}
      >
        <MapPin size={18} aria-hidden="true" /> {status === 'saved' ? t('location.savedShort') : t(labelKey)}
      </button>
      {message && (
        <p role="status" style={{ fontFamily: body, fontSize: 13, margin: '8px 0 0', color: status === 'saved' ? T.leaf : (dark ? T.consoleMut : T.mut) }}>
          {message}
        </p>
      )}
    </div>
  );
}

import React from 'react';
import { getLang, t, toggleLang } from '../i18n.js';

/** One tap switches English ⇄ ಕನ್ನಡ; App re-renders every screen through subscribeLang. */
export default function LanguageToggle({ dark = false }) {
  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label={t('lang.toggle')}
      style={{
        minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${dark ? 'rgba(255,255,255,.28)' : '#D8D2CB'}`,
        background: 'transparent', color: dark ? '#F0EEE9' : '#17151A',
        fontFamily: "'Public Sans', 'Segoe UI', system-ui, sans-serif", fontSize: 13, fontWeight: 600,
      }}
    >
      {getLang() === 'en' ? 'ಕನ್ನಡ' : 'English'}
    </button>
  );
}

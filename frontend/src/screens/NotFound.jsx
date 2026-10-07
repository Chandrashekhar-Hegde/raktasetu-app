import React from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n.js';
import { T } from '../theme.js';

export default function NotFound() {
  return (
    <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: 24, color: T.ink }}>{t('notFound.title')}</h1>
        <p style={{ marginTop: 10, color: T.mut }}>{t('notFound.body')}</p>
        <Link to="/" style={{ display: 'inline-block', minHeight: 44, marginTop: 18, padding: '12px 18px', borderRadius: 8, background: T.arterial, color: '#fff', fontWeight: 700, textDecoration: 'none' }}>
          {t('notFound.home')}
        </Link>
      </div>
    </main>
  );
}

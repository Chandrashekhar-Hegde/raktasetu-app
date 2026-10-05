import React from 'react';
import { CONTACT } from '../config.js';
import { Link } from 'react-router-dom';

function Brand() {
  return (
    <Link className="public-brand" to="/" aria-label="RaktaSetu home">
      <span className="public-brand__mark" aria-hidden="true" />
      <span className="public-brand__name">
        RaktaSetu
        <small>ರಕ್ತಸೇತು · Blood Bridge</small>
      </span>
    </Link>
  );
}

const landingLinks = [
  { to: '/?section=mission', label: 'Mission' },
  { to: '/?section=how-it-works', label: 'How it works' },
  { to: '/?section=safety', label: 'Safety' },
];

export function PublicHeader({ overlay = false }) {
  return (
    <header className={`public-header${overlay ? ' public-header--overlay' : ''}`}>
      <nav className="public-nav" aria-label="Main navigation">
        <Brand />
        <div className="public-nav__links">
          {landingLinks.map((link) => (
            <Link className="public-nav__link" key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
          <Link className="public-nav__link" to="/security-readiness">Readiness</Link>
        </div>
        <div className="public-nav__actions">
          <Link className="public-nav__link" to="/login">Sign in</Link>
          <Link className="public-nav__cta" to="/register">Join as a donor</Link>
        </div>
        <details className="public-menu">
          <summary aria-label="Open navigation">Menu</summary>
          <div className="public-menu__panel">
            {landingLinks.map((link) => (
              <Link key={link.to} to={link.to}>{link.label}</Link>
            ))}
            <Link to="/security-readiness">Security and readiness</Link>
            <Link to="/login?role=hospital">Hospital sign in</Link>
            <Link to="/register" className="public-menu__primary">Join as a donor</Link>
          </div>
        </details>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__inner">
        <div className="public-footer__grid">
          <div className="public-footer__brand">
            <Brand />
            <p className="public-footer__about">
              RaktaSetu helps willing donors and hospitals coordinate blood requests.
              It does not replace emergency services, clinical screening, or medical advice.
            </p>
          </div>
          <div>
            <h2>Donors</h2>
            <div className="public-footer__links">
              <Link to="/register">Create account</Link>
              <Link to="/login">Donor sign in</Link>
              <Link to="/?section=how-it-works">How it works</Link>
            </div>
          </div>
          <div>
            <h2>Trust</h2>
            <div className="public-footer__links">
              <Link to="/privacy">Privacy</Link>
              <Link to="/data-rights">Data rights</Link>
              <Link to="/security-readiness">Security and readiness</Link>
              <Link to="/terms">Terms</Link>
            </div>
          </div>
          <div>
            <h2>Hospitals</h2>
            <div className="public-footer__links">
              <Link to="/login?role=hospital">Hospital sign in</Link>
              <Link to="/register?role=hospital">Register a hospital</Link>
              <a href={`mailto:${CONTACT.support}`}>Contact support</a>
            </div>
          </div>
        </div>
        <div className="public-footer__bottom">
          <span>© 2026 RaktaSetu. ರಕ್ತಸೇತು means Blood Bridge.</span>
          <span>Availability and response times are not guaranteed.</span>
        </div>
      </div>
    </footer>
  );
}

export default function PublicShell({ children, overlayHeader = false }) {
  return (
    <div className="public-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <PublicHeader overlay={overlayHeader} />
      <main className="public-main" id="main-content">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

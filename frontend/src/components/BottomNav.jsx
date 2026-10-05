import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Bell, Award, User } from 'lucide-react';
import { T } from '../theme.js';
import { t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";

const NavItem = ({ to, icon, label, active }) => (
  <Link
    to={to}
    aria-current={active ? 'page' : undefined}
    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, padding: '8px 0', minHeight: 52, textDecoration: 'none' }}
  >
    {React.cloneElement(icon, { size: 20, color: active ? T.oxblood : T.mut, strokeWidth: active ? 2.4 : 2, 'aria-hidden': true })}
    <span style={{ fontFamily: body, fontSize: 11, fontWeight: active ? 700 : 500, color: active ? T.oxblood : T.mut }}>{label}</span>
  </Link>
);

export default function BottomNav() {
  const path = useLocation().pathname;
  const isActive = (p) => path.startsWith(p);

  return (
    <nav aria-label={t('nav.label')} style={{
      display: 'flex', borderTop: `1px solid ${T.line}`,
      background: 'rgba(255,255,255,0.93)', backdropFilter: 'blur(6px)',
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <NavItem to="/home" icon={<Home />} label={t('nav.home')} active={isActive('/home')} />
      <NavItem to="/requests" icon={<Bell />} label={t('nav.requests')} active={isActive('/requests') || isActive('/alert')} />
      <NavItem to="/credits" icon={<Award />} label={t('nav.credits')} active={isActive('/credits')} />
      <NavItem to="/profile" icon={<User />} label={t('nav.profile')} active={isActive('/profile') || isActive('/history')} />
    </nav>
  );
}

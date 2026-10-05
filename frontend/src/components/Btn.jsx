import React from 'react';
import { T } from '../theme.js';

const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

export default function Btn({ children, kind = 'primary', onClick, full, small, dark, disabled, ...rest }) {
  const styles = {
    primary: { background: T.oxblood, color: '#fff', border: '1px solid ' + T.oxbloodDark },
    critical: { background: T.arterial, color: '#fff', border: '1px solid #A50D26' },
    ghost: {
      background: dark ? 'transparent' : '#fff',
      color: dark ? '#E8E6E1' : T.ink,
      border: `1px solid ${dark ? T.consoleLine : T.line}`,
    },
    green: { background: T.leaf, color: '#fff', border: '1px solid #0B573C' },
  }[kind];
  return (
    <button
      {...rest}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles, fontFamily: display, fontWeight: 700,
        fontSize: small ? 13 : 15, letterSpacing: '0.01em',
        padding: small ? '8px 14px' : '13px 18px', borderRadius: 12,
        minHeight: small ? 36 : 48,
        width: full ? '100%' : 'auto', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'transform .08s ease, opacity .15s ease',
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = 'scale(.98)')}
      onMouseUp={(e) => !disabled && (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => !disabled && (e.currentTarget.style.transform = 'scale(1)')}
    >
      {children}
    </button>
  );
}

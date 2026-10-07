import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { User, Phone, Mail, Lock, MapPin, Calendar } from 'lucide-react';
import { errMsg } from '../api/client.js';
import { POLICY_VERSION } from '../config.js';
import { T, GROUPS } from '../theme.js';
import Btn from '../components/Btn.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import LocationPrompt from '../components/LocationPrompt.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { roleHome, parseAuthRole } from '../lib/roleHome.js';
import usePageMeta from '../hooks/usePageMeta.js';
import { t } from '../i18n.js';

const body = "'Public Sans', 'Segoe UI', system-ui, sans-serif";
const display = "'Anek Latin', 'Segoe UI', system-ui, sans-serif";

const labelStyle = { fontFamily: body, fontSize: 12, color: T.mut, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const inputStyle = {
  width: '100%', padding: '14px 14px', borderRadius: 12, border: `1px solid ${T.line}`, fontFamily: body,
  fontSize: 16, background: T.card, color: T.ink, colorScheme: 'light', caretColor: T.ink, minHeight: 48,
};
const iconStyle = { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' };

/** Label + input pair with a real <label for>, optional leading icon and persistent help text. */
function Field({ id, label, icon: Icon, help, children }) {
  return (
    <div style={{ marginBottom: 12, flex: 1 }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={16} color={T.mut} style={iconStyle} aria-hidden="true" />}
        {children}
      </div>
      {help && <p id={`${id}-help`} style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '6px 0 0' }}>{help}</p>}
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = parseAuthRole(searchParams);
  const isHospital = role === 'hospital';
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', password: '', city: '', state: '', dob: '', sex: '', address: '', licenseNumber: '',
  });
  // No default: a pre-selected group is easy to submit by mistake, and a wrong group is a clinical risk.
  const [bloodGroup, setBloodGroup] = useState('');
  const [coords, setCoords] = useState(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  usePageMeta({
    title: isHospital ? 'Register a Hospital | RaktaSetu' : 'Create a Donor Account | RaktaSetu',
    description: isHospital
      ? 'Register a hospital or blood bank to coordinate blood requests through RaktaSetu.'
      : 'Create a RaktaSetu donor account and choose when you are available for compatible requests.',
    path: '/register',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isHospital && !bloodGroup) return setError(t('register.errBloodGroup'));
    if (!isHospital) {
      const birth = new Date(form.dob);
      const adult = new Date();
      adult.setFullYear(adult.getFullYear() - 18);
      if (!(birth <= adult)) return setError(t('register.errAge'));
    }
    if (!consentGiven) return setError(t('register.errConsent'));
    setLoading(true);
    try {
      const result = await register({
        name: form.name, phone: form.phone, email: form.email, password: form.password,
        role, city: form.city, state: form.state,
        ...(coords || {}),
        ...(isHospital
          ? { hospital_name: form.name, address: form.address, license_number: form.licenseNumber }
          : { blood_group: bloodGroup, date_of_birth: form.dob, sex: form.sex }),
        consent_given: true,
        consent_policy_version: POLICY_VERSION,
      });
      if (result.status === 'pending_approval') navigate('/hospital-pending');
      else navigate(roleHome(result.user));
    } catch (err) {
      setError(errMsg(err, t('register.failed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="safe-top safe-bottom rs-light-shell"
      style={{ minHeight: '100dvh', padding: 'max(24px, env(safe-area-inset-top)) 20px max(40px, env(safe-area-inset-bottom))', background: T.porcelain }}
    >
      <div style={{ maxWidth: 360, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, minHeight: 44 }}>
          <Link to="/" style={{ fontFamily: body, fontSize: 13, color: T.mut, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
            ← RaktaSetu
          </Link>
          <LanguageToggle />
        </div>

        <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 22, color: T.ink, margin: '0 0 4px' }}>
          {isHospital ? t('register.hospitalTitle') : t('register.donorTitle')}
        </h1>
        <p style={{ fontFamily: body, fontSize: 14, color: T.mut, margin: '0 0 8px' }}>
          {isHospital ? t('register.hospitalSubtitle') : t('register.donorSubtitle')}
        </p>
        <Link
          to={isHospital ? '/register' : '/register?role=hospital'}
          style={{ fontFamily: body, fontSize: 13, color: T.oxblood, display: 'inline-flex', alignItems: 'center', minHeight: 44, marginBottom: 8 }}
        >
          {isHospital ? t('register.switchToDonor') : t('register.switchToHospital')}
        </Link>

        <form onSubmit={handleSubmit} noValidate={false}>
          {error && (
            <div role="alert" style={{ background: T.arterialSoft, border: '1px solid #F3C9D0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: body, fontSize: 14, color: T.arterial }}>
              {error}
            </div>
          )}

          <Field id="reg-name" label={isHospital ? t('register.hospitalName') : t('register.fullName')} icon={User}>
            <input id="reg-name" type="text" required autoComplete={isHospital ? 'organization' : 'name'} value={form.name} onChange={set('name')} style={{ ...inputStyle, paddingLeft: 40 }} />
          </Field>
          <Field id="reg-phone" label={t('register.phone')} icon={Phone}>
            <input id="reg-phone" type="tel" required autoComplete="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} style={{ ...inputStyle, paddingLeft: 40 }} />
          </Field>
          <Field id="reg-email" label={t('register.email')} icon={Mail}>
            <input id="reg-email" type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} style={{ ...inputStyle, paddingLeft: 40 }} />
          </Field>
          <Field id="reg-password" label={t('register.password')} icon={Lock} help={t('register.passwordHelp')}>
            <input id="reg-password" type="password" required autoComplete="new-password" minLength={12} aria-describedby="reg-password-help" value={form.password} onChange={set('password')} style={{ ...inputStyle, paddingLeft: 40 }} />
          </Field>

          {isHospital ? (
            <>
              <Field id="reg-license" label={t('register.license')}>
                <input id="reg-license" type="text" required value={form.licenseNumber} onChange={set('licenseNumber')} style={inputStyle} />
              </Field>
              <Field id="reg-address" label={t('register.address')}>
                <textarea id="reg-address" required value={form.address} onChange={set('address')} style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }} />
              </Field>
            </>
          ) : (
            <>
              <Field id="reg-dob" label={t('register.dob')} icon={Calendar}>
                <input id="reg-dob" type="date" required value={form.dob} onChange={set('dob')} style={{ ...inputStyle, paddingLeft: 40 }} />
              </Field>
              <Field id="reg-sex" label={t('register.sex')} help={t('register.sexHelp')}>
                <select id="reg-sex" required aria-describedby="reg-sex-help" value={form.sex} onChange={set('sex')} style={inputStyle}>
                  <option value="" disabled>{t('register.select')}</option>
                  <option value="male">{t('register.male')}</option>
                  <option value="female">{t('register.female')}</option>
                </select>
              </Field>
              <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
                <legend style={labelStyle}>{t('register.bloodGroup')}</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {GROUPS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={bloodGroup === g}
                      onClick={() => setBloodGroup(g)}
                      style={{
                        fontFamily: display, fontWeight: 800, fontSize: 15, padding: '12px 0', minHeight: 44, borderRadius: 10,
                        background: bloodGroup === g ? T.oxblood : T.card, color: bloodGroup === g ? '#fff' : T.ink,
                        border: `1px solid ${bloodGroup === g ? T.oxbloodDark : T.line}`, cursor: 'pointer',
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <p style={{ fontFamily: body, fontSize: 12, color: T.mut, margin: '6px 0 0' }}>{t('register.bloodGroupHelp')}</p>
              </fieldset>
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Field id="reg-city" label={t('register.city')} icon={MapPin}>
              <input id="reg-city" type="text" required autoComplete="address-level2" value={form.city} onChange={set('city')} style={{ ...inputStyle, paddingLeft: 40 }} />
            </Field>
            <Field id="reg-state" label={t('register.state')}>
              <input id="reg-state" type="text" required autoComplete="address-level1" value={form.state} onChange={set('state')} style={inputStyle} />
            </Field>
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontFamily: body, fontSize: 13, color: T.mut, margin: '0 0 8px' }}>
              {isHospital ? t('location.consoleBody') : t('location.why')}
            </p>
            <LocationPrompt labelKey={isHospital ? 'location.useHospital' : 'location.useMine'} onCoords={async (c) => setCoords(c)} />
          </div>

          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
            <input
              type="checkbox"
              id="consent"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              style={{ marginTop: 3, accentColor: T.oxblood, width: 20, height: 20, flexShrink: 0 }}
            />
            <label htmlFor="consent" style={{ fontFamily: body, fontSize: 13, color: T.ink, lineHeight: 1.45 }}>
              {t('register.consentPrefix')} <Link to="/privacy" style={{ color: T.oxblood }}>{t('register.privacy')}</Link>{' '}
              {t('register.consentAnd')} <Link to="/terms" style={{ color: T.oxblood }}>{t('register.terms')}</Link>.{' '}
              {t('register.consentBody')}
            </label>
          </div>

          <Btn kind="primary" full disabled={loading}>
            {loading ? t('register.creating') : isHospital ? t('register.hospitalSubmit') : t('register.donorSubmit')}
          </Btn>
        </form>

        <p style={{ fontFamily: body, fontSize: 14, color: T.mut, textAlign: 'center', marginTop: 20 }}>
          {t('register.haveAccount')}{' '}
          <Link to={isHospital ? '/login?role=hospital' : '/login'} style={{ color: T.oxblood, fontWeight: 700, textDecoration: 'none' }}>
            {t('register.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}

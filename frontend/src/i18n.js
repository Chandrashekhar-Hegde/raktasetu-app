import en from './i18n/en.json';
import kn from './i18n/kn.json';

const STORAGE_KEY = 'rs_lang';
const dict = { en, kn };

function readStoredLang() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'kn' ? 'kn' : 'en';
  } catch {
    return 'en';
  }
}

let currentLang = typeof localStorage !== 'undefined' ? readStoredLang() : 'en';

function applyDocumentLang(lang) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'kn' ? 'kn' : 'en';
  }
}

applyDocumentLang(currentLang);

export function getLang() {
  return currentLang;
}

const listeners = new Set();
/** For useSyncExternalStore: App re-renders the whole tree when the language changes. */
export function subscribeLang(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLang(lang) {
  currentLang = lang === 'kn' ? 'kn' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, currentLang);
  } catch {
    // ignore
  }
  applyDocumentLang(currentLang);
  listeners.forEach((listener) => listener());
  return currentLang;
}

export function toggleLang() {
  return setLang(currentLang === 'en' ? 'kn' : 'en');
}

export function t(key, vars = {}) {
  const table = dict[currentLang] || dict.en;
  let text = table[key] || dict.en[key] || key;
  Object.entries(vars).forEach(([name, value]) => {
    text = text.replaceAll(`{${name}}`, String(value ?? ''));
  });
  return text;
}

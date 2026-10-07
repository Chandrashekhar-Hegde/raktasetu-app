// Design tokens and constants with no React imports or circular dependencies.
export const T = {
  oxblood: '#7A1626',
  oxbloodDark: '#5E0F1D',
  arterial: '#C8102E',
  arterialSoft: '#FBEBEE',
  ink: '#17151A',
  mut: '#6F6963',
  faint: '#6F6862', // was #9A938C (~3:1); now >=4.5:1 on white for the small text it is used on
  porcelain: '#F8F1EF',
  card: '#FFFFFF',
  line: '#E8D9D6',
  leaf: '#0F6B4A',
  leafSoft: '#E8F2EE',
  consoleBg: '#0A0506',
  consoleCard: '#16090C',
  consoleLine: '#3A1A22',
  consoleMut: '#C9B7B4',
  gold: '#8A6A1F',
};

/** Keep identical to backend donor.js / hospital.js (guarded by compatibility-matrix.test.js). */
export const GIVERS = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

export const RARE = ['O-', 'AB-'];
export const GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

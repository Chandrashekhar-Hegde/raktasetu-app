/**
 * Single source of truth for red-cell compatibility and distance on the backend.
 * GIVERS[recipient] = donor groups that can give to that recipient (ABO + Rh).
 * frontend/src/theme.js keeps a display copy; compatibility-matrix.test.js checks both against the ABO/Rh rule.
 */
export const GIVERS = Object.freeze({
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
});

/** Groups that get a wider first search radius (few donors). metricsService's rare report uses the same pair. */
export const RARE_GROUPS = Object.freeze(['O-', 'AB-']);

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

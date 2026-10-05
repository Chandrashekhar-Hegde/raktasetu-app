// ~110 m precision: plenty for 10–25 km donor matching, and less precise than a home address.
const round = (value) => Math.round(value * 1000) / 1000;

/** One browser location fix → { latitude, longitude }. Rejects with code 'denied' | 'unavailable'. */
export function getApproxPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Location is not available on this device'), { code: 'unavailable' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: round(pos.coords.latitude), longitude: round(pos.coords.longitude) }),
      (err) => reject(Object.assign(new Error(err.message), { code: err.code === 1 ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

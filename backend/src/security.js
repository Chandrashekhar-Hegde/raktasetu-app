export function buildHelmetOptions(isProduction = false) {
  const directives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    connectSrc: ["'self'", 'https://accounts.google.com'],
    fontSrc: ["'self'", 'data:'],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    frameSrc: ["'self'", 'https://accounts.google.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com', 'https://*.tile.openstreetmap.org'],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
    workerSrc: ["'self'", 'blob:'],
  };

  if (isProduction) directives.upgradeInsecureRequests = [];

  return {
    contentSecurityPolicy: { directives },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };
}

export function applyPrivacyHeaders(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(), payment=(), usb=(), browsing-topics=(), geolocation=(self)'
  );
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
}

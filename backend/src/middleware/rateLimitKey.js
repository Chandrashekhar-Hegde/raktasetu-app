import jwt from 'jsonwebtoken';
import { ipKeyGenerator } from 'express-rate-limit';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../auth/session.js';

/**
 * Rate-limit key for API traffic under shared NATs (CGNAT / mobile carriers).
 * Prefer the user id from a *verified* Bearer access token (an unverified
 * `sub` lets anyone mint a fresh bucket per request); fall back to client IP.
 * Expiry is ignored: an expired-but-genuine token still identifies the user.
 *
 * Auth-route limiters stay separate and tighter (see createApp); they still
 * key by IP so credential-stuffing against one mailbox is not amortized across users.
 */
export function apiRateLimitKey(req) {
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE, ignoreExpiration: true,
      });
      if (decoded && typeof decoded.sub === 'string' && decoded.sub.length > 0) {
        return `user:${decoded.sub}`;
      }
    } catch {
      /* forged or malformed: use IP */
    }
  }
  const ip = req.ip || req.socket?.remoteAddress;
  // IPv6 clients usually own a whole /64 or larger: key the subnet, not the address they can rotate.
  return ip ? ipKeyGenerator(ip) : 'anonymous';
}

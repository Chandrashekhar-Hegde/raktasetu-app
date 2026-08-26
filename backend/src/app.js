import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import donorRoutes from './routes/donor.js';
import hospitalRoutes from './routes/hospital.js';
import adminRoutes from './routes/admin.js';
import pushRoutes from './routes/push.js';
import { applyPrivacyHeaders, buildHelmetOptions } from './security.js';
import { apiRateLimitKey } from './middleware/rateLimitKey.js';
import { createCanonicalRedirectMiddleware } from './middleware/canonicalRedirect.js';
import { classifyDatabaseReadinessError, mapDatabaseHttpError } from './db/computeQuota.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3001'];
const APP_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'),
).version;

export function buildAllowedOrigins(env = process.env) {
  const configured = (env.FRONTEND_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const railwayOrigins = [
    env.RAILWAY_PUBLIC_DOMAIN,
    env.RAILWAY_STATIC_URL,
    env.RAILWAY_SERVICE_RAKTASETU_URL,
  ]
    .filter(Boolean)
    .map((value) => `https://${String(value).replace(/^https?:\/\//, '').replace(/\/$/, '')}`);
  return [...new Set([...configured, ...railwayOrigins])];
}

async function defaultPingDatabase() {
  const { pingDatabaseReady } = await import('./db/readiness.js');
  return pingDatabaseReady();
}

function setStaticAssetCacheHeaders(res, filePath) {
  const base = path.basename(filePath);
  if (base === 'index.html') {
    res.setHeader('Cache-Control', 'no-store');
    return;
  }
  // Vite hashed bundles: app.[hash].js, assets/index-[hash].css
  if (/\.[a-f0-9]{8,}\./i.test(base) || /-[a-f0-9]{8,}\.(js|css|woff2?)$/i.test(base)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

export function createApp({ env = process.env, pingDatabase = defaultPingDatabase } = {}) {
  const app = express();
  const isProduction = env.NODE_ENV === 'production' || Boolean(env.RAILWAY_ENVIRONMENT);
  const allowedOrigins = buildAllowedOrigins(env);

  app.set('trust proxy', 1);
  // Off by default: set CANONICAL_ORIGIN (e.g. https://raktasetu.in) at cutover to 301 HTML pages.
  app.use(createCanonicalRedirectMiddleware(env));
  app.use(helmet(buildHelmetOptions(isProduction)));
  app.use(applyPrivacyHeaders);
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10kb', strict: true }));
  // Global API budget: ~400 / 15 min per authenticated user (or per IP when anonymous).
  // Auth routes keep a tighter IP-keyed limiter below so login abuse is not shared-NAT amortized.
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: apiRateLimitKey,
    skip: (req) => !req.path.startsWith('/api'),
  }));
  app.use('/api/auth/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/donor', donorRoutes);
  app.use('/api/hospital', hospitalRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/push', pushRoutes);

  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
      },
    });
  });
  app.get('/api/health/ready', async (req, res) => {
    try {
      await pingDatabase();
      return res.json({
        success: true,
        data: {
          status: 'ready',
          version: APP_VERSION,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      const code = classifyDatabaseReadinessError(err);
      return res.status(503).json({
        success: false,
        error: {
          code,
          message: code === 'COMPUTE_QUOTA_EXCEEDED'
            ? 'Database compute quota exceeded'
            : 'Database unavailable',
        },
      });
    }
  });
  app.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (env.SERVE_FRONTEND !== 'false' && fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, {
      index: false,
      setHeaders: setStaticAssetCacheHeaders,
    }));
    app.get(/^(?!\/api(?:\/|$)|\/socket\.io(?:\/|$)).*/, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (path.extname(req.path)) return next();
      res.setHeader('Cache-Control', 'no-store');
      return res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const mapped = mapDatabaseHttpError(error);
    if (mapped) {
      return res.status(mapped.status).json({
        success: false,
        error: { code: mapped.code, message: mapped.message },
      });
    }
    const status = error.type === 'entity.too.large' ? 413 : (error.status || 500);
    return res.status(status).json({
      success: false,
      error: {
        code: status === 413 ? 'BODY_TOO_LARGE' : 'INTERNAL_ERROR',
        message: status === 413 ? 'Request body is too large' : 'Internal server error',
      },
    });
  });

  return app;
}

export default createApp;

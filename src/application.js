require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { pool } = require('./config/db');
const { getDatabaseUrl, validateEnvironment } = require('./config/env');
const { databaseReady } = require('./middleware/dbReady');
const { maybeRunHousekeeping } = require('./middleware/housekeepingTick');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

app.use((req, res, next) => {
  res.locals.requestId = req.headers['x-vercel-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  if (req.path.startsWith('/api/') || req.path === '/health') {
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json');
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders:'draft-7', legacyHeaders:false }));

// This endpoint does not touch the database. Use it to prove that Vercel routing reaches Express.
app.get('/api/v1/system/ping', (_req, res) => {
  res.json({
    success: true,
    message: 'API runtime reachable',
    data: {
      application: 'PKN STAN Library System',
      runtime: process.version,
      vercel: Boolean(process.env.VERCEL),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      databaseConfigured: Boolean(getDatabaseUrl()),
      demoModeConfigured: process.env.DEMO_MODE ?? null,
      autoMigrateConfigured: process.env.AUTO_MIGRATE ?? null,
      autoSeedDemoConfigured: process.env.AUTO_SEED_DEMO ?? null,
    },
    requestId: res.locals.requestId,
  });
});

// Health always responds with JSON, even when DB is unavailable.
app.get('/health', async (_req, res) => {
  const dbConfigured = Boolean(getDatabaseUrl());
  if (!dbConfigured) {
    return res.status(503).json({
      success:false,
      status:'degraded',
      database:'not-configured',
      code:'DATABASE_NOT_CONFIGURED',
      message:'DATABASE_URL/POSTGRES_URL belum dikonfigurasi.',
      runtime:process.version,
      requestId:res.locals.requestId,
    });
  }
  try {
    const { rows } = await pool.query('SELECT now() AS database_time');
    return res.json({ success:true, status:'ok', database:'ok', databaseTime:rows[0].database_time, runtime:process.version, requestId:res.locals.requestId });
  } catch (err) {
    return res.status(503).json({
      success:false,
      status:'degraded',
      database:'unavailable',
      code:'DATABASE_UNAVAILABLE',
      message:process.env.NODE_ENV === 'production' ? 'Database tidak dapat dihubungi.' : err.message,
      runtime:process.version,
      requestId:res.locals.requestId,
    });
  }
});

// Cron and application API need a ready schema.
app.use('/api/cron', databaseReady, require('./routes/cron.routes'));
app.use('/api/v1', databaseReady);
app.use('/api/v1', maybeRunHousekeeping);
app.use('/api/v1', require('./routes/system.routes'));
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1', require('./routes/catalog.routes'));
app.use('/api/v1/me', require('./routes/member.routes'));
app.use('/api/v1', require('./routes/loan.routes'));
app.use('/api/v1', require('./routes/reservation.routes'));
app.use('/api/v1/staff/collective', require('./routes/collective.routes'));
app.use('/api/v1', require('./routes/room.routes'));
app.use('/api/v1', require('./routes/fine.routes'));
app.use('/api/v1', require('./routes/incident.routes'));
app.use('/api/v1', require('./routes/suggestion.routes'));
app.use('/api/v1', require('./routes/notification.routes'));
app.use('/api/v1', require('./routes/admin.routes'));
app.use('/api/v1', require('./routes/clearance.routes'));

// Vercel serves public/** from its CDN. Keep this only for local Node development.
if (!process.env.VERCEL) {
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, etag:true }));
  app.get(/^\/(?!api\/|health$).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  try { validateEnvironment(); } catch (e) { console.warn('[config]', e.message); }
}

module.exports = app;

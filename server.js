// server.js — Bricol (web-ready)
// Remplace entièrement ton fichier actuel par ce contenu.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const pool = require('./db');

// Routers
const authRoutes = require('./routes/auth');
const adsRoutes = require('./routes/ads');
const usersRoutes = require('./routes/users');
const workersRoutes = require('./routes/workerProfiles');
const workerPhotosRoutes = require('./routes/workerPhotos');
const companiesRoutes = require('./routes/companyProfiles');
const companyPhotosRoutes = require('./routes/companyPhotos');
const companySectorsRoutes = require('./routes/companySectors');
const messagesRoutes = require('./routes/messages');
const reviewsRoutes = require('./routes/reviews');
const oauthRoutes = require('./routes/oauth');

const app = express();
app.set('trust proxy', 1); // requis si derrière un proxy (Render/Heroku/Nginx)

// ---------- Sécurité & parsers ----------
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- CORS (whitelist depuis .env) ----------
const originsEnv = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000';
const ALLOWED_ORIGINS = originsEnv
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // autoriser Postman/cURL
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// ---------- Rate limit (optionnel, piloté par .env) ----------
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX_AUTH = parseInt(process.env.RATE_LIMIT_MAX_AUTH || '100', 10);
const MAX_TIGHT = parseInt(process.env.RATE_LIMIT_MAX_TIGHT || '20', 10);

const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_AUTH,
  standardHeaders: true,
  legacyHeaders: false,
});

const tightLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_TIGHT,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- Cookies refresh (web) ----------
const COOKIE_NAME   = process.env.COOKIE_NAME   || 'bricol_refresh_token';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || 'Lax';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

function setRefreshCookie(res, refreshToken) {
  res.cookie(COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,      // true en PROD avec HTTPS
    sameSite: COOKIE_SAMESITE,  // 'Lax' recommandé
    domain: COOKIE_DOMAIN,      // ex: 'bricol.ma' en prod
    path: '/',
    // maxAge piloté par l'exp du JWT côté serveur
  });
}
function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: '/',
  });
}

// 1) /auth/login → intercepter la réponse JSON pour poser le cookie httpOnly si refresh_token présent
app.use('/auth/login', tightLimiter, (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    try {
      if (body && body.refresh_token) {
        setRefreshCookie(res, body.refresh_token);
        // Option : masquer le refresh côté web (laisser = compat mobile/postman)
        if (process.env.HIDE_REFRESH_IN_RESPONSE === 'true') {
          delete body.refresh_token;
        }
      }
    } catch (_) {}
    return json(body);
  };
  next();
});

// 2) /auth/refresh → si le body n'a pas refresh_token, le prendre depuis le cookie (compat web)
app.use('/auth/refresh', tightLimiter, (req, res, next) => {
  if (!req.body) req.body = {};
  if (!req.body.refresh_token && req.cookies && req.cookies[COOKIE_NAME]) {
    req.body.refresh_token = req.cookies[COOKIE_NAME];
  }
  next();
});

// 3) /auth/logout → clear cookie après traitement
app.use('/auth/logout', tightLimiter, (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    try { clearRefreshCookie(res); } catch (_) {}
    return json(body);
  };
  next();
});

// ---------- Montage des routes ----------
app.use('/auth', authRoutes);
app.use('/oauth', oauthRoutes);

app.use('/ads', authLimiter, adsRoutes);
app.use('/users', usersRoutes);
app.use('/workers', workersRoutes);
app.use('/worker-photos', workerPhotosRoutes);

app.use('/companies', companiesRoutes);
app.use('/company-photos', companyPhotosRoutes);
app.use('/company-sectors', companySectorsRoutes);

app.use('/messages', messagesRoutes);
app.use('/reviews', reviewsRoutes);

// ---------- Healthcheck simple ----------
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Bricol API', time: new Date().toISOString() });
});

// ---------- Error handler global (doit rester en dernier) ----------
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// ---------- Lancement ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur Bricol lancé sur le port ${PORT}`);
  pool.query('SELECT NOW()', (err, result) => {
    if (err) console.error('❌ PostgreSQL KO :', err?.message || err);
    else     console.log('✅ PostgreSQL OK :', result.rows[0]?.now);
  });
});

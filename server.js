// --- haut de fichier ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');                 // ⭐ nouveau
const rateLimit = require('express-rate-limit');  // ⭐ nouveau
const pool = require('./db');

const app = express();
app.set('trust proxy', 1);


// ⭐ sécurité HTTP
app.use(helmet());

// ⭐ CORS whitelist à partir de l'env
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // permet curl/Postman
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// ⭐ rate limits
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10);
const maxAuth  = parseInt(process.env.RATE_LIMIT_MAX_AUTH || "100", 10);
const maxTight = parseInt(process.env.RATE_LIMIT_MAX_TIGHT || "20", 10);

const authLimiter  = rateLimit({ windowMs, max: maxAuth, standardHeaders: true, legacyHeaders: false });
const tightLimiter = rateLimit({ windowMs, max: maxTight, standardHeaders: true, legacyHeaders: false });

// --- tes routes de santé (si tu en as) ---
app.get('/health', (req,res)=>res.json({status:'ok'}));
app.get('/ready', async (req,res)=>{
  try { await pool.query('select 1'); res.json({db:'ok'}); }
  catch { res.status(500).json({db:'down'}); }
});

// --- logging global si tu l’as ---
const { logActions } = require("./middleware/loggingMiddleware");
app.use(logActions);

// --- routes protégées par rate-limit ---
app.use("/auth/login",  authLimiter);
app.use("/auth/refresh",authLimiter);
app.use("/auth/logout", authLimiter);
app.use("/messages",    tightLimiter);
app.use("/reviews",     tightLimiter);

// middlewares de base
app.use(express.json());

// --- montage de tes routes existantes ---
app.use("/users",            require("./routes/users"));
app.use("/ads",              require("./routes/ads"));
app.use("/messages",         require("./routes/messages"));
app.use("/reviews",          require("./routes/reviews"));
app.use("/worker-profiles",  require("./routes/workerProfiles"));
app.use("/worker-photos",    require("./routes/workerPhotos"));
app.use("/company-profiles", require("./routes/companyProfiles"));
app.use("/company-photos",   require("./routes/companyPhotos"));
app.use("/company-sectors",  require("./routes/companySectors"));
app.use("/auth",             require("./routes/auth"));

// --- error handler en dernier ---
const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);

// --- listen ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
  pool.query('SELECT NOW()', (err, result) => {
    if (err) console.error('❌ Erreur de connexion PostgreSQL :', err);
    else     console.log('✅ Connexion PostgreSQL :', result.rows[0].now);
  });
});

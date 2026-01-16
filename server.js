// server.js — Bricol (clean & web-ready)
require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pool = require("./db");

const app = express();
app.set("trust proxy", 1);

/* 1) Sécurité & parsers */
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

/* 2) CORS (whitelist depuis .env) */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Autorise Postman/cURL (origin null) + allowlist
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* 3) Rate limits ciblés */
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10);
const maxAuth = parseInt(process.env.RATE_LIMIT_MAX_AUTH || "100", 10);
const maxTight = parseInt(process.env.RATE_LIMIT_MAX_TIGHT || "20", 10);

const authLimiter = rateLimit({
  windowMs,
  max: maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
});
const tightLimiter = rateLimit({
  windowMs,
  max: maxTight,
  standardHeaders: true,
  legacyHeaders: false,
});

/* 4) Healthchecks */
app.get("/", (req, res) =>
  res.json({ ok: true, service: "Bricol API", time: new Date().toISOString() })
);
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      db: "up",
      service: "Bricol API",
      time: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      db: "down",
      error: e?.message || String(e),
      service: "Bricol API",
      time: new Date().toISOString(),
    });
  }
});

/* 5) Logging global (si présent) */
try {
  const { logActions } = require("./middleware/loggingMiddleware");
  app.use(logActions);
} catch (_) {
  /* middleware optionnel */
}

/* 6) Rate limits par route */
app.use("/auth/login", authLimiter);
app.use("/auth/refresh", authLimiter);
app.use("/auth/logout", authLimiter);
app.use("/messages", tightLimiter);
app.use("/reviews", tightLimiter);

/* 7) Routes — ordre important :
      - D’abord la sous-ressource imbriquée
      - Puis les routes “normales” */
const companyProfileSectorsRouter = require("./routes/companyProfileSectors");
app.use("/company-profiles/:companyId/sectors", companyProfileSectorsRouter);

app.use("/users", require("./routes/users"));
app.use("/ads", require("./routes/ads"));
app.use("/messages", require("./routes/messages"));
app.use("/reviews", require("./routes/reviews"));
app.use("/worker-profiles", require("./routes/workerProfiles"));
app.use("/worker-photos", require("./routes/workerPhotos"));
app.use("/company-profiles", require("./routes/companyProfiles"));
app.use("/company-photos", require("./routes/companyPhotos"));
app.use("/auth", require("./routes/auth"));
app.use("/oauth", require("./routes/oauth")); 
app.use("/cities", require("./routes/cities"));
app.use("/sectors", require("./routes/sectors"));
app.use("/umbrellas", require("./routes/umbrellas"));
app.use("/search", require("./routes/search"));
app.use("/admin", require("./routes/admin"));
app.use("/uploads", require("./routes/uploads"));

/* 8) Error handler JSON (en dernier) */
try {
  const errorHandler = require("./middleware/errorHandler");
  app.use(errorHandler);
} catch (_) {
  /* handler optionnel */
}

/* 9) Listen */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
  pool.query("SELECT NOW()", (err, result) => {
    if (err) console.error("❌ Erreur de connexion PostgreSQL :", err);
    else console.log("✅ Connexion PostgreSQL :", result.rows[0].now);
  });
});

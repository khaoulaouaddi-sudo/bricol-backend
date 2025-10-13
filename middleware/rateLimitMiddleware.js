// middleware/rateLimitMiddleware.js
const rateLimits = {};

// Limite générique : max X actions par période
function rateLimit(key, limit, windowMs) {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const uniqueKey = `${key}:${userId}`;

    const now = Date.now();
    if (!rateLimits[uniqueKey]) {
      rateLimits[uniqueKey] = [];
    }

    // garder uniquement les timestamps récents
    rateLimits[uniqueKey] = rateLimits[uniqueKey].filter(
      (ts) => now - ts < windowMs
    );

    if (rateLimits[uniqueKey].length >= limit) {
      return res.status(429).json({ msg: "Trop de requêtes, réessayez plus tard" });
    }

    rateLimits[uniqueKey].push(now);
    next();
  };
}

module.exports = {
  rateLimit,
};
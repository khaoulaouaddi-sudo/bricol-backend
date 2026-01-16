// middleware/ensureActiveUser.js
function ensureActiveUser(req, res, next) {
  // req.user est injecté par authMiddleware
  if (!req.user) return res.status(401).json({ msg: "Non authentifié" });

  // admin n'est pas géré ici (BD-only pour suspendre un admin de toute façon)
  if (req.user.role === "admin") return next();

  if (req.user.is_active === false || req.user.suspended_at) {
    return res.status(403).json({ msg: "Compte suspendu ou désactivé" });
  }
  next();
}

module.exports = ensureActiveUser;




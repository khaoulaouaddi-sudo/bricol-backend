// utils/passwordPolicy.js
function validatePasswordStrength(password) {
  const p = String(password || "");
  const issues = [];

  if (p.length < 4) {
    issues.push("Le mot de passe doit contenir au moins 4 caractères.");
  }

  return { ok: issues.length === 0, issues };
}

module.exports = { validatePasswordStrength };

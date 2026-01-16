// utils/passwordPolicy.js
function validatePasswordStrength(password) {
  const p = String(password || "");

  const issues = [];
  if (p.length < 10) issues.push("Le mot de passe doit contenir au moins 10 caractères.");
  if (!/[a-z]/.test(p)) issues.push("Ajoute au moins une lettre minuscule.");
  if (!/[A-Z]/.test(p)) issues.push("Ajoute au moins une lettre majuscule.");
  if (!/\d/.test(p)) issues.push("Ajoute au moins un chiffre.");
  if (!/[^\w\s]/.test(p)) issues.push("Ajoute au moins un caractère spécial (ex: ! @ # ?).");
  if (/\s/.test(p)) issues.push("Évite les espaces dans le mot de passe.");

  // Empêche les mots de passe trop simples
  const common = ["password", "123456", "123456789", "azerty", "qwerty"];
  if (common.some((c) => p.toLowerCase().includes(c))) {
    issues.push("Évite un mot de passe trop commun.");
  }

  return { ok: issues.length === 0, issues };
}

module.exports = { validatePasswordStrength };

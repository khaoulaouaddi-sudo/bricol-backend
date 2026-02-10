// utils/i18n.js
// Lang helpers (FR par défaut) + compat query ?lang=ar|fr + header x-bricol-lang

function resolveLang(req, defaultLang = "fr") {
  const q = String(req?.query?.lang || "").toLowerCase();
  if (q === "ar" || q === "fr") return q;

  const h = String(req?.headers?.["x-bricol-lang"] || "").toLowerCase();
  if (h === "ar" || h === "fr") return h;

  return defaultLang;
}

function pickLang(lang, frValue, arValue) {
  if (lang === "ar") return arValue || frValue || null;
  // default fr
  return frValue || arValue || null;
}

module.exports = { resolveLang, pickLang };


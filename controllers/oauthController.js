// controllers/oauthController.js
// OAuth désactivé volontairement pour le moment.
// Ce contrôleur répond 503 pour Google/Facebook.
// Quand on attaquera l'auth côté frontend, on remplacera ce fichier
// par l'implémentation qui vérifie Google id_token / Facebook access_token,
// et émet access+refresh comme dans le login classique.

const OAuthController = {
  async google(req, res) {
    return res.status(503).json({
      msg: "OAuth Google désactivé pour le moment. À activer lors du développement du frontend."
    });
  },
  async facebook(req, res) {
    return res.status(503).json({
      msg: "OAuth Facebook désactivé pour le moment. À activer lors du développement du frontend."
    });
  }
};

module.exports = OAuthController;
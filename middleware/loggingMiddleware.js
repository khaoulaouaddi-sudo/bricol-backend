// middleware/loggingMiddleware.js

function logActions(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} by ${req.user?.id || "guest"}`);
  next();
}

module.exports = {
  logActions,
};
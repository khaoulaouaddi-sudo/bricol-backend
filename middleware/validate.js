// middleware/validate.js
const { validationResult } = require("express-validator");

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      msg: "Validation échouée",
      errors: errors.array().map(e => ({
        field: e.param, value: e.value, message: e.msg
      })),
    });
  }
  next();
};

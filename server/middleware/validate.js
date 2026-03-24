const { validationResult } = require('express-validator');

function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ errors: result.array() });
  }
  next();
}

module.exports = { handleValidation };

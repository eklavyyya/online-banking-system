// Centralized error handler. Controllers can throw AppError for
// intentional, user-facing failures (validation, business rules); anything
// else is logged and returned as a generic 500 so internals never leak.
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

function errorHandler(err, req, res, next) {
  if (err.isOperational) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'An unexpected error occurred.' });
}

module.exports = { AppError, errorHandler };

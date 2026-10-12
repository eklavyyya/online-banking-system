// Wraps a controller body so thrown AppErrors reach the central error handler
// and the success path is a single res.status(...).json(...).
function handle(fn, status = 200) {
  return async (req, res, next) => {
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.status(status).json(out);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { handle };

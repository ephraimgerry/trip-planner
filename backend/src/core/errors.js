const logger = require("./logger");
const config = require("./config");

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
    this.expected = status < 500;
  }
}
const badRequest = (m = "Bad request", d) => new AppError(400, "bad_request", m, d);
const unauthorized = (m = "Sign in required") => new AppError(401, "unauthorized", m);
const forbidden = (m = "You don't have access to this") => new AppError(403, "forbidden", m);
const notFound = (m = "Not found") => new AppError(404, "not_found", m);
const conflict = (m = "Already exists", d) => new AppError(409, "conflict", m, d);
const tooLarge = (m = "Payload too large") => new AppError(413, "payload_too_large", m);

function errorHandler(err, req, res, _next) {
  if (err && err.name === "ZodError")
    err = badRequest("Validation failed", err.issues.map(i => ({ path: i.path.join("."), message: i.message })));
  if (err && err.type === "entity.too.large") err = tooLarge();
  if (err && /^SQLITE_CONSTRAINT/.test(err.code || "")) err = conflict("That conflicts with something that already exists");

  const status = err.status || 500;
  const log = (req.log || logger);
  if (status >= 500) log.error("request failed", { err: err.message, stack: err.stack, path: req.originalUrl });
  else log.debug("request rejected", { status, err: err.message, path: req.originalUrl });

  res.status(status).json({
    error: {
      code: err.code || (status >= 500 ? "internal" : "error"),
      // Never leak an internal failure's text to the client.
      message: status >= 500 && config.isProd ? "Something went wrong" : err.message,
      details: err.details,
      requestId: req.id,
    },
  });
}
module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, tooLarge, errorHandler };

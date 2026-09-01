class AppError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const notFound = (m = "Not found") => new AppError(404, m);
const badRequest = (m = "Bad request", d) => new AppError(400, m, d);

function errorHandler(err, req, res, _next) {
  // zod validation errors -> 400
  if (err && err.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal error", details: err.details });
}
module.exports = { AppError, notFound, badRequest, errorHandler };

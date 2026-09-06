// Structured JSON logs — one line per event, ready for any log shipper.
// No dependency: this is small enough that a library would cost more than it saves.
const config = require("./config");

const LEVELS = { error: 50, warn: 40, info: 30, debug: 20 };
const min = LEVELS[config.log.level] || 30;

// Never let a token, cookie or password reach the log stream.
const REDACT = /^(authorization|cookie|set-cookie|password|token|secret|api[-_]?key)$/i;
function scrub(v, depth = 0) {
  if (v == null || depth > 4) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(x => scrub(x, depth + 1));
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = REDACT.test(k) ? "[redacted]" : scrub(val, depth + 1);
    return out;
  }
  return v;
}

function emit(level, msg, fields) {
  if (LEVELS[level] < min) return;
  const line = Object.assign({ ts: new Date().toISOString(), level, msg }, scrub(fields || {}));
  (level === "error" ? process.stderr : process.stdout).write(JSON.stringify(line) + "\n");
}

const logger = {
  error: (m, f) => emit("error", m, f),
  warn:  (m, f) => emit("warn", m, f),
  info:  (m, f) => emit("info", m, f),
  debug: (m, f) => emit("debug", m, f),
  child: (base) => ({
    error: (m, f) => emit("error", m, Object.assign({}, base, f)),
    warn:  (m, f) => emit("warn", m, Object.assign({}, base, f)),
    info:  (m, f) => emit("info", m, Object.assign({}, base, f)),
    debug: (m, f) => emit("debug", m, Object.assign({}, base, f)),
  }),
};
module.exports = logger;

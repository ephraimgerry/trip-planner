const repo = require("./places.repository");
const { notFound } = require("../../core/errors");
module.exports = {
  list: (f) => repo.list(f),
  get: (id) => { const p = repo.get(id); if (!p) throw notFound("Place not found"); return p; },
  create: (d) => repo.create(d),
  update: (id, d) => { const p = repo.update(id, d); if (!p) throw notFound("Place not found"); return p; },
  remove: (id) => { if (!repo.remove(id)) throw notFound("Place not found"); return { ok: true }; },
};

const repo = require("./trips.repository");
const { notFound } = require("../../core/errors");
function ownGet(id) { const t = repo.get(id); if (!t) throw notFound("Trip not found"); return t; }
module.exports = {
  list: (userId) => repo.listByUser(userId),
  get: (id) => ownGet(id),
  create: (userId, d) => repo.upsert(userId, d),
  replace: (userId, id, d) => { ownGet(id); return repo.upsert(userId, { ...d, id }); },
  remove: (id) => { if (!repo.remove(id)) throw notFound("Trip not found"); return { ok: true }; },
  setDay: (id, date, ids) => { ownGet(id); return repo.setDay(id, date, ids); },
  addAlt: (id, placeId) => { ownGet(id); return repo.addAlt(id, placeId); },
  removeAlt: (id, placeId) => { ownGet(id); return repo.removeAlt(id, placeId); },
};

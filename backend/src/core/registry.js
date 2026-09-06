// The modulith's contract: a module is a name, a mount path and a router.
// Everything crossing a module boundary goes through a repository or service
// that the owning module exports — never a direct table read from elsewhere.
const modules = [
  { name: "auth",      mount: "/api/auth",      router: () => require("../modules/auth/auth.routes") },
  { name: "users",     mount: "/api/users",     router: () => require("../modules/users/users.routes") },
  { name: "geo",       mount: "/api/geo",       router: () => require("../modules/geo/geo.routes") },
  { name: "places",    mount: "/api/places",    router: () => require("../modules/places/places.routes") },
  { name: "trips",     mount: "/api/trips",     router: () => require("../modules/trips/trips.routes") },
  { name: "bootstrap", mount: "/api/bootstrap", router: () => require("../modules/bootstrap/bootstrap.routes") },
  { name: "import",    mount: "/api/import",    router: () => require("../modules/import/import.routes") },
];
module.exports = { modules };

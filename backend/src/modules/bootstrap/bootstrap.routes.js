// One request that gives the client everything it needs to render.
// Replaces the old localStorage blob: geography, the place catalogue, this
// user's marks, their trips, and their preferences.
const router = require("express").Router();
const { asyncHandler } = require("../../core/http");
const { requireAuth } = require("../auth/auth.middleware");
const geo = require("../geo/geo.repository");
const places = require("../places/places.repository");
const trips = require("../trips/trips.repository");
const tripService = require("../trips/trips.service");
const users = require("../users/users.repository");
const config = require("../../core/config");

router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const images = places.allImages();
  res.json({
    me: { id: uid, email: req.user.email, name: req.user.name, role: req.user.role },
    authMode: config.auth.mode,
    countries: geo.countries(),
    areas: geo.areas(),
    districts: geo.districts(),
    places: places.visibleTo(uid).map(p => ({ ...p, images: images[p.id] || [] })),
    userPlaces: places.userPlaces(uid),
    trips: trips.listFor(uid).map(t => tripService.document(t.id, uid)),
    prefs: users.prefs(uid),
  });
}));

module.exports = router;

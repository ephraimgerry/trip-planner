const { z } = require("zod");
const txt = (max) => z.string().trim().max(max);
const idStr = z.string().min(1).max(64);

// Only ever store links we would be willing to open.
const safeUrl = z.string().trim().max(2000).refine(
  (u) => { try { return ["http:", "https:"].includes(new URL(u).protocol); } catch (e) { return false; } },
  { message: "must be an http(s) URL" });

const placeCreate = z.object({
  kind: z.enum(["poi", "lodging", "transport"]).default("poi"),
  name: txt(160).min(1),
  nameLocal: txt(160).nullish(),
  category: txt(32).nullish(),
  countryCode: z.string().length(2).nullish(),
  areaId: idStr.nullish(),
  districtId: idStr.nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  address: txt(300).nullish(),
  link: safeUrl.nullish(),
  description: txt(4000).nullish(),
  source: txt(120).nullish(),
  visibility: z.enum(["public", "private"]).default("public"),
  images: z.array(safeUrl).max(12).optional(),
  // per-kind detail; a hotel's usual check-in policy lives here
  attrs: z.object({
    checkInTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    stars: z.number().int().min(1).max(5).nullish(),
    phone: txt(40).nullish(),
    openingHours: txt(200).nullish(),
    priceBand: txt(20).nullish(),
    iata: txt(4).nullish(),
    reservation: txt(200).nullish(),
  }).strict().optional(),
}).strict();

const placePatch = placeCreate.partial().strict();
const placeParams = z.object({ placeId: idStr });

const userPlacePatch = z.object({
  status: z.enum(["want", "planned", "visited"]).nullish(),
  note: txt(2000).nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
}).strict();

module.exports = { placeCreate, placePatch, placeParams, userPlacePatch, safeUrl };

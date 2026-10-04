const { z } = require("zod");
const { safeUrl } = require("../places/places.schema");

const txt = (max) => z.string().trim().max(max);
const idStr = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const time = z.string().regex(/^\d{2}:\d{2}$/, "must be HH:MM");

// Display-only detail. Validated, but never queried — see migration 009.
const attrs = z.object({
  opensAt: time.nullish(),
  closesAt: time.nullish(),
  hoursNote: txt(200).nullish(),          // "closes 21:20 on some days"
  price: txt(120).nullish(),              // "¥180–380" — tiers vary too much for a number
  booking: z.enum(["none", "recommended", "required"]).nullish(),
  bookingNote: txt(200).nullish(),
}).strict();

const base = {
  name: txt(160).min(1),
  nameLocal: txt(160).nullish(),
  category: idStr,
  venuePlaceId: idStr.nullish(),
  venueName: txt(160).nullish(),
  countryCode: z.string().length(2).nullish(),
  areaId: idStr.nullish(),
  districtId: idStr.nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  address: txt(300).nullish(),
  startDate: date,
  endDate: date.nullish(),
  isFree: z.boolean().optional(),
  link: safeUrl.nullish(),
  description: txt(4000).nullish(),
  source: txt(120).nullish(),
  visibility: z.enum(["public", "private"]).default("public"),
  attrs: attrs.optional(),
};

const endAfterStart = (v) => !v.endDate || !v.startDate || v.endDate >= v.startDate;

const eventCreate = z.object(base).strict()
  .refine(endAfterStart, { message: "endDate can't be before startDate", path: ["endDate"] });
const eventPatch = z.object(base).partial().strict()
  .refine(endAfterStart, { message: "endDate can't be before startDate", path: ["endDate"] });
const eventParams = z.object({ eventId: idStr });
const eventQuery = z.object({
  from: date.optional(), to: date.optional(),
  areas: z.string().max(2000).optional(),          // comma-separated area ids
}).strict();

// putting an event on a trip
const tripEventCreate = z.object({
  eventId: idStr,
  date: date.nullish(),                             // null = shortlist
  startTime: time.nullish(),
  note: txt(1000).nullish(),
}).strict();
const tripEventPatch = tripEventCreate.omit({ eventId: true }).partial().strict();
const tripEventParams = z.object({ tripId: idStr, tripEventId: idStr });

module.exports = { eventCreate, eventPatch, eventParams, eventQuery,
  tripEventCreate, tripEventPatch, tripEventParams };

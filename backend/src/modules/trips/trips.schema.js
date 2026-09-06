const { z } = require("zod");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const time = z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM").nullish();
const txt = (max) => z.string().trim().max(max);
const idStr = z.string().min(1).max(64);

const tripCreate = z.object({
  name: txt(120).min(1),
  startDate: date, endDate: date,
  note: txt(2000).nullish(),
}).strict().refine(v => v.endDate >= v.startDate, { message: "endDate must not precede startDate", path: ["endDate"] });

const tripPatch = z.object({
  name: txt(120).min(1).optional(),
  startDate: date.optional(), endDate: date.optional(),
  note: txt(2000).nullish(),
}).strict();

const stay = z.object({
  id: idStr.optional(), areaId: idStr.nullish(), placeId: idStr.nullish(),
  checkIn: date, checkOut: date,
  checkInTime: time, checkOutTime: time,
  booked: z.boolean().optional(), bookingRef: txt(80).nullish(), note: txt(500).nullish(),
  participantIds: z.array(idStr).max(40).optional(),
}).refine(v => v.checkOut >= v.checkIn, { message: "checkOut must not precede checkIn" });

// ---------------------------------------------------------------- commutes
// The columns are shared by every kind. `attrs` holds the per-type detail and
// is validated by kind, so JSON storage doesn't mean unvalidated storage.
const KINDS = ["flight", "train", "bus", "ferry", "metro", "taxi",
               "car_rental", "car_own", "rail_pass", "walk", "other"];

const attrsByKind = {
  flight:     z.object({ terminal: txt(40).nullish(), gate: txt(20).nullish(), seat: txt(20).nullish(),
                         baggage: txt(60).nullish(), aircraft: txt(40).nullish(),
                         cabin: txt(30).nullish() }).strict(),
  train:      z.object({ car: txt(20).nullish(), seat: txt(20).nullish(), platform: txt(20).nullish(),
                         class: txt(30).nullish() }).strict(),
  ferry:      z.object({ cabin: txt(30).nullish(), deck: txt(20).nullish() }).strict(),
  // a hire car is held across days, so it carries the paperwork you need at the desk
  car_rental: z.object({ vendor: txt(60).nullish(), vehicleClass: txt(60).nullish(),
                         plate: txt(20).nullish(), transmission: z.enum(["auto", "manual"]).nullish(),
                         fuelPolicy: txt(60).nullish(), insurance: txt(120).nullish(),
                         deposit: txt(40).nullish(), driverParticipantId: idStr.nullish(),
                         licenceRequired: txt(120).nullish(), pickupInstructions: txt(300).nullish(),
                         dropoffDiffers: z.boolean().nullish() }).strict(),
  car_own:    z.object({ plate: txt(20).nullish(), parking: txt(200).nullish(),
                         tolls: txt(120).nullish() }).strict(),
  rail_pass:  z.object({ passType: txt(60).nullish(), coverage: txt(200).nullish(),
                         activations: z.number().int().min(0).max(99).nullish() }).strict(),
};
const genericAttrs = z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean(), z.null()]));

const commute = z.object({
  id: idStr.optional(),
  kind: z.enum(KINDS),
  // alternatives for one hop share a groupId; exactly one may be chosen
  groupId: idStr.nullish(),
  chosen: z.boolean().optional(),
  direction: z.enum(["outbound", "inbound", "internal"]).default("internal"),
  startDate: date, startTime: time,
  endDate: date.nullish(), endTime: time,
  fromAreaId: idStr.nullish(), toAreaId: idStr.nullish(),
  fromPlaceId: idStr.nullish(), toPlaceId: idStr.nullish(),
  fromLabel: txt(120).nullish(), toLabel: txt(120).nullish(),
  label: txt(240).nullish(), operator: txt(80).nullish(), code: txt(40).nullish(),
  status: z.enum(["idea", "planned", "booked"]).default("idea"),
  bookingRef: txt(80).nullish(),
  price: z.number().min(0).max(1e7).nullish(), currency: txt(8).nullish(),
  durationMin: z.number().int().min(0).max(100000).nullish(),
  attrs: z.unknown().optional(),
  note: txt(500).nullish(),
  participantIds: z.array(idStr).max(40).optional(),
})
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.startDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must not precede startDate" });
    // validate attrs against the schema for this kind
    const schema = attrsByKind[v.kind] || genericAttrs;
    const r = schema.safeParse(v.attrs == null ? {} : v.attrs);
    if (!r.success)
      r.error.issues.forEach(i => ctx.addIssue({
        code: "custom", path: ["attrs", ...i.path], message: `${v.kind}: ${i.message}` }));
    else v.attrs = r.data;
  });

const item = z.object({
  id: idStr.optional(), date, placeId: idStr,
  slot: z.enum(["morning", "noon", "evening"]).nullish(),
  startTime: time, endTime: time,
  ord: z.number().int().min(0).max(999).optional(),
  note: txt(500).nullish(),
});

const alternative = z.object({
  id: idStr.optional(), placeId: idStr, date: date.nullish(), note: txt(500).nullish(),
});

// The whole plan in one request. Bounded so a single call can't blow up the DB.
const planDoc = z.object({
  stays: z.array(stay).max(60).default([]),
  commutes: z.array(commute).max(400).default([]),
  items: z.array(item).max(1500).default([]),
  alternatives: z.array(alternative).max(500).default([]),
}).strict();

// ------------------------------------------------------------- participants
const participantDates = z.object({
  startDate: date, endDate: date, note: txt(200).nullish(),
}).refine(v => v.endDate >= v.startDate, { message: "endDate must not precede startDate" });

const participantCreate = z.object({
  name: txt(80).min(1),
  email: z.string().email().max(200).nullish(),
  userId: idStr.nullish(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  isOrganiser: z.boolean().optional(),
  note: txt(500).nullish(),
  ord: z.number().int().min(0).max(999).optional(),
  // no ranges at all means "here for the whole trip"
  dates: z.array(participantDates).max(12).optional(),
}).strict();

const participantPatch = participantCreate.partial().strict();

const memberUpsert = z.object({
  email: z.string().email().max(200),
  role: z.enum(["owner", "editor", "viewer"]).default("viewer"),
}).strict();

const memberRole = z.object({ role: z.enum(["owner", "editor", "viewer"]) }).strict();
const tripParams = z.object({ tripId: idStr });
const settingsPatch = z.object({ basePlaceId: idStr.nullish() }).strict();

module.exports = { tripCreate, tripPatch, planDoc, commute, memberUpsert, memberRole,
                   tripParams, settingsPatch, participantCreate, participantPatch, date, KINDS, attrsByKind };

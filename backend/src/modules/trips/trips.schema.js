const { z } = require("zod");
// Loose on nested structured blobs (segments/legs/flights) to match the frontend's
// trip shape; strict on the relational essentials.
const tripInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  start: z.string(),
  end: z.string(),
  outbound: z.any().optional(),
  inbound: z.any().optional(),
  segments: z.array(z.any()).optional().default([]),
  legs: z.array(z.any()).optional().default([]),
  plan: z.record(z.array(z.string())).optional().default({}),   // { "YYYY-MM-DD": [placeId] }
  wishlist: z.array(z.string()).optional().default([]),
});
module.exports = { tripInput };

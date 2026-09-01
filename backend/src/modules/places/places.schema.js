const { z } = require("zod");
const placeInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  name_cn: z.string().optional().default(""),
  category: z.string().min(1),
  sub: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  lat: z.number(),
  lng: z.number(),
  link: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  image_urls: z.array(z.string()).optional(),
});
module.exports = { placeInput };

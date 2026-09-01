require("dotenv").config();
const path = require("path");
const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4177),
  dbFile: process.env.DB_FILE
    ? path.resolve(process.cwd(), process.env.DB_FILE)
    : path.join(__dirname, "..", "..", "data", "tripplanner.db"),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-change-me",
  images: {
    provider: process.env.IMAGE_PROVIDER || "google_cse",
    googleKey: process.env.GOOGLE_CSE_KEY || "",
    googleCx: process.env.GOOGLE_CSE_CX || "",
  },
};
module.exports = config;

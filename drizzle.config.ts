import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations run as the database owner; the app itself uses the restricted DATABASE_URL role.
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL! },
});

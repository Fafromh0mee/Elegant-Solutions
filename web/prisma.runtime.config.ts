import { defineConfig } from "prisma/config";

// Runtime containers receive DATABASE_URL from Compose/Railway directly.
// This config intentionally does not load local .env files.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL! },
  migrations: { path: "prisma/migrations" },
});

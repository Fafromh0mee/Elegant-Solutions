import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `pnpm test` stays database-free. Tests named *.db.test.ts touch the LOCAL
// database and only run with VITEST_DB=1 (`pnpm test:db`).
const withDb = process.env.VITEST_DB === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: withDb ? ["src/**/*.db.test.ts"] : ["src/**/*.test.ts"],
    exclude: withDb ? ["**/node_modules/**"] : ["**/node_modules/**", "**/*.db.test.ts"],
    environment: "node",
    // DB tests share one database; run their files serially.
    fileParallelism: !withDb,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", "node_modules*/**", "dist/**"],
    fileParallelism: false,
    pool: "threads",
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});

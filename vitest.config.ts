import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "web/src/**/*.test.ts", "web/src/**/*.test.tsx"],
    exclude: ["node_modules/**", "node_modules*/**", "dist/**"],
    fileParallelism: false,
    // Native-backed suites repeatedly load and close better-sqlite3 and PDF
    // parser state. Process isolation keeps native module lifecycles out of
    // Vitest worker threads while preserving serial file execution.
    pool: "forks",
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});

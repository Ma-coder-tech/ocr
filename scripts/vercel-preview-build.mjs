import { spawnSync } from "node:child_process";

const isPreview = process.env.VERCEL_ENV === "preview";
const v2Enabled = process.env.VITE_RATEREVEAL_REPORT_V2_ENABLED === "true";

if (!isPreview || !v2Enabled) {
  console.log("Skipping Preview web build; Preview Report V2 is not enabled.");
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "build:web"], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

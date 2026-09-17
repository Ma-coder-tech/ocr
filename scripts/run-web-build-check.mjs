import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ratereveal-web-build-"));

try {
  execFileSync(
    process.execPath,
    [
      "scripts/run-node-tool.mjs",
      "./node_modules/vite/bin/vite.js",
      "build",
      "--config",
      "web/vite.config.ts",
      "--outDir",
      outputRoot,
      "--emptyOutDir",
    ],
    { cwd: process.cwd(), stdio: "inherit" },
  );
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

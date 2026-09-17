import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ratereveal-fiserv-coverage-"));

try {
  execFileSync(
    process.execPath,
    [
      "scripts/run-node-tool.mjs",
      "--import",
      "tsx",
      "scripts/fiserv-coverage-audit.ts",
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        RATEREVEAL_FISERV_COVERAGE_OUTPUT: path.join(outputRoot, "fiserv-parser-coverage-audit.md"),
        RATEREVEAL_FISERV_COVERAGE_GENERATED_AT: "1970-01-01T00:00:00.000Z",
      },
    },
  );
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

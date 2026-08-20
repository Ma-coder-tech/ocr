import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const dataRoot = process.env.RATEREVEAL_DATA_ROOT?.trim();
if (!dataRoot || !path.isAbsolute(dataRoot) || dataRoot.startsWith("/tmp/")) {
  console.error("[staging-daemon] staging_persistent_storage_path_invalid");
  process.exit(1);
}

fs.mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
const pidPath = path.join(dataRoot, "staging-server.pid");
const logPath = path.join(dataRoot, "staging-server.log");
const previousPid = Number(readText(pidPath));
if (Number.isInteger(previousPid) && previousPid > 0 && processAlive(previousPid)) {
  console.log("[staging-daemon] server already running");
  process.exit(0);
}

const logFd = fs.openSync(logPath, "a", 0o600);
const child = spawn(process.execPath, ["scripts/staging-runtime-preflight.mjs"], {
  cwd: process.cwd(),
  detached: true,
  env: process.env,
  stdio: ["ignore", logFd, logFd],
});
child.unref();
fs.writeFileSync(pidPath, String(child.pid), { mode: 0o600 });
fs.closeSync(logFd);
console.log(`[staging-daemon] server launched pid=${child.pid}`);

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

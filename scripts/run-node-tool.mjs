import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-node-tool.mjs <tool-js-file> [...args]");
  process.exit(1);
}

const candidateNodes = [
  process.env.FEECLEAR_NODE,
  "/usr/local/bin/node",
  "/opt/homebrew/bin/node",
  process.execPath,
].filter(Boolean);

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const nodePath = candidateNodes.find((candidate) => isExecutable(candidate)) ?? process.execPath;
const child = spawn(nodePath, args, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    PATH: `${path.dirname(nodePath)}:${process.env.PATH ?? ""}`,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const requiredNodeMajor = 22;

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

function getNodeVersion(nodePath) {
  const result = spawnSync(nodePath, ["-p", "process.versions.node"], {
    encoding: "utf8",
    timeout: 5000,
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function findProjectNode() {
  for (const candidate of candidateNodes) {
    if (!isExecutable(candidate)) {
      continue;
    }

    const version = getNodeVersion(candidate);
    if (!version) {
      continue;
    }

    return { path: candidate, version };
  }

  return null;
}

function countDatalessFiles(targetPath) {
  if (process.platform !== "darwin" || !fs.existsSync(targetPath)) {
    return 0;
  }

  const result = spawnSync("find", [targetPath, "-flags", "+dataless", "-type", "f"], {
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0 && result.error) {
    return 0;
  }

  return result.stdout.split("\n").filter(Boolean).length;
}

const projectNode = findProjectNode();
const nodeMajor = projectNode ? Number(projectNode.version.split(".")[0]) : null;

if (!projectNode || nodeMajor !== requiredNodeMajor) {
  console.error(
    [
      `Toolchain check failed: expected Node ${requiredNodeMajor}.x for this project.`,
      projectNode
        ? `Selected node: ${projectNode.path} (${projectNode.version})`
        : "No executable Node runtime was found.",
      "Use `nvm use` or set FEECLEAR_NODE to a Node 22 binary before running build/test.",
    ].join("\n"),
  );
  process.exit(1);
}

const datalessCount = countDatalessFiles("node_modules");

if (datalessCount > 0) {
  console.error(
    [
      `Toolchain check failed: node_modules contains ${datalessCount} macOS dataless files.`,
      "Those are cloud placeholder files, usually from iCloud/optimized storage, and they make TypeScript/Vitest look hung while macOS hydrates dependencies.",
      "Long-term fix: keep this repo and node_modules outside iCloud-synced folders, or mark the folder as always downloaded.",
      "Immediate fix: reinstall dependencies under Node 22 after the files are local.",
    ].join("\n"),
  );
  process.exit(1);
}

const rootDuplicateDependencyDirs = fs
  .readdirSync(process.cwd(), { withFileTypes: true })
  .filter((entry) => entry.name !== "node_modules" && /^node_modules(?: \d+| copy.*)$/i.test(entry.name))
  .map((entry) => entry.name);

if (rootDuplicateDependencyDirs.length > 0) {
  console.error(
    [
      `Toolchain check failed: found root-level duplicate dependency folder(s): ${rootDuplicateDependencyDirs.join(", ")}.`,
      "Vitest and TypeScript can accidentally discover package source/tests through these folders.",
      "Remove the duplicate folder or symlink, then reinstall dependencies under Node 22 if needed.",
    ].join("\n"),
  );
  process.exit(1);
}

const nativeDependencyCheck = spawnSync(
  projectNode.path,
  ["-e", "require('better-sqlite3');"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10000,
  },
);

if (nativeDependencyCheck.status !== 0) {
  console.error(
    [
      "Toolchain check failed: better-sqlite3 is not loadable under the project Node runtime.",
      `Selected node: ${projectNode.path} (${projectNode.version})`,
      "This usually means native dependencies were installed or rebuilt under a different Node major version.",
      "Fix: run `nvm use` for Node 22, then reinstall/rebuild dependencies.",
      "On this machine, the known-good rebuild command is:",
      '  env PATH="/usr/local/bin:$PATH" /usr/local/bin/node /usr/local/lib/node_modules/npm/bin/npm-cli.js rebuild better-sqlite3 --build-from-source',
    ].join("\n"),
  );
  process.exit(1);
}

const duplicateDependencyFiles = spawnSync("find", ["node_modules", "-name", "* 2", "-o", "-name", "* copy*"], {
  encoding: "utf8",
  timeout: 10000,
  maxBuffer: 1024 * 1024,
});

if (duplicateDependencyFiles.status === 0) {
  const duplicates = duplicateDependencyFiles.stdout.split("\n").filter(Boolean);
  if (duplicates.length > 0) {
    console.error(
      [
        `Toolchain check failed: node_modules contains ${duplicates.length} duplicate/conflict files.`,
        "This usually means a cloud sync tool created duplicate dependency files.",
        `First duplicate: ${path.relative(process.cwd(), duplicates[0])}`,
        "Remove node_modules and reinstall dependencies under Node 22.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

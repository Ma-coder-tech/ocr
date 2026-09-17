import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const requestedArgs = process.argv.slice(2);
const batchSize = 12;
const repositoryPrefix = parseRepositoryPrefix(requestedArgs);

if (requestedArgs.length > 0 && !repositoryPrefix) {
  runVitest(requestedArgs);
} else {
  const files = discoverTestFiles().filter((file) => !repositoryPrefix || file.startsWith(repositoryPrefix));
  const shardCount = readPositiveInteger("RATEREVEAL_TEST_SHARD_COUNT", 1);
  const shardIndex = readPositiveInteger("RATEREVEAL_TEST_SHARD_INDEX", 1);
  if (shardIndex > shardCount) {
    throw new Error(`RATEREVEAL_TEST_SHARD_INDEX (${shardIndex}) exceeds RATEREVEAL_TEST_SHARD_COUNT (${shardCount}).`);
  }

  const selectedFiles = files.filter((_, index) => index % shardCount === shardIndex - 1);
  if (selectedFiles.length === 0) {
    throw new Error(`Test shard ${shardIndex}/${shardCount} selected no files.`);
  }

  const ordinaryFiles = selectedFiles.filter((file) => file !== "test/evaluationPackage5BIntegration.test.ts");
  const batches = chunk(ordinaryFiles, batchSize);
  if (selectedFiles.includes("test/evaluationPackage5BIntegration.test.ts")) {
    batches.push(["test/evaluationPackage5BIntegration.test.ts"]);
  }

  console.log(`[test-baseline] shard ${shardIndex}/${shardCount}: ${selectedFiles.length} files in ${batches.length} isolated processes`);
  for (const [index, filesInBatch] of batches.entries()) {
    console.log(`[test-baseline] process ${index + 1}/${batches.length}: ${filesInBatch.length} files`);
    runVitest(["--silent", ...filesInBatch]);
  }
}

function runVitest(args) {
  const configuredDbPath = process.env.FEECLEAR_DB_PATH?.trim();
  const temporaryRoot = configuredDbPath ? null : fs.mkdtempSync(path.join(os.tmpdir(), "ratereveal-test-"));
  const dbPath = configuredDbPath || path.join(temporaryRoot, "feeclear.sqlite");

  try {
    execFileSync(
      process.execPath,
      [
        "scripts/run-node-tool.mjs",
        "./node_modules/vitest/vitest.mjs",
        "run",
        ...args,
      ],
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: { ...process.env, FEECLEAR_DB_PATH: dbPath },
      },
    );
  } finally {
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function discoverTestFiles() {
  return ["test", "web/src"]
    .flatMap((root) => walk(root))
    .filter((file) => /\.test\.tsx?$/.test(file))
    .sort();
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(child) : [child.split(path.sep).join("/")];
  });
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function readPositiveInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function parseRepositoryPrefix(args) {
  if (args[0] !== "--repository-prefix") return null;
  if (args.length !== 2 || !/^(?:test|web\/src)\/[A-Za-z0-9_./-]+\/$/.test(args[1]) || args[1].includes("..")) {
    throw new Error("--repository-prefix requires one repository-relative test/ or web/src/ directory ending in '/'.");
  }
  return args[1];
}

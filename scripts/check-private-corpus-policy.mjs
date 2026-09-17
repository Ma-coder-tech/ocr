import { execFileSync, spawnSync } from "node:child_process";

const baseSha = argument("--base") || process.env.RATEREVEAL_POLICY_BASE_SHA?.trim();
const headSha = argument("--head") || process.env.RATEREVEAL_POLICY_HEAD_SHA?.trim() || "HEAD";

if (!baseSha) fail("policy_input_invalid", "A base SHA is required.");

let changedFiles;
try {
  changedFiles = execFileSync("git", ["diff", "--name-only", `${baseSha}...${headSha}`], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
} catch (error) {
  fail("policy_input_invalid", `Could not compare ${baseSha}...${headSha}.`);
}

const sensitiveFiles = changedFiles.filter(isPrivateCorpusRelevant);
if (sensitiveFiles.length === 0) {
  emit({
    status: "not_applicable",
    baseSha,
    headSha,
    changedFileCount: changedFiles.length,
    sensitiveFiles: [],
  });
  process.exit(0);
}

const waiverId = process.env.RATEREVEAL_PRIVATE_CORPUS_WAIVER_ID?.trim();
const waiverSha = process.env.RATEREVEAL_PRIVATE_CORPUS_WAIVER_SHA?.trim();
if (waiverId || waiverSha) {
  if (!/^PRODUCT-[A-Z0-9_-]{4,}$/.test(waiverId ?? "") || waiverSha !== resolveCommit(headSha)) {
    fail("invalid_product_waiver", "A waiver must use a PRODUCT-* identifier and match the exact head SHA.", sensitiveFiles);
  }
  emit({ status: "waived_by_product", waiverId, headSha: waiverSha, sensitiveFiles });
  process.exit(0);
}

if (!process.env.RATEREVEAL_PRIVATE_CORPUS_DIR?.trim()) {
  fail("required_unavailable", "Private corpus is required for this change and no exact-head Product waiver was supplied.", sensitiveFiles);
}

const canonical = runJsonCommand([
  "scripts/run-node-tool.mjs",
  "--import",
  "tsx",
  "scripts/canonical-secure-corpus-runner.ts",
]);
const gold = runJsonCommand([
  "scripts/run-node-tool.mjs",
  "--import",
  "tsx",
  "scripts/gold-contract-secure.ts",
]);

const canonicalFailed =
  canonical.status !== "configured" ||
  canonical.missingManifestCount !== 0 ||
  canonical.summary?.new_regression !== 0 ||
  canonical.summary?.unexpected_improvement !== 0;
const goldFailed = gold.status !== "verified" || (gold.failedCaseIds?.length ?? 0) > 0;

if (canonicalFailed || goldFailed) {
  fail("private_corpus_failed", "Private corpus or Gold provenance validation did not pass cleanly.", sensitiveFiles, {
    canonicalStatus: canonical.status,
    canonicalSummary: canonical.summary,
    missingManifestCount: canonical.missingManifestCount,
    goldStatus: gold.status,
    goldFailedCaseIds: gold.failedCaseIds,
  });
}

emit({
  status: "passed",
  baseSha,
  headSha: resolveCommit(headSha),
  sensitiveFiles,
  canonicalSummary: canonical.summary,
  goldVerifiedCaseCount: gold.verifiedCaseCount,
});

function isPrivateCorpusRelevant(filePath) {
  return [
    /^src\/canonical\//,
    /^src\/.*(?:parser|Parser|evidence|Evidence|report|Report)/,
    /^scripts\/(?:canonical-|gold-|evaluate-|qualify-)/,
    /^test\/canonical\//,
    /^test\/gold-contract\//,
    /^test\/fixtures\/(?:canonical|gold-contract|pdfs)\//,
    /^data\/(?:merchant-statement-foundation|qualified-benchmark|reference-rate)/,
  ].some((pattern) => pattern.test(filePath));
}

function runJsonCommand(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  if (result.status !== 0) fail("private_corpus_failed", "A secure corpus command failed without a valid passing result.");
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail("private_corpus_failed", "A secure corpus command returned non-JSON output.");
  }
}

function resolveCommit(ref) {
  return execFileSync("git", ["rev-parse", ref], { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function emit(value) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(status, reason, sensitiveFiles = [], details = {}) {
  console.error(JSON.stringify({ status, reason, sensitiveFiles, ...details }, null, 2));
  process.exit(1);
}

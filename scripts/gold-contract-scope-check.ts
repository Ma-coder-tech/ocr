import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const expectedBranch = "codex/package-h1-4-canonical-report-preview";
const expectedBaseHead = "158eb671b7cf26a59e14d31da300ecc350f5305f";
const expectedTrackedWipHash = process.env.RATEREVEAL_RA_EXPECTED_TRACKED_WIP_HASH ?? null;
const expectedUntrackedWipHash = process.env.RATEREVEAL_RA_EXPECTED_UNTRACKED_WIP_HASH ?? null;

const preexistingTrackedPaths = [
  "data/feeclear.sqlite",
  "data/feeclear.sqlite-shm",
  "data/feeclear.sqlite-wal",
  "src/canonical/aiCapabilityValidation.ts",
  "src/canonical/buildCanonicalAiCapabilities.ts",
  "src/canonical/runtimeAdapter.ts",
  "src/canonical/runtimeAiCapabilityAdapter.ts",
  "src/canonical/runtimeShadow.ts",
  "src/canonical/runtimeShadowRedaction.ts",
  "src/canonical/types.ts",
  "src/multiStatementOrchestrator.ts",
  "src/server.ts",
  "test/canonical/canonicalRuntimeShadowComparison.test.ts",
  "test/multiStatementOrchestrator.test.ts",
  "web/src/reportAdapter.ts",
];

const preexistingUntrackedPaths = [
  "src/analysisOutcome.ts",
  "src/canonical/customerReportProjection.ts",
  "src/canonical/customerReportProjectionTypes.ts",
  "src/canonical/customerReportProjectionValidation.ts",
  "src/canonical/intelligenceContracts.ts",
  "src/evaluationRunOutcomeProjection.ts",
  "src/researchEvidencePipeline.ts",
  "src/researchRetrieval.ts",
  "test/canonical/canonicalCustomerReportProjection.test.ts",
  "test/canonical/canonicalIntelligenceOutcomeContracts.test.ts",
  "test/evaluationRunOutcomeProjection.test.ts",
  "test/researchEvidencePipeline.test.ts",
  "test/researchRetrieval.test.ts",
  "web/canonical-preview.html",
  "web/src/canonical-preview/CanonicalPreviewApp.tsx",
  "web/src/canonical-preview/CanonicalReportPreview.tsx",
  "web/src/canonical-preview/canonicalPreview.css",
  "web/src/canonical-preview/canonicalPreview.test.tsx",
  "web/src/canonical-preview/canonicalPreviewFixtures.ts",
  "web/src/canonical-preview/canonicalPreviewFormatters.ts",
  "web/src/canonical-preview/canonicalPreviewProductionIsolation.test.ts",
  "web/src/canonical-preview/main.tsx",
];

const branch = git(["branch", "--show-current"]).trim();
const head = git(["rev-parse", "HEAD"]).trim();
const baseIsAncestor = head === expectedBaseHead || isAncestor(expectedBaseHead, head);
const trackedPatch = execFileSync("git", ["diff", "--binary", "--", ...preexistingTrackedPaths]);
const trackedWipHash = sha256(trackedPatch);
const untrackedLines: string[] = [];
for (const filePath of preexistingUntrackedPaths) {
  const content = await fs.readFile(path.resolve(process.cwd(), filePath));
  untrackedLines.push(`${sha256(content)}  ${filePath}\n`);
}
const untrackedWipHash = sha256(Buffer.from(untrackedLines.sort().join("")));

const changedPaths = statusPaths();
const allowedRaPath = (filePath: string) =>
  filePath === "package.json" ||
  filePath.startsWith("scripts/gold-") ||
  filePath.startsWith("test/gold-contract/") ||
  filePath.startsWith("test/fixtures/gold-contract/");
const unexpectedPaths = changedPaths.filter(
  (filePath) => !preexistingTrackedPaths.includes(filePath) && !preexistingUntrackedPaths.includes(filePath) && !allowedRaPath(filePath),
);
const committedSinceBase = head === expectedBaseHead ? [] : git(["diff", "--name-only", `${expectedBaseHead}..${head}`]).split("\n").filter(Boolean);
const unexpectedCommittedPaths = committedSinceBase.filter((filePath) => !allowedRaPath(filePath));

const productionViolations = await scanProductionIsolation();
const result = {
  status:
    branch === expectedBranch &&
    baseIsAncestor &&
    (expectedTrackedWipHash === null || trackedWipHash === expectedTrackedWipHash) &&
    (expectedUntrackedWipHash === null || untrackedWipHash === expectedUntrackedWipHash) &&
    unexpectedPaths.length === 0 &&
    unexpectedCommittedPaths.length === 0 &&
    productionViolations.length === 0
      ? "isolated_and_preserved"
      : "scope_violation",
  branch,
  head,
  expectedBaseHead,
  baseIsAncestor,
  trackedWipFingerprintCheck: expectedTrackedWipHash === null ? "not_requested" : trackedWipHash === expectedTrackedWipHash ? "preserved" : "changed",
  untrackedWipFingerprintCheck: expectedUntrackedWipHash === null ? "not_requested" : untrackedWipHash === expectedUntrackedWipHash ? "preserved" : "changed",
  unexpectedPaths,
  committedSinceBase,
  unexpectedCommittedPaths,
  productionViolations,
};

console.log(JSON.stringify(result, null, 2));
if (result.status !== "isolated_and_preserved") process.exit(1);

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function statusPaths(): string[] {
  const raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return raw
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3));
}

async function scanProductionIsolation(): Promise<string[]> {
  const files = git(["ls-files", "src/**/*.ts", "src/*.ts"])
    .split("\n")
    .filter(Boolean);
  const violations: string[] = [];
  const forbidden = [
    /gold[-_/ ]contract/i,
    /test\/fixtures\/gold/i,
    /\b(?:EL\s+NUEVO|PHILIP\s+FUTURE|XPRESS\s+FIX|JAMAICA\s+FISH|ANTHONY\s+LAVERNE|VORTAX|NXGEN)\b/i,
    /\b(?:G[1-9]|S10|S[1-9])-[A-Z0-9-]{3,}\b/,
    /\b[a-f0-9]{64}\b/i,
  ];
  for (const filePath of files) {
    const text = await fs.readFile(path.resolve(process.cwd(), filePath), "utf8");
    if (forbidden.some((pattern) => pattern.test(text))) violations.push(filePath);
  }
  return violations;
}

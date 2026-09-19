import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assessEvent, validateApproval, validateIdentity, REPOSITORY, REPOSITORY_ID, OWNER_ID } from "../scripts/private-corpus-ci-gate.mjs";
import { cleanupPackage, runnerPaths, sha256, stagePackage, validatePins, verifyPackage } from "../scripts/private-corpus-ci-preflight.mjs";
import { downloadApprovedPackage, validateCloudConfiguration, verifyOidcClaims } from "../scripts/private-corpus-ci-gcp.mjs";
import { validateResults } from "../scripts/private-corpus-ci-results.mjs";

const CASES = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);

function octal(header, offset, length, value) {
  header.write(value.toString(8).padStart(length - 1, "0") + "\0", offset, length, "ascii");
}

function tar(entries, options = {}) {
  const blocks = [];
  for (const [name, value] of entries) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    octal(header, 100, 8, 0o600);
    octal(header, 108, 8, 0);
    octal(header, 116, 8, 0);
    octal(header, 124, 12, options.size ?? bytes.length);
    octal(header, 136, 12, 0);
    header.fill(32, 148, 156);
    header[156] = options.type ?? 48;
    if (options.linkName) header.write(options.linkName, 157, 100);
    header.write("ustar\0", 257, 6);
    header.write("00", 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    octal(header, 148, 7, checksum);
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function fixture(change = () => {}) {
  const docs = Object.fromEntries(CASES.map((id) => [id, Buffer.from(`%PDF-synthetic-${id}\n`)]));
  const gold = { schema_version: "ratereveal_gold_private_manifest_v1", cases: CASES.map((case_id) => ({
    case_id, document_file: `documents/${case_id}.pdf`, sha256: sha256(docs[case_id]),
  })) };
  const canonical = { schemaVersion: "private_corpus_manifest_v1", privateCorpusCaseId: "private-fiserv-restaurant-count-001", documentFile: "documents/G4.pdf", actualValueExtractors: [] };
  const provenance = { goldBindings: CASES.map((caseId) => ({ caseId, sha256: sha256(docs[caseId]) })),
    canonicalPrivateCase: { privateCorpusCaseId: canonical.privateCorpusCaseId, sha256: sha256(docs.G4) },
    historicalG9: { sourceStatus: "source_unavailable", executionStatus: "non_source_executable" } };
  const extra = [];
  change({ docs, gold, canonical, provenance, extra });
  const manifestBytes = Buffer.from(JSON.stringify(gold));
  const canonicalBytes = Buffer.from(JSON.stringify(canonical));
  const provenanceBytes = Buffer.from(JSON.stringify(provenance));
  const entries = [
    ["gold-private-manifest.json", manifestBytes],
    ["private-fiserv-restaurant-count-001.json", canonicalBytes],
    ["product-source-provenance.json", provenanceBytes],
    ...CASES.map((id) => [`documents/${id}.pdf`, docs[id]]).filter(([, bytes]) => bytes),
    ...extra,
  ];
  const bytes = tar(entries);
  const pins = { schemaVersion: "ratereveal_private_ci_pins_v1",
    package: { version: "synthetic-v1", sha256: sha256(bytes), gcpObject: "approved/synthetic-v1.tar", gcpGeneration: "1" },
    goldManifestSha256: sha256(manifestBytes), canonicalManifestSha256: sha256(canonicalBytes),
    productProvenanceSha256: sha256(provenanceBytes),
    approvedDocuments: Object.fromEntries(CASES.map((id) => [id, sha256(Buffer.from(`%PDF-synthetic-${id}\n`))])),
    canonicalGoldCaseId: "G4", canonicalPrivateCaseId: "private-fiserv-restaurant-count-001" };
  return { bytes, pins, entries };
}

function repinPackage(sample) { sample.pins.package.sha256 = sha256(sample.bytes); return sample; }
function fails(sample, pattern) { assert.throws(() => verifyPackage(sample.bytes, sample.pins), pattern); }

test("valid synthetic package verifies exactly G1-G8", () => {
  const sample = fixture();
  assert.equal(verifyPackage(sample.bytes, sample.pins).verifiedCaseCount, 8);
});

test("trusted workflow pins every executable security tool and contains no artifact/cache path", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const workflow = await fs.readFile(path.join(root, ".github/workflows/private-corpus-trusted.yml"), "utf8");
  for (const name of ["gate", "preflight", "gcp", "results"]) {
    const digest = sha256(await fs.readFile(path.join(root, `scripts/private-corpus-ci-${name}.mjs`)));
    assert.ok(workflow.includes(digest), `${name} digest must be pinned`);
  }
  assert.ok(workflow.includes(sha256(await fs.readFile(path.join(root, "config/private-corpus-ci-pins.json")))));
  assert.ok(!/pull_request_target|workflow_run|upload-artifact|cache:\s*npm/i.test(workflow));
  const immutableBootstrap = "ref: f7a3e83371af2ae5ecd275f60c4e284e549f7277";
  assert.equal(workflow.split(immutableBootstrap).length - 1, 3);
  assert.ok(!workflow.includes("ref: main"));
  const canary = workflow.split("  synthetic_runtime_canary:")[1]?.split("\n  secure:")[0];
  assert.ok(canary);
  assert.ok(!canary.includes("id-token: write"));
  assert.ok(!canary.includes("environment:"));
  assert.ok(canary.includes("package_identity_unconfigured"));
  const productionPins = JSON.parse(await fs.readFile(path.join(root, "config/private-corpus-ci-pins.json"), "utf8"));
  assert.throws(() => validatePins(productionPins), /package_identity_unconfigured/);
  const caller = await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(caller, /private-corpus-trusted\.yml@[a-f0-9]{40}/);
  assert.ok(!caller.includes("RATEREVEAL_PRIVATE_CORPUS_WAIVER_ID"));
  const vercel = JSON.parse(await fs.readFile(path.join(root, "vercel.json"), "utf8"));
  assert.equal(vercel.git.deploymentEnabled["codex/secure-ci-corpus-provisioning"], false);
  assert.equal(vercel.git.deploymentEnabled.main, undefined);
});

test("missing real package pin fails closed", () => {
  const sample = fixture(); sample.pins.package.sha256 = null;
  assert.throws(() => validatePins(sample.pins), /package_digest_unconfigured/);
});

test("changed package digest fails before parsing", () => {
  const sample = fixture(); sample.bytes = Buffer.from(sample.bytes); sample.bytes[700] ^= 1;
  fails(sample, /package_digest_mismatch/);
});

test("changed PDF with unchanged private manifest fails independent document pin", () => {
  const sample = fixture(({ docs }) => { docs.G1 = Buffer.from("%PDF-substituted\n"); });
  fails(sample, /document_identity_mismatch/);
});

test("changed PDF plus matching private manifest cannot redefine approved source", () => {
  const sample = fixture(({ docs, gold }) => { docs.G1 = Buffer.from("%PDF-substituted\n"); gold.cases[0].sha256 = sha256(docs.G1); });
  fails(sample, /document_identity_mismatch/);
});

test("changed provenance record is rejected", () => {
  const original = fixture();
  const sample = fixture(({ provenance }) => { provenance.historicalG9.sourceStatus = "available"; });
  sample.pins.productProvenanceSha256 = original.pins.productProvenanceSha256;
  fails(sample, /source_digest_mismatch/);
});

test("even a newly pinned provenance record must cover each case once", () => {
  const sample = fixture(({ provenance }) => { provenance.goldBindings[7] = { ...provenance.goldBindings[0] }; });
  fails(sample, /product_provenance_invalid/);
});

test("missing, duplicate, unexpected and G9 Gold cases fail", () => {
  for (const mutate of [
    ({ gold }) => gold.cases.pop(),
    ({ gold }) => { gold.cases[7] = { ...gold.cases[0] }; },
    ({ gold }) => { gold.cases[7] = { case_id: "G10", document_file: "documents/G8.pdf", sha256: gold.cases[7].sha256 }; },
    ({ gold }) => { gold.cases[7] = { case_id: "G9", document_file: "documents/G8.pdf", sha256: gold.cases[7].sha256 }; },
  ]) fails(fixture(mutate), /gold_case_coverage_invalid/);
});

test("wrong canonical El Nuevo/G4 binding fails", () => {
  fails(fixture(({ canonical }) => { canonical.documentFile = "documents/G5.pdf"; }), /canonical_binding_invalid/);
});

test("unexpected file and duplicate archive entry fail", () => {
  fails(fixture(({ extra }) => extra.push(["documents/extra.pdf", "%PDF-extra"])), /archive_file_count_invalid/);
  const sample = fixture();
  sample.bytes = tar([...sample.entries.slice(0, -1), sample.entries[0]]);
  repinPackage(sample);
  fails(sample, /archive_duplicate_entry/);
});

test("missing approved document fails", () => {
  const sample = fixture();
  sample.bytes = tar(sample.entries.filter(([name]) => name !== "documents/G1.pdf"));
  repinPackage(sample);
  fails(sample, /document_identity_mismatch/);
});

test("traversal and absolute archive paths fail", () => {
  for (const name of ["../escape.pdf", "/absolute.pdf", "documents/../escape.pdf"]) {
    const sample = fixture(); sample.bytes = tar([...sample.entries.slice(0, -1), [name, sample.entries.at(-1)[1]]]);
    repinPackage(sample); fails(sample, /archive_entry_unsafe/);
  }
});

test("symlink, hardlink and special archive types fail", () => {
  for (const type of [50, 49, 51, 52, 54]) {
    const sample = fixture(); sample.bytes = tar(sample.entries, { type, linkName: "outside" });
    repinPackage(sample); fails(sample, /archive_entry_unsafe/);
  }
});

test("unsafe archive size and malformed checksum fail", () => {
  const sample = fixture(); sample.bytes = Buffer.from(sample.bytes); sample.bytes[5] ^= 1; repinPackage(sample);
  fails(sample, /archive_header_invalid/);
  const oversized = fixture(); oversized.bytes = Buffer.alloc(1024); repinPackage(oversized);
  fails(oversized, /archive_size_invalid/);
  const largeEntry = fixture(); largeEntry.bytes = tar(largeEntry.entries, { size: 128 * 1024 * 1024 + 1 }); repinPackage(largeEntry);
  fails(largeEntry, /archive_entry_unsafe/);
});

test("staging and cleanup remove corpus and archive after success", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-synthetic-ci-"));
  try {
    const sample = fixture(); const paths = runnerPaths(root); const pinsPath = path.join(root, "pins.json");
    await fs.writeFile(paths.archive, sample.bytes, { mode: 0o600 });
    await fs.writeFile(pinsPath, JSON.stringify(sample.pins));
    assert.equal((await stagePackage({ runnerTemp: root, pinsPath })).status, "verified");
    assert.equal((await fs.stat(paths.corpus)).mode & 0o777, 0o700);
    await fs.writeFile(paths.database, "synthetic-sqlite-output");
    await fs.writeFile(`${paths.database}-wal`, "synthetic-wal-output");
    await cleanupPackage(root);
    await assert.rejects(fs.stat(paths.corpus));
    await assert.rejects(fs.stat(paths.archive));
    await assert.rejects(fs.stat(paths.database));
    await assert.rejects(fs.stat(`${paths.database}-wal`));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("cleanup after failed extraction removes all runner-local material", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-synthetic-ci-"));
  try {
    const sample = fixture(); const paths = runnerPaths(root); const pinsPath = path.join(root, "pins.json");
    await fs.writeFile(paths.archive, sample.bytes, { mode: 0o600 });
    await fs.writeFile(pinsPath, JSON.stringify(sample.pins));
    await fs.mkdir(paths.corpus);
    await assert.rejects(stagePackage({ runnerTemp: root, pinsPath }));
    await assert.rejects(fs.stat(paths.corpus));
    await assert.rejects(fs.stat(paths.archive));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("missing corpus package fails closed and leaves no material", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-synthetic-ci-"));
  try {
    const sample = fixture(); const paths = runnerPaths(root); const pinsPath = path.join(root, "pins.json");
    await fs.writeFile(pinsPath, JSON.stringify(sample.pins));
    await assert.rejects(stagePackage({ runnerTemp: root, pinsPath }));
    await cleanupPackage(root);
    await assert.rejects(fs.stat(paths.corpus));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("CLI failure output never prints runner-local corpus paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-synthetic-ci-"));
  try {
    const sample = fixture(); const pinsPath = path.join(root, "pins.json");
    await fs.writeFile(pinsPath, JSON.stringify(sample.pins));
    const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, "../scripts/private-corpus-ci-preflight.mjs"), "verify", pinsPath], {
      env: { ...process.env, RUNNER_TEMP: root }, encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.ok(!result.stderr.includes(root));
    assert.equal(JSON.parse(result.stderr).code, "preflight_failed");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

function context() {
  const repository = { id: REPOSITORY_ID, owner: { id: OWNER_ID } };
  const pr = { number: 7, state: "open", head: { sha: HEAD, repo: repository }, base: { sha: BASE, ref: "main", repo: repository } };
  return { repository: REPOSITORY, repositoryId: REPOSITORY_ID, ownerId: OWNER_ID,
    workflowRef: `${REPOSITORY}/.github/workflows/ci.yml@refs/pull/7/merge`,
    eventName: "pull_request", event: { repository, pull_request: pr } };
}

test("exact-head same-repository approval succeeds", () => {
  const c = context(); const result = assessEvent(c, c.event.pull_request, ["src/canonical/facts.ts"]);
  assert.equal(result.required, true);
  assert.equal(validateApproval(result, { repositoryId: REPOSITORY_ID, eventName: "pull_request", headSha: HEAD, baseSha: BASE, packageVersion: "v1" }), result);
});

test("fork, unapproved same-repository PR and stale head/base fail", () => {
  const fork = context(); fork.event.pull_request.head.repo = { id: 9 };
  assert.throws(() => assessEvent(fork, fork.event.pull_request, ["src/canonical/facts.ts"]), /fork_or_pr_denied/);
  const c = context(); const result = assessEvent(c, c.event.pull_request, ["src/canonical/facts.ts"]);
  assert.throws(() => validateApproval(result, null), /exact_sha_not_approved/);
  assert.throws(() => validateApproval(result, { repositoryId: REPOSITORY_ID, eventName: "pull_request", headSha: "c".repeat(40), baseSha: BASE, packageVersion: "v1" }), /exact_sha_not_approved/);
  assert.throws(() => assessEvent(c, { ...c.event.pull_request, base: { ...c.event.pull_request.base, sha: "c".repeat(40) } }, ["src/canonical/facts.ts"]), /stale_or_invalid_pr/);
});

test("incorrect repository and caller workflow identity fail", () => {
  const c = context(); c.repositoryId = 9;
  assert.throws(() => validateIdentity(c), /repository_identity_denied/);
  const d = context(); d.workflowRef = `${REPOSITORY}/.github/workflows/attacker.yml@refs/pull/7/merge`;
  assert.throws(() => validateIdentity(d), /caller_workflow_denied/);
});

test("denied OIDC/cloud configuration and mismatched called workflow fail", () => {
  const sample = fixture();
  assert.throws(() => validateCloudConfiguration({}, sample.pins), /package_version_not_approved/);
  assert.throws(() => validateCloudConfiguration({ CI_APPROVED_PACKAGE_VERSION: "synthetic-v1" }, sample.pins), /oidc_provider_unconfigured/);
  const env = { RATEREVEAL_GCP_WIF_AUDIENCE: "//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/pool/providers/provider",
    RATEREVEAL_GCP_BUCKET: "approved-bucket", CI_TRUSTED_WORKFLOW_SHA: "c".repeat(40), CI_APPROVED_PACKAGE_VERSION: "synthetic-v1",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/token", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic" };
  assert.equal(validateCloudConfiguration(env, sample.pins), sample.pins);
  assert.throws(() => verifyOidcClaims({ repository: REPOSITORY, repository_id: REPOSITORY_ID,
    repository_owner_id: OWNER_ID, job_workflow_ref: "attacker-workflow", job_workflow_sha: env.CI_TRUSTED_WORKFLOW_SHA,
    sub: `repo:${REPOSITORY}:environment:ratereveal-private-corpus`, event_name: "pull_request", aud: env.RATEREVEAL_GCP_WIF_AUDIENCE }, env), /oidc_identity_denied/);
});

test("denied OIDC and cloud exchange fail without leaving an archive", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-synthetic-ci-"));
  const originalFetch = globalThis.fetch;
  try {
    const sample = fixture(); const pinsPath = path.join(root, "pins.json");
    await fs.writeFile(pinsPath, JSON.stringify(sample.pins));
    const env = { RUNNER_TEMP: root, CI_APPROVED_PACKAGE_VERSION: "synthetic-v1",
      RATEREVEAL_GCP_WIF_AUDIENCE: "//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/pool/providers/provider",
      RATEREVEAL_GCP_BUCKET: "approved-bucket", CI_TRUSTED_WORKFLOW_SHA: "c".repeat(40),
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic" };
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(downloadApprovedPackage({ env, pinsPath }), /oidc_unavailable/);
    const claims = { repository: REPOSITORY, repository_id: REPOSITORY_ID, repository_owner_id: OWNER_ID,
      job_workflow_ref: `${REPOSITORY}/.github/workflows/private-corpus-trusted.yml@${env.CI_TRUSTED_WORKFLOW_SHA}`,
      job_workflow_sha: env.CI_TRUSTED_WORKFLOW_SHA, sub: `repo:${REPOSITORY}:environment:ratereveal-private-corpus`,
      event_name: "pull_request", aud: env.RATEREVEAL_GCP_WIF_AUDIENCE };
    const jwt = `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
    globalThis.fetch = async (url) => String(url).includes("sts.googleapis.com") ? { ok: false } : { ok: true, json: async () => ({ value: jwt }) };
    await assert.rejects(downloadApprovedPackage({ env, pinsPath }), /cloud_access_denied/);
    await assert.rejects(fs.stat(runnerPaths(root).archive));
  } finally { globalThis.fetch = originalFetch; await fs.rm(root, { recursive: true, force: true }); }
});

test("validator failure and policy waiver/non-applicability remain failures", () => {
  const canonical = { status: "configured", missingManifestCount: 0, summary: { new_regression: 0, unexpected_improvement: 0 } };
  const gold = { status: "verified", verifiedCaseCount: 8, failedCaseIds: [] };
  const policy = { status: "passed", headSha: HEAD, goldVerifiedCaseCount: 8 };
  assert.equal(validateResults(canonical, gold, policy, HEAD).status, "passed");
  assert.throws(() => validateResults({ ...canonical, status: "failed" }, gold, policy, HEAD), /canonical_secure_failed/);
  assert.throws(() => validateResults(canonical, { ...gold, failedCaseIds: ["G1"] }, policy, HEAD), /gold_secure_failed/);
  for (const status of ["waived_by_product", "not_applicable", "failed"]) {
    assert.throws(() => validateResults(canonical, gold, { ...policy, status }, HEAD), /private_corpus_policy_failed/);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ATTESTATION, attestWithEvidence, verifyAttestationEvidence } from "../scripts/private-corpus-merge-attest.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const OTHER = "c".repeat(40);
const APP_ID = 987654;
const CALLER = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const steps = [
  "Verify independently pinned trusted security tools and pins",
  "Recheck live PR and exact Product approval",
  "Verify checked-out HEAD",
  "Recheck approval immediately before corpus access",
  "Verify package and independently pinned source identity before extraction",
  "Run exact-head canonical, Gold and private-corpus policy validators",
  "Reject a PR update during validation",
  "Remove restricted runner-local material",
].map((name) => ({ name, status: "completed", conclusion: "success" }));

function fixture(required = true) {
  const pr = {
    number: 95, state: "open", draft: true,
    head: { sha: HEAD, ref: "codex/secure-ci-corpus-provisioning", repo: { id: ATTESTATION.repositoryId } },
    base: { sha: BASE, ref: "main", repo: { id: ATTESTATION.repositoryId } },
  };
  const run = {
    id: 35466247685, repository: { id: ATTESTATION.repositoryId },
    workflow_id: ATTESTATION.workflowId, path: ATTESTATION.workflowPath,
    event: "pull_request", head_sha: HEAD, head_branch: pr.head.ref,
    status: "completed", conclusion: "success", run_attempt: 1,
    pull_requests: [{ number: 95, head: structuredClone(pr.head), base: structuredClone(pr.base) }],
    referenced_workflows: [{ path: ATTESTATION.trustedWorkflowPath, sha: ATTESTATION.trustedWorkflowSha }],
  };
  const names = [
    "private-corpus-policy / classify",
    "private-corpus-policy / secure",
    "private-corpus-policy / private-corpus-policy",
    "private-corpus-policy / synthetic-runtime-canary",
  ];
  const jobs = names.map((name, index) => ({
    id: 100 + index, name, run_id: run.id, head_sha: HEAD, status: "completed",
    conclusion: index === 3 ? "skipped" : "success",
    steps: index === 1 ? structuredClone(steps) : [],
  }));
  if (!required) jobs[1].conclusion = "skipped";
  return { pr, files: [required ? "src/canonical/financial-facts.ts" : "docs/security/attestor.md"],
    callerWorkflow: CALLER, run, jobs };
}

function rejected(name, mutate, code) {
  test(name, () => {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => verifyAttestationEvidence(evidence, 95), { message: code });
  });
}

test("exact-head required secure validation publishes only the dedicated App check", async () => {
  const calls = [];
  const result = await attestWithEvidence(fixture(), 95, async (check) => {
    calls.push(check);
    return { ...check, id: 77, app: { id: APP_ID } };
  }, APP_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, ATTESTATION.checkName);
  assert.equal(calls[0].head_sha, HEAD);
  assert.equal(calls[0].conclusion, "success");
  assert.equal(result.appId, APP_ID);
  assert.equal(result.required, true);
});

test("correct non-applicability requires an independently classified irrelevant change", () => {
  assert.equal(verifyAttestationEvidence(fixture(false), 95).required, false);
});

rejected("wrong SHA", (e) => { e.run.head_sha = OTHER; }, "workflow_run_identity_denied");
rejected("stale PR head", (e) => { e.pr.head.sha = OTHER; }, "workflow_run_identity_denied");
rejected("wrong repository", (e) => { e.run.repository.id = 1; }, "workflow_run_identity_denied");
rejected("wrong PR repository", (e) => { e.pr.head.repo.id = 1; }, "pr_identity_denied");
rejected("wrong caller workflow bytes", (e) => { e.callerWorkflow += "\n# injected job\n"; }, "caller_workflow_unapproved");
rejected("wrong workflow ID", (e) => { e.run.workflow_id++; }, "workflow_run_identity_denied");
rejected("wrong workflow path", (e) => { e.run.path = ".github/workflows/fake.yml"; }, "workflow_run_identity_denied");
rejected("wrong immutable trusted workflow SHA", (e) => { e.run.referenced_workflows[0].sha = OTHER; }, "trusted_workflow_version_denied");
rejected("wrong event", (e) => { e.run.event = "workflow_dispatch"; }, "workflow_run_identity_denied");
rejected("wrong PR/run association", (e) => { e.run.pull_requests[0].number = 96; }, "workflow_run_identity_denied");
rejected("wrong base SHA", (e) => { e.run.pull_requests[0].base.sha = OTHER; }, "workflow_run_identity_denied");
rejected("incomplete workflow run", (e) => { e.run.status = "in_progress"; }, "workflow_run_identity_denied");
rejected("failed workflow run", (e) => { e.run.conclusion = "failure"; }, "workflow_run_identity_denied");
rejected("missing trusted job", (e) => { e.jobs.pop(); }, "trusted_job_missing_or_duplicate");
rejected("same-named PR job duplicates the trusted context", (e) => { e.jobs.push({ ...e.jobs[1], id: 999 }); }, "trusted_job_missing_or_duplicate");
rejected("forged caller-provided run ID cannot replace job run ID", (e) => { e.jobs[1].run_id++; }, "workflow_jobs_invalid");
rejected("failed secure job", (e) => { e.jobs[1].conclusion = "failure"; }, "secure_validation_required");
rejected("skipped secure validation when required", (e) => { e.jobs[1].conclusion = "skipped"; }, "secure_validation_required");
rejected("not_applicable substitution when required", (e) => { e.jobs[1].conclusion = "skipped"; e.jobs[2].conclusion = "success"; }, "secure_validation_required");
rejected("waiver outcome", (e) => { e.jobs[1].conclusion = "neutral"; }, "secure_validation_required");
rejected("failed validation step inside nominally green job", (e) => { e.jobs[1].steps[5].conclusion = "failure"; }, "secure_validation_step_incomplete");
rejected("not_applicable with relevant changed file", (e) => { e.jobs[1].conclusion = "skipped"; }, "secure_validation_required");
rejected("secure success cannot replace non-applicable outcome", (e) => { e.files = ["docs/security/attestor.md"]; }, "not_applicable_policy_mismatch");
rejected("lookalike generic Actions check cannot substitute for the trusted run", (e) => {
  e.run.conclusion = "failure";
  e.check_runs = [{ name: ATTESTATION.checkName, conclusion: "success", app: { id: 15368 } }];
}, "workflow_run_identity_denied");
rejected("previously valid evidence cannot replay onto a new head SHA", (e) => {
  e.pr.head.sha = OTHER;
  e.run.pull_requests[0].head.sha = OTHER;
}, "workflow_run_identity_denied");

test("generic GitHub Actions publisher cannot claim the expected App identity", async () => {
  await assert.rejects(() => attestWithEvidence(fixture(), 95,
    async (check) => ({ ...check, id: 88, app: { id: 15368 } }), APP_ID),
  { message: "published_check_mismatch" });
});

test("no check is published after evidence refusal", async () => {
  const e = fixture();
  e.jobs[1].conclusion = "skipped";
  let calls = 0;
  await assert.rejects(() => attestWithEvidence(e, 95, async () => { calls++; }, APP_ID),
    { message: "secure_validation_required" });
  assert.equal(calls, 0);
});

import { createHash, createSign } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPrivateCorpusRelevant } from "./private-corpus-ci-gate.mjs";

// Operator-run only. Never execute this module with an App key in PR-controlled Actions.
export const ATTESTATION = Object.freeze({
  repository: "Ma-coder-tech/ocr",
  repositoryId: 1176226912,
  workflowId: 360499113,
  workflowPath: ".github/workflows/ci.yml",
  trustedWorkflowPath: "Ma-coder-tech/ocr/.github/workflows/private-corpus-trusted.yml@1fabf9af3b27cbd3f3cc501bd26baa7a7852b3a0",
  trustedWorkflowSha: "1fabf9af3b27cbd3f3cc501bd26baa7a7852b3a0",
  trustedToolsSha: "f7a3e83371af2ae5ecd275f60c4e284e549f7277",
  // The complete approved caller file, not a PR-supplied job or workflow name.
  callerSha256: "5c29d1a51db86450f0578eb212d53942e623cdbbd77b182568a723c29eaa491b",
  checkName: "ratereveal-private-corpus-attested",
  appSlug: "ratereveal-attestor-macodertech",
});

const SHA = /^[a-f0-9]{40}$/;
const JOB = Object.freeze({
  classify: "private-corpus-policy / classify",
  secure: "private-corpus-policy / secure",
  result: "private-corpus-policy / private-corpus-policy",
  canary: "private-corpus-policy / synthetic-runtime-canary",
});
const SECURE_STEPS = [
  "Verify independently pinned trusted security tools and pins",
  "Recheck live PR and exact Product approval",
  "Verify checked-out HEAD",
  "Recheck approval immediately before corpus access",
  "Verify package and independently pinned source identity before extraction",
  "Run exact-head canonical, Gold and private-corpus policy validators",
  "Reject a PR update during validation",
  "Remove restricted runner-local material",
];

function deny(code) { throw new Error(code); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function validId(value) { return Number.isSafeInteger(value) && value > 0; }
function jobResult(job, expected, run) {
  if (!job || !validId(job.id) || job.name !== expected || job.run_id !== run.id ||
      job.head_sha !== run.head_sha || job.status !== "completed") deny("trusted_job_incomplete_or_wrong_run");
  return job.conclusion;
}

export function verifyAttestationEvidence({ pr, files, callerWorkflow, run, jobs }, expectedPr) {
  if (!validId(expectedPr) || pr?.number !== expectedPr || pr.state !== "open" ||
      pr.base?.ref !== "main" || pr.head?.repo?.id !== ATTESTATION.repositoryId ||
      pr.base?.repo?.id !== ATTESTATION.repositoryId || !SHA.test(pr.head?.sha ?? "") ||
      !SHA.test(pr.base?.sha ?? "")) deny("pr_identity_denied");
  if (!Array.isArray(files) || files.length > 3000 || files.some((name) => typeof name !== "string" || !name || name.includes("\n"))) {
    deny("change_list_invalid");
  }
  if (typeof callerWorkflow !== "string" || digest(callerWorkflow) !== ATTESTATION.callerSha256) {
    deny("caller_workflow_unapproved");
  }
  const required = files.some(isPrivateCorpusRelevant);
  const runPr = run?.pull_requests?.find((item) => item.number === expectedPr);
  if (!validId(run?.id) || run.repository?.id !== ATTESTATION.repositoryId ||
      run.workflow_id !== ATTESTATION.workflowId || run.path !== ATTESTATION.workflowPath ||
      run.event !== "pull_request" || run.head_sha !== pr.head.sha ||
      run.head_branch !== pr.head.ref || run.status !== "completed" || run.conclusion !== "success" ||
      !validId(run.run_attempt) || runPr?.head?.sha !== pr.head.sha ||
      runPr?.base?.sha !== pr.base.sha || runPr?.head?.repo?.id !== ATTESTATION.repositoryId ||
      runPr?.base?.repo?.id !== ATTESTATION.repositoryId) deny("workflow_run_identity_denied");
  const refs = run.referenced_workflows;
  if (!Array.isArray(refs) || refs.filter((item) => item.path === ATTESTATION.trustedWorkflowPath &&
      item.sha === ATTESTATION.trustedWorkflowSha).length !== 1 ||
      refs.some((item) => item.path?.includes("/.github/workflows/private-corpus-trusted.yml@") &&
      (item.path !== ATTESTATION.trustedWorkflowPath || item.sha !== ATTESTATION.trustedWorkflowSha))) {
    deny("trusted_workflow_version_denied");
  }
  if (!Array.isArray(jobs) || jobs.length > 100 || jobs.some((job) => job.run_id !== run.id || job.head_sha !== run.head_sha)) {
    deny("workflow_jobs_invalid");
  }
  const named = {};
  for (const name of Object.values(JOB)) {
    const matches = jobs.filter((item) => item.name === name);
    if (matches.length !== 1) deny("trusted_job_missing_or_duplicate");
    named[name] = matches[0];
  }
  if (jobResult(named[JOB.classify], JOB.classify, run) !== "success" ||
      jobResult(named[JOB.result], JOB.result, run) !== "success") deny("trusted_policy_incomplete");
  const secure = jobResult(named[JOB.secure], JOB.secure, run);
  const canary = jobResult(named[JOB.canary], JOB.canary, run);
  if (required) {
    if (secure !== "success" || canary !== "skipped") deny("secure_validation_required");
    for (const name of SECURE_STEPS) {
      const steps = named[JOB.secure].steps?.filter((step) => step.name === name);
      if (steps?.length !== 1 || steps[0].status !== "completed" || steps[0].conclusion !== "success") {
        deny("secure_validation_step_incomplete");
      }
    }
  } else if (secure !== "skipped" || (canary !== "success" && canary !== "skipped")) {
    deny("not_applicable_policy_mismatch");
  }
  // The approved caller and immutable called workflow have no waiver branch. A
  // caller-provided 'waiver' or 'not_applicable' cannot replace the secure job.
  return Object.freeze({ pr: expectedPr, headSha: pr.head.sha, baseSha: pr.base.sha,
    runId: run.id, runAttempt: run.run_attempt, required });
}

export async function attestWithEvidence(evidence, expectedPr, publish, expectedAppId) {
  if (!validId(expectedAppId)) deny("app_identity_denied");
  const verified = verifyAttestationEvidence(evidence, expectedPr);
  const result = await publish({
    name: ATTESTATION.checkName,
    head_sha: verified.headSha,
    status: "completed",
    conclusion: "success",
    details_url: `https://github.com/${ATTESTATION.repository}/actions/runs/${verified.runId}/attempts/${verified.runAttempt}`,
    output: {
      title: "Trusted private-corpus policy attested",
      summary: `PR #${verified.pr}; run ${verified.runId} attempt ${verified.runAttempt}; trusted workflow ${ATTESTATION.trustedWorkflowSha}; required=${verified.required}. No corpus data is included.`,
    },
  });
  if (result?.name !== ATTESTATION.checkName || result?.head_sha !== verified.headSha ||
      result?.status !== "completed" || result?.conclusion !== "success" ||
      result?.app?.id !== expectedAppId) deny("published_check_mismatch");
  return { ...verified, checkId: result.id, appId: result.app?.id };
}

async function api(route, token, method = "GET", body) {
  const response = await fetch(`https://api.github.com${route}`, {
    method, redirect: "error",
    headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-github-api-version": "2022-11-28", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) deny("github_api_unavailable");
  return response.json();
}

function appJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat: now - 60, exp: now + 480, iss: String(appId) })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

async function installationToken(env) {
  const appId = Number(env.RATEREVEAL_ATTESTOR_APP_ID);
  const keyPath = env.RATEREVEAL_ATTESTOR_PRIVATE_KEY_FILE;
  if (!validId(appId) || !keyPath || !path.isAbsolute(keyPath)) deny("app_credential_unconfigured");
  const keyStat = await fs.lstat(keyPath);
  if (!keyStat.isFile() || keyStat.isSymbolicLink() || (keyStat.mode & 0o077) !== 0) {
    deny("app_private_key_permissions_denied");
  }
  const privateKey = await fs.readFile(keyPath, "utf8");
  const jwt = appJwt(appId, privateKey);
  const app = await api("/app", jwt);
  if (app.id !== appId || app.slug !== ATTESTATION.appSlug) deny("app_identity_denied");
  const installation = await api(`/repos/${ATTESTATION.repository}/installation`, jwt);
  if (!validId(installation.id) || installation.app_id !== appId) deny("app_installation_denied");
  const minted = await api(`/app/installations/${installation.id}/access_tokens`, jwt, "POST", {
    repository_ids: [ATTESTATION.repositoryId],
    permissions: { actions: "read", checks: "write", contents: "read", pull_requests: "read" },
  });
  if (typeof minted.token !== "string" || !minted.token || minted.permissions?.checks !== "write") {
    deny("app_token_denied");
  }
  return { token: minted.token, appId };
}

async function filesForPr(number, token) {
  const files = [];
  for (let page = 1; page <= 31; page++) {
    const batch = await api(`/repos/${ATTESTATION.repository}/pulls/${number}/files?per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) deny("change_list_invalid");
    for (const item of batch) files.push(item.filename, ...(item.previous_filename ? [item.previous_filename] : []));
    if (files.length > 3000) deny("change_list_invalid");
    if (batch.length < 100) return files;
  }
  deny("change_list_invalid");
}

async function liveEvidence(number, token) {
  const pr = await api(`/repos/${ATTESTATION.repository}/pulls/${number}`, token);
  if (!SHA.test(pr.head?.sha ?? "")) deny("pr_identity_denied");
  const [files, contents, listed] = await Promise.all([
    filesForPr(number, token),
    api(`/repos/${ATTESTATION.repository}/contents/${ATTESTATION.workflowPath}?ref=${pr.head.sha}`, token),
    api(`/repos/${ATTESTATION.repository}/actions/workflows/${ATTESTATION.workflowId}/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`, token),
  ]);
  if (contents.encoding !== "base64" || typeof contents.content !== "string" ||
      !Array.isArray(listed.workflow_runs) || listed.total_count > 100) deny("workflow_evidence_unavailable");
  const candidates = listed.workflow_runs.filter((item) => item.pull_requests?.some((p) => p.number === number));
  if (!candidates.length) deny("workflow_evidence_unavailable");
  candidates.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id - a.id);
  const run = await api(`/repos/${ATTESTATION.repository}/actions/runs/${candidates[0].id}`, token);
  const allJobs = await api(`/repos/${ATTESTATION.repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`, token);
  if (!Array.isArray(allJobs.jobs) || allJobs.total_count > 100 || allJobs.jobs.length !== allJobs.total_count) {
    deny("workflow_jobs_invalid");
  }
  return { pr, files, callerWorkflow: Buffer.from(contents.content, "base64").toString("utf8"), run, jobs: allJobs.jobs };
}

export async function attestLivePr(number, env = process.env) {
  if (!validId(number)) deny("pr_number_invalid");
  const { token, appId } = await installationToken(env);
  const evidence = await liveEvidence(number, token);
  const verified = verifyAttestationEvidence(evidence, number);
  const current = await api(`/repos/${ATTESTATION.repository}/pulls/${number}`, token);
  if (current.state !== "open" || current.head?.sha !== verified.headSha ||
      current.base?.sha !== verified.baseSha) deny("pr_changed_before_publication");
  const result = await attestWithEvidence(evidence, number,
    (check) => api(`/repos/${ATTESTATION.repository}/check-runs`, token, "POST", check), appId);
  return result;
}

export async function inspectPublicPr(number) {
  if (!validId(number)) deny("pr_number_invalid");
  return verifyAttestationEvidence(await liveEvidence(number), number);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inspect = process.argv[2] === "--inspect-public";
  const number = Number(process.argv[inspect ? 3 : 2]);
  try {
    const result = inspect ? await inspectPublicPr(number) : await attestLivePr(number);
    console.log(JSON.stringify({ status: inspect ? "verified_without_app_check" : "attested", ...result }));
  }
  catch (error) {
    const code = error instanceof Error && /^[a-z][a-z0-9_]{0,60}$/.test(error.message) ? error.message : "attestation_denied";
    console.error(JSON.stringify({ status: "denied", code }));
    process.exitCode = 1;
  }
}

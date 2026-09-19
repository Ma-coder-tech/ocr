import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY = "Ma-coder-tech/ocr";
export const REPOSITORY_ID = 1176226912;
export const OWNER_ID = 198274179;
const SHA = /^[a-f0-9]{40}$/;

function reject(code) { throw new Error(code); }

export function isPrivateCorpusRelevant(filePath) {
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

export function validateIdentity(context) {
  if (context.repository !== REPOSITORY || Number(context.repositoryId) !== REPOSITORY_ID ||
      Number(context.ownerId) !== OWNER_ID || context.event?.repository?.id !== REPOSITORY_ID ||
      context.event?.repository?.owner?.id !== OWNER_ID) reject("repository_identity_denied");
  if (!context.workflowRef?.startsWith(`${REPOSITORY}/.github/workflows/ci.yml@`)) reject("caller_workflow_denied");
  if (context.eventName !== "pull_request" && context.eventName !== "push") reject("event_denied");
}

export function assessEvent(context, live, changedFiles) {
  validateIdentity(context);
  const event = context.event;
  let headSha;
  let baseSha;
  if (context.eventName === "pull_request") {
    const pr = event.pull_request;
    if (!Number.isSafeInteger(pr?.number) || pr.number < 1 || pr.base?.ref !== "main" ||
        pr.head?.repo?.id !== REPOSITORY_ID || pr.base?.repo?.id !== REPOSITORY_ID) reject("fork_or_pr_denied");
    headSha = pr.head.sha;
    baseSha = pr.base.sha;
    if (!SHA.test(headSha ?? "") || !SHA.test(baseSha ?? "") || live?.state !== "open" ||
        live.head?.sha !== headSha || live.base?.sha !== baseSha || live.base?.ref !== "main" ||
        live.head?.repo?.id !== REPOSITORY_ID || live.base?.repo?.id !== REPOSITORY_ID) reject("stale_or_invalid_pr");
  } else {
    if (context.ref !== "refs/heads/main" || event.ref !== "refs/heads/main" || event.deleted ||
        event.forced || !SHA.test(event.before ?? "") || !SHA.test(event.after ?? "") ||
        event.after !== context.sha || live?.status !== "ahead") reject("push_identity_denied");
    headSha = event.after;
    baseSha = event.before;
  }
  if (!Array.isArray(changedFiles) || changedFiles.length > 3000 ||
      changedFiles.some((file) => typeof file !== "string" || !file || file.includes("\n"))) reject("change_list_invalid");
  const required = changedFiles.some(isPrivateCorpusRelevant);
  return { required, headSha, baseSha, eventName: context.eventName };
}

export function validateApproval(assessment, approval) {
  if (!assessment.required) reject("secure_validation_not_required");
  if (!approval || approval.repositoryId !== REPOSITORY_ID || approval.eventName !== assessment.eventName ||
      approval.headSha !== assessment.headSha || approval.baseSha !== assessment.baseSha ||
      !/^[-a-zA-Z0-9_.]+$/.test(approval.packageVersion ?? "")) reject("exact_sha_not_approved");
  return assessment;
}

async function githubApi(route, token) {
  if (!token) reject("github_api_unavailable");
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${route}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    redirect: "error",
  });
  if (!response.ok) reject("github_api_unavailable");
  return response.json();
}

async function currentEventEvidence(context, token) {
  if (context.eventName === "pull_request") {
    const number = context.event.pull_request?.number;
    if (!Number.isSafeInteger(number) || number < 1) reject("pr_number_invalid");
    const live = await githubApi(`pulls/${number}`, token);
    const files = [];
    for (let page = 1; page <= 31; page++) {
      const batch = await githubApi(`pulls/${number}/files?per_page=100&page=${page}`, token);
      if (!Array.isArray(batch)) reject("change_list_invalid");
      for (const item of batch) {
        files.push(item.filename);
        if (item.previous_filename) files.push(item.previous_filename);
      }
      if (batch.length < 100) return { live, files };
    }
    reject("change_list_invalid");
  }
  const { before, after } = context.event;
  if (!SHA.test(before ?? "") || !SHA.test(after ?? "")) reject("push_identity_denied");
  const live = await githubApi(`compare/${before}...${after}`, token);
  if (live.total_commits > 250 || !Array.isArray(live.files) || live.files.length >= 300) reject("change_list_invalid");
  const files = live.files.flatMap((item) => item.previous_filename ? [item.filename, item.previous_filename] : [item.filename]);
  return { live, files };
}

export async function runGate({ mode, env = process.env }) {
  const event = JSON.parse(await fs.readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const context = {
    event,
    eventName: env.CI_EVENT_NAME,
    repository: env.CI_REPOSITORY,
    repositoryId: env.CI_REPOSITORY_ID,
    ownerId: env.CI_OWNER_ID,
    workflowRef: env.GITHUB_WORKFLOW_REF,
    ref: env.CI_REF,
    sha: env.CI_SHA,
  };
  validateIdentity(context);
  const { live, files } = await currentEventEvidence(context, env.GITHUB_TOKEN);
  const assessment = assessEvent(context, live, files);
  if (assessment.required) {
    let approval;
    try { approval = JSON.parse(env.RATEREVEAL_PRIVATE_CI_APPROVAL ?? ""); } catch { reject("exact_sha_not_approved"); }
    validateApproval(assessment, approval);
  } else if (mode === "authorize") reject("secure_validation_not_required");
  if (mode !== "classify" && mode !== "authorize") reject("gate_mode_invalid");
  if (mode === "authorize" && (env.CI_CLASSIFIED_HEAD_SHA !== assessment.headSha ||
      env.CI_CLASSIFIED_PACKAGE_VERSION !== JSON.parse(env.RATEREVEAL_PRIVATE_CI_APPROVAL).packageVersion)) {
    reject("approval_changed_after_classification");
  }
  if (env.GITHUB_OUTPUT) {
    await fs.appendFile(env.GITHUB_OUTPUT, `required=${assessment.required}\nhead_sha=${assessment.headSha}\nbase_sha=${assessment.baseSha}\npackage_version=${assessment.required ? JSON.parse(env.RATEREVEAL_PRIVATE_CI_APPROVAL).packageVersion : ""}\n`);
  }
  return { status: assessment.required ? "authorized" : "not_applicable", required: assessment.required };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runGate({ mode: process.argv[2] }))); }
  catch (error) {
    const code = error instanceof Error && /^[a-z][a-z0-9_]{0,60}$/.test(error.message) ? error.message : "gate_failed";
    console.error(JSON.stringify({ status: "denied", code }));
    process.exitCode = 1;
  }
}

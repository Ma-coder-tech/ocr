import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function reject(code) { throw new Error(code); }

export function validateResults(canonical, gold, policy, expectedHeadSha) {
  if (canonical?.status !== "configured" || canonical?.missingManifestCount !== 0 ||
      canonical?.summary?.new_regression !== 0 || canonical?.summary?.unexpected_improvement !== 0) {
    reject("canonical_secure_failed");
  }
  if (gold?.status !== "verified" || gold?.verifiedCaseCount !== 8 || !Array.isArray(gold?.failedCaseIds) || gold.failedCaseIds.length) {
    reject("gold_secure_failed");
  }
  if (policy?.status !== "passed" || policy?.headSha !== expectedHeadSha || policy?.goldVerifiedCaseCount !== 8) {
    reject("private_corpus_policy_failed");
  }
  return { status: "passed", goldVerifiedCaseCount: 8 };
}

function runJson(cwd, scriptName, env) {
  const result = spawnSync(process.execPath, ["scripts/run-node-tool.mjs", "--import", "tsx", scriptName], {
    cwd, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60 * 1000,
  });
  if (result.status !== 0 || result.error) reject("secure_validator_failed");
  try { return JSON.parse(result.stdout); } catch { reject("secure_validator_output_invalid"); }
}

export function runSecureValidation({ cwd, env = process.env }) {
  if (!/^[a-f0-9]{40}$/.test(env.RATEREVEAL_POLICY_BASE_SHA ?? "") ||
      !/^[a-f0-9]{40}$/.test(env.RATEREVEAL_POLICY_HEAD_SHA ?? "") ||
      !env.RATEREVEAL_PRIVATE_CORPUS_DIR ||
      env.RATEREVEAL_PRIVATE_CORPUS_WAIVER_ID || env.RATEREVEAL_PRIVATE_CORPUS_WAIVER_SHA) reject("validation_environment_invalid");
  const canonical = runJson(cwd, "scripts/canonical-secure-corpus-runner.ts", env);
  const gold = runJson(cwd, "scripts/gold-contract-secure.ts", env);
  const policyResult = spawnSync(process.execPath, ["scripts/check-private-corpus-policy.mjs"], {
    cwd, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 15 * 60 * 1000,
  });
  if (policyResult.status !== 0 || policyResult.error) reject("private_corpus_policy_failed");
  let policy;
  try { policy = JSON.parse(policyResult.stdout); } catch { reject("private_corpus_policy_output_invalid"); }
  return validateResults(canonical, gold, policy, env.RATEREVEAL_POLICY_HEAD_SHA);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runSecureValidation({ cwd: process.argv[2] }))); }
  catch (error) {
    console.error(JSON.stringify({ status: "failed", code: error instanceof Error ? error.message : "unknown_failure" }));
    process.exitCode = 1;
  }
}

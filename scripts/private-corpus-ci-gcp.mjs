import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { REPOSITORY, REPOSITORY_ID, OWNER_ID } from "./private-corpus-ci-gate.mjs";
import { runnerPaths, validatePins } from "./private-corpus-ci-preflight.mjs";

function reject(code) { throw new Error(code); }

export function validateCloudConfiguration(env, pins) {
  validatePins(pins);
  if (pins.package.version !== env.CI_APPROVED_PACKAGE_VERSION) reject("package_version_not_approved");
  if (!/^\/\/iam\.googleapis\.com\/projects\/[0-9]+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(env.RATEREVEAL_GCP_WIF_AUDIENCE ?? "")) {
    reject("oidc_provider_unconfigured");
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,221}$/.test(env.RATEREVEAL_GCP_BUCKET ?? "")) reject("storage_bucket_unconfigured");
  if (!/^[a-f0-9]{40}$/.test(env.CI_TRUSTED_WORKFLOW_SHA ?? "")) reject("trusted_workflow_pin_missing");
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) reject("oidc_unavailable");
  return pins;
}

export function verifyOidcClaims(claims, env) {
  const expectedRef = `${REPOSITORY}/.github/workflows/private-corpus-trusted.yml@${env.CI_TRUSTED_WORKFLOW_SHA}`;
  if (claims.repository !== REPOSITORY || Number(claims.repository_id) !== REPOSITORY_ID ||
      Number(claims.repository_owner_id) !== OWNER_ID || claims.job_workflow_ref !== expectedRef ||
      claims.job_workflow_sha !== env.CI_TRUSTED_WORKFLOW_SHA ||
      !claims.sub?.includes(":environment:ratereveal-private-corpus") ||
      !["pull_request", "push"].includes(claims.event_name) ||
      claims.aud !== env.RATEREVEAL_GCP_WIF_AUDIENCE) reject("oidc_identity_denied");
  return true;
}

function decodeClaims(token) {
  const segments = token.split(".");
  if (segments.length !== 3) reject("oidc_invalid");
  try { return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")); }
  catch { reject("oidc_invalid"); }
}

async function getOidcToken(env) {
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".actions.githubusercontent.com")) reject("oidc_endpoint_denied");
  url.searchParams.set("audience", env.RATEREVEAL_GCP_WIF_AUDIENCE);
  const response = await fetch(url, { headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, redirect: "error" });
  if (!response.ok) reject("oidc_unavailable");
  const body = await response.json();
  if (typeof body.value !== "string") reject("oidc_invalid");
  verifyOidcClaims(decodeClaims(body.value), env);
  return body.value;
}

async function exchangeToken(oidcToken, env) {
  const body = new URLSearchParams({
    audience: env.RATEREVEAL_GCP_WIF_AUDIENCE,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    subject_token: oidcToken,
    scope: "https://www.googleapis.com/auth/devstorage.read_only",
  });
  const response = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, redirect: "error",
  });
  if (!response.ok) reject("cloud_access_denied");
  const result = await response.json();
  if (typeof result.access_token !== "string" || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) > 3600) {
    reject("cloud_token_invalid");
  }
  return result.access_token;
}

export async function downloadApprovedPackage({ env = process.env, pinsPath }) {
  const pins = validateCloudConfiguration(env, JSON.parse(await fs.readFile(pinsPath, "utf8")));
  const paths = runnerPaths(env.RUNNER_TEMP);
  const oidcToken = await getOidcToken(env);
  const accessToken = await exchangeToken(oidcToken, env);
  const object = encodeURIComponent(pins.package.gcpObject);
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.RATEREVEAL_GCP_BUCKET)}/o/${object}?alt=media&generation=${pins.package.gcpGeneration}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, redirect: "error" });
  if (!response.ok || !response.body) reject("package_download_denied");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 512 * 1024 * 1024) reject("package_size_invalid");
  let bytes = 0;
  const limit = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > 512 * 1024 * 1024 ? new Error("package_size_invalid") : null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(paths.archive, { flags: "wx", mode: 0o600 }));
  } catch (error) {
    await fs.rm(paths.archive, { force: true });
    throw error;
  }
  return { status: "downloaded", packageVersion: pins.package.version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await downloadApprovedPackage({ pinsPath: process.argv[2] }))); }
  catch (error) {
    console.error(JSON.stringify({ status: "failed", code: error instanceof Error ? error.message : "unknown_failure" }));
    process.exitCode = 1;
  }
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { RuntimeCache } from "@vercel/functions";

const PREVIEW_JOB_CACHE_NAMESPACE = "ratereveal-preview-job-v1";
const PREVIEW_JOB_CACHE_TTL_SECONDS = 2 * 60 * 60;
const PREVIEW_JOB_CACHE_MAX_BYTES = 1_900_000;
const FORBIDDEN_PUBLIC_PAYLOAD_KEYS = /"(?:filePath|rawPdf|rawStatement|parsedDocument|statementBytes)"\s*:/i;

export type PreviewJobPublicPayload = Record<string, unknown>;

export type PreviewJobPlatform = {
  cache: Pick<RuntimeCache, "get" | "set">;
  waitUntil: (promise: Promise<unknown>) => void | undefined;
};

export function previewAsyncJobExecutionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview";
}

export function createPreviewJobAccessKey(): string {
  return randomBytes(32).toString("base64url");
}

export function previewJobCacheKey(jobId: string, env: NodeJS.ProcessEnv = process.env): string {
  const deploymentId = safeCacheSegment(env.VERCEL_DEPLOYMENT_ID ?? "local-preview");
  return `${deploymentId}:${safeCacheSegment(jobId)}`;
}

export async function schedulePreviewJobExecution(input: {
  jobId: string;
  accessKey: string;
  initialPayload: PreviewJobPublicPayload;
  run: () => Promise<PreviewJobPublicPayload>;
  env?: NodeJS.ProcessEnv;
  platform?: PreviewJobPlatform;
}): Promise<void> {
  const env = input.env ?? process.env;
  const platform = input.platform ?? await loadVercelPlatform();
  const key = previewJobCacheKey(input.jobId, env);

  await persistEncryptedPreviewJobPayload(platform.cache, key, input.accessKey, input.initialPayload);

  const execution = input.run()
    .then((payload) => persistEncryptedPreviewJobPayload(platform.cache, key, input.accessKey, payload))
    .catch((error) => {
      console.error("[preview-job-execution] background-processing-failed", safeErrorCode(error));
    });

  platform.waitUntil(execution);
}

export async function readPreviewJobPayload(input: {
  jobId: string;
  accessKey: string;
  env?: NodeJS.ProcessEnv;
  platform?: PreviewJobPlatform;
}): Promise<PreviewJobPublicPayload | null> {
  const env = input.env ?? process.env;
  if (!previewAsyncJobExecutionEnabled(env)) return null;
  const platform = input.platform ?? await loadVercelPlatform();
  const value = await platform.cache.get(previewJobCacheKey(input.jobId, env));
  return decryptCachedPayload(value, input.accessKey);
}

async function loadVercelPlatform(): Promise<PreviewJobPlatform> {
  const { getCache, waitUntil } = await import("@vercel/functions");
  return {
    cache: getCache({ namespace: PREVIEW_JOB_CACHE_NAMESPACE }),
    waitUntil,
  };
}

async function persistEncryptedPreviewJobPayload(
  cache: PreviewJobPlatform["cache"],
  key: string,
  accessKey: string,
  payload: PreviewJobPublicPayload,
): Promise<void> {
  const serialized = JSON.stringify(payload);
  if (FORBIDDEN_PUBLIC_PAYLOAD_KEYS.test(serialized)) throw new Error("preview_job_payload_privacy_rejected");

  const encrypted = encryptPayload(serialized, accessKey);
  if (Buffer.byteLength(encrypted, "utf8") > PREVIEW_JOB_CACHE_MAX_BYTES) {
    throw new Error("preview_job_payload_limit_exceeded");
  }
  await cache.set(key, encrypted, {
    ttl: PREVIEW_JOB_CACHE_TTL_SECONDS,
    name: "RateReveal Preview encrypted public job snapshot",
    tags: ["ratereveal-preview-job"],
  });
}

function encryptPayload(serialized: string, accessKey: string): string {
  const key = decodeAccessKey(accessKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptCachedPayload(value: unknown, accessKey: string): PreviewJobPublicPayload | null {
  if (typeof value !== "string") return null;
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", decodeAccessKey(accessKey), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as PreviewJobPublicPayload;
  } catch {
    return null;
  }
}

function decodeAccessKey(accessKey: string): Buffer {
  const key = Buffer.from(accessKey, "base64url");
  if (key.length !== 32) throw new Error("preview_job_access_key_invalid");
  return key;
}

function safeCacheSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
  return normalized || "unknown";
}

function safeErrorCode(error: unknown): string {
  const candidate = error instanceof Error ? error.message : String(error);
  return /^[a-z0-9_-]{1,100}$/i.test(candidate) ? candidate : "preview_job_background_failed";
}

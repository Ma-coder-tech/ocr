import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const SESSION_COOKIE = "feeclear_session";
const PENDING_JOB_COOKIE = "feeclear_pending_job";
const SESSION_TTL_DAYS = 30;
const PENDING_JOB_TTL_SECONDS = 2 * 60 * 60;

function isSecureRequest(req: IncomingMessage): boolean {
  return req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
}

function appendSetCookie(res: ServerResponse, value: string): void {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", value);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, value]);
    return;
  }

  res.setHeader("Set-Cookie", [String(current), value]);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const derived = scryptSync(password, salt, 64).toString("hex");
  const left = Buffer.from(derived, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookieHeader = header ?? "";
  if (!cookieHeader.trim()) return {};

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
}

export function readSessionToken(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] ?? null;
}

export function readPendingStatementJobId(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[PENDING_JOB_COOKIE] ?? null;
}

export function setSessionCookie(req: IncomingMessage, res: ServerResponse, token: string): void {
  const secure = isSecureRequest(req);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  appendSetCookie(res, parts.join("; "));
}

export function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  const secure = isSecureRequest(req);
  const parts = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) {
    parts.push("Secure");
  }
  appendSetCookie(res, parts.join("; "));
}

export function setPendingStatementJobCookie(req: IncomingMessage, res: ServerResponse, jobId: string): void {
  const secure = isSecureRequest(req);
  const parts = [
    `${PENDING_JOB_COOKIE}=${encodeURIComponent(jobId)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${PENDING_JOB_TTL_SECONDS}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  appendSetCookie(res, parts.join("; "));
}

export function clearPendingStatementJobCookie(req: IncomingMessage, res: ServerResponse): void {
  const secure = isSecureRequest(req);
  const parts = [
    `${PENDING_JOB_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) {
    parts.push("Secure");
  }
  appendSetCookie(res, parts.join("; "));
}

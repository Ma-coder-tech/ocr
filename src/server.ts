import "dotenv/config";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import http, { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { URL } from "node:url";
import { getBusinessTypeReportLabel, isBusinessTypeId } from "./businessTypes.js";
import {
  claimStatementOneJob,
  createMerchantAccount,
  createSessionRecord,
  createStatementUpload,
  deleteExpiredSessions,
  deleteSessionRecord,
  getComparisonForMerchant,
  getMerchantByEmail,
  getMerchantById,
  getMerchantDashboardContext,
  getMerchantPasswordHash,
  getSessionRecord,
  getStatementByMerchantSlot,
  getStatementUploadForMerchant,
  resetMerchantDevState,
  setMerchantFreeStatementsRemaining,
  setMerchantChosenPath,
  touchSessionRecord,
} from "./accountStore.js";
import {
  clearPendingStatementJobCookie,
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  readPendingStatementJobId,
  readSessionToken,
  sessionExpiryIso,
  setPendingStatementJobCookie,
  setSessionCookie,
  verifyPassword,
} from "./auth.js";
import type { AnalysisSummary, BenchmarkStatus, Job, PublicReportSummary } from "./types.js";
import { analyzeDocument } from "./analyzer.js";
import { detectPeriodKeyFromFileName, formatPeriodKey, inferPeriodKeyFromText, parsePeriodKey, toPeriodLabel } from "./periods.js";
import { parsePdf } from "./parser.js";
import { detectPreflightFailure } from "./preflight.js";
import { createJob, getJob, listEvents, pruneJobs } from "./store.js";
import { enqueueJob, hydrateQueuedJobs } from "./worker.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://${host}:${port}`;
const isDevelopment = process.env.NODE_ENV === "development";
const isVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
const dataRoot = isVercel ? path.join("/tmp", "ocr-data") : path.resolve("data");
const uploadDir = path.join(dataRoot, "uploads");
const publicDir = path.resolve("public");
const fileRetentionHours = Math.max(1, Number(process.env.FILE_RETENTION_HOURS ?? 72));
const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  limit: number;
  windowMs: number;
  key: string;
};

const rateLimitBuckets = new Map<string, RateLimitEntry>();

type AuthenticatedContext = {
  merchantId: number;
  firstName: string;
  lastName: string;
  initials: string;
  freeStatementsRemaining: number;
  businessType: string | null;
  devMode: boolean;
};

function toPublicReportSummary(summary?: AnalysisSummary): PublicReportSummary | undefined {
  if (!summary) return undefined;
  return {
    businessType: summary.businessType,
    processorName: summary.processorName,
    sourceType: summary.sourceType,
    statementPeriod: merchantPeriodLabel(summary.statementPeriod) ?? summary.statementPeriod,
    executiveSummary: summary.executiveSummary,
    totalVolume: summary.totalVolume,
    totalFees: summary.totalFees,
    estimatedMonthlyVolume: summary.estimatedMonthlyVolume,
    estimatedMonthlyFees: summary.estimatedMonthlyFees,
    effectiveRate: summary.effectiveRate,
    benchmark: summary.benchmark,
    confidence: summary.confidence,
    dataQuality: summary.dataQuality,
  };
}

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  setSecurityHeaders(res);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", Buffer.byteLength(body));
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  setSecurityHeaders(res);
  res.statusCode = 302;
  res.setHeader("location", location);
  res.end();
}

function sendText(res: ServerResponse, status: number, contentType: string, body: string | Buffer): void {
  setSecurityHeaders(res);
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.setHeader("content-length", Buffer.byteLength(body));
  res.end(body);
}

function initialsFor(firstName: string, lastName: string): string {
  return `${(firstName[0] ?? "").toUpperCase()}${(lastName[0] ?? "").toUpperCase()}` || "FC";
}

function isPdfFileName(fileName: string): boolean {
  return path.extname(fileName).toLowerCase() === ".pdf";
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\-]+/g, "_");
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number): string {
  return `${Number(value).toFixed(2)}%`;
}

function formatDeltaPct(value: number): string {
  const sign = value >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(value).toFixed(2)}%`;
}

function formatDeltaMoney(value: number): string {
  const sign = value >= 0 ? "↑" : "↓";
  return `${sign} ${formatMoney(Math.abs(value))}`;
}

function merchantPeriodLabel(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return toPeriodLabel(raw) ?? raw;
}

function verdictLabel(status: BenchmarkStatus): string {
  if (status === "above") return "Above benchmark";
  if (status === "below") return "Below benchmark";
  return "Within benchmark";
}

function reportJobIdFromReferer(req: IncomingMessage): string | null {
  const referer = req.headers.referer;
  if (!referer) return null;

  try {
    const refererUrl = new URL(referer);
    const match = refererUrl.pathname.match(/^\/report\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function readForwardedIp(req: IncomingMessage): string | null {
  const header = req.headers["x-forwarded-for"];
  if (typeof header !== "string") return null;
  const first = header.split(",")[0]?.trim();
  return first || null;
}

function normalizeIp(value: string | null | undefined): string {
  return String(value ?? "").trim() || "unknown";
}

function getClientIp(req: IncomingMessage): string {
  const remote = normalizeIp(req.socket.remoteAddress);
  if (remote !== "unknown" && remote !== "::1" && remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1") {
    return remote;
  }
  return normalizeIp(readForwardedIp(req) ?? req.socket.remoteAddress);
}

function getRateLimitConfig(pathname: string, method: string): RateLimitConfig | null {
  if (!(pathname.startsWith("/api/") || pathname.startsWith("/dev/"))) {
    return null;
  }

  if (method === "POST" && (pathname === "/api/auth/signin" || pathname === "/api/auth/signup")) {
    return { limit: 10, windowMs: 15 * 60 * 1000, key: `auth:${pathname}` };
  }

  if (
    method === "POST" &&
    (pathname === "/api/jobs" || pathname === "/api/dashboard/statement2/validate")
  ) {
    return { limit: 5, windowMs: 60 * 1000, key: `upload:${pathname}` };
  }

  return { limit: 120, windowMs: 60 * 1000, key: "global" };
}

function cleanupExpiredRateLimitEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitBuckets.entries()) {
    if (entry.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

const rateLimitCleanupTimer = setInterval(cleanupExpiredRateLimitEntries, 5 * 60 * 1000);
rateLimitCleanupTimer.unref?.();

function applyRateLimit(req: IncomingMessage, res: ServerResponse, pathname: string, method: string): boolean {
  const config = getRateLimitConfig(pathname, method);
  if (!config) return true;

  const now = Date.now();
  const bucketKey = `${config.key}:${getClientIp(req)}`;
  const current = rateLimitBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + config.windowMs });
    return true;
  }

  if (current.count >= config.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    json(res, 429, { error: "Too many requests. Please wait before trying again." });
    return false;
  }

  current.count += 1;
  rateLimitBuckets.set(bucketKey, current);
  return true;
}

function maybeClaimPendingStatementOne(merchantId: number, pendingJobId: string | null | undefined): boolean {
  if (getStatementByMerchantSlot(merchantId, 1)) {
    return true;
  }

  if (!pendingJobId) {
    return false;
  }

  const job = getJob(pendingJobId);
  if (!job?.summary) {
    return false;
  }

  claimStatementOneJob({ merchantId, job });
  return true;
}

function mimeTypeForPath(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function sendFile(res: ServerResponse, filePath: string): Promise<void> {
  const body = await fs.readFile(filePath);
  sendText(res, 200, mimeTypeForPath(filePath), body);
}

async function readJsonBody<T>(req: IncomingMessage, res: ServerResponse): Promise<T | null> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > JSON_BODY_LIMIT_BYTES) {
      json(res, 413, { error: "Request body too large." });
      return null;
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      json(res, 400, { error: "Invalid JSON in request body." });
      return null;
    }
    throw error;
  }
}

async function readMultipartForm(req: IncomingMessage): Promise<FormData> {
  const request = new Request(`${APP_ORIGIN}${req.url ?? "/"}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return await request.formData();
}

function validateAuthEmail(email: string): string | null {
  if (email.length > 255) {
    return "Email address is too long.";
  }
  if (!EMAIL_REGEX.test(email)) {
    return "Please enter a valid email address.";
  }
  return null;
}

function validateNamePair(firstName: string, lastName: string): string | null {
  if (firstName.length < 1 || firstName.length > 100 || lastName.length < 1 || lastName.length > 100) {
    return "First and last name must each be between 1 and 100 characters.";
  }
  return null;
}

async function authenticatedMerchant(req: IncomingMessage): Promise<AuthenticatedContext | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const session = getSessionRecord(tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    deleteSessionRecord(tokenHash);
    return null;
  }
  touchSessionRecord(tokenHash);
  const merchant = getMerchantById(session.merchantId);
  if (!merchant) return null;
  return {
    merchantId: merchant.id,
    firstName: merchant.firstName,
    lastName: merchant.lastName,
    initials: initialsFor(merchant.firstName, merchant.lastName),
    freeStatementsRemaining: merchant.freeStatementsRemaining,
    businessType: merchant.businessType,
    devMode: isDevelopment,
  };
}

async function requireMerchantApi(req: IncomingMessage, res: ServerResponse): Promise<AuthenticatedContext | null> {
  const merchant = await authenticatedMerchant(req);
  if (!merchant) {
    json(res, 401, { error: "Authentication required" });
    return null;
  }
  return merchant;
}

async function requireMerchantPage(req: IncomingMessage, res: ServerResponse): Promise<AuthenticatedContext | null> {
  const merchant = await authenticatedMerchant(req);
  if (!merchant) {
    redirect(res, "/signin");
    return null;
  }
  return merchant;
}

async function cleanupOldFiles(dir: string, retentionHours: number): Promise<void> {
  const cutoffMs = Date.now() - retentionHours * 60 * 60 * 1000;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const filePath = path.join(dir, entry.name);
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < cutoffMs) {
          await fs.unlink(filePath);
        }
      } catch (e) {
        console.warn("[cleanup] failed to remove stale file", filePath, e instanceof Error ? e.message : e);
      }
    }),
  );
}

async function writeUploadedFile(file: File, finalPath: string): Promise<void> {
  const source = Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>);
  await pipeline(source, createWriteStream(finalPath));
}

function detectStatementPeriodKey(summary: AnalysisSummary, textPreview: string, fileName: string, fallbackDetected?: string | null): string | null {
  return (
    parsePeriodKey(summary.statementPeriod) ??
    parsePeriodKey(fallbackDetected ?? "") ??
    inferPeriodKeyFromText(textPreview) ??
    detectPeriodKeyFromFileName(fileName)
  );
}

async function validateProcessorStatementPdf(input: {
  filePath: string;
  fileName: string;
  businessType: string;
  existingPeriodKey?: string | null;
}): Promise<{ detectedPeriodKey: string | null; detectedPeriodLabel: string | null }> {
  const parsed = await parsePdf(input.filePath);

  if (parsed.extraction.mode === "unusable") {
    throw new Error(
      "This PDF appears to be a scanned image. Please upload a text-based PDF exported directly from your processor's portal. Most processors provide downloadable PDF statements that are text-based.",
    );
  }

  const preflightFailure = detectPreflightFailure(parsed);
  if (preflightFailure) {
    throw new Error(preflightFailure);
  }

  const summary = analyzeDocument(parsed, input.businessType as AnalysisSummary["businessType"]);

  const detectedPeriodKey = detectStatementPeriodKey(summary, parsed.textPreview, input.fileName, null);
  if (input.existingPeriodKey && detectedPeriodKey && input.existingPeriodKey === detectedPeriodKey) {
    throw new Error("This looks like the same statement you already uploaded. Please choose a different month.");
  }

  return {
    detectedPeriodKey,
    detectedPeriodLabel: detectedPeriodKey ? formatPeriodKey(detectedPeriodKey) : null,
  };
}

async function handleCreateAnonymousJob(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let form: FormData;
  try {
    form = await readMultipartForm(req);
  } catch {
    json(res, 400, { error: "We could not read that upload. Please try again with a PDF statement file." });
    return;
  }

  const businessTypeEntry = form.get("businessType");
  const businessTypeValue = typeof businessTypeEntry === "string" ? businessTypeEntry : "";
  if (!isBusinessTypeId(businessTypeValue)) {
    json(res, 400, { error: "Please select your business type above before uploading." });
    return;
  }

  const file = form.get("file");
  if (!file || typeof file !== "object" || typeof (file as File).name !== "string") {
    json(res, 400, { error: "Missing file upload" });
    return;
  }

  const upload = file as File;
  if (!isPdfFileName(upload.name)) {
    json(res, 400, { error: "This file isn't a PDF. Please download your statement as a PDF from your processor's portal and try again." });
    return;
  }

  if (upload.size > 20 * 1024 * 1024) {
    json(res, 400, { error: "This file is too large (over 20 MB). Try downloading a single monthly statement rather than a combined document." });
    return;
  }

  const fileName = `${Date.now()}-${safeFileName(upload.name)}`;
  const finalPath = path.join(uploadDir, fileName);
  await writeUploadedFile(upload, finalPath);

  const job = createJob({
    fileName: upload.name,
    filePath: finalPath,
    fileType: "pdf",
    businessType: businessTypeValue,
  });

  setPendingStatementJobCookie(req, res, job.id);
  enqueueJob(job.id);
  json(res, 201, { jobId: job.id });
}

async function handleSignUp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<{
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    statementJobId?: string;
  }>(req, res);
  if (!body) return;

  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!firstName || !lastName || !email || !password) {
    json(res, 400, { error: "First name, last name, email, and password are required." });
    return;
  }

  const emailError = validateAuthEmail(email);
  if (emailError) {
    json(res, 400, { error: emailError });
    return;
  }

  const nameError = validateNamePair(firstName, lastName);
  if (nameError) {
    json(res, 400, { error: nameError });
    return;
  }

  if (password.length < 8 || password.length > 128) {
    json(res, 400, { error: "Password must be between 8 and 128 characters." });
    return;
  }

  if (getMerchantByEmail(email)) {
    json(res, 409, { error: "An account with that email already exists. Sign in instead." });
    return;
  }

  const statementJobId = body.statementJobId ? String(body.statementJobId) : readPendingStatementJobId(req) ?? "";
  const job = statementJobId ? getJob(statementJobId) : undefined;
  if (statementJobId && (!job || !job.summary)) {
    json(res, 400, { error: "Your first statement is no longer available. Please upload it again before creating the account." });
    return;
  }

  const merchant = createMerchantAccount({
    email,
    firstName,
    lastName,
    passwordHash: hashPassword(password),
    businessType: job?.summary?.businessType ?? null,
  });

  if (job) {
    claimStatementOneJob({ merchantId: merchant.id, job });
  }

  const token = createSessionToken();
  createSessionRecord(merchant.id, hashSessionToken(token), sessionExpiryIso());
  setSessionCookie(req, res, token);
  clearPendingStatementJobCookie(req, res);

  const hasStatement1 = Boolean(job) || Boolean(getStatementByMerchantSlot(merchant.id, 1));
  json(res, 201, { redirectTo: hasStatement1 ? "/dashboard/report" : "/" });
}

async function handleSignIn(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<{
    email?: string;
    password?: string;
    statementJobId?: string;
  }>(req, res);
  if (!body) return;

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    json(res, 400, { error: "Email and password are required." });
    return;
  }

  const emailError = validateAuthEmail(email);
  if (emailError) {
    json(res, 400, { error: emailError });
    return;
  }

  const storedPasswordHash = getMerchantPasswordHash(email);
  if (!storedPasswordHash || !verifyPassword(password, storedPasswordHash)) {
    json(res, 401, { error: "Incorrect email or password." });
    return;
  }

  const merchant = getMerchantByEmail(email)!;
  const statementJobId = body.statementJobId ? String(body.statementJobId) : readPendingStatementJobId(req) ?? "";
  if (statementJobId && !getStatementByMerchantSlot(merchant.id, 1)) {
    const job = getJob(statementJobId);
    if (job?.summary) {
      claimStatementOneJob({ merchantId: merchant.id, job });
    }
  }

  const token = createSessionToken();
  createSessionRecord(merchant.id, hashSessionToken(token), sessionExpiryIso());
  setSessionCookie(req, res, token);
  clearPendingStatementJobCookie(req, res);

  const hasComparison = Boolean(getComparisonForMerchant(merchant.id));
  const hasStatement1 = Boolean(getStatementByMerchantSlot(merchant.id, 1));
  json(res, 200, {
    redirectTo: hasComparison ? "/dashboard/comparison" : hasStatement1 ? "/dashboard/report" : "/",
  });
}

async function handleSignOut(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = readSessionToken(req);
  if (token) {
    deleteSessionRecord(hashSessionToken(token));
  }
  clearPendingStatementJobCookie(req, res);
  clearSessionCookie(req, res);
  json(res, 200, { ok: true, redirectTo: "/" });
}

async function handleValidateSecondStatement(req: IncomingMessage, res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  if (merchant.freeStatementsRemaining <= 0) {
    json(res, 403, { error: "Your free second statement has already been used." });
    return;
  }

  const statement1 = getStatementByMerchantSlot(merchant.merchantId, 1);
  if (!statement1) {
    json(res, 400, { error: "You need to finish your first statement before adding another month." });
    return;
  }

  let form: FormData;
  try {
    form = await readMultipartForm(req);
  } catch {
    json(res, 400, { error: "We could not read that upload. Please try again with a PDF statement file." });
    return;
  }

  const file = form.get("file");
  if (!file || typeof file !== "object" || typeof (file as File).name !== "string") {
    json(res, 400, { error: "Missing file upload" });
    return;
  }

  const upload = file as File;
  if (!isPdfFileName(upload.name)) {
    json(res, 400, { error: "This file isn't a PDF. Please download your statement as a PDF from your processor's portal and try again." });
    return;
  }
  if (upload.size > 20 * 1024 * 1024) {
    json(res, 400, { error: "This file is too large (over 20 MB). Try downloading a single monthly statement rather than a combined document." });
    return;
  }

  const tempName = `${Date.now()}-${safeFileName(upload.name)}`;
  const finalPath = path.join(uploadDir, tempName);
  await writeUploadedFile(upload, finalPath);

  try {
    const validation = await validateProcessorStatementPdf({
      filePath: finalPath,
      fileName: upload.name,
      businessType: statement1.businessType,
      existingPeriodKey: statement1.periodKey,
    });

    const uploadRecord = createStatementUpload({
      merchantId: merchant.merchantId,
      fileName: upload.name,
      filePath: finalPath,
      fileSize: upload.size,
      detectedStatementPeriod: validation.detectedPeriodKey,
      validationStatus: "ready",
      validationError: null,
    });

    json(res, 200, {
      uploadId: uploadRecord.id,
      fileName: uploadRecord.fileName,
      fileSize: uploadRecord.fileSize,
      detectedStatementPeriod: validation.detectedPeriodLabel,
      status: "ready",
    });
  } catch (error) {
    await fs
      .unlink(finalPath)
      .catch((e) => console.warn("[cleanup] failed to unlink temp upload", finalPath, e instanceof Error ? e.message : e));
    json(res, 400, {
      error: error instanceof Error ? error.message : "We could not validate this statement.",
    });
  }
}

async function handleStartSecondAnalysis(req: IncomingMessage, res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  if (merchant.freeStatementsRemaining <= 0) {
    json(res, 403, { error: "Your free second statement has already been used." });
    return;
  }

  const body = await readJsonBody<{ uploadId?: string }>(req, res);
  if (!body) return;
  const uploadId = String(body.uploadId ?? "").trim();
  if (!uploadId) {
    json(res, 400, { error: "Missing upload id." });
    return;
  }

  const upload = getStatementUploadForMerchant(uploadId, merchant.merchantId);
  if (!upload || upload.validationStatus !== "ready") {
    json(res, 404, { error: "Validated upload not found." });
    return;
  }

  const statement1 = getStatementByMerchantSlot(merchant.merchantId, 1);
  if (!statement1) {
    json(res, 400, { error: "Your first statement must be saved before a second analysis can start." });
    return;
  }

  const job = createJob({
    fileName: upload.fileName,
    filePath: upload.filePath,
    fileType: "pdf",
    businessType: statement1.businessType,
    merchantId: merchant.merchantId,
    statementSlot: 2,
    detectedStatementPeriod: upload.detectedStatementPeriod,
  });

  enqueueJob(job.id);
  json(res, 201, { jobId: job.id, redirectTo: `/dashboard/analyze-second?job=${encodeURIComponent(job.id)}` });
}

async function handleAuthenticatedJob(req: IncomingMessage, res: ServerResponse, merchant: AuthenticatedContext, jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job || job.merchantId !== merchant.merchantId) {
    json(res, 404, { error: "Job not found" });
    return;
  }

  json(res, 200, {
    id: job.id,
    fileName: job.fileName,
    businessType: job.businessType,
    detectedStatementPeriod: merchantPeriodLabel(job.detectedStatementPeriod),
    status: job.status,
    progress: job.progress,
    error: job.error,
    summary: toPublicReportSummary(job.summary),
  });
}

async function handleChosenPath(req: IncomingMessage, res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  const body = await readJsonBody<{ chosenPath?: string }>(req, res);
  if (!body) return;
  const chosenPath = String(body.chosenPath ?? "");
  if (chosenPath !== "audit" && chosenPath !== "monitor") {
    json(res, 400, { error: "Choose either the audit path or the monitoring path." });
    return;
  }

  setMerchantChosenPath(merchant.merchantId, chosenPath);
  json(res, 200, { redirectTo: `/dashboard/next-step?path=${encodeURIComponent(chosenPath)}` });
}

async function handleDevResetAccount(req: IncomingMessage, res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  resetMerchantDevState(merchant.merchantId);

  const token = readSessionToken(req);
  if (token) {
    deleteSessionRecord(hashSessionToken(token));
  }
  clearPendingStatementJobCookie(req, res);
  clearSessionCookie(req, res);

  json(res, 200, { message: "Account reset. You can now test the full flow again." });
}

async function handleDevBypassCounter(res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  setMerchantFreeStatementsRemaining(merchant.merchantId, 99);
  json(res, 200, {
    message: "Free statement counter bypassed for development.",
    freeStatementsRemaining: 99,
  });
}

async function handleComparisonData(res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  const context = getMerchantDashboardContext(merchant.merchantId);
  if (!context?.statement1 || !context.statement2 || !context.comparison) {
    json(res, 404, { error: "Two completed statements are required before comparison is available." });
    return;
  }

  const ordered = [context.statement1, context.statement2].sort((left, right) => left.periodKey.localeCompare(right.periodKey));
  const earlier = ordered[0];
  const later = ordered[1];
  const comparison = context.comparison;
  const benchmarkCeiling = Math.max(earlier.benchmarkHigh, later.benchmarkHigh);
  const processorName = later.processorName ?? earlier.processorName ?? "Processor not identified";

  json(res, 200, {
    merchant: {
      firstName: merchant.firstName,
      lastName: merchant.lastName,
      initials: merchant.initials,
      chosenPath: context.merchant.chosenPath,
      devMode: merchant.devMode,
    },
    statement1: {
      period: merchantPeriodLabel(context.statement1.statementPeriod) ?? context.statement1.statementPeriod,
      processorName: context.statement1.processorName,
      businessType: getBusinessTypeReportLabel(context.statement1.businessType),
      totalVolume: context.statement1.totalVolume,
      totalFees: context.statement1.totalFees,
      effectiveRate: context.statement1.effectiveRate,
      benchmarkVerdict: context.statement1.benchmarkVerdict,
      processorMarkup: context.statement1.processorMarkup,
      cardNetworkFees: context.statement1.cardNetworkFees,
    },
    statement2: {
      period: merchantPeriodLabel(context.statement2.statementPeriod) ?? context.statement2.statementPeriod,
      processorName: context.statement2.processorName,
      businessType: getBusinessTypeReportLabel(context.statement2.businessType),
      totalVolume: context.statement2.totalVolume,
      totalFees: context.statement2.totalFees,
      effectiveRate: context.statement2.effectiveRate,
      benchmarkVerdict: context.statement2.benchmarkVerdict,
      processorMarkup: context.statement2.processorMarkup,
      cardNetworkFees: context.statement2.cardNetworkFees,
    },
    earlierMonth: merchantPeriodLabel(earlier.statementPeriod) ?? earlier.statementPeriod,
    laterMonth: merchantPeriodLabel(later.statementPeriod) ?? later.statementPeriod,
    processorName,
    businessType: getBusinessTypeReportLabel(later.businessType),
    benchmark: {
      low: later.benchmarkLow,
      high: later.benchmarkHigh,
      ceiling: benchmarkCeiling,
    },
    comparison: {
      alertType: comparison.alertType,
      effectiveRateDelta: comparison.effectiveRateDelta,
      feesDelta: comparison.feesDelta,
      volumeDelta: comparison.volumeDelta,
      processorMarkupDelta: comparison.processorMarkupDelta,
      cardNetworkFeesDelta: comparison.cardNetworkFeesDelta,
      earlierRate: earlier.effectiveRate,
      laterRate: later.effectiveRate,
      earlierTotalFees: earlier.totalFees,
      laterTotalFees: later.totalFees,
      earlierVolume: earlier.totalVolume,
      laterVolume: later.totalVolume,
      earlierProcessorMarkup: earlier.processorMarkup,
      laterProcessorMarkup: later.processorMarkup,
      earlierCardNetworkFees: earlier.cardNetworkFees,
      laterCardNetworkFees: later.cardNetworkFees,
    },
    formatted: {
      feesDelta: formatDeltaMoney(comparison.feesDelta),
      effectiveRateDelta: formatDeltaPct(comparison.effectiveRateDelta),
    },
  });
}

async function handleDashboardReportData(res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  const statement1 = getStatementByMerchantSlot(merchant.merchantId, 1);
  if (!statement1) {
    json(res, 404, { error: "No saved statement was found for this account yet." });
    return;
  }

  json(res, 200, {
    merchant: {
      firstName: merchant.firstName,
      lastName: merchant.lastName,
      initials: merchant.initials,
      freeStatementsRemaining: merchant.freeStatementsRemaining,
      devMode: merchant.devMode,
    },
    statement: {
      period: merchantPeriodLabel(statement1.statementPeriod) ?? statement1.statementPeriod,
      processorName: statement1.processorName ?? "Processor not identified",
      businessType: getBusinessTypeReportLabel(statement1.businessType),
      totalVolume: statement1.totalVolume,
      totalFees: statement1.totalFees,
      effectiveRate: statement1.effectiveRate,
      benchmarkVerdict: statement1.benchmarkVerdict,
      benchmarkLow: statement1.benchmarkLow,
      benchmarkHigh: statement1.benchmarkHigh,
      summary: statement1.analysisSummary,
    },
  });
}

async function handleUploadSecondContext(res: ServerResponse, merchant: AuthenticatedContext): Promise<void> {
  const statement1 = getStatementByMerchantSlot(merchant.merchantId, 1);
  if (!statement1) {
    json(res, 404, { error: "Your first statement has not been saved yet." });
    return;
  }

  json(res, 200, {
    merchant: {
      firstName: merchant.firstName,
      lastName: merchant.lastName,
      initials: merchant.initials,
      freeStatementsRemaining: merchant.freeStatementsRemaining,
      devMode: merchant.devMode,
    },
    statement1: {
      period: merchantPeriodLabel(statement1.statementPeriod) ?? statement1.statementPeriod,
      processorName: statement1.processorName ?? "Processor not identified",
      businessType: getBusinessTypeReportLabel(statement1.businessType),
      totalVolume: statement1.totalVolume,
      effectiveRate: statement1.effectiveRate,
      benchmarkVerdict: statement1.benchmarkVerdict,
      periodKey: statement1.periodKey,
    },
  });
}

async function handleAnonymousJobLookup(req: IncomingMessage, res: ServerResponse, jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) {
    json(res, 404, { error: "Job not found" });
    return;
  }

  if (job.merchantId) {
    const merchant = await authenticatedMerchant(req);
    if (!merchant || merchant.merchantId !== job.merchantId) {
      json(res, 404, { error: "Job not found" });
      return;
    }
  }

  json(res, 200, {
    id: job.id,
    fileName: job.fileName,
    businessType: job.businessType,
    status: job.status,
    progress: job.progress,
    error: job.error,
    summary: toPublicReportSummary(job.summary),
  });
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", APP_ORIGIN);
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (!applyRateLimit(req, res, pathname, method)) {
    return;
  }

  if (method === "POST" && pathname === "/api/jobs") {
    await handleCreateAnonymousJob(req, res);
    return;
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (method === "GET" && jobMatch) {
    await handleAnonymousJobLookup(req, res, decodeURIComponent(jobMatch[1]));
    return;
  }

  const eventMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
  if (method === "GET" && eventMatch) {
    const job = getJob(decodeURIComponent(eventMatch[1]));
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return;
    }
    json(res, 200, { events: listEvents(job.id) });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/signup") {
    await handleSignUp(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/auth/signin") {
    await handleSignIn(req, res);
    return;
  }

  if (method === "POST" && pathname === "/api/auth/signout") {
    await handleSignOut(req, res);
    return;
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    const merchant = await authenticatedMerchant(req);
    if (!merchant) {
      json(res, 200, { authenticated: false });
      return;
    }
    json(res, 200, {
      authenticated: true,
      firstName: merchant.firstName,
      lastName: merchant.lastName,
      initials: merchant.initials,
      freeStatementsRemaining: merchant.freeStatementsRemaining,
      businessType: merchant.businessType,
      devMode: merchant.devMode,
    });
    return;
  }

  if (method === "POST" && pathname === "/dev/reset-account") {
    if (!isDevelopment) {
      json(res, 404, { error: "Not found" });
      return;
    }
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleDevResetAccount(req, res, merchant);
    return;
  }

  if (method === "POST" && pathname === "/dev/bypass-counter") {
    if (!isDevelopment) {
      json(res, 404, { error: "Not found" });
      return;
    }
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleDevBypassCounter(res, merchant);
    return;
  }

  if (method === "GET" && pathname === "/api/dashboard/report") {
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleDashboardReportData(res, merchant);
    return;
  }

  if (method === "GET" && pathname === "/api/dashboard/upload-second/context") {
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleUploadSecondContext(res, merchant);
    return;
  }

  if (method === "POST" && pathname === "/api/dashboard/statement2/validate") {
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleValidateSecondStatement(req, res, merchant);
    return;
  }

  if (method === "POST" && pathname === "/api/dashboard/statement2/start") {
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleStartSecondAnalysis(req, res, merchant);
    return;
  }

  const dashboardJobMatch = pathname.match(/^\/api\/dashboard\/jobs\/([^/]+)$/);
  if (method === "GET" && dashboardJobMatch) {
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleAuthenticatedJob(req, res, merchant, decodeURIComponent(dashboardJobMatch[1]));
    return;
  }

  if (method === "GET" && pathname === "/api/dashboard/comparison") {
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleComparisonData(res, merchant);
    return;
  }

  if (method === "POST" && pathname === "/api/dashboard/chosen-path") {
    const merchant = await requireMerchantApi(req, res);
    if (!merchant) return;
    await handleChosenPath(req, res, merchant);
    return;
  }

  if (method === "GET" && pathname === "/signup") {
    const pendingJobId = url.searchParams.get("job") || readPendingStatementJobId(req) || reportJobIdFromReferer(req);
    const merchant = await authenticatedMerchant(req);
    if (merchant) {
      const hasStatement1 = maybeClaimPendingStatementOne(merchant.merchantId, pendingJobId);
      if (hasStatement1) {
        clearPendingStatementJobCookie(req, res);
      }
      redirect(res, hasStatement1 ? "/dashboard/report" : "/");
      return;
    }
    if (pendingJobId) {
      setPendingStatementJobCookie(req, res, pendingJobId);
    }
    await sendFile(res, path.join(publicDir, "signup.html"));
    return;
  }

  if (method === "GET" && pathname === "/signin") {
    const pendingJobId = url.searchParams.get("job") || readPendingStatementJobId(req) || reportJobIdFromReferer(req);
    const merchant = await authenticatedMerchant(req);
    if (merchant) {
      const hasStatement1 = maybeClaimPendingStatementOne(merchant.merchantId, pendingJobId);
      if (hasStatement1) {
        clearPendingStatementJobCookie(req, res);
      }
      redirect(res, hasStatement1 ? "/dashboard/report" : "/");
      return;
    }
    if (pendingJobId) {
      setPendingStatementJobCookie(req, res, pendingJobId);
    }
    await sendFile(res, path.join(publicDir, "signin.html"));
    return;
  }

  if (method === "GET" && pathname === "/dashboard/report") {
    const merchant = await requireMerchantPage(req, res);
    if (!merchant) return;
    const statement1 = getStatementByMerchantSlot(merchant.merchantId, 1);
    if (!statement1) {
      redirect(res, "/");
      return;
    }
    await sendFile(res, path.join(publicDir, "dashboard-report.html"));
    return;
  }

  if (method === "GET" && pathname === "/dashboard/upload-second") {
    const merchant = await requireMerchantPage(req, res);
    if (!merchant) return;
    const statement1 = getStatementByMerchantSlot(merchant.merchantId, 1);
    if (!statement1) {
      redirect(res, "/dashboard/report");
      return;
    }
    if (merchant.freeStatementsRemaining <= 0) {
      redirect(res, "/dashboard/comparison");
      return;
    }
    await sendFile(res, path.join(publicDir, "upload-second.html"));
    return;
  }

  if (method === "GET" && pathname === "/dashboard/analyze-second") {
    const merchant = await requireMerchantPage(req, res);
    if (!merchant) return;
    const jobId = url.searchParams.get("job") ?? "";
    const job = jobId ? getJob(jobId) : undefined;
    if (!job || job.merchantId !== merchant.merchantId) {
      redirect(res, "/dashboard/upload-second");
      return;
    }
    await sendFile(res, path.join(publicDir, "analyze-second.html"));
    return;
  }

  if (method === "GET" && pathname === "/dashboard/comparison") {
    const merchant = await requireMerchantPage(req, res);
    if (!merchant) return;
    const context = getMerchantDashboardContext(merchant.merchantId);
    if (!context?.statement1 || !context.statement2 || !context.comparison) {
      redirect(res, merchant.freeStatementsRemaining > 0 ? "/dashboard/upload-second" : "/dashboard/report");
      return;
    }
    await sendFile(res, path.join(publicDir, "comparison.html"));
    return;
  }

  if (method === "GET" && pathname === "/dashboard/next-step") {
    const merchant = await requireMerchantPage(req, res);
    if (!merchant) return;
    await sendFile(res, path.join(publicDir, "path-placeholder.html"));
    return;
  }

  if (method === "GET" && pathname === "/") {
    await sendFile(res, path.join(publicDir, "index.html"));
    return;
  }

  const reportMatch = pathname.match(/^\/report\/([^/]+)$/);
  if (method === "GET" && reportMatch) {
    setPendingStatementJobCookie(req, res, decodeURIComponent(reportMatch[1]));
    await sendFile(res, path.join(publicDir, "report.html"));
    return;
  }

  const staticPath = path.join(publicDir, pathname.replace(/^\/+/, ""));
  if (method === "GET" && staticPath.startsWith(publicDir)) {
    try {
      await sendFile(res, staticPath);
      return;
    } catch {}
  }

  sendText(res, 404, "text/plain; charset=utf-8", "Not found");
}

export default function app(req: IncomingMessage, res: ServerResponse): void {
  void route(req, res).catch((error) => {
    const errorId = randomUUID();
    console.error("[server-error]", errorId, error);
    json(res, 500, {
      error: "An unexpected server error occurred.",
      errorId,
      ...(isDevelopment ? { detail: error instanceof Error ? error.message : String(error) } : {}),
    });
  });
}

async function start(): Promise<void> {
  console.log(`[startup] host=${host} port=${port}`);
  await fs.mkdir(uploadDir, { recursive: true });
  await cleanupOldFiles(uploadDir, fileRetentionHours);
  hydrateQueuedJobs();
  deleteExpiredSessions();
  pruneJobs();
  const server = http.createServer(app);
  const sessionCleanupTimer = setInterval(() => deleteExpiredSessions(), 15 * 60 * 1000);
  sessionCleanupTimer.unref?.();
  const pruneJobsTimer = setInterval(() => pruneJobs(), 6 * 60 * 60 * 1000);
  pruneJobsTimer.unref?.();
  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
  });
  server.on("close", () => {
    clearInterval(sessionCleanupTimer);
    clearInterval(pruneJobsTimer);
  });
  server.on("error", (error) => {
    console.error("[listen-error]", error);
    process.exit(1);
  });
}

if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error("[startup-error]", error);
    process.exit(1);
  });
}

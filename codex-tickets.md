# Codex Work Specification — Merchant Fee Analyzer

Generated from formal technical review of commit `0dd53a5`, branch `main`.

---

## 1. CONTEXT BLOCK

This is a Node.js/TypeScript web application that accepts merchant payment processor statements (PDF/CSV), runs a deterministic fee analysis pipeline against industry benchmarks, and produces a two-statement comparison report. The backend is raw `node:http` (no Express in use despite it being listed as a dependency), with a `better-sqlite3` SQLite database, an in-process single-threaded job queue, optional Anthropic Claude AI refinement via `@ai-sdk/anthropic`, and server-rendered HTML pages in `public/`. The declared deployment target is Vercel (serverless), with a local dev mode via `tsx watch`. Auth uses scrypt password hashing and 32-byte random session tokens stored as SHA-256 hashes in SQLite.

**Ground rules for the agent:**
- Preserve all existing API response shapes unless a ticket explicitly changes them. If a ticket requires a breaking API shape change, flag it in a comment before proceeding.
- Do not add features, refactor, or abstract beyond what each ticket explicitly requires. Fix the stated problem only.
- When logic changes require type changes, update `src/types.ts` and related type definitions to stay consistent.
- Add tests where a ticket calls for it. Use `node:test` or `vitest` — do not introduce a different test framework.
- All new code must pass `tsc --noEmit` with the existing `tsconfig.json` (strict mode).
- Do not modify `public/` HTML/JS/CSS files unless a ticket explicitly targets them.
- Do not commit lockfile changes unless `package.json` changed.

---

## 2. TICKET BACKLOG

---

### TICKET-001: Add rate limiting to all API endpoints

- **Severity:** Critical
- **Category:** Security
- **Files:** `src/server.ts`
- **Lines:** `816` (`/api/jobs`), `838` (`/api/auth/signup`), `843` (`/api/auth/signin`), `806` (`route()` entry point)
- **Problem:** No rate limiting exists on any endpoint. An unauthenticated caller can submit unlimited password guesses against `/api/auth/signin`, upload 20 MB files at unlimited frequency to `/api/jobs`, and enumerate registered email addresses via the `409` response from `/api/auth/signup`. There is no per-IP or per-account throttle anywhere in the request handler.
- **Root Cause:** No rate limiting middleware was integrated during initial development.
- **Required Changes:**
  - Implement an in-process per-IP request counter using a `Map<string, { count: number; resetAt: number }>` stored at module scope in `server.ts`, or introduce `express-rate-limit` if the project is migrated to Express (it currently is not — use the in-process approach).
  - Apply strict limits at the top of the `route()` function: **10 requests per 15 minutes per IP** for `/api/auth/signin` and `/api/auth/signup`; **5 requests per minute per IP** for `POST /api/jobs` and `POST /api/dashboard/statement2/validate`; a relaxed **120 requests per minute per IP** global fallback for all other routes.
  - Extract the client IP from `req.socket.remoteAddress`, falling back to the `x-forwarded-for` header (first value only) when behind a trusted proxy.
  - Return `429 Too Many Requests` with `{ error: "Too many requests. Please wait before trying again." }` when a limit is exceeded.
  - Include a `Retry-After` header (seconds until reset) on 429 responses.
  - Clean up expired entries from the counter map on a 5-minute `setInterval` to prevent unbounded memory growth.
- **Acceptance Criteria:**
  - Sending 11 signin requests from the same IP within 15 minutes results in a `429` on the 11th request.
  - Sending 6 upload requests from the same IP within 60 seconds results in a `429` on the 6th request.
  - A 429 response always includes a `Retry-After` header with a positive integer value.
  - Legitimate requests from a different IP are not affected by another IP's rate limit.
  - `tsc --noEmit` passes after changes.
- **Do Not:** Introduce Express or any external HTTP framework. Do not add rate limiting to the `/health` endpoint or static file serving paths.
- **Suggested Libraries/Patterns:** In-process `Map`-based sliding window counter. No new library needed.
- **Effort:** M
- **Depends On:** —

---

### TICKET-002: Fix SQLite database path to use /tmp on Vercel

- **Severity:** Critical
- **Category:** Reliability
- **Files:** `src/db.ts`
- **Lines:** `5–8`
- **Problem:** The database path is resolved as `path.resolve("data")` (CWD-relative), which resolves to the project bundle root on Vercel. Vercel's serverless runtime mounts the bundle on a read-only filesystem; only `/tmp` is writable. `new Database(dbPath)` at line 10 will throw `SQLITE_CANTOPEN` or `EROFS` on every cold start because `data/feeclear.sqlite` does not exist in the deployed bundle (it is gitignored). The application is non-functional on Vercel today.
- **Root Cause:** The `isVercel` path branching introduced in `server.ts:53` was not replicated in `db.ts`, which maintains its own `dataRoot` variable with divergent logic.
- **Required Changes:**
  - In `src/db.ts`, detect Vercel using `Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV)` (mirror the exact check from `server.ts:52`).
  - When on Vercel, set `dbPath` to `path.join("/tmp", "ocr-data", "feeclear.sqlite")`.
  - When not on Vercel, keep the existing `path.resolve("data", "feeclear.sqlite")`.
  - Ensure `fs.mkdirSync` at line 8 uses the same resolved parent directory (i.e., `path.dirname(dbPath)`), not a hardcoded `"data"` string.
  - Add a startup log line: `console.log("[db] path =", dbPath)` so the resolved path is visible in Vercel function logs.
- **Acceptance Criteria:**
  - With `VERCEL=1` in the environment, `dbPath` resolves to `/tmp/ocr-data/feeclear.sqlite`.
  - Without `VERCEL` set, `dbPath` resolves to `<cwd>/data/feeclear.sqlite` (existing behavior preserved).
  - `fs.mkdirSync` creates the correct parent directory in both cases.
  - `tsc --noEmit` passes.
- **Do Not:** Change the SQLite WAL/FK/busy_timeout pragma settings. Do not migrate to a different database engine. Do not change anything in `server.ts` — that file already handles its own `dataRoot` correctly.
- **Suggested Libraries/Patterns:** Mirror the `isVercel` boolean already defined in `server.ts:52`.
- **Effort:** S
- **Depends On:** —

---

### TICKET-003: Fix host header injection in multipart form parser

- **Severity:** High
- **Category:** Security
- **Files:** `src/server.ts`
- **Lines:** `212–219`
- **Problem:** `readMultipartForm` constructs a WHATWG `Request` object using the raw `Host` header from the incoming request: `` `http://${req.headers.host ?? ...}` ``. The `Host` header is attacker-controlled. Any future feature that uses the constructed URL (password reset links, redirect URLs, canonical link generation) would produce URLs pointing to the attacker's domain.
- **Root Cause:** The developer used the incoming `Host` header to satisfy the WHATWG `Request` constructor's requirement for an absolute URL base. This is a known footgun when adapting `fetch`-based patterns.
- **Required Changes:**
  - Add a module-level constant `const APP_ORIGIN = process.env.APP_ORIGIN ?? \`http://${host}:${port}\`` at the top of `server.ts` (near line 49–50 where `host` and `port` are already defined).
  - Replace `\`http://${req.headers.host ?? \`${host}:${port}\`}\`` on line 213 with `APP_ORIGIN`.
  - Update `.env.example` (if it exists) to document `APP_ORIGIN=https://yourapp.com`.
- **Acceptance Criteria:**
  - A multipart form POST with `Host: evil.com` in the request headers does not cause `evil.com` to appear anywhere in the constructed `Request` URL.
  - Setting `APP_ORIGIN=https://example.com` in the environment causes the `Request` base URL to use `https://example.com`.
  - When `APP_ORIGIN` is not set, the base URL defaults to `http://127.0.0.1:3000` (or whatever `host`/`port` resolve to).
  - Multipart form parsing continues to work correctly for valid PDF uploads after this change.
  - `tsc --noEmit` passes.
- **Do Not:** Change the multipart parsing logic itself. Do not introduce a new dependency. Do not alter any other use of `req.headers.host` (there are none outside this function).
- **Effort:** S
- **Depends On:** —

---

### TICKET-004: Add timeout to PDF parsing to prevent job queue stall

- **Severity:** High
- **Category:** Reliability
- **Files:** `src/parser.ts`, `src/worker.ts`
- **Lines:** `src/parser.ts:142`, `src/worker.ts:9` (context: `busy` flag)
- **Problem:** `pdfParse(buffer)` at `parser.ts:142` has no execution timeout. A pathological or adversarially crafted PDF can cause the `pdf-parse` / `pdf.js` engine to hang indefinitely. The job queue in `worker.ts` is single-threaded behind a `busy` boolean (line 9); while `busy = true`, no subsequent job can be dequeued. One hung PDF stalls all uploads for all users for the lifetime of the process.
- **Root Cause:** PDF parsing was not identified as a potentially unbounded operation during initial design of the single-threaded queue.
- **Required Changes:**
  - In `src/parser.ts`, wrap the `pdfParse(buffer)` call (line 142) in a `Promise.race` against a `setTimeout`-based rejection. Use a configurable timeout: `const PDF_PARSE_TIMEOUT_MS = Number(process.env.PDF_PARSE_TIMEOUT_MS ?? 30_000)`.
  - The rejection error message should be: `"PDF parsing timed out. The file may be corrupted or too complex to process."`.
  - In `src/worker.ts`, verify that a thrown error from `parsePdf` is caught by the existing `try/catch` at line 193–196 and routed to `failJob`. Confirm the `busy` flag is always reset in the `finally` block (it is, at line 46 — just verify nothing changed).
  - Add a log line before the race: `console.log(\`[job:${jobId}] pdf-parse-start timeout=${PDF_PARSE_TIMEOUT_MS}ms\`)`.
- **Acceptance Criteria:**
  - Uploading a PDF that causes `pdfParse` to hang results in the job transitioning to `failed` status within `PDF_PARSE_TIMEOUT_MS` milliseconds.
  - After the timeout, the job queue processes the next queued job normally (i.e., `busy` is reset to `false`).
  - The timeout value is overridable via `PDF_PARSE_TIMEOUT_MS` environment variable.
  - Normal PDF parsing that completes before the timeout is unaffected.
  - `tsc --noEmit` passes.
- **Do Not:** Change the `parseCsv` function. Do not move PDF parsing to a worker thread (out of scope for this ticket). Do not alter the `pdf-parse` library or its import.
- **Effort:** S
- **Depends On:** —

---

### TICKET-005: Wrap JSON.parse calls in database row mappers with try/catch

- **Severity:** High
- **Category:** Reliability
- **Files:** `src/store.ts`, `src/accountStore.ts`
- **Lines:** `src/store.ts:24`, `src/accountStore.ts:154`
- **Problem:** Both `mapJob` and `mapStatement` call `JSON.parse` on database column values without any error handling. A corrupted, truncated, or manually edited JSON value in `summary_json` or `analysis_summary_json` will throw a `SyntaxError` that propagates to the global handler and returns a `500` to the client. One corrupted row makes the corresponding merchant's entire dashboard permanently inaccessible.
- **Root Cause:** The developer used `as AnalysisSummary` type assertions and assumed database writes are always atomic and complete.
- **Required Changes:**
  - In `src/store.ts`, wrap the `JSON.parse(String(row.summary_json))` call (line 24) in a `try/catch`. On parse failure: log `console.error("[store] corrupt summary_json for job", row.id, e)` and return `undefined` for the `summary` field.
  - In `src/accountStore.ts`, wrap the `JSON.parse(String(row.analysis_summary_json))` call (line 154) in a `try/catch`. On parse failure: log `console.error("[accountStore] corrupt analysis_summary_json for statement", row.id, e)` and throw a new `Error(\`Statement ${row.id} has corrupt analysis data. Manual repair required.\`)` — this is preferable to silently returning `null` for a non-nullable field.
  - Ensure that `mapJob` returning a `Job` with `summary: undefined` does not break callers that assume `job.summary` is present after job completion — audit `src/server.ts` and `src/worker.ts` for such assumptions and add null guards where needed.
- **Acceptance Criteria:**
  - Manually setting `summary_json = 'not valid json'` in the database for a job row results in the job's `summary` field being `undefined` (not a 500 crash) when retrieved via `GET /api/jobs/:id`.
  - Manually setting `analysis_summary_json = 'not valid json'` for a statement row results in a logged error and a thrown `Error` (not a silent `null`) when `mapStatement` is called.
  - Normal job and statement reads with valid JSON are unaffected.
  - `tsc --noEmit` passes.
- **Do Not:** Add Zod schema validation at this stage — that is a larger effort. Do not change the database schema.
- **Effort:** S
- **Depends On:** —

---

### TICKET-006: Add automated test suite with coverage for critical paths

- **Severity:** High
- **Category:** Testing
- **Files:** `package.json`, new files under `test/` or `src/__tests__/`
- **Lines:** N/A (new files)
- **Problem:** There are no automated tests of any kind in the repository. The fee analysis pipeline, authentication layer, and all API endpoints are exercised only manually. Every fix made in this ticket backlog can regress silently without a test suite.
- **Root Cause:** Tests were deferred during initial MVP development.
- **Required Changes:**
  - Add `vitest` to `devDependencies`. Add `"test": "vitest run"` script to `package.json`.
  - Create `test/auth.test.ts`: test `hashPassword`/`verifyPassword` round-trip; test that two different passwords with the same salt do not verify; test `parseCookies` with empty string, multi-cookie string, URL-encoded values, missing `=`.
  - Create `test/store.test.ts`: test `createJob`, `getJob`, `updateJob`, `failJob` against an in-memory SQLite instance (pass `:memory:` as the DB path via a test-only factory). Test that `mapJob` returns `undefined` for `summary` when `summary_json` is invalid JSON (verifies TICKET-005 fix).
  - Create `test/accountStore.test.ts`: test `createMerchantAccount`, `getMerchantByEmail`, `createSessionRecord`, `getSessionRecord`, `deleteExpiredSessions` against an in-memory SQLite instance. Test `persistStatementFromSummary` for both the INSERT and UPDATE paths.
  - Create `test/preflight.test.ts`: test `detectPreflightFailure` with a fixture containing bank statement terms, a fixture containing processor terms, and an empty document.
  - Create `test/periods.test.ts`: test `parsePeriodKey`, `formatPeriodKey`, `toPeriodLabel`, `detectPeriodKeyFromFileName` with valid and invalid inputs.
  - Do NOT attempt to test `src/analyzer.ts`, `src/pdfHeuristic.ts`, or `src/checklistEngine.ts` in this ticket — those require fixture files and are a separate effort.
- **Acceptance Criteria:**
  - `npm test` runs and all written tests pass.
  - `tsc --noEmit` passes with test files included (add `test/` to `tsconfig.json` `include` if needed, or use a separate `tsconfig.test.json`).
  - Auth round-trip tests cover: correct password verifies, incorrect password does not verify, timing-safe comparison path is exercised.
  - `parseCookies` test covers at minimum: empty input, single cookie, multiple cookies, URL-encoded key and value.
  - Store tests exercise both the happy path and the corrupt-JSON path introduced by TICKET-005.
- **Do Not:** Write end-to-end HTTP tests in this ticket. Do not test `public/` JavaScript. Do not mock the SQLite database — use `:memory:` for real integration.
- **Suggested Libraries/Patterns:** `vitest` for test runner (ESM-native, zero config for TypeScript). `better-sqlite3` already supports `:memory:` databases.
- **Effort:** L
- **Depends On:** TICKET-005 (the corrupt-JSON test validates that fix)

---

### TICKET-007: Add HTTP security response headers to all responses

- **Severity:** Medium
- **Category:** Security
- **Files:** `src/server.ts`
- **Lines:** `87–106` (`json`, `sendText` helper functions)
- **Problem:** No security-relevant HTTP response headers are set on any response. Missing headers: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`. Without these, the application has no second line of defense against content injection, clickjacking, or MIME-sniffing attacks.
- **Root Cause:** Security headers were not included in the initial implementation of the response helper functions.
- **Required Changes:**
  - Add a `setSecurityHeaders(res: ServerResponse): void` function in `server.ts` that sets:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: DENY`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;`
    - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (set only when `isSecureRequest(req)` is true — but since `res` is the parameter here, gate this on `process.env.NODE_ENV === "production"`)
  - Call `setSecurityHeaders(res)` at the top of `json()`, `sendText()`, and `redirect()` helper functions.
  - Do not call it inside `setSecurityHeaders` itself (no recursion risk, just be explicit).
- **Acceptance Criteria:**
  - Every HTTP response (JSON, HTML, CSS, JS, redirect) includes `X-Content-Type-Options: nosniff`.
  - Every HTTP response includes `X-Frame-Options: DENY`.
  - Every HTTP response includes `Referrer-Policy: strict-origin-when-cross-origin`.
  - Every JSON API response includes a `Content-Security-Policy` header.
  - In production mode (`NODE_ENV=production`), every response includes `Strict-Transport-Security`.
  - `tsc --noEmit` passes.
- **Do Not:** Add CORS headers — the frontend is same-origin. Do not modify the HTML files in `public/`.
- **Effort:** S
- **Depends On:** —

---

### TICKET-008: Add input validation to signup and signin request bodies

- **Severity:** Medium
- **Category:** Security
- **Files:** `src/server.ts`
- **Lines:** `382–390` (signup), `437–441` (signin)
- **Problem:** Signup validates only that `firstName`, `lastName`, `email`, and `password` are non-empty. No email format validation, no maximum field lengths, and no character restrictions are applied. A value like `"not-an-email"` or a 10,000-character string is accepted silently. This allows garbage data into the database and makes the 409 account-enumeration path trivially scriptable.
- **Root Cause:** Input validation was deferred during initial development.
- **Required Changes:**
  - **Email**: Validate format with the regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Return `400 { error: "Please enter a valid email address." }` on failure.
  - **First name / Last name**: Enforce `1 ≤ length ≤ 100` characters after trim. Return `400 { error: "First and last name must each be between 1 and 100 characters." }` if violated.
  - **Password** (signup only): Existing 8-character minimum is kept. Add a maximum of 128 characters. Return `400 { error: "Password must be between 8 and 128 characters." }` if violated.
  - **Email** (both signup and signin): Enforce maximum length of 255 characters. Return `400 { error: "Email address is too long." }` if violated.
  - All validation must run before any database call.
  - Do not expose which specific field failed in a way that aids enumeration — the email format error is acceptable because it does not reveal whether the email exists.
- **Acceptance Criteria:**
  - POST to `/api/auth/signup` with `email: "notanemail"` returns `400`.
  - POST to `/api/auth/signup` with `firstName: ""` returns `400`.
  - POST to `/api/auth/signup` with `firstName` of 101 characters returns `400`.
  - POST to `/api/auth/signup` with `password` of 129 characters returns `400`.
  - POST to `/api/auth/signup` with a valid email of 256 characters returns `400`.
  - A fully valid signup request with correct fields still returns `201`.
  - `tsc --noEmit` passes.
- **Do Not:** Add phone number or address validation — those fields don't exist. Do not change password hashing.
- **Effort:** S
- **Depends On:** —

---

### TICKET-009: Sanitize internal error messages exposed to API clients

- **Severity:** Medium
- **Category:** Security
- **Files:** `src/server.ts`
- **Lines:** `1063–1068`
- **Problem:** The global error handler returns `error.message` verbatim to the HTTP client: `error instanceof Error ? error.message : "Unknown server error"`. Node.js system errors (filesystem, SQLite) include absolute paths and internal details in their messages. This is an OWASP A05 information disclosure finding.
- **Root Cause:** Using `error.message` directly is idiomatic in development but was not updated to differentiate between development and production environments.
- **Required Changes:**
  - In the catch block of `app()` (line 1063), log the full error to `console.error` with all details (keep this as-is).
  - Generate a random `errorId` using `randomUUID()` (already imported in other files — add the import to `server.ts` if not present).
  - Return to the client: `json(res, 500, { error: "An unexpected server error occurred.", errorId })`.
  - In development mode only (`isDevelopment === true`), include `detail: error instanceof Error ? error.message : String(error)` in the response alongside `errorId`.
  - Log the `errorId` with the full error in `console.error` so it can be looked up: `console.error("[server-error]", errorId, error)`.
- **Acceptance Criteria:**
  - A request that triggers a filesystem error (e.g., reading a nonexistent file) returns `500` with `{ error: "An unexpected server error occurred.", errorId: "<uuid>" }` — the filesystem path does not appear in the response body.
  - The same `errorId` appears in the server log output.
  - In `NODE_ENV=development`, the response additionally includes a `detail` field with the raw error message.
  - In `NODE_ENV=production`, the `detail` field is absent from the response.
  - `tsc --noEmit` passes.
- **Do Not:** Suppress error logging. Do not change how specific handler functions return their own user-facing `400`/`403`/`404` errors — those are intentional and safe.
- **Effort:** S
- **Depends On:** —

---

### TICKET-010: Add runtime validation when casting database row values to enum types

- **Severity:** Medium
- **Category:** Correctness
- **Files:** `src/store.ts`, `src/accountStore.ts`
- **Lines:** `src/store.ts:14–22`, `src/accountStore.ts:103–105`, `src/accountStore.ts:116`, `src/accountStore.ts:148`, `src/accountStore.ts:167`
- **Problem:** Database row mappers cast column values to TypeScript union types using `as` without runtime validation: e.g., `String(row.file_type) as "csv" | "pdf"`, `String(row.status) as JobStatus`, `String(row.benchmark_verdict) as BenchmarkStatus`. If the database contains a value outside the declared union, the cast succeeds silently and invalid values flow into downstream logic.
- **Root Cause:** TypeScript `as` casts provide compile-time type satisfaction but no runtime narrowing. The database boundary was not treated as an untrusted input boundary.
- **Required Changes:**
  - Add a generic `assertOneOf<T extends string>(value: string, allowed: readonly T[], field: string): T` helper function in `src/store.ts` (or a new `src/utils.ts`). It should throw `Error(\`Invalid value for ${field}: ${value}\`)` if `value` is not in `allowed`.
  - Apply `assertOneOf` to the following casts in `src/store.ts`: `file_type` (allowed: `["csv", "pdf"]`), `status` (allowed: all values of `JobStatus`).
  - Apply `assertOneOf` to the following casts in `src/accountStore.ts`: `business_type` (allowed: all values of `BusinessTypeId` from `src/businessTypes.ts`), `benchmark_verdict` (allowed: `["below", "within", "above"]`), `chosen_path` (allowed: `["audit", "monitor"]`), `validation_status` (allowed: `["ready", "error"]`), `alert_type` (allowed: all values of `ComparisonAlertType`).
  - Export the valid arrays as `const` from their respective type definition files so `assertOneOf` can reference them without duplicating values.
- **Acceptance Criteria:**
  - Manually inserting `file_type = 'image'` into `analysis_jobs` and calling `getJob()` throws a descriptive error rather than returning a job with `fileType: "image"`.
  - All existing valid enum values continue to deserialize correctly.
  - `BusinessTypeId` valid values are derived from `src/businessTypes.ts` (the single source of truth), not duplicated.
  - `tsc --noEmit` passes.
- **Do Not:** Add Zod as a dependency for this ticket. Do not validate free-text columns (`file_name`, `error`, etc.). Do not add validation to non-enum numeric or string fields.
- **Effort:** M
- **Depends On:** —

---

### TICKET-011: Wrap persistStatementFromSummary in a database transaction

- **Severity:** Medium
- **Category:** Correctness
- **Files:** `src/accountStore.ts`
- **Lines:** `383–506`
- **Problem:** `persistStatementFromSummary` performs multiple logically atomic database writes (INSERT/UPDATE on `statements`, then UPDATE on `merchants` for both the `free_statements_remaining` decrement and the slot-2 denormalization) as separate prepared statement executions without a wrapping transaction. A crash between writes leaves the database in a partially updated state — e.g., a statement row exists but `free_statements_remaining` is not decremented, granting the merchant unlimited free statements.
- **Root Cause:** Multi-write operations were added incrementally without transaction boundaries. `resetMerchantDevState` (line 590) correctly uses `db.transaction()` but the same pattern was not applied here.
- **Required Changes:**
  - Wrap the entire body of `persistStatementFromSummary` (from the `const periodKey = ...` line through `return statement`) in a `better-sqlite3` transaction: `const tx = db.transaction(() => { ... }); return tx()`.
  - `better-sqlite3`'s `transaction()` API is synchronous — no `async/await` changes are needed.
  - Ensure the `return statement` at the end of the function returns the value from inside the transaction lambda.
  - Also wrap `createOrReplaceComparison` (lines 509–577) in a transaction, as it similarly performs multiple writes (UPDATE `comparisons` or INSERT, then UPDATE `merchants`) without one.
- **Acceptance Criteria:**
  - If an exception is thrown between the `statements` upsert and the `merchants` update inside `persistStatementFromSummary`, neither write is committed (SQLite rolls back).
  - Normal execution of `persistStatementFromSummary` produces the same observable result as before the change.
  - `createOrReplaceComparison` is similarly transactional.
  - `tsc --noEmit` passes.
- **Do Not:** Change the function signatures or return types. Do not add new fields to the database schema.
- **Effort:** S
- **Depends On:** —

---

### TICKET-012: Replace in-memory file buffering with streaming writes for uploads

- **Severity:** Medium
- **Category:** Performance
- **Files:** `src/server.ts`
- **Lines:** `359`, `519`
- **Problem:** Both `handleCreateAnonymousJob` and `handleValidateSecondStatement` fully materialize the uploaded file into a `Buffer` before writing to disk via `Buffer.from(await upload.arrayBuffer())`. For a 20 MB upload, this allocates the full file in the V8 heap before any byte is persisted, and the `File` object already holds a copy — doubling peak heap consumption per upload.
- **Root Cause:** The WHATWG `FormData` / `File` API does not expose a streaming file write interface without additional plumbing; `arrayBuffer()` was used as the simplest path.
- **Required Changes:**
  - After extracting the `File` object from `FormData`, obtain a `ReadableStream` via `upload.stream()`.
  - Use `node:stream`'s `pipeline` (from `node:stream/promises`) to pipe the stream to `fs.createWriteStream(finalPath)`.
  - Remove the `Buffer.from(await upload.arrayBuffer())` calls on lines 359 and 519.
  - Apply the same change to both `handleCreateAnonymousJob` and `handleValidateSecondStatement`.
  - Preserve the existing size check (`upload.size > 20 * 1024 * 1024`) — it runs before the write and is unaffected.
- **Acceptance Criteria:**
  - A valid PDF upload completes successfully and the file is written to `uploadDir`.
  - Peak heap usage during a single upload does not include a full in-memory copy of the file buffer (verify by code inspection — automated memory profiling is out of scope).
  - `tsc --noEmit` passes.
  - The change does not affect the `readMultipartForm` helper — only the file write step changes.
- **Do Not:** Replace the multipart form parsing mechanism (that is a larger refactor). Do not change the 20 MB size limit. Do not alter the `safeFileName` or `path.join` logic for constructing `finalPath`.
- **Suggested Libraries/Patterns:** `import { pipeline } from "node:stream/promises"`, `fs.createWriteStream`.
- **Effort:** M
- **Depends On:** TICKET-003 (both tickets modify `readMultipartForm` area — coordinate to avoid conflicts)

---

### TICKET-013: Return 400 for malformed JSON request bodies instead of 500

- **Severity:** Medium
- **Category:** Correctness
- **Files:** `src/server.ts`
- **Lines:** `200–210`
- **Problem:** `readJsonBody` calls `JSON.parse(body)` at line 209 without a `try/catch`. A client sending a malformed JSON body to any endpoint that calls `readJsonBody` receives a `500 Internal Server Error` instead of a `400 Bad Request`. Additionally, there is no body size limit — a client can send an arbitrarily large JSON payload that is fully buffered.
- **Root Cause:** The JSON parse step was not given error handling during development.
- **Required Changes:**
  - Wrap `JSON.parse(body)` in a `try/catch`. On `SyntaxError`, call `json(res, 400, { error: "Invalid JSON in request body." })` and return (do not proceed with the handler). This requires `readJsonBody` to gain access to `res`, or alternatively restructure it to throw a typed error that callers check.
  - Recommended approach: change `readJsonBody` signature to `async function readJsonBody<T>(req: IncomingMessage, res: ServerResponse): Promise<T | null>` — return `null` after writing the 400 response. Callers that currently do `const body = await readJsonBody(req)` become `const body = await readJsonBody(req, res); if (!body) return;`.
  - Add a body size limit of 1 MB: during the chunk accumulation loop (lines 201–204), track total bytes and call `json(res, 413, { error: "Request body too large." })` if the limit is exceeded, then abort.
  - Update all callers of `readJsonBody` in `server.ts` to handle the `null` return.
- **Acceptance Criteria:**
  - `POST /api/auth/signin` with body `{broken` returns `400 { error: "Invalid JSON in request body." }`.
  - `POST /api/auth/signin` with a valid JSON body of 1.1 MB returns `413`.
  - `POST /api/auth/signin` with a valid JSON body of 500 bytes continues to work normally.
  - No handler proceeds with processing after a `null` return from `readJsonBody`.
  - `tsc --noEmit` passes.
- **Do Not:** Change the behavior for empty bodies — returning `{} as T` for empty bodies is intentional and must be preserved. Do not apply a size limit to file uploads (those go through `readMultipartForm`, not `readJsonBody`).
- **Effort:** M
- **Depends On:** —

---

### TICKET-014: Remove statement data denormalization from the merchants table

- **Severity:** Medium
- **Category:** Maintainability
- **Files:** `src/db.ts`, `src/accountStore.ts`
- **Lines:** `src/db.ts:37–47`, `src/accountStore.ts:17–27`, `src/accountStore.ts:477–503`, `src/accountStore.ts:590–617`
- **Problem:** Eleven columns on the `merchants` table (`statement_2_period`, `statement_2_processor`, `statement_2_volume`, `statement_2_total_fees`, `statement_2_effective_rate`, `statement_2_benchmark_verdict`, `statement_2_processor_markup`, `statement_2_card_network_fees`, `comparison_alert_type`, `comparison_effective_rate_delta`, `comparison_fees_delta`) are manual copies of data already present in the authoritative `statements` and `comparisons` tables. These must be synchronized in two functions and nulled out in the reset function.
- **Root Cause:** These columns were added incrementally to support denormalized reads in dashboard endpoints, without the corresponding JOIN queries being written.
- **Required Changes:**
  - Write a database migration (inside the existing `migrate()` function in `db.ts`) that drops the 11 columns using `ALTER TABLE merchants DROP COLUMN` for each (SQLite 3.35+ supports this — `better-sqlite3` v12 targets SQLite 3.46+, so this is safe). The migration must be idempotent: check column existence before dropping using `hasColumn()`.
  - Remove the 11 fields from the `MerchantAccount` type in `src/accountStore.ts` (lines 17–27).
  - Remove the 11-column sync block from `persistStatementFromSummary` (lines 477–503).
  - Remove the 11-column null-out block from `resetMerchantDevState` (lines 598–612).
  - Remove the 11-column `ensureColumn` calls from `db.ts:137–147`.
  - Update `getMerchantDashboardContext` and any callers that read the removed fields to instead use `getStatementByMerchantSlot(merchantId, 2)` and `getComparisonForMerchant(merchantId)` — both already exist and return the authoritative data.
  - Update `mapMerchant` to remove the 11 field mappings.
- **Acceptance Criteria:**
  - After migration, the `merchants` table no longer contains the 11 columns.
  - Dashboard and comparison endpoints (`/api/dashboard/report`, `/api/dashboard/comparison`) return the same data as before.
  - `resetMerchantDevState` correctly resets a merchant to initial state.
  - `tsc --noEmit` passes.
  - No caller reads a field that no longer exists on `MerchantAccount`.
- **Do Not:** Change the `statements` or `comparisons` table schemas. Do not remove any columns from those tables. Do not alter the `ComparisonRecord` or `StatementRecord` types.
- **Effort:** L
- **Depends On:** TICKET-011 (transactions should be in place before restructuring persistence)

---

### TICKET-015: Fix CWD-relative path resolution in checklistEngine and db

- **Severity:** Medium
- **Category:** Reliability
- **Files:** `src/checklistEngine.ts`, `src/db.ts`
- **Lines:** `src/checklistEngine.ts:33–35`, `src/db.ts:5–6`
- **Problem:** Both files use `path.resolve("data", ...)` to locate runtime-required resources. This resolves relative to `process.cwd()`, not relative to the module file. If the application is started from any directory other than the project root, or when compiled output is run from `dist/`, the paths resolve incorrectly. For `db.ts`, this compounds TICKET-002 (the Vercel `/tmp` issue). For `checklistEngine.ts`, the foundation JSON files will not be found and checklist evaluation silently fails.
- **Root Cause:** `path.resolve` without an `__dirname`/`import.meta.url` anchor is fragile. ESM modules require `import.meta.url` to derive their own directory.
- **Required Changes:**
  - In `src/checklistEngine.ts`, replace:
    ```
    const FOUNDATION_DIR = path.resolve("data", "merchant-statement-foundation");
    ```
    with:
    ```
    import { fileURLToPath } from "node:url";
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const FOUNDATION_DIR = path.resolve(__dirname, "..", "data", "merchant-statement-foundation");
    ```
    (The `..` navigates from `src/` to the project root where `data/` lives.)
  - In `src/db.ts`, the Vercel-conditional path fix in TICKET-002 supersedes the path resolution issue for the DB file. However, the non-Vercel path `path.resolve("data")` should also be anchored: use `path.resolve(__dirname, "..", "data")` with the same `fileURLToPath` pattern when not on Vercel.
  - Add the `import { fileURLToPath } from "node:url"` import to both files if not already present.
- **Acceptance Criteria:**
  - Running `node dist/server.js` from the `dist/` directory (or any directory other than project root) correctly locates both the foundation JSON files and the SQLite database.
  - `checklistEngine.ts`'s `loadChecklists()` resolves the correct absolute path to `master-checklist.json` and `processor-grouped-checklist.json` regardless of CWD.
  - `tsc --noEmit` passes.
- **Do Not:** Change the `public/` directory path in `server.ts` — it uses `path.resolve("public")` which is already CWD-relative and currently works because the server always starts from project root. Only fix `db.ts` and `checklistEngine.ts`.
- **Effort:** S
- **Depends On:** TICKET-002 (coordinate edits to `db.ts`)

---

### TICKET-016: Add database indexes for frequently queried columns

- **Severity:** Medium
- **Category:** Performance
- **Files:** `src/db.ts`
- **Lines:** `60–135` (schema definition inside `migrate()`)
- **Problem:** Several columns that are queried on every authenticated request and every job state change have no indexes. `listQueuedJobs()` scans `analysis_jobs` by `status` on every call. The `pruneJobs` DELETE filters by `(status, updated_at, merchant_id IS NULL)` with no composite index. `getStatementUploadForMerchant` filters `statement_uploads` by both `id` and `merchant_id` with no index on `merchant_id`.
- **Root Cause:** Indexes were not specified during initial schema design.
- **Required Changes:**
  - Add the following `CREATE INDEX IF NOT EXISTS` statements inside the `migrate()` function in `src/db.ts`, after the table creation block:
    - `CREATE INDEX IF NOT EXISTS idx_jobs_status ON analysis_jobs(status);`
    - `CREATE INDEX IF NOT EXISTS idx_jobs_merchant ON analysis_jobs(merchant_id);`
    - `CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON analysis_jobs(status, updated_at);`
    - `CREATE INDEX IF NOT EXISTS idx_uploads_merchant ON statement_uploads(merchant_id);`
    - `CREATE INDEX IF NOT EXISTS idx_job_events_job ON analysis_job_events(job_id);` (already has a FK but no explicit index in SQLite unless created)
- **Acceptance Criteria:**
  - `PRAGMA index_list(analysis_jobs)` shows the three new indexes after running `migrate()`.
  - `PRAGMA index_list(statement_uploads)` shows `idx_uploads_merchant`.
  - `PRAGMA index_list(analysis_job_events)` shows `idx_job_events_job`.
  - Application startup and all existing operations complete without error.
  - `tsc --noEmit` passes.
- **Do Not:** Change any existing table schemas or add columns. Do not add indexes to the `sessions` table — `token_hash` already has an implicit index from its `UNIQUE` constraint, and `statements(merchant_id, slot)` is covered by the `UNIQUE` constraint.
- **Effort:** S
- **Depends On:** —

---

### TICKET-017: Move deleteExpiredSessions off the per-request path

- **Severity:** Low
- **Category:** Performance
- **Files:** `src/server.ts`, `src/accountStore.ts`
- **Lines:** `src/server.ts:223`, `src/accountStore.ts:324–326`
- **Problem:** `deleteExpiredSessions()` is called synchronously inside `authenticatedMerchant()` (line 223), which runs on every authenticated request. This issues a `DELETE` query on every request. At scale this is redundant write I/O and creates write contention with the job processing pipeline on the single-writer SQLite connection.
- **Root Cause:** Session cleanup was inlined into the authentication path as a convenience rather than scheduled separately.
- **Required Changes:**
  - Remove the `deleteExpiredSessions()` call from `authenticatedMerchant()` (line 223 of `server.ts`).
  - In the `start()` function (line 1071 of `server.ts`), add a call to `deleteExpiredSessions()` immediately after `hydrateQueuedJobs()`.
  - Add a `setInterval(() => deleteExpiredSessions(), 15 * 60 * 1000)` in `start()` to run cleanup every 15 minutes.
  - Assign the interval result to a variable and clear it on `server.on("close", ...)` if a clean shutdown signal is handled (optional — do not add a shutdown handler if one does not already exist).
- **Acceptance Criteria:**
  - `deleteExpiredSessions()` is no longer called inside `authenticatedMerchant()`.
  - Expired sessions are cleaned up at server startup and every 15 minutes.
  - Authenticated requests to protected endpoints still return `401` after a session has expired (the expiry check on line 229 `new Date(session.expiresAt).getTime() <= Date.now()` still handles this inline).
  - `tsc --noEmit` passes.
- **Do Not:** Remove the inline expiry check at `server.ts:229–232` — that is separate from the cleanup sweep and must remain.
- **Effort:** S
- **Depends On:** —

---

### TICKET-018: Move pruneJobs off the per-write path

- **Severity:** Low
- **Category:** Performance
- **Files:** `src/store.ts`, `src/server.ts`
- **Lines:** `src/store.ts:77` (in `createJob`), `src/store.ts:140` (in `updateJob`)
- **Problem:** `pruneJobs()` is called inside both `createJob` and `updateJob`. During a single job's processing lifecycle, `updateJob` is called at least 6 times (one per stage transition), each triggering a `DELETE` on `analysis_jobs`. This is redundant write amplification — pruning stale anonymous jobs does not need to happen on every stage transition.
- **Root Cause:** `pruneJobs` was inlined into `createJob`/`updateJob` as a maintenance convenience.
- **Required Changes:**
  - Remove the `pruneJobs()` call from `createJob` (line 77 of `store.ts`).
  - Remove the `pruneJobs()` call from `updateJob` (line 140 of `store.ts`).
  - In `server.ts`'s `start()` function, add a call to `pruneJobs()` (import it from `store.ts`) immediately after `hydrateQueuedJobs()`.
  - Add a `setInterval(() => pruneJobs(), 6 * 60 * 60 * 1000)` (every 6 hours) in `start()`.
  - Export `pruneJobs` from `src/store.ts` (it is currently not exported — add `export` to the function declaration).
- **Acceptance Criteria:**
  - `pruneJobs` is no longer called inside `createJob` or `updateJob`.
  - Anonymous completed jobs older than `TERMINAL_JOB_RETENTION_HOURS` are still pruned (at next startup or next 6-hour interval).
  - `tsc --noEmit` passes.
- **Do Not:** Change `TERMINAL_JOB_RETENTION_HOURS` logic or the pruning SQL query itself.
- **Effort:** S
- **Depends On:** —

---

### TICKET-019: Extend session expiry on activity (sliding window)

- **Severity:** Low
- **Category:** Security
- **Files:** `src/accountStore.ts`, `src/auth.ts`
- **Lines:** `src/accountStore.ts:316–318`, `src/auth.ts:52–54`
- **Problem:** `sessionExpiryIso()` creates a fixed 30-day expiry at session creation. `touchSessionRecord` updates only `last_seen_at`, not `expires_at`. An active user who logs in and uses the application daily will be silently logged out 30 days after first login, even mid-session.
- **Root Cause:** The sliding window extension logic was not implemented — only the initial expiry creation was.
- **Required Changes:**
  - In `src/accountStore.ts`, update `touchSessionRecord` to also update `expires_at`:
    ```ts
    db.prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`)
      .run(nowIso(), sessionExpiryIso(), tokenHash);
    ```
  - Import `sessionExpiryIso` from `src/auth.ts` in `src/accountStore.ts` (add the import).
- **Acceptance Criteria:**
  - A session created 29 days ago, where the user authenticated yesterday, has its `expires_at` extended to 30 days from yesterday after the most recent request.
  - A session that has not been used for 30 days expires as expected.
  - `tsc --noEmit` passes.
- **Do Not:** Change `SESSION_TTL_DAYS`. Do not alter the cookie `Max-Age` — that is set at cookie creation time and is cosmetic. Do not change the expiry check logic in `server.ts:229`.
- **Effort:** S
- **Depends On:** —

---

### TICKET-020: Log errors in silent cleanup catch blocks

- **Severity:** Low
- **Category:** Observability
- **Files:** `src/server.ts`
- **Lines:** `277` (empty `catch {}` in `cleanupOldFiles`), `547` (`.catch(() => undefined)` in `handleValidateSecondStatement`)
- **Problem:** Two cleanup paths completely swallow errors without logging. In `cleanupOldFiles` (line 277), both `fs.stat` and `fs.unlink` failures are discarded with an empty `catch {}`. In `handleValidateSecondStatement` (line 547), a failed `unlink` of an uploaded file after validation error is discarded via `.catch(() => undefined)`. Failed cleanups are invisible to operators.
- **Root Cause:** Cleanup failures were treated as non-critical during development and logging was omitted.
- **Required Changes:**
  - In `cleanupOldFiles` (line 277), replace `catch {}` with `catch (e) { console.warn("[cleanup] failed to remove stale file", filePath, e instanceof Error ? e.message : e); }`.
  - In `handleValidateSecondStatement` (line 547), replace `.catch(() => undefined)` with `.catch((e) => console.warn("[cleanup] failed to unlink temp upload", finalPath, e instanceof Error ? e.message : e))`.
- **Acceptance Criteria:**
  - A simulated `fs.unlink` failure (e.g., file already deleted) produces a `[cleanup]` warning in server logs.
  - No request returns a different HTTP status code than before — these changes affect logging only.
  - `tsc --noEmit` passes.
- **Do Not:** Change the cleanup logic itself. Do not make cleanup failures return 500. Do not log at `error` level — these are warnings.
- **Effort:** S
- **Depends On:** —

---

### TICKET-021: Add structured logging with request and job correlation IDs

- **Severity:** Low
- **Category:** Observability
- **Files:** `src/server.ts`, `src/worker.ts`, `src/aiFallback.ts`
- **Lines:** `src/server.ts:806–808` (`route()` entry), `src/server.ts:1062–1068` (global handler), `src/worker.ts:50–196`, `src/aiFallback.ts:88`
- **Problem:** All logging uses unstructured `console.log`/`console.error` with ad hoc string prefixes. There is no request ID, no session ID, no merchant ID threaded through the request lifecycle. A 500 error in the global handler cannot be correlated with the merchant or job that caused it. Vercel log aggregation has no way to reconstruct the full context of a failure.
- **Root Cause:** Structured logging was not introduced during initial development.
- **Required Changes:**
  - Add `pino` to `dependencies` in `package.json`. Create a `src/logger.ts` module that exports a configured `pino` logger instance.
  - In `route()` (line 806), generate a `requestId = randomUUID()` at the top of each request. Pass it down to handlers that log, or store it in a request-scoped object.
  - Replace `console.log` / `console.error` in `src/server.ts:1064` with `logger.error({ requestId, err: error }, "[server-error]")`.
  - Replace the ad hoc `console.log` calls in `src/worker.ts` with `logger.info({ jobId, ...fields }, "[job-stage]")` using the structured fields already being logged.
  - Replace the `console.error` calls in `src/aiFallback.ts` with `logger.warn` and `logger.error`.
  - Keep the log content (the same keys and values already being logged) — just change the transport from `console` to `pino`. Do not add new log statements.
- **Acceptance Criteria:**
  - Server output is newline-delimited JSON (pino's default format) in production.
  - Every log line for a request includes a `requestId` field.
  - Every log line from the job worker includes a `jobId` field.
  - `tsc --noEmit` passes after adding `@types/pino` or using pino's built-in types.
- **Do Not:** Add logging to functions that do not already log. Do not add request logging middleware that logs every incoming request — only convert existing log calls.
- **Suggested Libraries/Patterns:** `pino` (structured JSON logger, zero-config, ESM-compatible).
- **Effort:** M
- **Depends On:** —

---

### TICKET-022: Remove internal filesystem path from health endpoint response

- **Severity:** Low
- **Category:** Security
- **Files:** `src/server.ts`
- **Lines:** `812`
- **Problem:** The `/health` endpoint returns `{ ok: true, uploadDir }` to any unauthenticated caller. `uploadDir` is an absolute filesystem path (e.g., `/tmp/ocr-data/uploads`). This discloses the runtime environment, directory structure, and whether the deployment is serverless.
- **Root Cause:** `uploadDir` was included during development for debugging and not removed.
- **Required Changes:**
  - Change line 812 from `json(res, 200, { ok: true, uploadDir })` to `json(res, 200, { ok: true })`.
- **Acceptance Criteria:**
  - `GET /health` returns `{ "ok": true }` with no additional fields.
  - `tsc --noEmit` passes.
- **Do Not:** Remove the `/health` endpoint itself. Do not add authentication to the health endpoint.
- **Effort:** S
- **Depends On:** —

---

### TICKET-023: Remove unused production dependencies

- **Severity:** Low
- **Category:** Maintainability
- **Files:** `package.json`, `package-lock.json`
- **Lines:** `package.json:14–16` (dependencies), `package.json:26–27` (devDependencies)
- **Problem:** Three packages are listed as production dependencies but are not imported anywhere in the source: `express` (server uses raw `node:http`), `multer` (an Express middleware), `pdf-lib` (a PDF generation library). Additionally, `@types/express` and `@types/multer` are devDependencies for the unused runtime packages. These inflate the deployment bundle and introduce unnecessary attack surface (`multer` 1.x has a known moderate security advisory).
- **Root Cause:** These packages were installed during initial scaffolding when Express was originally planned and were never removed when the architecture shifted.
- **Required Changes:**
  - Remove from `dependencies`: `express`, `multer`, `pdf-lib`.
  - Remove from `devDependencies`: `@types/express`, `@types/multer`.
  - Run `npm install` to update `package-lock.json`.
  - Run `tsc --noEmit` to confirm no source file actually imports these packages.
- **Acceptance Criteria:**
  - `package.json` no longer lists `express`, `multer`, `pdf-lib`, `@types/express`, or `@types/multer`.
  - `npm install` completes without errors.
  - `tsc --noEmit` passes with the packages removed.
  - The server starts and handles requests normally.
- **Do Not:** Remove any other dependency. Do not replace the removed packages with alternatives.
- **Effort:** S
- **Depends On:** —

---

### TICKET-024: Decompose server.ts into focused modules

- **Severity:** Low
- **Category:** Maintainability
- **Files:** `src/server.ts` (1,092 lines — refactor target)
- **Lines:** Entire file
- **Problem:** `src/server.ts` owns at least six distinct concerns: HTTP server lifecycle, URL routing, authentication middleware, request body parsing, business logic orchestration, and static file serving. At 1,092 lines, any change risks inadvertent cross-concern modification. The file cannot be unit-tested in isolation without spinning up the entire server.
- **Root Cause:** Iterative feature addition to a single module without periodic extraction.
- **Required Changes:**
  - Create `src/middleware/auth.ts`: move `authenticatedMerchant`, `requireMerchantApi`, `requireMerchantPage`, and the `AuthenticatedContext` type out of `server.ts`.
  - Create `src/http/response.ts`: move `json`, `sendText`, `redirect`, `sendFile`, `setSecurityHeaders` (from TICKET-007) out of `server.ts`.
  - Create `src/http/request.ts`: move `readJsonBody`, `readMultipartForm`, `parseCookies` (currently in `auth.ts` — leave it there) out of `server.ts`.
  - Create `src/handlers/auth.ts`: move `handleSignUp`, `handleSignIn`, `handleSignOut`.
  - Create `src/handlers/jobs.ts`: move `handleCreateAnonymousJob`, `handleAnonymousJobLookup`.
  - Create `src/handlers/dashboard.ts`: move `handleDashboardReportData`, `handleValidateSecondStatement`, `handleStartSecondAnalysis`, `handleAuthenticatedJob`, `handleComparisonData`, `handleUploadSecondContext`, `handleChosenPath`.
  - Create `src/handlers/dev.ts`: move `handleDevResetAccount`, `handleDevBypassCounter`.
  - Keep `src/server.ts` as the entry point containing only: imports, the `route()` dispatch function, the `app()` export, and the `start()` function.
  - All helper/utility functions (`formatMoney`, `formatPct`, `toPublicReportSummary`, `merchantPeriodLabel`, `mimeTypeForPath`, etc.) should move to `src/http/response.ts` or a new `src/utils/format.ts`.
- **Acceptance Criteria:**
  - `src/server.ts` is reduced to under 200 lines.
  - `tsc --noEmit` passes with no import errors.
  - All existing API endpoints function identically (no behavior changes).
  - No circular imports introduced.
- **Do Not:** Change any function signatures, return types, or logic during this refactor. This is a pure structural move — no behavior changes.
- **Effort:** L
- **Depends On:** All tickets that modify `server.ts` (TICKET-001, TICKET-003, TICKET-007, TICKET-008, TICKET-009, TICKET-012, TICKET-013, TICKET-017, TICKET-018, TICKET-022) should be completed before this refactor to avoid merge conflicts.

---

### TICKET-025: Change default AI model from Opus to Sonnet

- **Severity:** Low
- **Category:** Maintainability
- **Files:** `src/aiFallback.ts`
- **Lines:** `19`
- **Problem:** The AI refinement step defaults to `"claude-opus-4-6"` when `ANTHROPIC_MODEL` is not set. The task (generating a small structured JSON object: confidence, insights, dynamic fields) with a 600-token output cap does not require Opus-tier reasoning. Opus pricing is 5–15x higher than Sonnet. This default will silently incur Opus costs in any deployment where the environment variable is not explicitly set.
- **Root Cause:** The model was set during development and not updated when the task scope was narrowed to structured output generation with `generateObject`.
- **Required Changes:**
  - Change line 19 from:
    ```ts
    const modelName = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6";
    ```
    to:
    ```ts
    const modelName = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    ```
  - Update `.env.example` if it documents the default model value.
- **Acceptance Criteria:**
  - When `ANTHROPIC_MODEL` is not set, the AI refinement step uses `claude-sonnet-4-6`.
  - Setting `ANTHROPIC_MODEL=claude-opus-4-6` in the environment still uses Opus.
  - `tsc --noEmit` passes.
- **Do Not:** Change `maxInputTokens`, `maxOutputTokens`, `temperature`, or the Zod schema. Do not change the fallback logic.
- **Effort:** S
- **Depends On:** —

---

## 3. EXECUTION ORDER

Work in the following sequence. Do not start a phase until all tickets in the previous phase are complete and `tsc --noEmit` passes.

### Phase 1 — Deployment blockers and security critical (complete before any production traffic)

**Step 1 — Make the app functional on Vercel (together, both edit db.ts):**
- TICKET-002 (SQLite path to /tmp)
- TICKET-015 (CWD-relative paths) — coordinate edits to `db.ts` in a single commit

**Step 2 — Harden the request handling layer (all touch server.ts; batch into one PR):**
- TICKET-001 (rate limiting)
- TICKET-003 (host header injection)
- TICKET-007 (security headers)
- TICKET-009 (sanitize error messages)
- TICKET-013 (readJsonBody 400 on malformed JSON)
- TICKET-022 (health endpoint path)

**Step 3 — Prevent data corruption (independent, short fixes):**
- TICKET-005 (JSON.parse try/catch in mappers)
- TICKET-011 (transaction for persistStatementFromSummary)

---

### Phase 2 — Reliability and correctness (complete within first sprint after launch)

**Step 4 — Stabilize the job queue:**
- TICKET-004 (PDF parse timeout)

**Step 5 — Input and type safety (independent fixes, can be parallelized):**
- TICKET-008 (input validation on signup/signin)
- TICKET-010 (runtime enum validation from DB rows)
- TICKET-012 (streaming file uploads) — coordinate with TICKET-003 changes to server.ts

---

### Phase 3 — Performance, observability, and maintainability (ongoing development)

**Step 6 — Database efficiency (all touch db.ts or store.ts; single PR):**
- TICKET-016 (database indexes)
- TICKET-017 (move deleteExpiredSessions off request path)
- TICKET-018 (move pruneJobs off write path)

**Step 7 — Small independent fixes (can be done in any order):**
- TICKET-019 (sliding session expiry)
- TICKET-020 (log cleanup errors)
- TICKET-023 (remove unused dependencies)
- TICKET-025 (default AI model to Sonnet)

**Step 8 — Structured logging:**
- TICKET-021 (pino structured logging) — do after Step 7 so the log calls it converts already reflect the other fixes

**Step 9 — Data model cleanup (significant refactor, own PR):**
- TICKET-014 (remove statement denormalization from merchants table)

---

### Phase 4 — Test coverage (start after Phase 1, run continuously)

- TICKET-006 (automated test suite) — begin after Phase 1 is complete; expand coverage in parallel with Phase 2 and Phase 3 work

---

### Phase 5 — Structural refactor (last, after all other tickets)

- TICKET-024 (decompose server.ts) — must be last to avoid merge conflicts with all tickets that modify server.ts

---

## 4. OUT OF SCOPE

The following are explicitly excluded from this work specification. Do not attempt them:

- Migrating from SQLite to a hosted database engine (Turso, Neon, PlanetScale) — the SQLite path fix in TICKET-002 is the only DB infrastructure change in scope.
- Migrating from the in-process job queue to an external queue service (Inngest, QStash, Trigger.dev).
- Adding a password reset or email verification flow.
- Adding an export/download feature for reports (PDF or CSV export).
- Rewriting or expanding the fee analysis logic in `src/analyzer.ts`.
- Rewriting or expanding the PDF heuristic recovery logic in `src/pdfHeuristic.ts`.
- Expanding processor detection coverage in `src/checklistEngine.ts` (adding new processor signatures).
- Adding end-to-end browser tests.
- Adding a CI/CD pipeline or GitHub Actions configuration.
- Adding API documentation or an OpenAPI schema.
- Modifying any files in `public/` (HTML, CSS, client-side JS).
- Changing the product's pricing, rate limits, or free-statement business logic.
- Removing the anonymous job flow or the statement-claiming flow during signup/signin.

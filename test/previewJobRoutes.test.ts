import fs from "node:fs/promises";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Preview job routes", () => {
  let app: (req: IncomingMessage, res: ServerResponse) => void;
  let previewJobApp: (req: IncomingMessage, res: ServerResponse) => void;
  let store: typeof import("../src/store.js");
  let dbModule: typeof import("../src/db.js");
  let scheduled: Array<Record<string, unknown>>;
  let cachedPayload: Record<string, unknown> | null;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    vi.resetModules();
    scheduled = [];
    cachedPayload = null;
    previousEnv = {
      FEECLEAR_DB_PATH: process.env.FEECLEAR_DB_PATH,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    };
    process.env.FEECLEAR_DB_PATH = ":memory:";
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "test";

    vi.doMock("../src/worker.js", () => ({
      enqueueJob: vi.fn(),
      hydrateQueuedJobs: vi.fn(),
      processJobUntilTerminal: vi.fn(),
    }));
    vi.doMock("../src/previewJobExecution.js", async (importOriginal) => {
      const original = await importOriginal<typeof import("../src/previewJobExecution.js")>();
      return {
        ...original,
        schedulePreviewJobExecution: vi.fn(async (input: Record<string, unknown>) => {
          scheduled.push(input);
        }),
        readPreviewJobPayload: vi.fn(async () => cachedPayload),
      };
    });

    store = await import("../src/store.js");
    dbModule = await import("../src/db.js");
    ({ default: app, previewJobApp } = await import("../src/server.js"));
  });

  afterEach(async () => {
    for (const job of store.listQueuedJobs()) {
      await fs.unlink(job.filePath).catch(() => undefined);
    }
    dbModule.db.close();
    vi.doUnmock("../src/worker.js");
    vi.doUnmock("../src/previewJobExecution.js");
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("redirects the Preview upload before consuming its request body", async () => {
    const result = await invoke(app, "/api/jobs", { method: "POST" });
    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("/api/preview-jobs");
    expect(scheduled).toHaveLength(0);
  });

  it("acknowledges a valid Preview upload after scheduling background processing", async () => {
    const form = new FormData();
    form.set("businessType", "restaurant_food_beverage");
    form.set("file", new File([Buffer.from("%PDF-1.4 safe test")], "statement.pdf", { type: "application/pdf" }));
    const request = new Request("http://preview.test/api/preview-jobs", { method: "POST", body: form });
    const body = Buffer.from(await request.arrayBuffer());
    const result = await invoke(previewJobApp, "/api/preview-jobs", {
      method: "POST",
      headers: Object.fromEntries(request.headers.entries()),
      body,
    });

    expect(result.status, result.body).toBe(201);
    expect(JSON.parse(result.body)).toMatchObject({ jobId: expect.any(String) });
    expect(scheduled).toHaveLength(1);
    expect(result.headers.get("set-cookie")).toContain("feeclear_pending_job=");
    expect(result.headers.get("set-cookie")).toContain("ratereveal_preview_job_access=");
  });

  it("fails the Preview worker route closed outside Preview", async () => {
    process.env.VERCEL_ENV = "production";
    const result = await invoke(previewJobApp, "/api/preview-jobs", { method: "POST" });
    expect(result.status).toBe(404);
    expect(scheduled).toHaveLength(0);
  });

  it("retrieves an encrypted-cache projection when polling reaches another function instance", async () => {
    cachedPayload = {
      id: "remote-job",
      status: "completed",
      progress: 100,
      productionReportV2: { experience: "complete" },
    };
    const result = await invoke(app, "/api/jobs/remote-job", {
      headers: { cookie: "ratereveal_preview_job_access=valid-test-capability" },
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      status: "completed",
      productionReportV2: { experience: "complete" },
    });
  });
});

async function invoke(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: Buffer } = {},
) {
  const body = init.body ?? Buffer.alloc(0);
  const req = Object.assign(Readable.from(body.length > 0 ? [body] : []), {
    method: init.method ?? "GET",
    url,
    headers: {
      ...(body.length > 0 ? { "content-length": String(body.length) } : {}),
      ...(init.headers ?? {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  }) as unknown as IncomingMessage;
  const headers = new Map<string, string>();
  return await new Promise<{ status: number; body: string; headers: Map<string, string> }>((resolve) => {
    const res = {
      statusCode: 200,
      setHeader(name: string, value: number | string | readonly string[]) {
        headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
      },
      getHeader(name: string) {
        return headers.get(name.toLowerCase());
      },
      end(payload?: string | Buffer) {
        resolve({
          status: this.statusCode,
          body: Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload ?? ""),
          headers,
        });
      },
    } as unknown as ServerResponse;
    handler(req, res);
  });
}

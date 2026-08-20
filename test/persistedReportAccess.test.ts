import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionReportProjection } from "../src/canonical/productionReportProjectionTypes.js";

type AccountStoreModule = typeof import("../src/accountStore.js");
type DbModule = typeof import("../src/db.js");
type StoreModule = typeof import("../src/store.js");

const projection: ProductionReportProjection = {
  schemaVersion: "ratereveal_production_report_v2",
  experience: "unable_to_complete",
  header: {
    title: "Your RateReveal statement review",
    merchantName: null,
    processor: null,
    statementPeriod: null,
    statementScope: "One statement analyzed.",
  },
  recovery: {
    title: "We couldn't complete this statement review",
    reasonCode: "review_could_not_be_completed",
    explanation: "Try another statement.",
    nextSteps: ["Upload another statement."],
  },
  report: null,
};

describe("persisted Report V2 read-only access", () => {
  let accountStore: AccountStoreModule;
  let dbModule: DbModule;
  let store: StoreModule;
  let app: (req: IncomingMessage, res: ServerResponse) => void;
  let enqueueJob: ReturnType<typeof vi.fn>;
  let processJobUntilTerminal: ReturnType<typeof vi.fn>;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    vi.resetModules();
    enqueueJob = vi.fn();
    processJobUntilTerminal = vi.fn();
    vi.doMock("../src/worker.js", () => ({
      enqueueJob,
      hydrateQueuedJobs: vi.fn(),
      processJobUntilTerminal,
    }));
    previousEnv = {
      FEECLEAR_DB_PATH: process.env.FEECLEAR_DB_PATH,
      VERCEL: process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
      RATEREVEAL_REPORT_V2_ENABLED: process.env.RATEREVEAL_REPORT_V2_ENABLED,
    };
    process.env.FEECLEAR_DB_PATH = ":memory:";
    process.env.VERCEL = "1";
    process.env.NODE_ENV = "test";
    process.env.RATEREVEAL_REPORT_V2_ENABLED = "true";

    accountStore = await import("../src/accountStore.js");
    store = await import("../src/store.js");
    dbModule = await import("../src/db.js");
    app = (await import("../src/server.js")).default;
  });

  afterEach(() => {
    dbModule.db.close();
    vi.doUnmock("../src/worker.js");
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function api(path: string) {
    const req = Object.assign(Readable.from([]), {
      method: "GET",
      url: path,
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    }) as unknown as IncomingMessage;
    const headers = new Map<string, string>();
    return new Promise<{ status: number; body: Record<string, unknown> }>((resolve) => {
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
            body: JSON.parse(Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload ?? "{}")),
          });
        },
      } as unknown as ServerResponse;
      app(req, res);
    });
  }

  it("returns the same completed projection on reopen without enqueuing or executing work", async () => {
    const job = store.createJob({
      fileName: "statement.pdf",
      filePath: "/tmp/statement.pdf",
      fileType: "pdf",
      businessType: "retail",
    });
    store.updateJob(job.id, {
      status: "completed",
      progress: 100,
      attemptCount: 1,
      productionReportV2: projection,
    });
    const checkpointsBefore = store.listJobCheckpoints(job.id);

    const first = await api(`/api/jobs/${encodeURIComponent(job.id)}`);
    const reopened = await api(`/api/jobs/${encodeURIComponent(job.id)}`);

    expect(first).toMatchObject({ status: 200, body: { status: "completed", productionReportV2: projection } });
    expect(reopened.body.productionReportV2).toEqual(first.body.productionReportV2);
    expect(store.listJobCheckpoints(job.id)).toEqual(checkpointsBefore);
    expect(store.getJob(job.id)?.attemptCount).toBe(1);
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(processJobUntilTerminal).not.toHaveBeenCalled();
  });

  it("returns the same not-found response for missing and unauthorized merchant jobs", async () => {
    const merchant = accountStore.createMerchantAccount({
      email: "private-report@example.com",
      firstName: "Private",
      lastName: "Merchant",
      passwordHash: "hash",
      businessType: "retail",
    });
    const privateJob = store.createJob({
      fileName: "private.pdf",
      filePath: "/tmp/private.pdf",
      fileType: "pdf",
      businessType: "retail",
      merchantId: merchant.id,
    });
    store.updateJob(privateJob.id, { status: "completed", progress: 100, productionReportV2: projection });

    const missing = await api("/api/jobs/missing-job");
    const unauthorized = await api(`/api/jobs/${encodeURIComponent(privateJob.id)}`);

    expect(missing).toEqual({ status: 404, body: { error: "Job not found" } });
    expect(unauthorized).toEqual(missing);
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(processJobUntilTerminal).not.toHaveBeenCalled();
  });
});

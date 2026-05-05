import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoreModule = typeof import("../src/store.js");
type DbModule = typeof import("../src/db.js");

describe("store", () => {
  let store: StoreModule;
  let dbModule: DbModule;

  beforeEach(async () => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
    store = await import("../src/store.js");
    dbModule = await import("../src/db.js");
  });

  afterEach(() => {
    dbModule.db.close();
    delete process.env.FEECLEAR_DB_PATH;
  });

  it("creates, reads, updates, and fails jobs", () => {
    const job = store.createJob({
      uploadId: "upload-1",
      fileName: "statement.pdf",
      filePath: "/tmp/statement.pdf",
      fileType: "pdf",
      businessType: "retail",
      statementSlot: 2,
      detectedStatementPeriod: "2024-10",
    });

    const created = store.getJob(job.id);
    expect(created?.status).toBe("queued");
    expect(created?.progress).toBe(0);
    expect(created?.uploadId).toBe("upload-1");
    expect(created?.statementSlot).toBe(2);
    expect(created?.attemptCount).toBe(0);

    const updated = store.updateJob(job.id, {
      status: "verifying_statement",
      progress: 10,
      detectedStatementPeriod: "2024-10",
    });
    expect(updated.status).toBe("verifying_statement");
    expect(updated.detectedStatementPeriod).toBe("2024-10");

    const failed = store.failJob(job.id, "bad pdf");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("bad pdf");
  });

  it("schedules retryable failures with backoff before final failure", () => {
    const job = store.createJob({
      fileName: "statement.pdf",
      filePath: "/tmp/statement.pdf",
      fileType: "pdf",
      businessType: "retail",
      maxAttempts: 2,
    });

    const attempt1 = store.startJobAttempt(job.id);
    expect(attempt1.attemptCount).toBe(1);

    const retry = store.retryJobOrFail(job.id, "temporary parser issue");
    expect(retry.retrying).toBe(true);
    expect(retry.job.status).toBe("queued");
    expect(retry.job.error).toBe("temporary parser issue");
    expect(retry.job.nextRunAt).toBeTruthy();
    expect(store.getNextQueuedJob()).toBeUndefined();

    store.updateJob(job.id, { nextRunAt: new Date(Date.now() - 1000).toISOString() });
    expect(store.getNextQueuedJob()?.id).toBe(job.id);

    store.startJobAttempt(job.id);
    const final = store.retryJobOrFail(job.id, "still broken");
    expect(final.retrying).toBe(false);
    expect(final.job.status).toBe("failed");
    expect(final.job.error).toBe("still broken");
  });

  it("returns undefined summary when summary_json is corrupt", () => {
    const job = store.createJob({
      fileName: "statement.pdf",
      filePath: "/tmp/statement.pdf",
      fileType: "pdf",
      businessType: "retail",
    });

    dbModule.db.prepare(`UPDATE analysis_jobs SET summary_json = ? WHERE id = ?`).run("not valid json", job.id);

    const loaded = store.getJob(job.id);
    expect(loaded?.summary).toBeUndefined();
  });
});

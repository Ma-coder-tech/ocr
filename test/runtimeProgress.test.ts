import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emitRuntimeProgress,
  normalizeRuntimeProgressEvent,
  type RuntimeProgressEvent,
} from "../src/runtimeProgress.js";

describe("privacy-safe runtime progress", () => {
  afterEach(() => vi.restoreAllMocks());

  it("admits only enumerated stages, bounded identifiers, safe counters, and reason codes", () => {
    expect(normalizeRuntimeProgressEvent({
      stage: "whole_statement_intelligence",
      status: "completed",
      elapsedMs: 1200,
      provider: "openai",
      model: "gpt-5.4-mini",
      counters: {
        expectedFeeRowCount: 8,
        reviewedFeeRowCount: 8,
        batchOrdinal: 1,
        batchExpectedRowCount: 8,
        batchReturnedRowCount: 8,
        batchUniqueReturnedRowCount: 8,
        batchMissingRowCount: 0,
        batchDuplicateRowCount: 0,
        batchUnknownRowCount: 0,
        batchCrossBatchRowCount: 0,
        batchMalformedRowCount: 0,
        batchAttemptCount: 1,
        batchStructuredOutputCompletedCount: 1,
      },
      reasonCodes: ["whole_statement_fee_intelligence_completed"],
    })).toEqual({
      stage: "whole_statement_intelligence",
      status: "completed",
      elapsedMs: 1200,
      provider: "openai",
      model: "gpt-5.4-mini",
      counters: {
        expectedFeeRowCount: 8,
        reviewedFeeRowCount: 8,
        batchOrdinal: 1,
        batchExpectedRowCount: 8,
        batchReturnedRowCount: 8,
        batchUniqueReturnedRowCount: 8,
        batchMissingRowCount: 0,
        batchDuplicateRowCount: 0,
        batchUnknownRowCount: 0,
        batchCrossBatchRowCount: 0,
        batchMalformedRowCount: 0,
        batchAttemptCount: 1,
        batchStructuredOutputCompletedCount: 1,
      },
      reasonCodes: ["whole_statement_fee_intelligence_completed"],
    });

    expect(() => normalizeRuntimeProgressEvent({
      stage: "retrieval",
      status: "completed",
      counters: { rawStatementBytes: 10 } as never,
    })).toThrow("runtime_checkpoint_counter_invalid");
    expect(() => normalizeRuntimeProgressEvent({
      stage: "merchant_language",
      status: "running",
      model: "/private/tmp/merchant.pdf",
    })).toThrow("runtime_checkpoint_model_invalid");
    expect(() => normalizeRuntimeProgressEvent({
      stage: "parser",
      status: "failed",
      reasonCodes: ["merchant name: Jefes"],
    })).toThrow("runtime_checkpoint_reason_code_invalid");
  });

  it("keeps checkpoint failures diagnostic-only", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(emitRuntimeProgress(async () => {
      throw new Error("runtime_checkpoint_write_failed");
    }, { stage: "parser", status: "running" })).resolves.toBeUndefined();
    await expect(emitRuntimeProgress(() => undefined, {
      stage: "parser",
      status: "running",
      model: "merchant statement.pdf",
    })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("does not block job creation when checkpoint storage is unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-checkpoint-failure-"));
    const dbPath = path.join(root, "staging.sqlite");
    process.env.FEECLEAR_DB_PATH = dbPath;
    vi.resetModules();
    const store = await import("../src/store.js");
    const dbModule = await import("../src/db.js");
    dbModule.db.exec("DROP TABLE analysis_job_checkpoints");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const job = store.createJob({
      fileName: "statement.pdf",
      filePath: path.join(root, "statement.pdf"),
      fileType: "pdf",
      businessType: "restaurant",
    });

    expect(job.status).toBe("queued");
    expect(errorSpy).toHaveBeenCalledWith("[runtime-checkpoint] runtime_checkpoint_persistence_failed");
    dbModule.db.close();
    delete process.env.FEECLEAR_DB_PATH;
    await fs.rm(root, { recursive: true, force: true });
  });

  it("persists monotonic checkpoints across a database close and module reload", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-checkpoints-"));
    const dbPath = path.join(root, "staging.sqlite");
    process.env.FEECLEAR_DB_PATH = dbPath;
    vi.resetModules();
    let store = await import("../src/store.js");
    let dbModule = await import("../src/db.js");
    const job = store.createJob({
      fileName: "statement.pdf",
      filePath: path.join(root, "statement.pdf"),
      fileType: "pdf",
      businessType: "restaurant",
    });
    const executionId = "runtime_0123456789abcdef0123456789abcdef";
    const events: RuntimeProgressEvent[] = [
      { stage: "parser", status: "running" },
      { stage: "parser", status: "completed", elapsedMs: 25 },
      { stage: "canonical_construction", status: "running" },
    ];
    events.forEach((event) => store.appendJobCheckpoint(job.id, { attemptCount: 1, executionId, event }));
    expect(store.listJobCheckpoints(job.id).map((item) => item.sequence)).toEqual([1, 2, 3, 4]);
    dbModule.db.close();

    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = dbPath;
    store = await import("../src/store.js");
    dbModule = await import("../src/db.js");
    expect(store.listJobCheckpoints(job.id)).toMatchObject([
      { sequence: 1, stage: "queued", status: "waiting", executionId: null },
      { sequence: 2, stage: "parser", status: "running", executionId },
      { sequence: 3, stage: "parser", status: "completed", elapsedMs: 25, executionId },
      { sequence: 4, stage: "canonical_construction", status: "running", executionId },
    ]);
    dbModule.db.close();
    delete process.env.FEECLEAR_DB_PATH;
    await fs.rm(root, { recursive: true, force: true });
  });
});

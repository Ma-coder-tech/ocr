import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import {
  PdfParserAbortError,
  PdfParserIsolationError,
  PdfParserTimeoutError,
  resolvePdfParserWorkerPathForDeployment,
  runIsolatedPdfPageTextParser,
  runIsolatedPdfParser,
  type PdfParserStageDiagnostic,
} from "../src/pdfParserIsolation.js";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const JEFES = path.join(process.cwd(), "test", "fixtures", "pdfs", "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");

describe("isolated PDF parser runtime", () => {
  it("demonstrates why a same-event-loop Promise race is not a wall-clock boundary", async () => {
    const startedAt = Date.now();
    const blockedOperation = Promise.resolve().then(() => {
      const blockedUntil = Date.now() + 120;
      while (Date.now() < blockedUntil) {
        // Deliberately block the execution context that also owns the timer.
      }
      return "completed";
    });
    const deadline = new Promise<string>((resolve) => setTimeout(() => resolve("timed_out"), 10));

    await expect(Promise.race([blockedOperation, deadline])).resolves.toBe("completed");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
  });

  it("completes the supported Jefes path without changing deterministic financial facts", async () => {
    const diagnostics: PdfParserStageDiagnostic[] = [];
    const parsed = await parsePdf(JEFES, undefined, { onStage: (diagnostic) => diagnostics.push(diagnostic) });
    const summary = analyzeStatementDocument(parsed, "restaurant_food_beverage", {
      sourceFileName: path.basename(JEFES),
    });

    expect(parsed.extraction).toMatchObject({ mode: "structured", lineCount: 432 });
    expect(parsed.rows).toHaveLength(432);
    expect(summary).toMatchObject({
      processorName: "Basys",
      statementPeriod: "2020-03",
      totalVolume: 171283.93,
      totalFees: 3552.45,
      effectiveRate: 2.07,
      confidence: "high",
    });
    expect(summary.parserSource?.driverId).toBe("generic_fiserv_family_statement");
    expect(summary.fiservFeeAnalysisV2?.reconciliation).toMatchObject({ basisTotal: 3552.45, rowTotal: 3552.45, residual: 0, status: "pass" });
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "document_loaded", pageCount: 8 }),
      expect.objectContaining({ stage: "text_content_completed", pageNumber: 8, itemCount: 153 }),
      expect.objectContaining({ stage: "document_destroy_completed" }),
    ]));
  }, 30_000);

  it("terminates a parser worker that blocks its own event loop", async () => {
    const startedAt = Date.now();
    const attempt = runIsolatedPdfParser(new Uint8Array([1]), {
      timeoutMs: 40,
      workerFactory: () => new Worker("while (true) {}", { eval: true, stdout: true, stderr: true }),
    });

    await expect(attempt).rejects.toBeInstanceOf(PdfParserTimeoutError);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("terminates the retrieved-PDF worker after successful page-text extraction", async () => {
    let worker: Worker | undefined;
    const pages = await runIsolatedPdfPageTextParser(new Uint8Array([1]), {
      workerFactory: () => {
        worker = new Worker(`
          const { parentPort } = require("node:worker_threads");
          parentPort.postMessage({ type: "page_text_result", pages: [{ pageNumber: 1, text: "Official fee guide" }] });
          setInterval(() => {}, 1000);
        `, { eval: true, stdout: true, stderr: true });
        return worker;
      },
    });

    expect(pages).toEqual([{ pageNumber: 1, text: "Official fee guide" }]);
    expect(worker?.threadId).toBe(-1);
  });

  it("forcibly terminates a blocking retrieved-PDF worker within the parent deadline", async () => {
    let worker: Worker | undefined;
    const startedAt = Date.now();
    const attempt = runIsolatedPdfPageTextParser(new Uint8Array([1]), {
      timeoutMs: 40,
      workerFactory: () => {
        worker = new Worker("while (true) {}", { eval: true, stdout: true, stderr: true });
        return worker;
      },
    });

    await expect(attempt).rejects.toBeInstanceOf(PdfParserTimeoutError);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(worker?.threadId).toBe(-1);
  });

  it("propagates parent abort and terminates the retrieved-PDF worker", async () => {
    let worker: Worker | undefined;
    const controller = new AbortController();
    const attempt = runIsolatedPdfPageTextParser(new Uint8Array([1]), {
      timeoutMs: 5_000,
      abortSignal: controller.signal,
      workerFactory: () => {
        worker = new Worker("while (true) {}", { eval: true, stdout: true, stderr: true });
        return worker;
      },
    });
    setTimeout(() => controller.abort(), 20);

    await expect(attempt).rejects.toBeInstanceOf(PdfParserAbortError);
    expect(worker?.threadId).toBe(-1);
  });

  it("terminates the retrieved-PDF worker after an isolated parse failure", async () => {
    let worker: Worker | undefined;
    const attempt = runIsolatedPdfPageTextParser(new Uint8Array([1]), {
      workerFactory: () => {
        worker = new Worker(`
          const { parentPort } = require("node:worker_threads");
          parentPort.postMessage({ type: "error", code: "pdf_parse_failed" });
          setInterval(() => {}, 1000);
        `, { eval: true, stdout: true, stderr: true });
        return worker;
      },
    });

    await expect(attempt).rejects.toMatchObject({ name: PdfParserIsolationError.name, code: "pdf_parse_failed" });
    expect(worker?.threadId).toBe(-1);
  });

  it("keeps the isolated runtime and PDF.js assets in the Vercel bundle contract", () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
      builds: Array<{ config?: { includeFiles?: string[] } }>;
    };
    const includeFiles = config.builds[0]?.config?.includeFiles ?? [];
    const workerPath = resolvePdfParserWorkerPathForDeployment();
    const workerSource = fs.readFileSync(workerPath, "utf8");
    const lockfile = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8")) as {
      packages: Record<string, { optional?: boolean; optionalDependencies?: Record<string, string> }>;
    };

    expect(includeFiles).toContain("node_modules/pdfjs-dist/**");
    expect(includeFiles).toContain("src/pdfParserWorker.mjs");
    expect(fs.existsSync(path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts"))).toBe(true);
    expect(workerSource).toContain('import("pdfjs-dist/legacy/build/pdf.mjs")');
    expect(workerSource).toContain("verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0");
    expect(lockfile.packages["node_modules/pdfjs-dist"]?.optionalDependencies).toHaveProperty("@napi-rs/canvas");
    expect(lockfile.packages["node_modules/@napi-rs/canvas"]?.optional).toBe(true);
  });
});

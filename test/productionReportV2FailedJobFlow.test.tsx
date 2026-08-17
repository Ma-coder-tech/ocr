// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import type { ParsedDocument } from "../src/parser.js";
import { ReportV2Gate } from "../web/src/report-v2/ReportV2Gate.js";

const scannedDocument: ParsedDocument = {
  sourceType: "pdf",
  headers: [],
  rows: [],
  textPreview: "",
  extraction: { mode: "unusable", qualityScore: 0, reasons: ["no_extractable_text"], lineCount: 0, amountTokenCount: 0, hasExtractableText: false },
};

const missingTotalsDocument: ParsedDocument = {
  sourceType: "pdf",
  headers: ["content"],
  rows: [{ content: "Merchant statement payment processing fee details" }],
  textPreview: "Merchant statement payment processing fee fees charged",
  extraction: { mode: "text_only", qualityScore: 0.5, reasons: [], lineCount: 2, amountTokenCount: 8, hasExtractableText: true },
};

let database: typeof import("../src/db.js").db | null = null;

afterEach(async () => {
  cleanup();
  database?.close();
  database = null;
  for (const key of [
    "FEECLEAR_DB_PATH",
    "VERCEL",
    "RATEREVEAL_REPORT_V2_ENABLED",
    "RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ENABLED",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
  ]) delete process.env[key];
  vi.doUnmock("../src/parser.js");
  vi.doUnmock("../src/statementParserOrchestrator.js");
  vi.doUnmock("../src/checklistEngine.js");
  vi.resetModules();
});

describe("failed job Report V2 recovery integration", () => {
  it.each([
    ["unusable scanned input", scannedDocument],
    ["missing required financial totals", missingTotalsDocument],
  ])("keeps %s failed while transporting and rendering Package 3 recovery", async (_name, document) => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
    process.env.VERCEL = "1";
    process.env.RATEREVEAL_REPORT_V2_ENABLED = "true";
    process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ENABLED = "false";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.OPENAI_API_KEY = "";

    const summary = analyzeDocument(document, "retail");
    vi.doMock("../src/parser.js", () => ({
      parsePdf: async () => structuredClone(document),
      parseCsv: async () => structuredClone(document),
    }));
    vi.doMock("../src/statementParserOrchestrator.js", () => ({
      analyzeStatementDocumentWithOptionalAi: async () => structuredClone(summary),
    }));
    vi.doMock("../src/checklistEngine.js", () => ({ evaluateChecklistReport: vi.fn() }));

    const store = await import("../src/store.js");
    database = (await import("../src/db.js")).db;
    const worker = await import("../src/worker.js");
    const job = store.createJob({ fileName: "unsafe.pdf", filePath: "/tmp/unsafe.pdf", fileType: "pdf", businessType: "retail" });

    await worker.processJob(job.id);
    const failed = store.getJob(job.id)!;
    expect(failed.status).toBe("failed");
    expect(failed.productionReportV2).toMatchObject({ experience: "unable_to_complete", report: null });

    const { buildAnonymousJobPayload } = await import("../src/server.js");
    const payload = buildAnonymousJobPayload(failed) as { status: string; productionReportV2: unknown };
    expect(payload.status).toBe("failed");
    expect(payload.productionReportV2).toEqual(failed.productionReportV2);

    render(
      <ReportV2Gate enabled productionReportV2={payload.productionReportV2} onStartOver={() => {}}>
        <div>Generic analysis error</div>
      </ReportV2Gate>,
    );
    expect(screen.getByRole("heading", { name: /couldn't complete this statement review/i })).toBeInTheDocument();
    expect(screen.queryByText("Generic analysis error")).not.toBeInTheDocument();
    expect(screen.queryByText("Your effective rate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare 3–6 more months/i })).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { toPublicReportSummary } from "../src/publicReport.js";
import type { AnalysisSummary, ChecklistBucket } from "../src/types.js";

function bucket(results: ChecklistBucket["results"]): ChecklistBucket {
  return {
    total: results.length,
    pass: results.filter((result) => result.status === "pass").length,
    fail: results.filter((result) => result.status === "fail").length,
    warning: results.filter((result) => result.status === "warning").length,
    unknown: results.filter((result) => result.status === "unknown").length,
    notApplicable: results.filter((result) => result.status === "not_applicable").length,
    results,
  };
}

function summaryWithChecklist(): AnalysisSummary {
  return {
    businessType: "retail",
    processorName: "Clover",
    sourceType: "pdf",
    statementPeriod: "2024-10",
    executiveSummary: "Summary",
    totalVolume: 10000,
    totalFees: 300,
    estimatedMonthlyVolume: 10000,
    estimatedMonthlyFees: 300,
    effectiveRate: 3,
    benchmark: { status: "within", lowerRate: 2, upperRate: 4 },
    confidence: "high",
    dataQuality: [],
    checklistReport: {
      extractionMode: "structured",
      extractionQualityScore: 92,
      extractionReasons: ["structured rows", "totals matched", "processor detected", "extra private detail"],
      processorDetection: {
        detectedProcessorId: "clover",
        detectedProcessorName: "Clover",
        rulePackId: "clover",
        confidence: 0.9,
        matchedKeywords: ["clover"],
        source: "text_preview",
      },
      universal: bucket([
        { id: "u-warning-1", title: "Warning one", status: "warning", reason: "Warned first", evidence: ["a", "b", "c", "d"] },
        { id: "u-warning-2", title: "Warning two", status: "warning", reason: "Warned second", evidence: [] },
        { id: "u-warning-3", title: "Warning three", status: "warning", reason: "Warned third", evidence: [] },
        { id: "u-warning-4", title: "Warning four", status: "warning", reason: "Warned fourth", evidence: [] },
        { id: "u-fail", title: "Failure", status: "fail", reason: "More important", evidence: ["fee"] },
        { id: "u-pass", title: "Passed check", status: "pass", reason: "Fine", evidence: ["ok"] },
      ]),
      processorSpecific: {
        ...bucket([{ id: "p-unknown", title: "Unknown check", status: "unknown", reason: "Needs review", evidence: ["processor"] }]),
        processorId: "clover",
        processorName: "Clover",
      },
      crossProcessor: bucket([{ id: "x-na", title: "Not applicable", status: "not_applicable", reason: "Skipped", evidence: [] }]),
    },
  } as unknown as AnalysisSummary;
}

describe("toPublicReportSummary", () => {
  it("surfaces bounded public checklist findings without leaking internal rule ids", () => {
    const publicSummary = toPublicReportSummary(summaryWithChecklist());

    expect(publicSummary?.statementPeriod).toBe("October 2024");
    expect(publicSummary?.checklistReport?.counts).toEqual({
      total: 8,
      fail: 1,
      warning: 4,
      unknown: 1,
    });
    expect(publicSummary?.checklistReport?.extractionReasons).toEqual(["structured rows", "totals matched", "processor detected"]);
    expect(publicSummary?.checklistReport?.findings.map((finding) => finding.status)).toEqual([
      "fail",
      "warning",
      "warning",
      "warning",
      "unknown",
    ]);
    expect(publicSummary?.checklistReport?.findings[0]).toMatchObject({
      bucket: "universal",
      title: "Failure",
      reason: "More important",
      evidence: ["fee"],
    });
    expect(publicSummary?.checklistReport?.findings[1]?.evidence).toEqual(["a", "b", "c"]);
    expect(publicSummary?.checklistReport?.findings.some((finding) => "id" in finding)).toBe(false);
  });
});

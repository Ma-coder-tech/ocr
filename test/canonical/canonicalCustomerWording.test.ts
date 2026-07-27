import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeOwnershipActionability } from "../../src/canonical/feeOwnershipActionability.js";
import { buildCanonicalOpportunityEngine } from "../../src/canonical/opportunityEngine.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type { CanonicalAiCapabilityOutput, CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical customer wording", () => {
  it("uses calm deterministic fallback wording with no prohibited claims", () => {
    const analysis = analysisWithLedger();
    ready(analysis);

    expect(analysis.customerState.explanation.source).toBe("deterministic_fallback");
    const text = analysis.customerState.explanation.sections.map((section) => section.text).join(" ");
    expect(text).toMatch(/RateReveal verified|Your statement shows|Ask your processor/i);
    expect(text).not.toMatch(/overpaying|cheating|guaranteed|definitely remove/i);
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("accepts safe AI narrative only when it agrees with the deterministic projection", () => {
    const analysis = analysisWithLedger();
    const safeNarrative = merchantNarrative(analysis, "RateReveal reviewed the statement and kept verification-only items separate.");
    ready(analysis, safeNarrative);

    expect(analysis.customerState.explanation.source).toBe("ai_enhanced");
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("falls back when AI narrative implies a benchmark conclusion that Package G did not prove", () => {
    const analysis = analysisWithLedger();
    const unsafeNarrative = merchantNarrative(analysis, "Your rate is competitive, and verification-only items are separate.");
    ready(analysis, unsafeNarrative);

    expect(analysis.customerState.axes.ratePosition).toBe("unavailable");
    expect(analysis.customerState.explanation.source).toBe("deterministic_fallback");
    expect(analysis.customerState.explanation.fallbackReasonCodes).toContain("ai_narrative_contradicted_projection");
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });
});

function ready(analysis: CanonicalStatementAnalysis, narrative?: CanonicalAiCapabilityOutput): void {
  const harnessInputs: Parameters<typeof buildCanonicalAiCapabilities>[0]["harnessInputs"] = [
    { capability: "full_statement_anomaly_review", status: "completed", output: anomalyOutput(analysis) },
  ];
  if (narrative) harnessInputs.push({ capability: "merchant_narrative", status: "completed", output: narrative });
  analysis.aiCapabilities = buildCanonicalAiCapabilities({ ...analysis, evidence: analysis.evidence, harnessInputs });
  analysis.customerState = buildCanonicalCustomerState({ ...analysis });
}

function analysisWithLedger(): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(statement(), { sourceFileName: "package-g-wording.pdf", businessType: "restaurant", preferExtractedRows: true });
  analysis.identity.statementPeriod = selectedFact({ value: { start: "2026-01-01", end: "2026-01-31" }, confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic verified period." });
  analysis.identity.processorFamily = selectedFact({ value: "fiserv", confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic processor." });
  analysis.identity.processorName = selectedFact({ value: "Fiserv", confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic processor." });
  const evidence = new Map();
  const calculations: any[] = [];
  analysis.feeLedger = buildCanonicalFeeLedger({
    doc: statement(),
    documentId: "doc_pkg_g_wording",
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows: [{ description: "Monthly CPU GTWY", amount: 10, sourceSection: "Fees", evidenceLine: "Monthly CPU GTWY | -$10.00", pageNumber: 1, confidence: "high" }],
        controls: [{ label: "Total Fees", rowSum: 10, printedTotal: 10, delta: 0, evidenceLine: "Total Fees | -$10.00" }],
        printedTotal: 10,
        delta: 0,
      },
    },
  });
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(analysis.feeLedger, { processorFamily: "fiserv", statementPeriodStart: "2026-01-01" });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({ feeLedger: analysis.feeLedger, feeOwnershipActionability: analysis.feeOwnershipActionability, evidence: analysis.evidence, statementPeriodVerified: true });
  return analysis;
}

function anomalyOutput(analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const evidenceRef = analysis.evidence[0]!.id;
  return { type: "full_statement_anomaly_review", authoritative: false, evidenceRefs: [evidenceRef], factRefs: ["financialFacts.processedSales"], limitationCodes: [], observations: [{ id: "obs_wording", severity: "info", summary: "Synthetic core metrics are reviewed.", affectedFactRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef], authoritative: false }] };
}

function merchantNarrative(analysis: CanonicalStatementAnalysis, text: string): CanonicalAiCapabilityOutput {
  const evidenceRef = analysis.evidence[0]!.id;
  return {
    type: "merchant_narrative",
    authoritative: false,
    evidenceRefs: [evidenceRef],
    factRefs: ["financialFacts.processedSales"],
    limitationCodes: [],
    sections: [{ kind: "verified_facts", text, factRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef] }],
  };
}

function statement(): ParsedDocument {
  const lines = ["Merchant: Package G Wording", "Processor: Fiserv", "Total Amount Submitted | $1,000.00", "Fees Charged | -$30.00", "Monthly CPU GTWY | -$10.00"];
  return { sourceType: "pdf", headers: [], rows: lines.map((content) => ({ content, page: "page-1" })), textPreview: lines.join("\n"), extraction: { mode: "structured", qualityScore: 1, reasons: [], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true } };
}

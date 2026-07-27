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

describe("canonical customer permissions", () => {
  it("preserves verified core metrics while hiding opportunity conclusions during limited fee reconciliation", () => {
    const analysis = analysisWithLedger();
    analysis.feeLedger.status = "partial";
    ready(analysis);

    expect(analysis.customerState.primaryState).toBe("analysis_limited");
    expect(analysis.customerState.visibility.showCoreMetrics).toBe(true);
    expect(analysis.customerState.visibility.showEffectiveRate).toBe(true);
    expect(analysis.customerState.visibility.visibleEligibleAnnualAmount).toEqual(money(0));
    expect(permission(analysis, "deterministic_opportunity")?.permitted).toBe(false);
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("withholds financial visibility when Package F does not permit conclusions", () => {
    const analysis = analysisWithLedger();
    analysis.customerState = buildCanonicalCustomerState({ ...analysis });

    expect(analysis.customerState.primaryState).toBe("analysis_withheld");
    expect(analysis.customerState.visibility.showCoreMetrics).toBe(false);
    expect(analysis.customerState.visibility.visibleVerificationOnlyObservedAmount).toEqual(money(0));
    expect(permission(analysis, "customer_explanation")?.permitted).toBe(true);
  });

  it("records that consumers may only reduce canonical visibility", () => {
    const analysis = analysisWithLedger();
    ready(analysis);

    expect(analysis.customerState.visibility.consumerMayReduceVisibilityOnly).toBe(true);
    expect(analysis.customerState.permissions.map((item) => item.key).sort()).toEqual(
      [
        "actions",
        "ai_enhanced_narrative",
        "benchmark",
        "core_metrics",
        "deterministic_opportunity",
        "effective_rate",
        "estimated_opportunity",
        "evidence_calculations",
        "fee_inventory",
        "ownership_actionability",
        "customer_explanation",
        "verification_amounts",
      ].sort(),
    );
  });
});

function permission(analysis: CanonicalStatementAnalysis, key: string) {
  return analysis.customerState.permissions.find((item) => item.key === key);
}

function ready(analysis: CanonicalStatementAnalysis): void {
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    ...analysis,
    evidence: analysis.evidence,
    harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output: anomalyOutput(analysis) }],
  });
  analysis.customerState = buildCanonicalCustomerState({ ...analysis });
}

function analysisWithLedger(): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(statement(), { sourceFileName: "package-g-permissions.pdf", businessType: "restaurant", preferExtractedRows: true });
  analysis.identity.statementPeriod = selectedFact({ value: { start: "2026-01-01", end: "2026-01-31" }, confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic verified period." });
  analysis.identity.processorFamily = selectedFact({ value: "fiserv", confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic processor." });
  analysis.identity.processorName = selectedFact({ value: "Fiserv", confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic processor." });
  const evidence = new Map();
  const calculations: any[] = [];
  analysis.feeLedger = buildCanonicalFeeLedger({
    doc: statement(),
    documentId: "doc_pkg_g_permissions",
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
  return {
    type: "full_statement_anomaly_review",
    authoritative: false,
    evidenceRefs: [evidenceRef],
    factRefs: ["financialFacts.processedSales"],
    limitationCodes: [],
    observations: [{ id: "obs_permissions", severity: "info", summary: "Synthetic core metrics are reviewed.", affectedFactRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef], authoritative: false }],
  };
}

function statement(): ParsedDocument {
  const lines = ["Merchant: Package G Permissions", "Processor: Fiserv", "Total Amount Submitted | $1,000.00", "Fees Charged | -$30.00", "Monthly CPU GTWY | -$10.00"];
  return { sourceType: "pdf", headers: [], rows: lines.map((content) => ({ content, page: "page-1" })), textPreview: lines.join("\n"), extraction: { mode: "structured", qualityScore: 1, reasons: [], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true } };
}

function money(dollars: number) {
  return { amountMinor: Math.round(dollars * 100), currency: "USD" as const };
}

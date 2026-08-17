import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeOwnershipActionability } from "../../src/canonical/feeOwnershipActionability.js";
import { buildCanonicalMerchantAttentionModel } from "../../src/canonical/merchantAttention.js";
import { buildMerchantAttentionAiInterpretationPacket } from "../../src/canonical/merchantAttentionAiInterpretation.js";
import { buildCanonicalOpportunityEngine } from "../../src/canonical/opportunityEngine.js";
import type { CanonicalEvidenceRecord, CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

export type Package3TestRow = { label: string; amount: number; section?: string };

export function package3Analysis(rows: Package3TestRow[]): CanonicalStatementAnalysis {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const doc = package3Statement(total);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(doc, {
    sourceFileName: null,
    sourceAnalysisId: "package_3_generalized_fixture",
    businessType: "restaurant_food_beverage",
    preferExtractedRows: true,
  });
  const evidence = new Map<string, CanonicalEvidenceRecord>();
  const calculations: CanonicalStatementAnalysis["calculations"] = [];
  analysis.feeLedger = buildCanonicalFeeLedger({
    doc,
    documentId: "doc_package_3_generalized",
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows: rows.map((row, index) => ({
          description: row.label,
          amount: row.amount,
          sourceSection: row.section ?? "Fees",
          evidenceLine: `${row.label} | -$${row.amount.toFixed(2)}`,
          pageNumber: 1,
          rowIndex: index,
          confidence: "high",
        })),
        controls: [{ label: "Total Fees", rowSum: total, printedTotal: total, delta: 0, evidenceLine: `Total Fees | -$${total.toFixed(2)}` }],
        printedTotal: total,
        delta: 0,
      },
    },
  });
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(analysis.feeLedger, {
    processorFamily: "fiserv",
    statementPeriodStart: "2026-08-01",
  });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
  });
  analysis.identity.processorName.status = "selected";
  analysis.identity.processorName.value = "Fiserv";
  analysis.identity.merchantName.status = "selected";
  analysis.identity.merchantName.value = "Fixture Merchant";
  analysis.identity.merchantName.confidence = "high";
  analysis.identity.merchantName.evidenceRefs = [...analysis.financialFacts.processedSales.evidenceRefs];
  analysis.identity.processorFamily.status = "selected";
  analysis.identity.processorFamily.value = "fiserv";
  analysis.identity.statementPeriod.status = "selected";
  analysis.identity.statementPeriod.value = { start: "2026-08-01", end: "2026-08-31" };
  analysis.businessQualification.status = "qualified";
  analysis.businessQualification.resolvedSegmentId = "restaurant_food_service";
  analysis.businessQualification.confirmationRequirement = null;
  refreshPackage3Analysis(analysis);
  return analysis;
}

export function refreshPackage3Analysis(analysis: CanonicalStatementAnalysis): void {
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    businessQualification: analysis.businessQualification,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
    harnessInputs: [],
  });
  analysis.customerState = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    aiCapabilities: analysis.aiCapabilities,
    rateComparison: analysis.customerState.rateComparison,
  });
  analysis.merchantAttention = buildCanonicalMerchantAttentionModel(analysis);
  authorizePackage3ProjectionFixture(analysis);
}

function authorizePackage3ProjectionFixture(analysis: CanonicalStatementAnalysis): void {
  const reconciled = analysis.feeLedger.status === "available"
    && analysis.feeLedger.controls.every((control) => ["pass", "pass_with_rounding"].includes(control.status));
  const hasQuestion = analysis.merchantAttention.items.some((item) => item.questionToResolve);
  const hasAction = analysis.merchantAttention.items.some((item) => item.surfaceEligibility.actionToolkit && item.actionToolkit);
  const benchmark = analysis.customerState.rateComparison.status === "qualified"
    && analysis.customerState.rateComparison.position !== "unavailable";
  analysis.customerState.axes.analysisReadiness = reconciled ? "verified" : "limited";
  analysis.customerState.axes.dataIntegrity = reconciled ? "reconciled" : "partially_reconciled";
  analysis.customerState.axes.ratePosition = benchmark ? analysis.customerState.rateComparison.position : "unavailable";
  analysis.customerState.axes.opportunityPosture = hasQuestion ? "verification_only" : "none";
  analysis.customerState.primaryState = !reconciled
    ? "analysis_limited"
    : hasQuestion
      ? "verification_needed"
      : "verified_benchmark_unavailable";
  const permitted = new Set([
    "core_metrics",
    "effective_rate",
    "fee_inventory",
    "ownership_actionability",
    "evidence_calculations",
    "customer_explanation",
    ...(benchmark ? ["benchmark"] : []),
    ...(hasQuestion ? ["verification_amounts"] : []),
    ...(hasAction ? ["actions"] : []),
  ]);
  for (const permission of analysis.customerState.permissions) {
    permission.permitted = permitted.has(permission.key);
    permission.reasonCodes = [permission.permitted ? "package_3_projection_fixture_permitted" : "package_3_projection_fixture_hidden"];
    permission.limitationCodes = permission.permitted ? [] : [...permission.reasonCodes];
  }
  const visibility = analysis.customerState.visibility;
  visibility.showCoreMetrics = permitted.has("core_metrics");
  visibility.showEffectiveRate = permitted.has("effective_rate");
  visibility.showBenchmark = permitted.has("benchmark");
  visibility.showFeeInventory = permitted.has("fee_inventory");
  visibility.showOwnershipActionability = permitted.has("ownership_actionability");
  visibility.showVerificationAmounts = permitted.has("verification_amounts");
  visibility.showEvidenceCalculations = permitted.has("evidence_calculations");
  visibility.showActions = permitted.has("actions");
  visibility.showCustomerExplanation = permitted.has("customer_explanation");
  visibility.hiddenReasonCodes = analysis.customerState.permissions
    .filter((permission) => !permission.permitted)
    .flatMap((permission) => permission.reasonCodes)
    .sort();
}

export function validPackage3Interpretation(model: CanonicalStatementAnalysis["merchantAttention"]): any {
  const packet = buildMerchantAttentionAiInterpretationPacket(model);
  return {
    type: "merchant_attention_ai_interpretation",
    policyVersion: "merchant_attention_ai_interpretation_v1",
    outputId: "merchant_language_test_output",
    items: model.items.filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation).map((item) => ({
      attentionItemId: item.id,
      merchantTitle: item.merchantTitle.replace(/\bcharge\b/i, "fee"),
      whyThisDeservesAttention: item.whyThisDeservesAttention,
      reasonableConclusion: item.evidenceBoundary.reasonableConclusion.summary,
      remainingUncertainty: [...item.evidenceBoundary.remainingUncertainty],
      safeNextAction: item.safestNextAction.instruction.replace(/^Ask\b/i, "Request"),
      resolutionMeaning: item.resolution.merchantMeaning,
      question: item.questionToResolve ? {
        question: item.questionToResolve.question.replace(/ labeled “[^”]+”/i, "").replace(/Which pricing terms and fee components/i, "Which pricing terms and charge components"),
        whatRateRevealKnows: item.scope === "fee_row" ? "The statement contains an observed charge." : item.questionToResolve.whatRateRevealKnows,
        whatRemainsUncertain: item.questionToResolve.whatRemainsUncertain,
        safeNextStep: item.questionToResolve.safeNextStep.replace(/^Ask\b/i, "Request"),
      } : null,
      actionToolkit: item.actionToolkit ? {
        whatToDo: item.actionToolkit.whatToDo.replace(/^Ask\b/i, "Request"),
        why: item.actionToolkit.why,
        exactAsk: item.actionToolkit.exactAsk,
        unclearAnswerFollowUp: item.actionToolkit.unclearAnswerFollowUp,
        avoidClaiming: [...item.actionToolkit.avoidClaiming],
        successCriteria: [...item.actionToolkit.successCriteria],
      } : null,
      semanticSupportRefs: packet.items.find((candidate) => candidate.attentionItemId === item.id)!.semanticSupportUnits.map((unit) => unit.supportRef),
    })),
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function package3Statement(totalFees: number): ParsedDocument {
  const lines = [
    "SYNTHETIC FISERV STATEMENT",
    "Processor: Fiserv",
    "Statement Period: 08/01/2026 - 08/31/2026",
    "Total Amount Submitted | $20,000.00",
    `Fees Charged | -$${totalFees.toFixed(2)}`,
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, warnings: [], pageCount: 1 },
  };
}

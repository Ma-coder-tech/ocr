import { beforeAll, describe, expect, it } from "vitest";

import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystMerchantContext,
} from "../../src/canonical/internalAnalystFindingV1.js";
import { parsePdf, type ParsedDocument } from "../../src/parser.js";

const SOURCE = "test/fixtures/pdfs/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["fixture:us"] } } as any;

let parsed: ParsedDocument;

beforeAll(async () => {
  parsed = await parsePdf(SOURCE);
});

describe("Per-Authorization Commercial Runtime Readiness v1", () => {
  it("A: produces a fully bound, material REVIEW candidate through the normal path", () => {
    const { analysis, report } = normalPath({ channel: "card_present", policy: "no_known_public_block" });
    const before = canonicalFinancialTruthFingerprint(analysis);
    const decision = highVolumeDecision(report, "VISA WATS AUTH FEE");
    const candidate = runtimeCandidate(report, decision.candidateId);
    const context = runtimeContext(report, decision.candidateId);

    expect(decision.comparisonValidity).toBe("valid_exact");
    expect(decision.materiality.state).toBe("review_threshold_met");
    expect(decision.action).toEqual({ permitted: true, type: "REVIEW_CURRENT_PRICING" });
    expect(candidate.offsets.state).toBe("complete_non_reversing");
    expect(candidate.providerControlledCost).toEqual({ state: "exact", amountMinor: 37_884 });
    expect(context).toMatchObject({
      bindingSource: "runtime_bound",
      population: "authorizations",
      populationCount: 3444,
      channel: "card_present",
      evidenceStrength: "high",
      comparisonDirection: "current_costs_more",
      applicabilityState: "no_known_public_block:approval_unknown",
      offsetState: "complete_non_reversing",
      controlState: "exact_provider_controlled",
    });
    expect(report.perAuthorizationCommercialRuntimeReadiness.summary.fallbackArbitrationContexts).toBe(0);
    expect(report.commercialReportSetOfflineIntegration.selectionLedger.some((item) => item.candidateId === decision.candidateId)).toBe(true);
    expect(report.commercialReportSetOfflineIntegration.realCustomerRoutingAllowed).toBe(false);
    expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
  });

  it("B: keeps an exact comparison below Product materiality out of REVIEW", () => {
    const { report } = normalPath({ channel: "card_present", policy: "no_known_public_block" });
    const decision = highVolumeDecision(report, "MASTERCARD WATS AUTH FEE");
    expect(decision.comparisonValidity).toBe("valid_exact");
    expect(decision.materiality.state).toBe("explain_only");
    expect(decision.action.permitted).toBe(false);
  });

  it("C: refuses arithmetic and action on channel mismatch", () => {
    const { report } = normalPath({ channel: "card_not_present", policy: "no_known_public_block" });
    const attempt = attemptsFor(report, "MASTERCARD WATS AUTH FEE")
      .find((item) => item.alternativeOffer === "Standard Retail / Storefront");
    expect(attempt?.comparisonPerformed).toBe(false);
    expect(attempt?.stoppingReason).toContain("channel");
    expect(attempt?.finding.economics.matchedComponentDifference.state).toBe("NOT_ESTABLISHED");
  });

  it("D and L: constructs an evidence-bound invalidating VERIFY dependency for unknown channel", () => {
    const { report } = normalPath({ channel: "unknown", policy: "no_known_public_block" });
    const runtime = report.perAuthorizationCommercialRuntimeReadiness;
    const dependency = runtime.verifyDependencies[0];
    expect(runtime.verifyDependencies.length).toBeGreaterThan(0);
    expect(runtime.merchantProjection.decisions.every((decision) => !decision.action.permitted)).toBe(true);
    expect(dependency?.effect).toBe("invalidates_or_materially_changes");
    const context = runtime.candidateContexts.find((item) => item.candidateId === dependency?.verifyCandidateId);
    expect(context?.verify).toMatchObject({
      impact: "invalidates_or_materially_changes_review",
      missingFact: "CP/CNP authorization population split",
    });
    expect(context?.evidenceRefs?.length).toBeGreaterThan(0);
    const ledger = report.commercialReportSetOfflineIntegration.selectionLedger.find((item) => item.candidateId === dependency?.reviewCandidateId);
    expect(ledger?.linkedVerifyCandidateId).toBe(dependency?.verifyCandidateId);
    expect(ledger?.reasonCodes).toContain("review_path_held_by_unresolved_verify");
  });

  it("E: preserves authorization and settled-transaction populations as incompatible", () => {
    const { report } = normalPath({
      channel: "card_present",
      policy: "no_known_public_block",
      replacements: [["MASTERCARD WATS AUTH FEE", "MASTERCARD SETTLED TRANSACTION AUTH FEE"]],
    });
    const current = currentFor(report, "SETTLED TRANSACTION AUTH FEE");
    expect(current.populationIdentity).toBe("settled_transactions");
    const attempts = report.commercialComparisonAttachment.attempts.filter((item) => item.currentComponentRef === current.componentRef);
    expect(attempts.every((item) => !item.comparisonPerformed)).toBe(true);
    expect(attempts.some((item) => item.stoppingReason?.includes("billing population"))).toBe(true);
  });

  it("F: fails closed and suppresses merchant alternative naming for a prohibited offer", () => {
    const { report } = normalPath({ channel: "card_present", riskClass: "high_risk", policy: "no_known_public_block" });
    const prohibited = report.merchantCommercialFindingShadowProjection.decisions.filter((decision) =>
      decision.presentationGroupId.includes(":High Volume:") && decision.reasonCodes.includes("publicly_prohibited"));
    expect(prohibited.length).toBeGreaterThan(0);
    expect(prohibited.every((decision) => !decision.visibility.permitted
      && !decision.namedAlternativePermitted
      && !decision.action.permitted
      && decision.customerSafeRecord === null)).toBe(true);
  });

  it("G: preserves restricted/review-required status without assuming approval", () => {
    const { report } = normalPath({ channel: "card_present", policy: "restricted" });
    const decision = highVolumeDecision(report, "VISA WATS AUTH FEE");
    const candidate = runtimeCandidate(report, decision.candidateId);
    expect(candidate.applicability).toMatchObject({
      publicPolicy: "restricted_or_review_required",
      approval: "approval_unknown",
    });
    expect(decision.visibility.mode).toBe("verify");
    expect(decision.action.permitted).toBe(false);
  });

  it("H: retains an incomplete same-authorization-scope limitation", () => {
    const { report } = normalPath({
      channel: "card_present",
      policy: "no_known_public_block",
      replacements: [["MASTERCARD WATS AUTH FEE", "MASTERCARD SETTLED TRANSACTION AUTH FEE"]],
    });
    const decision = highVolumeDecision(report, "VISA WATS AUTH FEE");
    const candidate = runtimeCandidate(report, decision.candidateId);
    expect(candidate.offsets.state).toBe("incomplete");
    expect(decision.visibility.mode).toBe("explain");
    expect(decision.action.permitted).toBe(false);
    expect(decision.customerSafeRecord?.scopeNote).toContain("individual component");
    expect(JSON.stringify(decision.customerSafeRecord)).not.toMatch(/savings|cheaper overall/i);
  });

  it("I and J: blocks review and retains both directions when same-scope authorization evidence reverses", () => {
    const { report } = normalPath({
      channel: "card_present",
      policy: "no_known_public_block",
      replacements: [
        ["MASTERCARD WATS AUTH FEE 621 TRANSACTIONS AT 0.11", "MASTERCARD WATS AUTH FEE 621 TRANSACTIONS AT 0.05"],
        ["Fees | -$68.31", "Fees | -$31.05"],
      ],
    });
    const decisions = report.merchantCommercialFindingShadowProjection.decisions.filter((decision) =>
      decision.presentationGroupId.includes(":High Volume:") && decision.comparisonValidity === "valid_exact");
    expect(decisions.some((decision) => decision.direction === "current_costs_more")).toBe(true);
    expect(decisions.some((decision) => decision.direction === "current_costs_less")).toBe(true);
    expect(decisions.every((decision) => !decision.action.permitted)).toBe(true);
    expect(decisions.every((decision) => runtimeCandidate(report, decision.candidateId).offsets.state === "complete_reversing")).toBe(true);
    const contexts = report.perAuthorizationCommercialRuntimeReadiness.candidateContexts.filter((context) =>
      decisions.some((decision) => decision.candidateId === context.candidateId));
    expect(contexts.some((context) => context.comparisonDirection === "current_costs_more")).toBe(true);
    expect(contexts.some((context) => context.comparisonDirection === "current_costs_less")).toBe(true);
  });

  it("K: propagates real claim-specific strength and never uses fallback arbitration context", () => {
    const { report } = normalPath({ channel: "card_present", policy: "no_known_public_block" });
    const runtime = report.perAuthorizationCommercialRuntimeReadiness;
    const exactIds = new Set(runtime.merchantProjection.decisions
      .filter((decision) => decision.comparisonValidity === "valid_exact")
      .map((decision) => decision.candidateId));
    const exactContexts = runtime.candidateContexts.filter((context) => exactIds.has(context.candidateId));
    expect(exactContexts.length).toBeGreaterThan(0);
    expect(exactContexts.every((context) => context.bindingSource === "runtime_bound" && context.evidenceStrength === "high")).toBe(true);
    expect(runtime.summary.fallbackArbitrationContexts).toBe(0);
  });

  it("preserves independently supplied merchant-specific approval without admitting knowledge", () => {
    const { report } = normalPath({ channel: "card_present", approveRetailOffer: true });
    const decision = report.merchantCommercialFindingShadowProjection.decisions.find((item) =>
      item.presentationGroupId.includes(":Standard Retail / Storefront:")
      && item.comparisonValidity === "valid_exact"
      && item.materiality.state === "review_threshold_met");
    const candidate = runtimeCandidate(report, decision!.candidateId);
    expect(candidate.applicability.approval).toBe("merchant_specific_approved");
    expect(decision?.action.permitted).toBe(true);
    expect(candidate.applicability.evidenceRefs).toContain("merchant_document:approved_retail_offer");
  });
});

function normalPath(options: {
  channel: InternalAnalystMerchantContext["channel"];
  riskClass?: InternalAnalystMerchantContext["riskClass"];
  policy?: "no_known_public_block" | "restricted";
  replacements?: Array<[string, string]>;
  approveRetailOffer?: boolean;
}) {
  const document = currentPeriodDocument(options.replacements ?? []);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    sourceFileName: "privacy-safe-supported-fiserv-current-period.pdf",
    businessType: "restaurant_food_beverage",
  });
  const commercialFacts: NonNullable<InternalAnalystMerchantContext["commercialFacts"]> = {};
  if (options.policy === "no_known_public_block") {
    commercialFacts.risk_review_required = { value: false, evidenceRefs: ["merchant_confirmed:risk_review_not_required"], basis: "merchant_confirmed" };
    commercialFacts.future_delivery_or_custom_deposit_or_open_ended_billing = { value: false, evidenceRefs: ["merchant_confirmed:no_future_delivery_condition"], basis: "merchant_confirmed" };
  } else if (options.policy === "restricted") {
    commercialFacts.future_delivery_or_custom_deposit_or_open_ended_billing = { value: true, evidenceRefs: ["merchant_confirmed:future_delivery_condition"], basis: "merchant_confirmed" };
  }
  const merchantContext: InternalAnalystMerchantContext = {
    verticalId: "restaurant_food_beverage",
    riskClass: options.riskClass ?? "standard",
    channel: options.channel,
    averageTicketUsd: 42,
    evidenceRefs: ["fixture:merchant_confirmed_context"],
    basis: "merchant_confirmed",
    commercialFacts,
    ...(options.approveRetailOffer ? { merchantSpecificApprovals: [{
      providerBrand: "dharma_merchant_services",
      namedOffer: "Standard Retail / Storefront",
      distributionChannel: "direct",
      productScope: "all_in_one_processing",
      evidenceRefs: ["merchant_document:approved_retail_offer"],
    }] } : {}),
  };
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, merchantContext, asOf: "2026-09-30" });
  return { analysis, report };
}

function currentPeriodDocument(replacements: Array<[string, string]>): ParsedDocument {
  const convert = (value: string | number): string | number => {
    if (value === 324136827999) return 111111111111;
    if (typeof value !== "string") return value;
    let safe = value
      .replaceAll("09/01/24", "09/01/26")
      .replaceAll("09/30/24", "09/30/26")
      .replaceAll("324136827999", "111111111111")
      .replaceAll("EL NUEVO TEQUILA MEXICAN", "SYNTHETIC CURRENT MERCHANT")
      .replaceAll("FELIX GARCIA", "SYNTHETIC OWNER")
      .replaceAll("602 W 15TH ST", "100 TEST STREET")
      .replaceAll("WASHINGTON NC 27889 -3527", "TEST CITY ST 00000");
    for (const [from, to] of replacements) safe = safe.replaceAll(from, to);
    return safe;
  };
  return {
    ...parsed,
    rows: parsed.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, convert(value)]))),
    textPreview: String(convert(parsed.textPreview)),
    extraction: { ...parsed.extraction, reasons: ["Privacy-safe current-period per-authorization runtime fixture."] },
  };
}

function currentFor(report: ReturnType<typeof buildInternalAnalystFindingV1>, label: string) {
  return report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents
    .find((item) => item.printedLabel.includes(label))!;
}

function attemptsFor(report: ReturnType<typeof buildInternalAnalystFindingV1>, label: string) {
  const current = currentFor(report, label);
  return report.commercialComparisonAttachment.attempts.filter((item) => item.currentComponentRef === current.componentRef);
}

function highVolumeDecision(report: ReturnType<typeof buildInternalAnalystFindingV1>, label: string) {
  const attempts = attemptsFor(report, label);
  return report.merchantCommercialFindingShadowProjection.decisions.find((decision) =>
    attempts.some((attempt) => attempt.attemptId === decision.candidateId)
      && decision.presentationGroupId.includes(":High Volume:")
      && decision.comparisonValidity === "valid_exact")!;
}

function runtimeCandidate(report: ReturnType<typeof buildInternalAnalystFindingV1>, candidateId: string) {
  return report.perAuthorizationCommercialRuntimeReadiness.candidates.find((item) => item.candidateId === candidateId)!;
}

function runtimeContext(report: ReturnType<typeof buildInternalAnalystFindingV1>, candidateId: string) {
  return report.perAuthorizationCommercialRuntimeReadiness.candidateContexts.find((item) => item.candidateId === candidateId)!;
}

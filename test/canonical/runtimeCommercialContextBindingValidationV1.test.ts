import { beforeAll, describe, expect, it } from "vitest";

import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { commercialSemanticFingerprintV1 } from "../../src/canonical/commercialSourceGovernanceV1.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystMerchantContext,
} from "../../src/canonical/internalAnalystFindingV1.js";
import {
  observeRuntimeCommercialContextBindingV1,
  RUNTIME_COMMERCIAL_COMPONENT_CAPABILITIES_V1,
  RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1,
} from "../../src/canonical/runtimeCommercialContextBindingValidationV1.js";
import { parsePdf, type ParsedDocument } from "../../src/parser.js";

const SOURCE = "test/fixtures/pdfs/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf";
const SOURCE_FINGERPRINT = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["synthetic_current_fixture:us"] } } as any;

let parsed: ParsedDocument;

beforeAll(async () => {
  parsed = await parsePdf(SOURCE);
});

describe("Runtime Commercial Context-Binding Validation v1", () => {
  it("publishes the complete Product-required field matrix", () => {
    expect(RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1).toHaveLength(43);
    expect(new Set(RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1.map((item) => `${item.group}:${item.field}`)).size).toBe(43);
    expect(RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1.every((item) => item.upstreamSource
      && item.runtimeStage
      && item.support
      && item.safeForCommercialComparison)).toBe(true);
    expect(RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1.find((item) => item.field === "invalidating VERIFY dependency")?.support).toBe("ABSENT");
    expect(RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1.find((item) => item.field === "dispute/risk overlap")?.support).toBe("PARTIAL");
  });

  it("establishes an exact per-authorization component and matching alternative only through the normal supported path", () => {
    const { analysis, report } = normalPathReport({ channel: "card_present" });
    const before = canonicalFinancialTruthFingerprint(analysis);
    const observation = observeRuntimeCommercialContextBindingV1(report);
    const exact = report.commercialComparisonAttachment.attempts.find((attempt) => attempt.comparisonPerformed);

    expect(report.statementPeriod).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(observation.observed.exactCurrentComponents).toBeGreaterThan(0);
    expect(observation.observed.matchedComparisons).toBeGreaterThan(0);
    expect(observation.observed.comparisonsWithThreeEvidenceBindings).toBe(observation.observed.matchedComparisons);
    expect(exact?.finding.comparisonEvidenceBinding?.currentComponentEvidenceRefs.length).toBeGreaterThan(0);
    expect(exact?.finding.comparisonEvidenceBinding?.alternativeComponentEvidenceRefs.length).toBeGreaterThan(0);
    expect(exact?.finding.comparisonEvidenceBinding?.matchedPopulationEvidenceRefs.length).toBeGreaterThan(0);
    expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
  });

  it("selects the matching channel and rejects the opposite channel", () => {
    const { report } = normalPathReport({ channel: "card_present" });
    const attempts = mastercardAttempts(report);
    expect(attempts.some((attempt) => attempt.alternativeOffer === "Standard Retail / Storefront" && attempt.comparisonPerformed)).toBe(true);
    expect(attempts.some((attempt) => attempt.alternativeOffer === "Standard Virtual / Online"
      && attempt.result === "COMPARISON_UNAVAILABLE"
      && attempt.stoppingReason?.includes("channel"))).toBe(true);
  });

  it("keeps unknown channel blocked with a merchant-verifiable smallest unlocker", () => {
    const { report } = normalPathReport({ channel: "unknown" });
    const attempts = mastercardAttempts(report);
    expect(attempts.every((attempt) => !attempt.comparisonPerformed)).toBe(true);
    expect(attempts.some((attempt) => attempt.smallestUnlocker === "CP versus CNP transaction and volume split for the current component.")).toBe(true);
    expect(report.merchantCommercialFindingShadowProjection.decisions.every((decision) => !decision.action.permitted)).toBe(true);
  });

  it("fails closed when a printed authorization-like row explicitly names a settled-transaction population", () => {
    const { report } = normalPathReport({
      channel: "card_present",
      replaceLabel: ["MASTERCARD WATS AUTH FEE", "MASTERCARD SETTLED TRANSACTION AUTH FEE"],
    });
    const current = report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents
      .find((item) => item.printedLabel.includes("SETTLED TRANSACTION"));
    const attempts = report.commercialComparisonAttachment.attempts.filter((attempt) => attempt.currentComponentRef === current?.componentRef);
    expect(current).toBeDefined();
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((attempt) => !attempt.comparisonPerformed)).toBe(true);
    expect(attempts.some((attempt) => attempt.stoppingReason?.includes("billing population"))).toBe(true);
  });

  it("preserves upper-bound economics through the normal path without creating an exact comparison or pricing action", () => {
    const { report } = normalPathReport({
      channel: "card_present",
      replaceLabel: ["MASTERCARD WATS AUTH FEE", "MASTERCARD BUNDLED AUTH FEE"],
    });
    const current = report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents
      .find((item) => item.printedLabel.includes("BUNDLED AUTH FEE"));
    const attempts = report.commercialComparisonAttachment.attempts
      .filter((attempt) => attempt.currentComponentRef === current?.componentRef);
    const decisions = report.merchantCommercialFindingShadowProjection.decisions
      .filter((decision) => attempts.some((attempt) => attempt.attemptId === decision.candidateId));

    expect(current?.currentAmount.state).toBe("UPPER_BOUND");
    expect(attempts.some((attempt) => attempt.comparisonPerformed
      && attempt.finding.economics.currentAmountState === "UPPER_BOUND"
      && attempt.finding.economics.matchedComponentDifference.state !== "EXACT")).toBe(true);
    expect(attempts.every((attempt) => attempt.finding.action.signal === "NONE")).toBe(true);
    expect(decisions.some((decision) => decision.comparisonValidity === "valid_bounded")).toBe(true);
    expect(decisions.every((decision) => !decision.action.permitted)).toBe(true);
  });

  it("reports that percentage, fixed-monthly, and episodic bridges are not proven by the normal path", () => {
    const { report } = normalPathReport({ channel: "card_present" });
    const observation = observeRuntimeCommercialContextBindingV1(report);
    expect(observation.observed.boundedCurrentComponents).toBe(0);
    expect(component("percentage_bps").disposition).toBe("runtime_not_ready");
    expect(component("fixed_monthly").disposition).toBe("runtime_not_ready");
    expect(component("episodic_chargeback").disposition).toBe("runtime_not_ready");
    expect(report.merchantCommercialFindingShadowProjection.decisions
      .filter((decision) => decision.internalSignalIgnored)
      .every((decision) => !decision.action.permitted)).toBe(true);
  });

  it("keeps gateway-only alternatives outside acquiring authorization matching", () => {
    const { report } = normalPathReport({ channel: "card_present" });
    const matched = report.commercialComparisonAttachment.attempts.filter((attempt) => attempt.comparisonPerformed);
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((attempt) => attempt.alternativeProvider !== "authorize_net")).toBe(true);
    expect(component("gateway_transaction").failClosedReason).toContain("Gateway evidence cannot be treated as acquiring economics");
  });

  it("carries governed offer and public-policy state through the normal path without assuming merchant approval", () => {
    const standard = normalPathReport({ channel: "card_present", riskClass: "standard" }).report;
    const highRisk = normalPathReport({ channel: "card_present", riskClass: "high_risk" }).report;
    expect(standard.merchantCommercialFindingShadowProjection.decisions.some((decision) => decision.reasonCodes.includes("public_policy_unknown"))).toBe(true);
    expect(highRisk.merchantCommercialFindingShadowProjection.decisions.some((decision) => decision.reasonCodes.includes("publicly_prohibited"))).toBe(true);
    expect(highRisk.merchantCommercialFindingShadowProjection.decisions
      .filter((decision) => decision.reasonCodes.includes("publicly_prohibited"))
      .every((decision) => !decision.namedAlternativePermitted && !decision.action.permitted)).toBe(true);
    expect(standard.merchantCommercialFindingShadowProjection.decisions.some((decision) => decision.reasonCodes.includes("merchant_approval_unknown"))).toBe(true);
  });

  it("preserves named-offer group identity but identifies normal-path dependency and risk links as absent", () => {
    const { report } = normalPathReport({ channel: "card_present" });
    const observation = observeRuntimeCommercialContextBindingV1(report);
    const groups = new Set(report.merchantCommercialFindingShadowProjection.decisions.map((decision) => decision.presentationGroupId));
    expect([...groups].some((group) => group.includes("Standard Retail / Storefront"))).toBe(true);
    expect(observation.observed.invalidatingVerifyDependenciesConstructedByNormalPath).toBe(0);
    expect(observation.observed.disputeRiskLinksConstructedByNormalPath).toBe(0);
    expect(observation.conclusion.answer).toBe("NO_FULL_COMPONENT_CLASS_YET");
  });

  it("preserves source authority, offline routing, hero isolation, and canonical truth", () => {
    const beforeSource = commercialSemanticFingerprintV1([
      AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
      HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
    ]);
    const { analysis, report } = normalPathReport({ channel: "card_present" });
    const beforeCanonical = canonicalFinancialTruthFingerprint(analysis);
    const observation = observeRuntimeCommercialContextBindingV1(report);
    const afterSource = commercialSemanticFingerprintV1([
      AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
      HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
    ]);
    expect(beforeSource).toBe(SOURCE_FINGERPRINT);
    expect(afterSource).toBe(beforeSource);
    expect(canonicalFinancialTruthFingerprint(analysis)).toBe(beforeCanonical);
    expect(report.commercialReportSetOfflineIntegration.heroByteEquivalent).toBe(true);
    expect(report.commercialReportSetOfflineIntegration.primaryExperienceUnchanged).toBe(true);
    expect(report.commercialReportSetOfflineIntegration.realCustomerRoutingAllowed).toBe(false);
    expect(Object.values(observation.permissions).every((permission) => permission === false)).toBe(true);
  });
});

function component(id: RuntimeCommercialComponentCapabilityV1["componentClass"]) {
  return RUNTIME_COMMERCIAL_COMPONENT_CAPABILITIES_V1.find((item) => item.componentClass === id)!;
}

type RuntimeCommercialComponentCapabilityV1 = (typeof RUNTIME_COMMERCIAL_COMPONENT_CAPABILITIES_V1)[number];

function mastercardAttempts(report: ReturnType<typeof buildInternalAnalystFindingV1>) {
  const current = report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents
    .find((item) => item.printedLabel.includes("MASTERCARD WATS AUTH FEE"));
  return report.commercialComparisonAttachment.attempts.filter((attempt) => attempt.currentComponentRef === current?.componentRef);
}

function normalPathReport(options: {
  channel: InternalAnalystMerchantContext["channel"];
  riskClass?: InternalAnalystMerchantContext["riskClass"];
  replaceLabel?: [string, string];
}) {
  const document = currentPeriodDocument(options.replaceLabel);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    sourceFileName: "synthetic-supported-fiserv-current-period.pdf",
    businessType: "restaurant_food_beverage",
  });
  const merchantContext: InternalAnalystMerchantContext = {
    verticalId: "restaurant_food_beverage",
    riskClass: options.riskClass ?? "standard",
    channel: options.channel,
    averageTicketUsd: 42,
    evidenceRefs: ["synthetic_current_fixture:merchant_context"],
    basis: "merchant_confirmed",
  };
  const report = buildInternalAnalystFindingV1({
    analysis,
    statementContext: US_CONTEXT,
    merchantContext,
    asOf: "2026-09-30",
  });
  return { analysis, report };
}

function currentPeriodDocument(replaceLabel?: [string, string]): ParsedDocument {
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
    if (replaceLabel) safe = safe.replace(replaceLabel[0], replaceLabel[1]);
    return safe;
  };
  return {
    ...parsed,
    rows: parsed.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, convert(value)]))),
    textPreview: String(convert(parsed.textPreview)),
    extraction: { ...parsed.extraction, reasons: ["Privacy-safe current-period runtime validation fixture."] },
  };
}

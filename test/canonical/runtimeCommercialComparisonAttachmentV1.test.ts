import { describe, expect, it } from "vitest";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import type { CommercialSourceGovernanceRegistryV1 } from "../../src/canonical/commercialSourceGovernanceV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../../src/canonical/internalAnalystFindingV1.js";
import {
  evaluateRuntimeCommercialComparisonFactsV1,
  type RuntimeCommercialMerchantFactsV1,
  type RuntimeCurrentCommercialComponentV1,
} from "../../src/canonical/runtimeCommercialComparisonAttachmentV1.js";
import { parsePdf } from "../../src/parser.js";

const currentStatement = {
  statementRef: "supported_fiserv_runtime_control",
  processorName: "Wells Fargo / Fiserv family",
  processorFamily: "fiserv_first_data",
  statementPeriod: { start: "2026-09-10", end: "2026-09-30" },
  processedSalesMinor: 12_000_000,
  businessType: "restaurant_food_beverage",
};

const qualifyingFacts: RuntimeCommercialMerchantFactsV1 = {
  facts: {
    monthly_volume_minor: 12_000_000,
    transaction_count: 6_000,
    average_ticket_minor: 2_000,
    merchant_type: "restaurant",
    channel: "card_present",
    known_high_risk: false,
  },
  channel: "card_present",
  evidenceRefsByFact: {
    monthly_volume_minor: ["statement:processed_sales"],
    transaction_count: ["statement:transaction_count"],
    average_ticket_minor: ["statement:average_ticket"],
    merchant_type: ["statement:business_type"],
    channel: ["statement:channel"],
    known_high_risk: ["merchant_context:risk"],
  },
  unresolvedFacts: ["three_month_rolling_card_volume_minor"],
};

describe("Runtime Commercial Comparison Attachment v1", () => {
  it("attaches to normal analysis of a real supported Fiserv Gold statement without reopening history", async () => {
    const file = "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf";
    const document = await parsePdf(`test/fixtures/pdfs/${file}`);
    const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file, businessType: "restaurant_food_beverage" });
    const before = canonicalFinancialTruthFingerprint(analysis);
    const report = buildInternalAnalystFindingV1({ analysis, statementContext: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } }, asOf: "2026-09-11" });
    const attachment = report.commercialComparisonAttachment;
    expect(attachment.deterministicBaseline.currentProviderControlledComponents.some((component) => component.printedLabel.includes("WATS AUTH FEE"))).toBe(true);
    expect(attachment.summary.matchedComparisons).toBe(0);
    expect(attachment.summary.blockedComparisons).toBeGreaterThan(0);
    expect(attachment.attempts.every((attempt) => !attempt.comparisonPerformed && attempt.finding.action.signal === "NONE")).toBe(true);
    expect(attachment.attempts.every((attempt) => attempt.stoppingReason?.includes("cannot be projected backward"))).toBe(true);
    expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
    expect(report.canonicalFinancialTruth.unchanged).toBe(true);
  });

  it("performs an exact matched-component calculation with all three evidence bindings", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [authorizationComponent()],
      merchantFacts: qualifyingFacts,
    });
    const match = result.attempts.find((attempt) => attempt.alternativeComponentRef === "component_dharma_high_volume_cp_auth_v1");
    expect(match?.comparisonPerformed).toBe(true);
    expect(match?.finding.findingKind).toBe("MATCHED_CURRENT_VS_ALTERNATIVE_COMPONENT_COMPARISON");
    expect(match?.finding.economics.currentAmountMinor).toBe(66_000);
    expect(match?.finding.economics.alternativeAmountMinor).toBe(48_000);
    expect(match?.finding.economics.matchedComponentDifference.currentMinusAlternativeMinor).toBe(18_000);
    expect(match?.finding.comparisonEvidenceBinding?.currentComponentEvidenceRefs).toEqual(["statement:auth_component"]);
    expect(match?.finding.comparisonEvidenceBinding?.alternativeComponentEvidenceRefs.length).toBeGreaterThan(1);
    expect(match?.finding.comparisonEvidenceBinding?.matchedPopulationEvidenceRefs).toEqual(["statement:auth_population"]);
    expect(match?.finding.action.signal).toBe("REVIEW_CURRENT_PRICING");
  });

  it("keeps qualification evidence separate when no current matching component exists", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [],
      merchantFacts: qualifyingFacts,
      registries: [onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "High Volume")],
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.result).toBe("OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE");
    expect(result.attempts[0]?.comparisonPerformed).toBe(false);
    expect(result.attempts[0]?.finding.economics.matchedComponentDifference.state).toBe("NOT_ESTABLISHED");
    expect(result.attempts[0]?.finding.action.signal).toBe("NONE");
  });

  it("blocks a channel mismatch", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [authorizationComponent({ channel: "card_not_present" })],
      merchantFacts: { ...qualifyingFacts, channel: "card_not_present", facts: { ...qualifyingFacts.facts, channel: "card_not_present" } },
      registries: [onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "Standard Retail / Storefront")],
    });
    expect(result.summary.matchedComparisons).toBe(0);
    expect(result.attempts.every((attempt) => attempt.result === "COMPARISON_UNAVAILABLE")).toBe(true);
    expect(result.attempts[0]?.stoppingReason).toContain("channel");
  });

  it("blocks unresolved mixed CP/CNP activity and preserves the smallest unlocker", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [authorizationComponent({ channel: "mixed" })],
      merchantFacts: { ...qualifyingFacts, channel: "mixed", facts: { ...qualifyingFacts.facts, channel: "mixed" } },
      registries: [onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "Standard Retail / Storefront")],
    });
    expect(result.summary.matchedComparisons).toBe(0);
    expect(result.attempts[0]?.smallestUnlocker).toBe("CP versus CNP transaction and volume split for the current component.");
    expect(result.attempts[0]?.finding.economics.matchedComponentDifference.state).toBe("NOT_ESTABLISHED");
  });

  it("keeps a current upper bound bounded and emits no automatic review action", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [authorizationComponent({ currentAmount: { state: "UPPER_BOUND", amountMinor: 66_000 } })],
      merchantFacts: qualifyingFacts,
      registries: [onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "Standard Retail / Storefront")],
    });
    const match = result.attempts.find((attempt) => attempt.comparisonPerformed)!;
    expect(match.finding.status).toBe("VALID_BOUNDED_COMPONENT_COMPARISON");
    expect(match.finding.economics.currentAmountState).toBe("UPPER_BOUND");
    expect(match.finding.economics.matchedComponentDifference.currentMinusAlternativeMinor).toBeNull();
    expect(match.finding.action.signal).toBe("NONE");
  });

  it("does not project current-only alternative evidence into a historical statement", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: { ...currentStatement, statementPeriod: { start: "2024-09-01", end: "2024-09-30" } },
      currentComponents: [authorizationComponent()],
      merchantFacts: qualifyingFacts,
      registries: [onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "Standard Retail / Storefront")],
    });
    expect(result.summary.matchedComparisons).toBe(0);
    expect(result.attempts[0]?.stoppingReason).toContain("cannot be projected backward");
    expect(result.attempts[0]?.smallestUnlocker).toContain("Period-applicable");
  });

  it("limits Authorize.net matching to gateway economics", () => {
    const current = authorizationComponent({
      componentKind: "gateway_transaction_fee",
      unit: "per_gateway_transaction",
      channel: "gateway",
      cardBrandScope: "unknown",
      populationLabel: "gateway credit-card transaction events",
      printedLabel: "GATEWAY TRANSACTION FEE",
      populationCount: 1_000,
      currentUnitPriceMinor: 12,
      currentAmount: { state: "EXACT", amountMinor: 12_000 },
    });
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [current],
      merchantFacts: qualifyingFacts,
      registries: [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1],
    });
    const match = result.attempts.find((attempt) => attempt.comparisonPerformed)!;
    expect(match.alternativeComponentRef).toBe("commercial_component_authorize_net_gateway_transaction_v1");
    expect(match.finding.conclusion.whatThisDoesNotProve).toContain("Treating gateway-only pricing as complete acquiring economics.");
    expect(match.finding.economics.alternativeAmountMinor).toBe(10_000);
  });

  it("records no governed comparison without fabricating a no-savings conclusion", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [authorizationComponent()],
      merchantFacts: qualifyingFacts,
      registries: [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1],
    });
    expect(result.attempts).toHaveLength(0);
    expect(result.summary.result).toBe("NO_APPLICABLE_GOVERNED_ALTERNATIVE");
    expect(result.summary.explanation).toContain("not a no-savings conclusion");
  });

  it("keeps scoped absence and fee-identity evidence as commercial fact only", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [],
      currentFactSignals: [{ feeRowId: "fee_batch", printedLabel: "BATCH FEE", factIdentity: "batch_fee", evidenceRefs: ["statement:batch_fee"] }],
      merchantFacts: { ...qualifyingFacts, facts: { channel: "card_present" } },
      registries: [onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "Standard Retail / Storefront")],
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.result).toBe("COMMERCIAL_FACT_IDENTITY_EVIDENCE");
    expect(result.attempts[0]?.comparisonPerformed).toBe(false);
    expect(result.attempts[0]?.finding.action.signal).toBe("NONE");
    expect(result.attempts[0]?.finding.economics.matchedComponentDifference.state).toBe("NOT_ESTABLISHED");
  });

  it("keeps every stronger permission disabled", () => {
    const result = evaluateRuntimeCommercialComparisonFactsV1({
      statement: currentStatement,
      currentComponents: [authorizationComponent()],
      merchantFacts: qualifyingFacts,
    });
    expect(Object.entries(result.permissions).filter(([key]) => key !== "internalAnalystOnly").every(([, value]) => value === false)).toBe(true);
    expect(result.attempts.every((attempt) => !attempt.finding.permissions.customerRenderingAllowed
      && !attempt.finding.permissions.savingsClaimAllowed
      && !attempt.finding.permissions.switchingRecommendationAllowed
      && !attempt.finding.permissions.canonicalMutationAllowed)).toBe(true);
  });
});

function authorizationComponent(
  patch: Partial<RuntimeCurrentCommercialComponentV1> = {},
): RuntimeCurrentCommercialComponentV1 {
  return {
    componentRef: "canonical_fee_component:auth",
    feeRowId: "auth",
    printedLabel: "MASTERCARD WATS AUTH FEE 6000 TRANSACTIONS AT 0.11",
    componentKind: "authorization_fee",
    channel: "card_present",
    cardBrandScope: "mastercard",
    economicLayer: "acquiring_commercial",
    unit: "per_authorization",
    populationLabel: "printed authorization events",
    populationCount: 6_000,
    currentUnitPriceMinor: 11,
    currentAmount: { state: "EXACT", amountMinor: 66_000 },
    currentComponentEvidenceRefs: ["statement:auth_component"],
    populationEvidenceRefs: ["statement:auth_population"],
    ...patch,
  };
}

function onlyOffer(registry: CommercialSourceGovernanceRegistryV1, offer: string): CommercialSourceGovernanceRegistryV1 {
  return {
    ...registry,
    offerCompositionVersions: registry.offerCompositionVersions.filter((composition) => composition.offerIdentity.namedOffer === offer),
  };
}

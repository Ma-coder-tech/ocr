import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  type CanonicalEconomicsV2PricingAnalysis,
} from "../../../src/canonical/v2/index.js";
import { approvedEconomicInput, economicPricing } from "./economicFixtures.js";

describe("Canonical Economics V2 RD representations and unresolved states", () => {
  it("admits one economic charge for two RB representations only when the group selects one contributor", () => {
    const pricing = pricingWithRepeatedStatementFee();
    const input = approvedEconomicInput(pricing);
    const statement = input.charges!.find((charge) => charge.key === "statement_fee")!;
    const group = pricing.foundation.sourceModel.representationGroups.at(-1)!;
    statement.sourceOccurrenceRefs = [...group.occurrenceRefs];
    statement.contributingOccurrenceRef = group.authoritativeContributionOccurrenceRef;
    statement.representationGroupRef = group.id;
    const before = JSON.stringify(pricing);
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.economicLayer.charges).toHaveLength(3);
    expect(analysis.economicLayer.charges.find((charge) => charge.subtype === "service_admin")).toMatchObject({
      contributionStatus: "contributes_classified",
      sourceOccurrenceRefs: group.occurrenceRefs,
      contributingOccurrenceRef: group.authoritativeContributionOccurrenceRef,
      representationGroupRef: group.id,
    });
    expect(analysis.economicLayer.costStack.classifiedChargeNet.amountMinor).toBe(4500);
    expect(JSON.stringify(pricing)).toBe(before);
  });

  it("blocks multiple ungrouped representations and preserves them as unresolved instead of double counting", () => {
    const pricing = pricingWithRepeatedStatementFee(false);
    const input = approvedEconomicInput(pricing, { feeDetailCoverage: "incomplete" });
    const original = pricing.foundation.sourceModel.occurrences.find((occurrence) => occurrence.pageNumber === 3 && occurrence.semanticRole === "fee_charge")!;
    const duplicate = pricing.foundation.sourceModel.occurrences.at(-1)!;
    const statement = input.charges!.find((charge) => charge.key === "statement_fee")!;
    statement.sourceOccurrenceRefs = [original.id, duplicate.id];
    statement.contributingOccurrenceRef = original.id;
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.economicLayer.charges.find((charge) => charge.subtype === "service_admin")).toMatchObject({
      status: "unresolved",
      contributionStatus: "blocked_representation",
      contributingOccurrenceRef: null,
    });
    expect(analysis.economicLayer.costStack).toMatchObject({
      completeness: "partial_but_financially_reconciled",
      unresolvedRemainder: { amountMinor: 3100 },
    });
  });

  it("keeps category conflict distinct from financial occurrence and role uncertainty", () => {
    const input = approvedEconomicInput();
    const statement = input.charges!.find((charge) => charge.key === "statement_fee")!;
    statement.categoryResolution = "conflicting";
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);
    const charge = analysis.economicLayer.charges.find((item) => item.subtype === "service_admin")!;

    expect(analysis.validation.status).toBe("valid");
    expect(charge).toMatchObject({
      status: "conflicting",
      category: "unresolved_unclassified",
      categoryResolution: "conflicting",
      contributionStatus: "contributes_unresolved",
      financialDirection: "debit",
    });
    expect(analysis.economicLayer.costStack.completeness).toBe("partial_but_financially_reconciled");
    expect(analysis.economicLayer.roleClaims.find((claim) => claim.dimension === "economic_beneficiary")?.resolution).toBe("unresolved");
  });
});

function pricingWithRepeatedStatementFee(withGroup = true): CanonicalEconomicsV2PricingAnalysis {
  const pricing = structuredClone(economicPricing());
  const source = pricing.foundation.sourceModel.occurrences.find((occurrence) => occurrence.pageNumber === 3 && occurrence.semanticRole === "fee_charge")!;
  const duplicate = {
    ...structuredClone(source),
    id: `${source.id}_repeated`,
    contributionRole: "repeated_representation" as const,
    limitations: [...source.limitations, "Approved synthetic repeated representation."],
  };
  source.contributionRole = withGroup ? "authoritative_contributor" : "supporting_detail";
  pricing.foundation.sourceModel.occurrences.push(duplicate);
  if (withGroup) {
    pricing.foundation.sourceModel.representationGroups.push({
      id: "representation_rd_synthetic_statement_fee",
      canonicalFactRef: pricing.foundation.financialPopulations.totalStatementProcessingFees.id,
      occurrenceRefs: [source.id, duplicate.id],
      authoritativeContributionOccurrenceRef: source.id,
      supportingOccurrenceRefs: [duplicate.id],
      duplicateHandling: "one_authoritative_contributor",
      reconciliationRefs: [...source.reconciliationRefs],
      evidenceRefs: [source.evidenceRef],
      limitations: [],
    });
  }
  return pricing;
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const evaluation = JSON.parse(readFileSync(
  "evaluations/claim-specific-commercial-decomposition-contract-v1/evaluation-2026-09-10.json",
  "utf8",
));

describe("Claim-Specific Commercial Decomposition Contract v1", () => {
  it("builds a mutually exclusive commercial-dollar ledger across all 11 Gold statements without canonical mutation", () => {
    expect(evaluation.corpus.statements).toBe(11);
    expect(evaluation.statements).toHaveLength(11);
    expect(evaluation.statements.every((statement: any) => statement.reconcilesToCanonicalFees)).toBe(true);
    expect(evaluation.statements.every((statement: any) => statement.canonicalFingerprintBefore === statement.canonicalFingerprintAfter)).toBe(true);
    expect(evaluation.corpus.canonicalFingerprintInvariantStatements).toBe(11);
    expect(evaluation.corpus.fingerprintChanges).toBe(0);
    expect(evaluation.statements.every((statement: any) => !statement.exactProviderResidualAllowed && statement.exactOfficialNetworkParAmountMinor === null)).toBe(true);
  });

  it("enforces the Product-adjudicated precedence corrections", () => {
    const controls = evaluation.controlOutcomes;
    expect(controls.mastercardNabu).toHaveLength(2);
    expect(controls.mastercardNabu.every((row: any) => row.family === "F3" && row.economicLayer === "card_network")).toBe(true);
    expect(controls.mastercardConnectivityKilobyte).toHaveLength(9);
    expect(controls.mastercardConnectivityKilobyte.every((row: any) => row.exactIdentity.includes("connectivity_kilobyte") && row.economicLayer === "card_network")).toBe(true);
    expect(controls.visaIsaBase).toHaveLength(4);
    expect(controls.visaIsaBase.every((row: any) => row.exactIdentity === "visa_international_service_assessment_base" && row.economicLayer === "card_network")).toBe(true);
    expect(controls.exactNetworkDisputes).toHaveLength(3);
    expect(controls.exactNetworkDisputes.every((row: any) => row.economicLayer === "card_network" && row.claimPermissions.periodScopedUnderlyingBilledDollarsAllowed)).toBe(true);
  });

  it("separates merchant price control from retention and billed-dollar composition", () => {
    const controls = evaluation.controlOutcomes;
    const programCost = controls.amexProgramCost2020[0];
    expect(programCost.attribution).toMatchObject({
      kind: "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE",
      amountMinor: 1956,
      providerControlledMinimumContributionMinor: 1956,
    });
    expect(programCost.beneficiary.value).toBeNull();
    expect(programCost.claimPermissions.providerRetentionOrProfitLanguageAllowed).toBe(false);
    expect(controls.tieredQualMqualNqual).toHaveLength(21);
    expect(controls.tieredQualMqualNqual.every((row: any) =>
      row.cardinality === "multiple_components" &&
      row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED" &&
      row.claimPermissions.providerControlledUpperBoundAllowed &&
      !row.claimPermissions.exactProviderControlledDollarsAllowed,
    )).toBe(true);
    expect(controls.mastercardAssessment01475[0]).toMatchObject({
      cardinality: "multiple_components",
      commercialDollarCategory: "SHARED_BUNDLED_OR_UNRESOLVED",
    });
  });

  it("preserves unresolved generic exception composition and the separate government/non-processing lane", () => {
    expect(evaluation.controlOutcomes.genericExceptions).toHaveLength(6);
    expect(evaluation.controlOutcomes.genericExceptions.every((row: any) =>
      row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED" &&
      row.research.disposition === "STOP",
    )).toBe(true);
    expect(evaluation.controlOutcomes.regulatoryProduct[0]).toMatchObject({
      commercialDollarCategory: "GOVERNMENT_NONPROCESSING_OR_OTHER",
      economicLayer: "government_or_nonprocessing_pass_through",
    });
  });

  it("keeps the milestone internal and does not add grades, savings, annualization, AI, or web research", () => {
    expect(evaluation.scope).toMatchObject({
      internalAnalystOnly: true,
      marketBandsOrGradesImplemented: false,
      savingsOrSwitchingImplemented: false,
      aiOrWebResearchExecuted: false,
      customerFacingCutover: false,
      canonicalMutationAllowed: false,
    });
    expect(evaluation.statements.every((statement: any) => statement.annualizedRows === 0 && !statement.customerRenderingAllowed)).toBe(true);
    expect(Object.values(evaluation.invariants).every(Boolean)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "../../src/canonical/commercialDecompositionContractV1.js";
import {
  buildCurrentRelationshipEconomicsProfileV1,
  type CurrentEconomicsActivityAdmissionV1,
  type CurrentRelationshipEconomicsProfileV1,
} from "../../src/canonical/currentRelationshipEconomicsProfileV1.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "../../src/canonical/v2/economicTypes.js";
import { buildApprovedEconomics } from "./v2/economicFixtures.js";

describe("Single-Statement Current Relationship Economics Profile v1", () => {
  it("preserves known, known-absent, unknown, and not-applicable activity states without converting missing data to zero", () => {
    const known = profile();
    expect(known.activity.processedVolume).toMatchObject({ state: "KNOWN", evidenceAccess: "STATEMENT_DERIVABLE" });
    expect(known.activity.transactionCount).toMatchObject({ state: "UNKNOWN", value: null });

    const absentEconomic = cloneEconomic();
    absentEconomic.pricingAnalysis.foundation.financialPopulations.refundVolume.value = { amountMinor: 0, currency: "USD" };
    const absent = profile(absentEconomic);
    expect(absent.activity.refundVolume).toMatchObject({ state: "KNOWN_ABSENT", value: { amountMinor: 0 } });

    const inactiveEconomic = cloneEconomic();
    inactiveEconomic.pricingAnalysis.pricingArchitecture.formulaCoverageStatus = "not_applicable_no_active_processing";
    const inactive = profile(inactiveEconomic);
    expect(inactive.activity.approvedAuthorizationCount.state).toBe("NOT_APPLICABLE");
    expect(inactive.activity.channel.state).toBe("NOT_APPLICABLE");
  });

  it("uses average ticket only with the compatible canonical gross-sales population", () => {
    const compatible = profile();
    expect(compatible.activity.averageTicket).toMatchObject({
      state: "KNOWN",
      value: { amountMinor: 5_000, currency: "USD" },
      canonicalFactRefs: ["fact_v2_gross_sale_volume", "fact_v2_gross_sale_transaction_count"],
    });

    const incompatibleEconomic = cloneEconomic();
    incompatibleEconomic.pricingAnalysis.foundation.metrics.headlineAverageTicket.state = "population_unproven";
    incompatibleEconomic.pricingAnalysis.foundation.metrics.headlineAverageTicket.value = null;
    const incompatible = profile(incompatibleEconomic);
    expect(incompatible.activity.averageTicket).toMatchObject({ state: "UNKNOWN", value: null });
    expect(incompatible.costStructureSensitivity.averageTicketUsed).toBe(false);
  });

  it("admits an exact statement-evidenced population into the profile without mutating canonical truth", () => {
    const economic = cloneEconomic();
    const canonicalBefore = structuredClone(economic.pricingAnalysis.foundation.financialPopulations.submittedTransactionCount);
    economic.pricingAnalysis.foundation.financialPopulations.refundTransactionCount = {
      ...economic.pricingAnalysis.foundation.financialPopulations.refundTransactionCount,
      status: "unavailable", value: null,
    };
    const result = buildCurrentRelationshipEconomicsProfileV1({
      economic,
      commercialDecomposition: decomp().contract,
      activityAdmissions: {
        transactionCount: activityAdmission("transactionCount", "submitted_transaction_count", 42),
        refundTransactionCount: activityAdmission("refundTransactionCount", "refund_transaction_count", 0),
      },
    });
    expect(result.activity.transactionCount).toMatchObject({ state: "KNOWN", value: 42, population: "submitted_transaction_count" });
    expect(result.activity.refundTransactionCount).toMatchObject({ state: "KNOWN_ABSENT", value: 0 });
    expect(economic.pricingAnalysis.foundation.financialPopulations.submittedTransactionCount).toEqual(canonicalBefore);
  });

  it("fails closed on a wrong field, population, source, missing control, or canonical conflict", () => {
    const build = (admission: CurrentEconomicsActivityAdmissionV1<number>) => buildCurrentRelationshipEconomicsProfileV1({
      economic: cloneEconomic(), commercialDecomposition: decomp().contract,
      activityAdmissions: { transactionCount: admission },
    });
    expect(() => build({ ...activityAdmission("grossSaleTransactionCount", "submitted_transaction_count", 42) }))
      .toThrow("CURRENT_ECONOMICS_ACTIVITY_ADMISSION_FIELD_MISMATCH");
    expect(() => build({ ...activityAdmission("transactionCount", "gross_sale_transaction_count", 42) }))
      .toThrow("CURRENT_ECONOMICS_ACTIVITY_ADMISSION_POPULATION_MISMATCH");
    expect(() => build({ ...activityAdmission("transactionCount", "submitted_transaction_count", 42), sourceDocumentRef: "other.pdf" }))
      .toThrow("CURRENT_ECONOMICS_ACTIVITY_ADMISSION_SOURCE_MISMATCH");
    expect(() => build({ ...activityAdmission("transactionCount", "submitted_transaction_count", 42), controlRefs: [] }))
      .toThrow("CURRENT_ECONOMICS_ACTIVITY_ADMISSION_EVIDENCE_REQUIRED");

    const economic = cloneEconomic();
    economic.pricingAnalysis.foundation.financialPopulations.submittedTransactionCount = {
      ...economic.pricingAnalysis.foundation.financialPopulations.submittedTransactionCount,
      status: "available", value: 41, provenanceStatus: "authoritative",
    };
    expect(() => buildCurrentRelationshipEconomicsProfileV1({
      economic, commercialDecomposition: decomp().contract,
      activityAdmissions: { transactionCount: activityAdmission("transactionCount", "submitted_transaction_count", 42) },
    })).toThrow("CURRENT_ECONOMICS_ACTIVITY_ADMISSION_CONFLICT");
  });

  it("does not admit a positive activity population into a no-active-processing period", () => {
    const economic = cloneEconomic();
    economic.pricingAnalysis.pricingArchitecture.formulaCoverageStatus = "not_applicable_no_active_processing";
    expect(() => buildCurrentRelationshipEconomicsProfileV1({
      economic, commercialDecomposition: decomp().contract,
      activityAdmissions: { transactionCount: activityAdmission("transactionCount", "submitted_transaction_count", 1) },
    })).toThrow("CURRENT_ECONOMICS_ACTIVITY_ADMISSION_ACTIVE_VALUE_IN_INACTIVE_PERIOD");
  });

  it("projects each contributing RD charge into at most one Product-view location and reconciles to RD", () => {
    const result = profile();
    const refs = result.chargedCostProfile.buckets.flatMap((bucket) => bucket.rdEconomicChargeRefs);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs).toHaveLength(result.chargedCostProfile.items.length);
    expect(result.chargedCostProfile).toMatchObject({
      additiveAuthority: "canonical_rd_economic_charge_ledger",
      mappedNetAmountMinor: 4_500,
      profileReconciliationDeltaMinor: 0,
      reconcilesToRdTotal: true,
      duplicateChargeContributionCount: 0,
      nonFeePrincipalContributionCount: 0,
    });
  });

  it("reconciles only through governed non-additive rounding metadata without changing charge amounts", () => {
    const economic = cloneEconomic();
    economic.economicLayer.costStack.authoritativeStatementFeeTotal = { amountMinor: 4_499, currency: "USD" };
    economic.economicLayer.costStack.totalStatementProcessingCost = { amountMinor: 4_499, currency: "USD" };
    economic.economicLayer.costStack.reconciliationDeltaMinor = -1;
    economic.economicLayer.costStack.roundingResidual = {
      policyVersion: "fiserv_fee_total_nonadditive_rounding_residual_max_2_minor_units_v1",
      state: "accepted_bounded_rounding_nonadditive",
      printedStatementFeeTotalMinor: 4_499,
      admittedFeeOccurrenceSumMinor: 4_500,
      signedResidualMinor: -1,
      absoluteResidualMinor: 1,
      maximumAcceptedAbsoluteResidualMinor: 2,
      controlRef: "control:test-rounding",
      evidenceRefs: ["evidence:test-rounding"],
      reasonCode: "bounded_rounding_reconciles_complete_fee_population",
      additiveChargeRef: null,
      category: null,
      participantOrOwner: null,
    };

    const result = profile(economic);
    expect(result.chargedCostProfile).toMatchObject({
      mappedNetAmountMinor: 4_500,
      profileReconciliationDeltaMinor: -1,
      reconcilesToRdTotal: true,
      rdNonAdditiveRoundingResidual: {
        signedResidualMinor: -1,
        additiveChargeRef: null,
        category: null,
        participantOrOwner: null,
      },
    });
    expect(result.chargedCostProfile.items.reduce((sum, item) =>
      sum + (item.financialDirection === "debit" ? item.amount.amountMinor : -item.amount.amountMinor), 0)).toBe(4_500);
  });

  it("keeps a missing or ambiguous governed bridge in the unresolved Product-view bucket", () => {
    const decomposition = decomp().contract;
    decomposition.rows = decomposition.rows.filter((row) => row.printedLabel !== "Statement fee");
    const result = profile(cloneEconomic(), decomposition);
    const item = result.chargedCostProfile.items.find((candidate) => candidate.amount.amountMinor === 3_100)!;
    expect(item).toMatchObject({
      commercialFeeRowRef: null,
      productCostConcept: "UNRESOLVED_SHARED_BUNDLED_ECONOMICS",
      mappingState: "UNRESOLVED",
      classificationEvidenceAccess: "UNRESOLVED",
    });
    expect(result.completeness.costMappingState).toBe("PARTIAL_RD_CHARGE_MAPPING");
  });

  it("keeps an RD unresolved remainder in one unresolved location and marks mapping completeness partial", () => {
    const economic = cloneEconomic();
    economic.economicLayer.costStack.authoritativeStatementFeeTotal = { amountMinor: 5_000, currency: "USD" };
    economic.economicLayer.costStack.totalStatementProcessingCost = { amountMinor: 5_000, currency: "USD" };
    economic.economicLayer.costStack.unresolvedRemainder = { amountMinor: 500, currency: "USD" };
    economic.economicLayer.costStack.reconciliationDeltaMinor = 0;
    const result = profile(economic);
    const unresolved = result.chargedCostProfile.buckets.find((bucket) => bucket.concept === "UNRESOLVED_SHARED_BUNDLED_ECONOMICS")!;
    expect(unresolved.rdRemainderIncludedMinor).toBe(500);
    expect(result.chargedCostProfile).toMatchObject({ mappedNetAmountMinor: 5_000, reconcilesToRdTotal: true });
    expect(result.completeness).toMatchObject({
      costMappingState: "PARTIAL_RD_CHARGE_MAPPING",
      profileState: "PARTIAL_CURRENT_STATEMENT",
    });
  });

  it("preserves provider, network, shared, and dispute boundaries without changing RD categories", () => {
    const economic = cloneEconomic();
    const beforeCategories = economic.economicLayer.charges.map((charge) => charge.category);
    const fixture = decomp();
    fixture.rows.statement.commercialDollarCategory = "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM";
    fixture.rows.statement.economicLayer = { state: "supported", value: "card_network" };
    fixture.rows.statement.claimPermissions.exactProviderControlledDollarsAllowed = false;
    const result = profile(economic, fixture.contract);
    expect(result.chargedCostProfile.items.find((item) => item.amount.amountMinor === 1_500)?.productCostConcept)
      .toBe("DISPUTE_CHARGEBACK_ECONOMICS");
    expect(result.chargedCostProfile.items.find((item) => item.amount.amountMinor === 3_100)?.productCostConcept)
      .toBe("CARD_NETWORK_ECONOMICS");
    expect(result.chargedCostProfile.items.find((item) => item.amount.amountMinor === 100)?.productCostConcept)
      .toBe("UNRESOLVED_SHARED_BUNDLED_ECONOMICS");
    expect(economic.economicLayer.charges.map((charge) => charge.category)).toEqual(beforeCategories);
  });

  it.each([
    ["volume", "VOLUME_DRIVEN"],
    ["count", "TRANSACTION_COUNT_DRIVEN"],
    ["fixed", "FIXED_COST_DRIVEN"],
  ] as const)("derives %s sensitivity only from reproduced current mechanics", (mechanic, expected) => {
    const economic = cloneEconomic();
    const fixture = decomp();
    bindMechanic(economic, fixture.rows.statement, mechanic);
    const result = profile(economic, fixture.contract);
    expect(result.costStructureSensitivity.state).toBe(expected);
    expect(result.costStructureSensitivity.additiveDriverContributionMinor).toBe(0);
  });

  it("classifies more than one reproduced controllable mechanic as mixed", () => {
    const economic = cloneEconomic();
    const fixture = decomp();
    bindMechanic(economic, fixture.rows.statement, "volume");
    fixture.rows.chargeback.claimPermissions.exactProviderControlledDollarsAllowed = true;
    fixture.rows.chargeback.commercialDollarCategory = "PROVIDER_CONTROLLED_VARIABLE";
    fixture.rows.chargeback.mechanicAndPopulation = { mechanicState: "supported", mechanic: "per_item", populationState: "supported", population: "authorization_events" };
    fixture.rows.chargeback.printedArithmetic.status = "reproduces";
    economic.economicLayer.charges[0]!.pricingComponentRefs = ["pricing_component_002"];
    economic.economicLayer.charges[0]!.pricingPopulationRefs = ["pricing_population_002"];
    economic.pricingAnalysis.pricingArchitecture.observedPricingComponents.push({
      ...economic.pricingAnalysis.pricingArchitecture.observedPricingComponents[0]!,
      id: "pricing_component_002",
      populationRef: "pricing_population_002",
      componentKind: "per_item",
      basisType: "transaction_count",
      appliedBaseAmount: null,
      appliedCount: 150,
      rate: null,
      printedRate: null,
      printedRateUnit: null,
      perItemAmount: { amountMinor: 10, currency: "USD" },
      observedAmount: { amountMinor: 1_500, currency: "USD" },
    });
    const result = profile(economic, fixture.contract);
    expect(result.costStructureSensitivity.state).toBe("MIXED");
  });

  it("defaults incidence to unresolved and does not equate gross cost with merchant burden", () => {
    const result = profile();
    expect(result.costIncidence).toMatchObject({
      state: "INCIDENCE_UNRESOLVED",
      grossProcessingCost: { amountMinor: 4_500 },
      costOffsetRevenue: { state: "UNKNOWN", value: null },
      netMerchantBorneProcessingCost: { state: "UNKNOWN", value: null },
    });
  });

  it("preserves statement-evidenced incidence without unsupported netting", () => {
    const present = buildCurrentRelationshipEconomicsProfileV1({
      economic: cloneEconomic(),
      commercialDecomposition: decomp().contract,
      incidence: {
        state: "INCIDENCE_EVIDENCED_PRESENT",
        evidenceAccess: "STATEMENT_DERIVABLE",
        evidenceRefs: ["statement:incidence-program-present"],
      },
    });
    expect(present.costIncidence).toMatchObject({
      state: "INCIDENCE_EVIDENCED_PRESENT",
      costOffsetRevenue: { state: "UNKNOWN", value: null },
      netMerchantBorneProcessingCost: { state: "UNKNOWN", value: null },
    });
  });

  it("keeps authorization, approval, settlement, and their relationship separate", () => {
    const economic = cloneEconomic();
    const facts = economic.pricingAnalysis.foundation.financialPopulations;
    facts.authorizationCount = { ...facts.authorizationCount, status: "available", value: 120, provenanceStatus: "approved_synthetic", evidenceRefs: ["statement:auth"] };
    facts.settledTransactionCount = { ...facts.settledTransactionCount, status: "available", value: 100, provenanceStatus: "approved_synthetic", evidenceRefs: ["statement:settled"] };
    const withoutCompatibility = profile(economic);
    expect(withoutCompatibility.activity.authorizationCount.value).toBe(120);
    expect(withoutCompatibility.activity.approvedAuthorizationCount.state).toBe("UNKNOWN");
    expect(withoutCompatibility.activity.settledTransactionCount.value).toBe(100);
    expect(withoutCompatibility.activity.authorizationToSettlement.state).toBe("UNKNOWN");

    const compatible = buildCurrentRelationshipEconomicsProfileV1({
      economic,
      commercialDecomposition: decomp().contract,
      authorizationSettlementCompatibility: {
        state: "PROVEN_COMPATIBLE",
        evidenceAccess: "STATEMENT_DERIVABLE",
        evidenceRefs: ["statement:compatible-event-populations"],
      },
    });
    expect(compatible.activity.authorizationToSettlement).toMatchObject({
      state: "KNOWN",
      value: { authorizationCount: 120, settledTransactionCount: 100, settledPerAuthorization: 0.833333 },
    });
  });

  it("excludes refund and chargeback principal from the additive charged-cost profile", () => {
    const result = profile();
    const economic = cloneEconomic();
    const excludedRefs = new Set(economic.economicLayer.nonFeeExclusions
      .filter((item) => item.reason === "sales_refund" || item.reason === "chargeback_principal")
      .map((item) => item.occurrenceRef));
    expect(result.chargedCostProfile.items.every((item) => item.rdSourceOccurrenceRefs.every((ref) => !excludedRefs.has(ref)))).toBe(true);
    expect(result.chargedCostProfile.nonFeePrincipalContributionCount).toBe(0);
  });

  it("fails closed if an upstream contributing charge overlaps an excluded refund or chargeback-principal occurrence", () => {
    const economic = cloneEconomic();
    economic.economicLayer.nonFeeExclusions.push({
      occurrenceRef: economic.economicLayer.charges[0]!.sourceOccurrenceRefs[0]!,
      reason: "chargeback_principal",
      evidenceRefs: ["statement:chargeback-principal"],
      derivabilityTier: "stated_on_statement",
      assertionBasis: "source_fact",
      limitations: [],
    });
    expect(() => profile(economic)).toThrow("CURRENT_ECONOMICS_NONFEE_PRINCIPAL_INCLUDED");
  });

  it("classifies evidence access while preserving missing evidence as requirements rather than prompts", () => {
    const result = profile();
    expect(result.activity.processedVolume.evidenceAccess).toBe("STATEMENT_DERIVABLE");
    expect(result.activity.approvedAuthorizationCount.evidenceAccess).toBe("DOCUMENT_REQUIRED");
    expect(result.activity.channel.evidenceAccess).toBe("MERCHANT_INPUT");
    expect(new Set(result.evidenceRequirements.map((item) => item.access))).toEqual(new Set([
      "DOCUMENT_REQUIRED", "MERCHANT_INPUT", "PUBLIC_EVIDENCE", "UNRESOLVED",
    ]));
  });

  it("contains no alternative, commercial-source, customer-routing, opportunity, savings, or annualization authority", () => {
    const result = profile();
    expect(result.safety).toMatchObject({
      commercialSourceConsumptionAllowed: false,
      comparatorInputCount: 0,
      alternativeProviderCount: 0,
      opportunityOutputCount: 0,
      savingsOutputCount: 0,
      annualizationOutputCount: 0,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
      customerRoutingAllowed: false,
      legacyOpportunityFieldReuseAllowed: false,
    });
    expect(result.costStructureSensitivity.additiveDriverContributionMinor).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/authorize\.net|helcim|dharma|switching recommendation|annual savings/i);
  });
});

function profile(
  economic = cloneEconomic(),
  commercialDecomposition = decomp().contract,
): CurrentRelationshipEconomicsProfileV1 {
  return buildCurrentRelationshipEconomicsProfileV1({ economic, commercialDecomposition });
}

function cloneEconomic(): CanonicalEconomicsV2EconomicAnalysis {
  return structuredClone(buildApprovedEconomics());
}

function activityAdmission(
  field: CurrentEconomicsActivityAdmissionV1<number>["field"],
  population: string,
  value: number,
): CurrentEconomicsActivityAdmissionV1<number> {
  return {
    admissionRef: `test-${field}`,
    field,
    population,
    value,
    evidenceAccess: "STATEMENT_DERIVABLE",
    evidenceRefs: ["document-ir:test-line"],
    sourceLayer: "fiserv_claim_scoped_activity_population_admission_v1",
    sourceDocumentRef: "SYNTH-RC-PRICING",
    exactPopulationIdentityProven: true,
    reconciliationState: "DIRECT_SOURCE",
    controlRefs: ["exact_test_population"],
    canonicalMutationAllowed: false,
    rdMutationAllowed: false,
    limitations: [],
  };
}

function bindMechanic(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  row: CommercialDecompositionRowV1,
  mechanic: "volume" | "count" | "fixed",
): void {
  const charge = economic.economicLayer.charges.find((candidate) => candidate.observedAmount?.amountMinor === 3_100)!;
  const component = economic.pricingAnalysis.pricingArchitecture.observedPricingComponents[0]!;
  charge.pricingComponentRefs = [component.id];
  charge.pricingPopulationRefs = [component.populationRef];
  row.printedArithmetic.status = "reproduces";
  row.claimPermissions.exactProviderControlledDollarsAllowed = true;
  if (mechanic === "volume") {
    row.mechanicAndPopulation = { mechanicState: "supported", mechanic: "rate_times_volume", populationState: "supported", population: "gross sales" };
    return;
  }
  if (mechanic === "count") {
    component.componentKind = "per_item";
    component.basisType = "transaction_count";
    component.appliedBaseAmount = null;
    component.appliedCount = 310;
    component.rate = null;
    component.printedRate = null;
    component.printedRateUnit = null;
    component.perItemAmount = { amountMinor: 10, currency: "USD" };
    component.observedAmount = { amountMinor: 3_100, currency: "USD" };
    row.mechanicAndPopulation = { mechanicState: "supported", mechanic: "per_item", populationState: "supported", population: "authorization_events" };
    return;
  }
  charge.pricingComponentRefs = [];
  charge.pricingPopulationRefs = [];
  row.commercialDollarCategory = "PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY";
  row.mechanicAndPopulation = { mechanicState: "supported", mechanic: "fixed_periodic_charge", populationState: "supported", population: "statement_period" };
  row.recurrence = { state: "EXPLICIT_CADENCE_SUPPORTED", cadence: "monthly", annualizationAllowed: false, reason: "Printed monthly cadence." };
}

function decomp(): {
  contract: CommercialDecompositionContractV1;
  rows: { chargeback: CommercialDecompositionRowV1; statement: CommercialDecompositionRowV1; credit: CommercialDecompositionRowV1 };
} {
  const chargeback = row("fee_chargeback", "Chargeback fee", 1_500, "SHARED_BUNDLED_OR_UNRESOLVED", "security_compliance_or_risk", "chargeback_fee");
  const statement = row("fee_statement", "Statement fee", 3_100, "PROVIDER_CONTROLLED_VARIABLE", "acquiring_commercial", "rate_times_volume");
  statement.claimPermissions.exactProviderControlledDollarsAllowed = true;
  const credit = row("fee_credit", "Fee credit", 100, "SHARED_BUNDLED_OR_UNRESOLVED", "LAYER_UNRESOLVED", null);
  const rows = [chargeback, statement, credit];
  return {
    rows: { chargeback, statement, credit },
    contract: {
      contractVersion: "claim_specific_commercial_decomposition_contract_2026_09_10_v1",
      authorityVersion: "governed_payment_knowledge_authority_v1" as any,
      statement: { processorFamily: "fiserv", statementPeriod: { start: "2025-01-01", end: "2025-01-31" }, totalCanonicalFeesMinor: 4_500, contributingRowTotalMinor: 4_700 },
      rows,
      aggregate: {
        categoryTotalsMinor: {
          UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM: 0,
          INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE: 0,
          PROVIDER_CONTROLLED_VARIABLE: 3_100,
          PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY: 0,
          SHARED_BUNDLED_OR_UNRESOLVED: 1_600,
          GOVERNMENT_NONPROCESSING_OR_OTHER: 0,
        },
        attributedContributingRowsMinor: 4_700,
        canonicalRowReconciliationResidualMinor: -200,
        reconcilesToCanonicalFees: true,
        doubleCountedDollarsMinor: 0,
        unresolvedIncludingCanonicalResidualMinor: 1_600,
      },
      residualCompleteness: {
        state: "ROW_LEDGER_WITH_CANONICAL_RESIDUAL",
        exactCanonicalRowResidualMinor: -200,
        exactProviderResidualAllowed: false,
        exactProviderResidualMinor: null,
        providerControlledMinimumMinor: 3_100,
        providerControlledUpperBound: { state: "SAME_AS_MINIMUM", amountMinor: 3_100 },
        periodScopedUnderlyingBilledAmountMinor: 0,
        networkRelatedBilledAmountMinor: 0,
        exactOfficialNetworkParAmountMinor: null,
        unresolvedRemainderMinor: 1_600,
        reasons: [],
      },
      permissions: {
        internalAnalystOnly: true,
        customerRenderingAllowed: false,
        overallCommercialGradeAllowed: false,
        savingsTargetAllowed: false,
        switchingRecommendationAllowed: false,
        canonicalMutationAllowed: false,
        aiOrResearchMutationAllowed: false,
      },
    },
  };
}

function row(
  feeRowId: string,
  printedLabel: string,
  billedAmountMinor: number,
  category: CommercialDecompositionRowV1["commercialDollarCategory"],
  economicLayer: string,
  exactIdentity: string | null,
): CommercialDecompositionRowV1 {
  return {
    feeRowId,
    printedLabel,
    contributesToCanonicalTotal: true,
    billedAmountMinor,
    identity: { exactState: exactIdentity ? "supported" : "unresolved", exactValue: exactIdentity, familyState: "supported", familyValue: exactIdentity },
    mechanicAndPopulation: { mechanicState: "supported", mechanic: exactIdentity === "chargeback_fee" ? "per_item" : exactIdentity, populationState: "supported", population: "statement_population" },
    economicLayer: { state: economicLayer === "LAYER_UNRESOLVED" ? "unresolved" : "supported", value: economicLayer },
    participants: {
      collector: { state: "supported", value: "processor_or_acquirer" },
      economicBeneficiary: { state: "unresolved", value: null },
      ruleSetter: { state: "unresolved", value: null },
      priceSetter: { state: "unresolved", value: null },
      merchantFacingPriceController: { state: category === "PROVIDER_CONTROLLED_VARIABLE" ? "supported" : "unresolved", value: category === "PROVIDER_CONTROLLED_VARIABLE" ? "acquiring_side_program" : null },
    },
    cardinality: { state: "supported", value: "one_fee" },
    printedArithmetic: { status: "reproduces", chargedAmountMinor: billedAmountMinor, reconstructedRoundedAmountMinor: billedAmountMinor, reasonCode: "synthetic_reproduces" },
    commercialDollarCategory: category,
    commercialDollarAttribution: {
      kind: category === "PROVIDER_CONTROLLED_VARIABLE" ? "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE" : "SHARED_BUNDLED_OR_UNRESOLVED",
      amountMinor: billedAmountMinor,
      providerControlledMinimumContributionMinor: category === "PROVIDER_CONTROLLED_VARIABLE" ? billedAmountMinor : 0,
      providerControlledUpperBoundContributionMinor: category === "PROVIDER_CONTROLLED_VARIABLE" ? billedAmountMinor : 0,
      periodScopedUnderlyingContributionMinor: 0,
      unresolvedContributionMinor: category === "SHARED_BUNDLED_OR_UNRESOLVED" ? billedAmountMinor : 0,
      rationale: "Approved synthetic profile test.",
    },
    claimPermissions: {
      exactProviderControlledDollarsAllowed: false,
      providerControlledUpperBoundAllowed: false,
      periodScopedUnderlyingBilledDollarsAllowed: false,
      networkRelatedAttributionAllowed: category === "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM",
      officialNetworkParLanguageAllowed: false,
      confirmedNoProviderUpliftLanguageAllowed: false,
      providerRetentionOrProfitLanguageAllowed: false,
      overallCommercialGradeAllowed: false,
      savingsTargetAllowed: false,
    },
    action: { actionClass: "N0", text: "No action generated.", merchantAgreementRequiredForAction: false, merchantAgreementRequiredForContractConclusion: false },
    recurrence: { state: "CURRENT_PERIOD_OCCURRENCE_ONLY", cadence: null, annualizationAllowed: false, reason: "One period only." },
    evidenceRefs: [`governed:${feeRowId}`],
    limitations: [],
  };
}

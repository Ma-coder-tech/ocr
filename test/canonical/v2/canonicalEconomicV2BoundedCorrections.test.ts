import { describe, expect, it } from "vitest";
import { compareAssertion, loadGoldContract, loadToleranceRules, type GoldAssertion } from "../../../scripts/gold-contract-lib.js";
import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  buildCanonicalEconomicsV2PricingAnalysis,
  buildUnavailableCanonicalEconomicsV2Foundation,
  compareLegacyAndCanonicalEconomicsV2,
  observeCanonicalEconomicsV2ForGold,
  validateCanonicalEconomicsV2EconomicAnalysis,
  type BuildCanonicalEconomicsV2EconomicInput,
  type CanonicalEconomicNonFeeExclusionReason,
} from "../../../src/canonical/v2/index.js";
import { approvedEconomicInput, buildApprovedEconomics, economicPricing } from "./economicFixtures.js";

describe("Canonical Economics V2 bounded RD corrections", () => {
  it.each(["control_only", "repeated_representation", "unresolved"] as const)(
    "refuses an ungrouped %s source occurrence as an economic contributor",
    (contributionRole) => {
      const input = approvedEconomicInput();
      const occurrence = statementFeeOccurrence(input);
      occurrence.contributionRole = contributionRole;
      const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);

      expect(analysis.validation.status).toBe("valid");
      expect(statementFeeCharge(analysis)).toMatchObject({
        status: "unresolved",
        contributionStatus: "noncontributing_support",
        contributingOccurrenceRef: null,
      });
      expect(analysis.economicLayer.costStack.completeness).toBe("financially_unreconciled");
    },
  );

  it("requires explicit evidence-bound admission before supporting detail can contribute", () => {
    const refusedInput = approvedEconomicInput();
    delete refusedInput.charges!.find((charge) => charge.key === "statement_fee")!.supportingDetailAdmission;
    const refused = buildCanonicalEconomicsV2EconomicAnalysis(refusedInput);
    const admitted = buildApprovedEconomics();

    expect(statementFeeCharge(refused)).toMatchObject({ contributionStatus: "noncontributing_support", supportingDetailAdmissionId: null });
    expect(statementFeeCharge(admitted)).toMatchObject({
      contributionStatus: "contributes_classified",
      supportingDetailAdmissionId: "approved_synthetic_supporting_detail_statement_fee_v1",
    });
  });

  it("preserves two explicitly admitted identical-looking occurrences as distinct charges", () => {
    const input = approvedEconomicInput();
    const original = statementFeeOccurrence(input);
    const duplicate = { ...structuredClone(original), id: `${original.id}_distinct_event` };
    input.pricingAnalysis.foundation.sourceModel.occurrences.push(duplicate);
    input.charges!.push({
      ...structuredClone(input.charges!.find((charge) => charge.key === "statement_fee")!),
      key: "second_distinct_statement_fee",
      sourceOccurrenceRefs: [duplicate.id],
      contributingOccurrenceRef: duplicate.id,
      roleClaimKeys: [],
      supportingDetailAdmission: {
        admissionId: "approved_synthetic_supporting_detail_second_event_v1",
        evidenceRefs: [duplicate.evidenceRef],
        assertionBasis: "source_fact",
      },
    });
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);
    const sameAmount = analysis.economicLayer.charges.filter((charge) => charge.observedAmount?.amountMinor === original.printedAmount?.amountMinor);

    expect(analysis.validation.status).toBe("valid");
    expect(sameAmount).toHaveLength(2);
    expect(new Set(sameAmount.map((charge) => charge.id)).size).toBe(2);
    expect(new Set(sameAmount.map((charge) => charge.contributingOccurrenceRef)).size).toBe(2);
  });

  it("does not let an AI or unsupported participant-role path establish processor control", () => {
    const input = processorPricingInput();
    input.participants![0]!.assertionBasis = "ai_hypothesis";
    input.participants![0]!.derivabilityTier = "inferable_from_statement_with_qualification";
    addPriceSetter(input);
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);

    expect(analysis.economicLayer.participants[0]).toMatchObject({ roleResolution: "unresolved" });
    expect(analysis.economicLayer.roleClaims.find((claim) => claim.dimension === "price_setter")).toMatchObject({ resolution: "proven" });
    expect(bucket(analysis, "processor_controlled_pricing")).toBe(0);
    expect(bucket(analysis, "unresolved_cost")).toBe(3100);
  });

  it("keeps collector, beneficiary, setter, billing, and control semantics independent", () => {
    const billed = processorPricingInput();
    const billedAnalysis = buildCanonicalEconomicsV2EconomicAnalysis(billed);
    expect(billedAnalysis.economicLayer.roleClaims.find((claim) => claim.dimension === "collector")?.resolution).toBe("proven");
    expect(billedAnalysis.economicLayer.roleClaims.find((claim) => claim.dimension === "economic_beneficiary")?.resolution).toBe("unresolved");
    expect(billedAnalysis.economicLayer.roleClaims.some((claim) => claim.dimension === "price_setter")).toBe(false);
    expect(bucket(billedAnalysis, "processor_controlled_pricing")).toBe(0);

    const beneficiaryInput = processorPricingInput();
    const evidenceRef = statementFeeOccurrence(beneficiaryInput).evidenceRef;
    beneficiaryInput.roleClaims!.push({
      key: "proven_beneficiary",
      chargeKey: "statement_fee",
      dimension: "economic_beneficiary",
      participantKey: "processor",
      resolution: "proven",
      evidenceRefs: [evidenceRef],
      derivabilityTier: "stated_on_statement",
      assertionBasis: "source_fact",
    });
    beneficiaryInput.charges!.find((charge) => charge.key === "statement_fee")!.roleClaimKeys!.push("proven_beneficiary");
    const beneficiary = buildCanonicalEconomicsV2EconomicAnalysis(beneficiaryInput);
    expect(beneficiary.economicLayer.roleClaims.find((claim) => claim.id.endsWith("004"))?.resolution).toBe("proven");
    expect(bucket(beneficiary, "processor_controlled_pricing")).toBe(0);
  });

  it("downgrades a positive role claim whose required dependency is unsatisfied", () => {
    const input = processorPricingInput();
    addPriceSetter(input, ["merchant_pricing_document"]);
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);
    const setter = analysis.economicLayer.roleClaims.find((claim) => claim.dimension === "price_setter")!;

    expect(analysis.validation.status).toBe("valid");
    expect(setter).toMatchObject({ resolution: "unresolved", participantRef: null });
    expect(setter.dependencyRefs).toEqual(["economic_dependency_001"]);
    expect(bucket(analysis, "processor_controlled_pricing")).toBe(0);
  });

  it("blocks a contributing economic charge while any referenced dependency remains unsatisfied", () => {
    const input = approvedEconomicInput();
    input.charges!.find((charge) => charge.key === "statement_fee")!.dependencyKeys = ["merchant_pricing_document"];
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(statementFeeCharge(analysis)).toMatchObject({
      status: "unresolved",
      contributionStatus: "blocked_representation",
      contributingOccurrenceRef: null,
      derivabilityTier: "unresolved",
    });
  });

  it("allows dependency-bound control only after admitted evidence satisfies the dependency", () => {
    const input = processorPricingInput();
    const evidenceRef = statementFeeOccurrence(input).evidenceRef;
    input.dependencies![0]!.status = "satisfied_by_admitted_evidence";
    input.dependencies![0]!.evidenceRefs = [evidenceRef];
    addPriceSetter(input, ["merchant_pricing_document"]);
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.economicLayer.roleClaims.find((claim) => claim.dimension === "price_setter")?.resolution).toBe("proven");
    expect(bucket(analysis, "processor_controlled_pricing")).toBe(3100);
  });

  it("classifies demonstrated category, direction, contribution, and completeness differences explicitly", () => {
    const unresolvedInput = approvedEconomicInput(undefined, { feeDetailCoverage: "incomplete", omitStatementFee: true });
    const unresolved = buildCanonicalEconomicsV2EconomicAnalysis(unresolvedInput);
    const categoryInput = approvedEconomicInput();
    categoryInput.charges!.find((charge) => charge.key === "statement_fee")!.categoryResolution = "unresolved";
    const categoryAnalysis = buildCanonicalEconomicsV2EconomicAnalysis(categoryInput);
    const statement = statementFeeCharge(buildApprovedEconomics());

    const category = compareLegacyAndCanonicalEconomicsV2(baseLegacy({
      charges: [legacyCharge(statement, { category: "processor_service_administrative_cost", categoryPositiveEvidenceProven: false })],
    }), categoryAnalysis);
    expect(category.items).toContainEqual(expect.objectContaining({ fact: "charge:legacy-charge:category", classification: "approved_semantic_amendment" }));

    const direction = compareLegacyAndCanonicalEconomicsV2(baseLegacy({
      charges: [legacyCharge(buildApprovedEconomics().economicLayer.charges.find((charge) => charge.subtype === "fee_credit")!, { direction: "debit" })],
    }), buildApprovedEconomics());
    expect(direction.items).toContainEqual(expect.objectContaining({ fact: "charge:legacy-charge:direction", amendmentId: "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION" }));

    const contributionInput = approvedEconomicInput();
    statementFeeOccurrence(contributionInput).contributionRole = "control_only";
    const contributionAnalysis = buildCanonicalEconomicsV2EconomicAnalysis(contributionInput);
    const contribution = compareLegacyAndCanonicalEconomicsV2(baseLegacy({
      charges: [legacyCharge(statementFeeCharge(contributionAnalysis), { contributes: true })],
    }), contributionAnalysis);
    expect(contribution.items).toContainEqual(expect.objectContaining({ fact: "charge:legacy-charge:contribution", amendmentId: "RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY" }));

    const completeness = compareLegacyAndCanonicalEconomicsV2(baseLegacy({
      uniqueChargeCount: 2,
      costStack: { completeness: "complete", unresolvedRemainder: null, reconciliationDeltaMinor: 0 },
    }), unresolved);
    expect(completeness.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ fact: "cost_stack_completeness", amendmentId: "RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK" }),
      expect.objectContaining({ fact: "cost_stack_unresolved_remainder", amendmentId: "RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK" }),
    ]));
  });

  it("treats a proven conflicting category as an unexpected legacy/V2 divergence", () => {
    const analysis = buildApprovedEconomics();
    const statement = statementFeeCharge(analysis);
    const comparison = compareLegacyAndCanonicalEconomicsV2(baseLegacy({
      charges: [legacyCharge(statement, { category: "network_card_brand_economics", categoryPositiveEvidenceProven: true })],
    }), analysis);
    expect(comparison.items).toContainEqual(expect.objectContaining({
      fact: "charge:legacy-charge:category",
      classification: "unexpected_divergence",
    }));
  });

  it("reports zero unexpected divergence for fully aligned shared economic facts", () => {
    const analysis = buildApprovedEconomics();
    const comparison = compareLegacyAndCanonicalEconomicsV2(baseLegacy({
      charges: analysis.economicLayer.charges.map((charge, index) => ({
        ...legacyCharge(charge, {
          id: `legacy-charge-${index + 1}`,
          categoryPositiveEvidenceProven: true,
        }),
      })),
      costStack: {
        completeness: analysis.economicLayer.costStack.completeness,
        unresolvedRemainder: analysis.economicLayer.costStack.unresolvedRemainder,
        reconciliationDeltaMinor: analysis.economicLayer.costStack.reconciliationDeltaMinor,
      },
      nonFeeExcludedOccurrenceRefs: analysis.economicLayer.nonFeeExclusions.map((entry) => entry.occurrenceRef),
    }), analysis);

    expect(comparison.hasUnexpectedDivergence).toBe(false);
    expect(comparison.counts.unexpected_divergence).toBe(0);
  });

  it.each([
    "reserve_or_funding_correction",
    "funding_activity",
    "non_processing_tax",
    "other_non_fee",
  ] as const)("requires positive evidence to exclude %s activity and never adds it to fee cost", (reason) => {
    const admittedInput = inputWithUnknownNonFeeOccurrence(reason, true);
    const refusedInput = inputWithUnknownNonFeeOccurrence(reason, false);
    const admitted = buildCanonicalEconomicsV2EconomicAnalysis(admittedInput);
    const refused = buildCanonicalEconomicsV2EconomicAnalysis(refusedInput);

    expect(admitted.validation.status).toBe("valid");
    expect(admitted.economicLayer.nonFeeExclusions).toContainEqual(expect.objectContaining({ reason, assertionBasis: "source_fact" }));
    const occurrenceRef = admittedInput.nonFeeAdmissions![0]!.occurrenceRef;
    expect(refused.economicLayer.nonFeeExclusions.some((entry) => entry.occurrenceRef === occurrenceRef)).toBe(false);
    expect(admitted.economicLayer.costStack.classifiedChargeNet.amountMinor).toBe(4500);
    expect(refused.economicLayer.costStack.classifiedChargeNet.amountMinor).toBe(4500);
  });

  it("does not emit processor-billed cost from the authoritative fee total alone", () => {
    const input = approvedEconomicInput();
    input.roleClaims = [];
    for (const charge of input.charges!) charge.roleClaimKeys = [];
    const observation = observeCanonicalEconomicsV2ForGold(buildCanonicalEconomicsV2EconomicAnalysis(input));

    expect(observation.values).not.toHaveProperty("cost.observed_processor_billed_fee");
    expect(observation.states["cost.processor_markup"]).toBe("unresolved_requires_positive_mapping");
  });

  it("matches the finalized RD-owned S6, S10, and G9 Gold assertions directly", async () => {
    const s6 = observeCanonicalEconomicsV2ForGold(buildApprovedEconomics(), { caseId: "S6" });
    await expectGoldMatches("S6", ["S6-ADJUSTMENT", "S6-NO-CONTAMINATION"], s6);

    const s10Input = approvedEconomicInput(economicPricing({ totalFees: 100, chargebackFee: 20, feeCredit: -5 }));
    proveProcessorBillingForEveryCharge(s10Input);
    const s10 = observeCanonicalEconomicsV2ForGold(buildCanonicalEconomicsV2EconomicAnalysis(s10Input), { caseId: "S10" });
    await expectGoldMatches("S10", ["S10-OBSERVED-COST"], s10);

    const g9 = observeCanonicalEconomicsV2ForGold(sourceUnavailableAnalysis(), { caseId: "G9" });
    await expectGoldMatches("G9", ["G9-DETAIL", "G9-COST-STACK", "G9-MARKUP"], g9);
  });

  it("rejects any attempt to claim total-acceptance-cost authority", () => {
    const analysis = structuredClone(buildApprovedEconomics());
    (analysis.versionManifest as { totalAcceptanceCostAuthority: string }).totalAcceptanceCostAuthority = "allowed";
    const validated = validateCanonicalEconomicsV2EconomicAnalysis(analysis);

    expect(validated.validation.status).toBe("invalid");
    expect(validated.validation.errors).toContain("RD cannot claim total acceptance cost authority.");
  });
});

function processorPricingInput(): BuildCanonicalEconomicsV2EconomicInput {
  const input = approvedEconomicInput();
  input.charges!.find((charge) => charge.key === "statement_fee")!.category = "processor_acquirer_pricing";
  return input;
}

function addPriceSetter(input: BuildCanonicalEconomicsV2EconomicInput, dependencyKeys: string[] = []): void {
  const evidenceRef = statementFeeOccurrence(input).evidenceRef;
  input.roleClaims!.push({
    key: "price_setter",
    chargeKey: "statement_fee",
    dimension: "price_setter",
    participantKey: "processor",
    resolution: "proven",
    evidenceRefs: [evidenceRef],
    dependencyKeys,
    derivabilityTier: "stated_on_statement",
    assertionBasis: "source_fact",
  });
  input.charges!.find((charge) => charge.key === "statement_fee")!.roleClaimKeys!.push("price_setter");
  for (const dependencyKey of dependencyKeys) {
    const dependency = input.dependencies!.find((item) => item.key === dependencyKey)!;
    dependency.claimKeys = [...(dependency.claimKeys ?? []), "price_setter"];
  }
}

function statementFeeOccurrence(input: BuildCanonicalEconomicsV2EconomicInput) {
  const ref = input.charges!.find((charge) => charge.key === "statement_fee")!.contributingOccurrenceRef!;
  return input.pricingAnalysis.foundation.sourceModel.occurrences.find((occurrence) => occurrence.id === ref)!;
}

function statementFeeCharge(analysis: ReturnType<typeof buildCanonicalEconomicsV2EconomicAnalysis>) {
  return analysis.economicLayer.charges.find((charge) => charge.subtype === "service_admin")!;
}

function bucket(analysis: ReturnType<typeof buildCanonicalEconomicsV2EconomicAnalysis>, kind: string): number {
  return analysis.economicLayer.costStack.buckets.find((entry) => entry.kind === kind)!.netAmount.amountMinor;
}

function baseLegacy(overrides: Partial<Parameters<typeof compareLegacyAndCanonicalEconomicsV2>[0]> = {}) {
  return {
    statementProcessingFeeTotal: { amountMinor: 4500, currency: "USD" as const },
    uniqueChargeCount: 3,
    processorControlledTotal: null,
    emitsExactOwnershipWithoutPositiveProof: false,
    mayDoubleCountRepeatedRepresentations: false,
    includesNonFeeSettlementActivityInFeeCost: false,
    describesStatementFeesAsTotalAcceptanceCost: false,
    ...overrides,
  };
}

function legacyCharge(
  charge: ReturnType<typeof statementFeeCharge>,
  overrides: Partial<NonNullable<Parameters<typeof compareLegacyAndCanonicalEconomicsV2>[0]["charges"]>[number]> = {},
) {
  return {
    id: "legacy-charge",
    sourceOccurrenceRefs: charge.sourceOccurrenceRefs,
    amount: charge.observedAmount,
    direction: charge.financialDirection,
    contributes: charge.contributionStatus.startsWith("contributes_"),
    category: charge.category,
    processorParticipantRoleProven: null,
    processorControlProven: null,
    ...overrides,
  };
}

function inputWithUnknownNonFeeOccurrence(
  reason: CanonicalEconomicNonFeeExclusionReason,
  withEvidence: boolean,
): BuildCanonicalEconomicsV2EconomicInput {
  const input = approvedEconomicInput();
  const source = statementFeeOccurrence(input);
  const occurrence = {
    ...structuredClone(source),
    id: `occurrence_explicit_nonfee_${reason}`,
    semanticRole: "unknown" as const,
    contributionRole: "unresolved" as const,
  };
  input.pricingAnalysis.foundation.sourceModel.occurrences.push(occurrence);
  input.nonFeeAdmissions = [{
    occurrenceRef: occurrence.id,
    reason,
    evidenceRefs: withEvidence ? [occurrence.evidenceRef] : [],
    derivabilityTier: "stated_on_statement",
    assertionBasis: "source_fact",
  }];
  return input;
}

function proveProcessorBillingForEveryCharge(input: BuildCanonicalEconomicsV2EconomicInput): void {
  for (const charge of input.charges!) {
    const ref = charge.contributingOccurrenceRef!;
    const evidenceRef = input.pricingAnalysis.foundation.sourceModel.occurrences.find((occurrence) => occurrence.id === ref)!.evidenceRef;
    const key = `billing_${charge.key}`;
    input.roleClaims!.push({
      key,
      chargeKey: charge.key,
      dimension: "billing_intermediary",
      participantKey: "processor",
      resolution: "proven",
      evidenceRefs: [evidenceRef],
      derivabilityTier: "stated_on_statement",
      assertionBasis: "source_fact",
    });
    charge.roleClaimKeys = [...(charge.roleClaimKeys ?? []), key];
  }
}

function sourceUnavailableAnalysis() {
  const foundation = buildUnavailableCanonicalEconomicsV2Foundation({
    sourceDocumentRef: "SOURCE-UNAVAILABLE-RD-GOLD",
    provenanceStatus: "source_unavailable",
    reason: "Source unavailable.",
  });
  const pricing = buildCanonicalEconomicsV2PricingAnalysis({
    foundation,
    admissionProfile: {
      source: "observational",
      pricingAdmissionId: "unavailable_rd_gold_pricing_v1",
      populationSemanticsProven: false,
      pricingCoverageProven: false,
      underlyingCostRolesProven: false,
      formulaRelationshipsProven: false,
      noActiveProcessingProven: false,
      noActiveProcessingEvidenceRefs: [],
      evidenceRefs: [],
      limitations: ["Source unavailable."],
    },
  });
  return buildCanonicalEconomicsV2EconomicAnalysis({
    pricingAnalysis: pricing,
    admissionProfile: {
      source: "observational",
      admissionId: "source_unavailable_rd_gold_v1",
      feeDetailCoverage: "unavailable",
      statementPeriodApplicabilityProven: false,
      evidenceRefs: [],
      limitations: ["Source unavailable."],
    },
  });
}

async function expectGoldMatches(caseId: string, assertionIds: string[], observation: ReturnType<typeof observeCanonicalEconomicsV2ForGold>) {
  const [contract, tolerances] = await Promise.all([loadGoldContract(), loadToleranceRules()]);
  const goldCase = contract.cases.find((candidate) => candidate.case_id === caseId)!;
  for (const assertionId of assertionIds) {
    const assertion = goldCase.assertions.find((candidate) => candidate.assertion_id === assertionId) as GoldAssertion;
    expect(assertion, assertionId).toBeDefined();
    expect(compareAssertion(assertion, observation, tolerances), assertionId).toBe("match");
  }
}

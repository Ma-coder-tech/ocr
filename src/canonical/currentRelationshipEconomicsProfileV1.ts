import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import {
  buildClaimScopedCountDrivenCostSensitivityAdmissionV1,
  type ClaimScopedCountDrivenCostSensitivityAdmissionV1,
} from "./claimScopedCountDrivenCostSensitivityAdmissionV1.js";
import {
  buildClaimScopedVolumeDrivenCostSensitivityAdmissionV1,
  type ClaimScopedVolumeDrivenCostSensitivityAdmissionV1,
} from "./claimScopedVolumeDrivenCostSensitivityAdmissionV1.js";
import type { CanonicalStatementAnalysis, MoneyAmount } from "./types.js";
import type { CanonicalEconomicsV2EconomicAnalysis, CanonicalEconomicCharge } from "./v2/economicTypes.js";
import type { CanonicalPricingComponent } from "./v2/pricingTypes.js";
import type { CanonicalEconomicsV2Fact } from "./v2/types.js";

export const CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_V1 =
  "single_statement_current_relationship_economics_profile_2026_09_12_v1" as const;

export const CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_PRODUCT_AUTHORITY_V1 = {
  document: "RateReveal Broader Merchant Economics Model FINAL — Product-Adjudicated v1",
  sha256: "4357008f1f32998de5f67f66faa6c732fb6ead45c7880b710438d821733e4cb7",
} as const;

export type CurrentEconomicsFactStateV1 = "KNOWN" | "KNOWN_ABSENT" | "UNKNOWN" | "NOT_APPLICABLE";
export type CurrentEconomicsEvidenceAccessV1 =
  | "STATEMENT_DERIVABLE"
  | "MERCHANT_INPUT"
  | "DOCUMENT_REQUIRED"
  | "PUBLIC_EVIDENCE"
  | "UNRESOLVED";

export type CurrentEconomicsProfileFactV1<T> = {
  state: CurrentEconomicsFactStateV1;
  value: T | null;
  population: string;
  canonicalFactRefs: string[];
  evidenceRefs: string[];
  evidenceAccess: CurrentEconomicsEvidenceAccessV1;
  limitations: string[];
};

export type CurrentEconomicsProductCostConceptV1 =
  | "INTERCHANGE_ISSUER_ECONOMICS"
  | "CARD_NETWORK_ECONOMICS"
  | "PROVIDER_CONTROLLED_PERCENTAGE_ECONOMICS"
  | "PROVIDER_CONTROLLED_PER_ITEM_ECONOMICS"
  | "GATEWAY_ECONOMICS"
  | "FIXED_ACCOUNT_SERVICE_ECONOMICS"
  | "ANCILLARY_SERVICE_ECONOMICS"
  | "EQUIPMENT_POS_SOFTWARE_ECONOMICS"
  | "DISPUTE_CHARGEBACK_ECONOMICS"
  | "TAX_REGULATORY_PASS_THROUGH"
  | "UNRESOLVED_SHARED_BUNDLED_ECONOMICS";

export type CurrentEconomicsSensitivityV1 =
  | "TRANSACTION_COUNT_DRIVEN"
  | "VOLUME_DRIVEN"
  | "FIXED_COST_DRIVEN"
  | "MIXED"
  | "UNRESOLVED";

export type CurrentEconomicsIncidenceStateV1 =
  | "INCIDENCE_EVIDENCED_PRESENT"
  | "INCIDENCE_EVIDENCED_ABSENT"
  | "INCIDENCE_UNRESOLVED";

export type CurrentEconomicsIncidenceAdmissionV1 = {
  state: Exclude<CurrentEconomicsIncidenceStateV1, "INCIDENCE_UNRESOLVED">;
  evidenceAccess: "STATEMENT_DERIVABLE";
  evidenceRefs: string[];
  /** Optional exact statement-established offset. This package does not discover or estimate it. */
  exactOffsetAmount?: MoneyAmount | null;
};

export type CurrentEconomicsChannelAdmissionV1 = {
  value: "card_present" | "card_not_present" | "mixed";
  canonicalFactRef: string;
  evidenceAccess: "STATEMENT_DERIVABLE";
  evidenceRefs: string[];
};

export type CurrentEconomicsAuthorizationSettlementCompatibilityV1 = {
  state: "PROVEN_COMPATIBLE" | "PROVEN_INCOMPATIBLE";
  evidenceAccess: "STATEMENT_DERIVABLE";
  evidenceRefs: string[];
};

export type CurrentEconomicsActivityAdmissionFieldV1 =
  | "processedVolume"
  | "grossSalesVolume"
  | "refundVolume"
  | "transactionCount"
  | "grossSaleTransactionCount"
  | "refundTransactionCount"
  | "authorizationCount"
  | "chargebackCount"
  | "chargebackFee"
  | "averageTicket";

export type CurrentEconomicsActivityAdmissionV1<T extends number | MoneyAmount = number | MoneyAmount> = {
  admissionRef: string;
  field: CurrentEconomicsActivityAdmissionFieldV1;
  population: string;
  value: T;
  evidenceAccess: "STATEMENT_DERIVABLE";
  evidenceRefs: string[];
  sourceLayer: "fiserv_claim_scoped_activity_population_admission_v1";
  sourceDocumentRef: string;
  exactPopulationIdentityProven: true;
  reconciliationState: "DIRECT_SOURCE" | "RECONCILED";
  controlRefs: string[];
  canonicalMutationAllowed: false;
  rdMutationAllowed: false;
  limitations: string[];
};

export type CurrentEconomicsActivityAdmissionsV1 = Partial<{
  processedVolume: CurrentEconomicsActivityAdmissionV1<MoneyAmount>;
  grossSalesVolume: CurrentEconomicsActivityAdmissionV1<MoneyAmount>;
  refundVolume: CurrentEconomicsActivityAdmissionV1<MoneyAmount>;
  transactionCount: CurrentEconomicsActivityAdmissionV1<number>;
  grossSaleTransactionCount: CurrentEconomicsActivityAdmissionV1<number>;
  refundTransactionCount: CurrentEconomicsActivityAdmissionV1<number>;
  authorizationCount: CurrentEconomicsActivityAdmissionV1<number>;
  chargebackCount: CurrentEconomicsActivityAdmissionV1<number>;
  chargebackFee: CurrentEconomicsActivityAdmissionV1<MoneyAmount>;
  averageTicket: CurrentEconomicsActivityAdmissionV1<MoneyAmount>;
}>;

export type CurrentRelationshipEconomicsProfileV1 = {
  profileVersion: typeof CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_V1;
  productAuthority: typeof CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_PRODUCT_AUTHORITY_V1;
  mode: "internal_offline";
  declaredScope: "current_statement_relationship_economics_only";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  activity: {
    processedVolume: CurrentEconomicsProfileFactV1<MoneyAmount>;
    grossSalesVolume: CurrentEconomicsProfileFactV1<MoneyAmount>;
    refundVolume: CurrentEconomicsProfileFactV1<MoneyAmount>;
    transactionCount: CurrentEconomicsProfileFactV1<number>;
    grossSaleTransactionCount: CurrentEconomicsProfileFactV1<number>;
    refundTransactionCount: CurrentEconomicsProfileFactV1<number>;
    authorizationCount: CurrentEconomicsProfileFactV1<number>;
    approvedAuthorizationCount: CurrentEconomicsProfileFactV1<number>;
    settledTransactionCount: CurrentEconomicsProfileFactV1<number>;
    authorizationToSettlement: CurrentEconomicsProfileFactV1<{
      authorizationCount: number;
      settledTransactionCount: number;
      settledPerAuthorization: number;
    }>;
    chargebackCount: CurrentEconomicsProfileFactV1<number>;
    chargebackPrincipal: CurrentEconomicsProfileFactV1<MoneyAmount>;
    chargebackFee: CurrentEconomicsProfileFactV1<MoneyAmount>;
    averageTicket: CurrentEconomicsProfileFactV1<MoneyAmount>;
    channel: CurrentEconomicsProfileFactV1<CurrentEconomicsChannelAdmissionV1["value"]>;
  };
  chargedCostProfile: {
    additiveAuthority: "canonical_rd_economic_charge_ledger";
    rdStatementFeeFactRef: string;
    rdCostStackCompleteness: CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["costStack"]["completeness"];
    rdAuthoritativeStatementFeeTotal: MoneyAmount | null;
    rdTotalStatementProcessingCost: MoneyAmount | null;
    items: Array<{
      rdEconomicChargeRef: string;
      rdSourceOccurrenceRefs: string[];
      commercialFeeRowRef: string | null;
      pricingPopulationRefs: string[];
      pricingComponentRefs: string[];
      amount: MoneyAmount;
      financialDirection: "debit" | "credit";
      productCostConcept: CurrentEconomicsProductCostConceptV1;
      mappingState: "DETERMINISTIC_GOVERNED_MAPPING" | "UNRESOLVED";
      amountEvidenceAccess: "STATEMENT_DERIVABLE";
      classificationEvidenceAccess: "PUBLIC_EVIDENCE" | "UNRESOLVED";
      evidenceRefs: string[];
      limitations: string[];
    }>;
    buckets: Array<{
      concept: CurrentEconomicsProductCostConceptV1;
      debitAmountMinor: number;
      creditAmountMinor: number;
      netAmountMinor: number;
      rdEconomicChargeRefs: string[];
      rdRemainderIncludedMinor: number;
    }>;
    rdUnresolvedRemainderMinor: number;
    rdNonAdditiveRoundingResidual?: CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["costStack"]["roundingResidual"];
    mappedNetAmountMinor: number;
    profileReconciliationDeltaMinor: number | null;
    reconcilesToRdTotal: boolean;
    duplicateChargeContributionCount: number;
    nonFeePrincipalContributionCount: number;
  };
  countDrivenCostSensitivityAdmission: ClaimScopedCountDrivenCostSensitivityAdmissionV1;
  volumeDrivenCostSensitivityAdmission: ClaimScopedVolumeDrivenCostSensitivityAdmissionV1;
  costStructureSensitivity: {
    state: CurrentEconomicsSensitivityV1;
    countDrivenChargeRefs: string[];
    volumeDrivenChargeRefs: string[];
    fixedCostDrivenChargeRefs: string[];
    unresolvedControllableChargeRefs: string[];
    pricingPopulationRefs: string[];
    averageTicketFactRef: string | null;
    averageTicketUsed: boolean;
    additiveDriverContributionMinor: 0;
    method: "reproduced_statement_mechanics_only";
    limitations: string[];
  };
  costIncidence: {
    state: CurrentEconomicsIncidenceStateV1;
    evidenceAccess: CurrentEconomicsEvidenceAccessV1;
    evidenceRefs: string[];
    grossProcessingCost: MoneyAmount | null;
    costOffsetRevenue: CurrentEconomicsProfileFactV1<MoneyAmount>;
    netMerchantBorneProcessingCost: CurrentEconomicsProfileFactV1<MoneyAmount>;
    limitations: string[];
  };
  evidenceRequirements: Array<{
    fact: string;
    access: CurrentEconomicsEvidenceAccessV1;
    reason: string;
  }>;
  completeness: {
    profileState: "OBSERVED_RECONCILED" | "PARTIAL_CURRENT_STATEMENT" | "UNAVAILABLE_CURRENT_STATEMENT";
    observedActivityFields: string[];
    unresolvedActivityFields: string[];
    costMappingState: "ALL_RD_CONTRIBUTING_CHARGES_MAPPED" | "PARTIAL_RD_CHARGE_MAPPING" | "RD_COST_UNAVAILABLE";
    pricingFormulaCoverage: CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["pricingArchitecture"]["formulaCoverageStatus"];
    feeLedgerReconciliation: CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["costStack"]["completeness"];
    completeMerchantEconomicsClaimAllowed: false;
    completeCostOfAcceptanceClaimAllowed: false;
    limitations: string[];
  };
  safety: {
    rdIsSoleAdditiveAuthority: true;
    canonicalMutationAllowed: false;
    commercialSourceConsumptionAllowed: false;
    comparatorInputCount: 0;
    alternativeProviderCount: 0;
    opportunityOutputCount: 0;
    savingsOutputCount: 0;
    annualizationOutputCount: 0;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
    customerRoutingAllowed: false;
    legacyOpportunityFieldReuseAllowed: false;
  };
  limitations: string[];
};

type V2Fact = CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["financialPopulations"][keyof CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["financialPopulations"]];

export function buildCurrentRelationshipEconomicsProfileV1(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  commercialDecomposition: CommercialDecompositionContractV1;
  canonicalAnalysis?: CanonicalStatementAnalysis | null;
  activityAdmissions?: CurrentEconomicsActivityAdmissionsV1 | null;
  channel?: CurrentEconomicsChannelAdmissionV1 | null;
  incidence?: CurrentEconomicsIncidenceAdmissionV1 | null;
  authorizationSettlementCompatibility?: CurrentEconomicsAuthorizationSettlementCompatibilityV1 | null;
}): CurrentRelationshipEconomicsProfileV1 {
  if (input.economic.validation.status !== "valid" || input.economic.economicLayer.validation.status !== "valid") {
    throw new Error("CURRENT_ECONOMICS_REQUIRES_VALID_RD");
  }
  const foundation = input.economic.pricingAnalysis.foundation;
  const facts = foundation.financialPopulations;
  const noActiveProcessing = input.economic.pricingAnalysis.pricingArchitecture.formulaCoverageStatus === "not_applicable_no_active_processing";
  const admissions = input.activityAdmissions ?? {};

  const activity = {
    processedVolume: factValueWithAdmission(facts.canonicalNetSubmittedCardVolume, admissions.processedVolume, false, false, foundation.identity.sourceDocumentRef),
    grossSalesVolume: factValueWithAdmission(facts.grossSaleVolume, admissions.grossSalesVolume, false, false, foundation.identity.sourceDocumentRef),
    refundVolume: factValueWithAdmission(facts.refundVolume, admissions.refundVolume, true, false, foundation.identity.sourceDocumentRef),
    transactionCount: factValueWithAdmission(facts.submittedTransactionCount, admissions.transactionCount, false, noActiveProcessing, foundation.identity.sourceDocumentRef),
    grossSaleTransactionCount: factValueWithAdmission(facts.grossSaleTransactionCount, admissions.grossSaleTransactionCount, false, noActiveProcessing, foundation.identity.sourceDocumentRef),
    refundTransactionCount: factValueWithAdmission(facts.refundTransactionCount, admissions.refundTransactionCount, true, noActiveProcessing, foundation.identity.sourceDocumentRef),
    authorizationCount: factValueWithAdmission(facts.authorizationCount, admissions.authorizationCount, true, noActiveProcessing, foundation.identity.sourceDocumentRef),
    approvedAuthorizationCount: unavailableFact<number>(
      "approved_authorization_count",
      noActiveProcessing ? "NOT_APPLICABLE" : "UNKNOWN",
      noActiveProcessing ? "UNRESOLVED" : "DOCUMENT_REQUIRED",
      "Canonical Economics V2 does not expose approved authorizations as the same fact as authorization events.",
    ),
    settledTransactionCount: factValue(facts.settledTransactionCount, true, noActiveProcessing),
    authorizationToSettlement: authorizationToSettlement(input.economic, input.authorizationSettlementCompatibility ?? null, noActiveProcessing),
    chargebackCount: factValueWithAdmission(facts.chargebackCount, admissions.chargebackCount, true, noActiveProcessing, foundation.identity.sourceDocumentRef),
    chargebackPrincipal: factValue(facts.chargebackPrincipalDebitAmount, true, noActiveProcessing),
    chargebackFee: factValueWithAdmission(facts.chargebackFeeAmount, admissions.chargebackFee, true, noActiveProcessing, foundation.identity.sourceDocumentRef),
    averageTicket: averageTicket(input.economic, admissions.averageTicket, foundation.identity.sourceDocumentRef),
    channel: channelFact(input.channel ?? null, noActiveProcessing),
  } satisfies CurrentRelationshipEconomicsProfileV1["activity"];

  const chargedCostProfile = buildCostProfile(input.economic, input.commercialDecomposition);
  const priorSensitivity = buildSensitivity(input.economic, chargedCostProfile.items, input.commercialDecomposition);
  const countDrivenCostSensitivityAdmission = buildClaimScopedCountDrivenCostSensitivityAdmissionV1({
    economic: input.economic,
    commercialDecomposition: input.commercialDecomposition,
    chargedCostItems: chargedCostProfile.items,
    existingCountDrivenChargeRefs: priorSensitivity.countDrivenChargeRefs,
    canonicalAnalysis: input.canonicalAnalysis,
  });
  const countExtendedSensitivity = extendCountDrivenSensitivity(priorSensitivity, countDrivenCostSensitivityAdmission);
  const volumeDrivenCostSensitivityAdmission = buildClaimScopedVolumeDrivenCostSensitivityAdmissionV1({
    economic: input.economic,
    commercialDecomposition: input.commercialDecomposition,
    chargedCostItems: chargedCostProfile.items,
    existingVolumeDrivenChargeRefs: priorSensitivity.volumeDrivenChargeRefs,
    countDrivenChargeRefs: countExtendedSensitivity.countDrivenChargeRefs,
  });
  const costStructureSensitivity = extendVolumeDrivenSensitivity(countExtendedSensitivity, volumeDrivenCostSensitivityAdmission);
  const costIncidence = buildIncidence(chargedCostProfile.rdTotalStatementProcessingCost, input.incidence ?? null);
  const activityEntries = Object.entries(activity);
  const observedActivityFields = activityEntries.filter(([, fact]) => fact.state === "KNOWN" || fact.state === "KNOWN_ABSENT").map(([key]) => key);
  const unresolvedActivityFields = activityEntries.filter(([, fact]) => fact.state === "UNKNOWN").map(([key]) => key);
  const mappedCount = chargedCostProfile.items.filter((item) => item.mappingState === "DETERMINISTIC_GOVERNED_MAPPING").length;
  const costMappingState = chargedCostProfile.rdTotalStatementProcessingCost === null
    ? "RD_COST_UNAVAILABLE" as const
    : mappedCount === chargedCostProfile.items.length && chargedCostProfile.rdUnresolvedRemainderMinor === 0
      ? "ALL_RD_CONTRIBUTING_CHARGES_MAPPED" as const
      : "PARTIAL_RD_CHARGE_MAPPING" as const;
  const profileState = chargedCostProfile.rdTotalStatementProcessingCost === null
    ? "UNAVAILABLE_CURRENT_STATEMENT" as const
    : costMappingState === "ALL_RD_CONTRIBUTING_CHARGES_MAPPED" && chargedCostProfile.reconcilesToRdTotal
      ? "OBSERVED_RECONCILED" as const
      : "PARTIAL_CURRENT_STATEMENT" as const;

  const profile: CurrentRelationshipEconomicsProfileV1 = {
    profileVersion: CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_V1,
    productAuthority: CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_PRODUCT_AUTHORITY_V1,
    mode: "internal_offline",
    declaredScope: "current_statement_relationship_economics_only",
    sourceDocumentRef: foundation.identity.sourceDocumentRef,
    statementPeriod: foundation.identity.statementPeriod,
    activity,
    chargedCostProfile,
    countDrivenCostSensitivityAdmission,
    volumeDrivenCostSensitivityAdmission,
    costStructureSensitivity,
    costIncidence,
    evidenceRequirements: [
      { fact: "approved authorization count", access: "DOCUMENT_REQUIRED", reason: "Authorization events do not prove approval events." },
      { fact: "component-level channel mix", access: "MERCHANT_INPUT", reason: "Use merchant or gateway evidence when the statement does not establish channel." },
      { fact: "fee economic meaning or participant role", access: "PUBLIC_EVIDENCE", reason: "Governed public evidence may classify a printed charge without changing its statement amount." },
      { fact: "cost incidence or offset", access: "UNRESOLVED", reason: "No absence or offset is inferred from statement silence." },
    ],
    completeness: {
      profileState,
      observedActivityFields,
      unresolvedActivityFields,
      costMappingState,
      pricingFormulaCoverage: input.economic.pricingAnalysis.pricingArchitecture.formulaCoverageStatus,
      feeLedgerReconciliation: input.economic.economicLayer.costStack.completeness,
      completeMerchantEconomicsClaimAllowed: false,
      completeCostOfAcceptanceClaimAllowed: false,
      limitations: unique([
        "Profile completeness applies only to current-statement economics; it is not pricing-formula completeness or complete cost of acceptance.",
        costMappingState !== "ALL_RD_CONTRIBUTING_CHARGES_MAPPED" ? "One or more RD charges lack a deterministic governed Product-view mapping." : null,
        input.economic.economicLayer.costStack.completeness === "financially_unreconciled" ? "RD statement processing cost is financially unreconciled and remains unavailable to this profile." : null,
        unresolvedActivityFields.length > 0 ? "Unresolved activity fields remain visible and are not converted to zero." : null,
      ]),
    },
    safety: {
      rdIsSoleAdditiveAuthority: true,
      canonicalMutationAllowed: false,
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
    },
    limitations: [
      "This profile describes observed current-statement relationship economics only.",
      "It does not establish complete merchant economics, total cost of acceptance, avoidability, savings, overpayment, comparison, or merchant-level advantage.",
      "Commercial decomposition is used only as governed classification evidence over RD charge references; it is not an additive ledger here.",
      "Public commercial-source prices and alternative providers are excluded.",
    ],
  };
  assertCurrentRelationshipEconomicsProfileV1(profile, input.economic);
  return deepFreeze(profile);
}

export function assertCurrentRelationshipEconomicsProfileV1(
  profile: CurrentRelationshipEconomicsProfileV1,
  economic: CanonicalEconomicsV2EconomicAnalysis,
): void {
  const contributing = economic.economicLayer.charges.filter(contributes);
  const ids = profile.chargedCostProfile.items.map((item) => item.rdEconomicChargeRef);
  if (new Set(ids).size !== ids.length) throw new Error("CURRENT_ECONOMICS_DUPLICATE_RD_CHARGE");
  if (ids.some((id) => !contributing.some((charge) => charge.id === id))) throw new Error("CURRENT_ECONOMICS_NONCONTRIBUTING_CHARGE");
  if (profile.chargedCostProfile.duplicateChargeContributionCount !== 0) throw new Error("CURRENT_ECONOMICS_DOUBLE_COUNT");
  if (profile.chargedCostProfile.nonFeePrincipalContributionCount !== 0) throw new Error("CURRENT_ECONOMICS_NONFEE_PRINCIPAL_INCLUDED");
  const bucketRefs = profile.chargedCostProfile.buckets.flatMap((bucket) => bucket.rdEconomicChargeRefs);
  if (new Set(bucketRefs).size !== bucketRefs.length || bucketRefs.length !== ids.length) throw new Error("CURRENT_ECONOMICS_BUCKET_MEMBERSHIP_INVALID");
  if (profile.costStructureSensitivity.additiveDriverContributionMinor !== 0) throw new Error("CURRENT_ECONOMICS_DRIVER_DUPLICATION");
  const sensitivityAdmission = profile.countDrivenCostSensitivityAdmission;
  if (sensitivityAdmission.aggregate.additiveSensitivityAmountMinor !== 0 ||
      sensitivityAdmission.admissions.some((record) => record.additiveContributionMinor !== 0)) {
    throw new Error("CURRENT_ECONOMICS_COUNT_SENSITIVITY_DUPLICATION");
  }
  if (sensitivityAdmission.admissions.some((record) => !ids.includes(record.rdChargeRef) ||
      !profile.costStructureSensitivity.countDrivenChargeRefs.includes(record.rdChargeRef))) {
    throw new Error("CURRENT_ECONOMICS_COUNT_SENSITIVITY_REFERENCE_INVALID");
  }
  const volumeAdmission = profile.volumeDrivenCostSensitivityAdmission;
  if (volumeAdmission.aggregate.additiveSensitivityAmountMinor !== 0 ||
      volumeAdmission.admissions.some((record) => record.additiveContributionMinor !== 0)) {
    throw new Error("CURRENT_ECONOMICS_VOLUME_SENSITIVITY_DUPLICATION");
  }
  if (volumeAdmission.admissions.some((record) => !ids.includes(record.rdChargeRef) ||
      !profile.costStructureSensitivity.volumeDrivenChargeRefs.includes(record.rdChargeRef) ||
      profile.costStructureSensitivity.countDrivenChargeRefs.includes(record.rdChargeRef))) {
    throw new Error("CURRENT_ECONOMICS_VOLUME_SENSITIVITY_REFERENCE_INVALID");
  }
  if (profile.costIncidence.state === "INCIDENCE_UNRESOLVED" && profile.costIncidence.netMerchantBorneProcessingCost.value !== null) {
    throw new Error("CURRENT_ECONOMICS_UNRESOLVED_INCIDENCE_NETTED");
  }
  if (profile.safety.comparatorInputCount !== 0 || profile.safety.alternativeProviderCount !== 0 ||
      profile.safety.opportunityOutputCount !== 0 || profile.safety.savingsOutputCount !== 0 ||
      profile.safety.annualizationOutputCount !== 0 || profile.safety.aiOrWebOperationCount !== 0 ||
      profile.safety.newKnowledgeAdmissionCount !== 0 || profile.safety.customerRoutingAllowed) {
    throw new Error("CURRENT_ECONOMICS_PROHIBITED_OUTPUT");
  }
}

function factValue<T>(fact: V2Fact, zeroMeansAbsent: boolean, notApplicable = false): CurrentEconomicsProfileFactV1<T> {
  if (notApplicable && fact.status !== "available") {
    return unavailableFact<T>(fact.population, "NOT_APPLICABLE", "UNRESOLVED", "No active processing population is proven for this statement period.");
  }
  const authoritative = fact.provenanceStatus === "authoritative" || fact.provenanceStatus === "approved_synthetic";
  if (fact.status !== "available" || fact.value === null || !authoritative) {
    return {
      state: "UNKNOWN",
      value: null,
      population: fact.population,
      canonicalFactRefs: [fact.id],
      evidenceRefs: [...fact.evidenceRefs],
      evidenceAccess: "UNRESOLVED",
      limitations: unique([...fact.limitations, "This fact is not an authoritative statement-derived value for the current profile."]),
    };
  }
  const numeric = typeof fact.value === "number" ? fact.value : (fact.value as MoneyAmount).amountMinor;
  return {
    state: zeroMeansAbsent && numeric === 0 ? "KNOWN_ABSENT" : "KNOWN",
    value: structuredClone(fact.value) as T,
    population: fact.population,
    canonicalFactRefs: [fact.id],
    evidenceRefs: [...fact.evidenceRefs],
    evidenceAccess: "STATEMENT_DERIVABLE",
    limitations: [...fact.limitations],
  };
}

function factValueWithAdmission<T extends number | MoneyAmount>(
  fact: V2Fact,
  admission: CurrentEconomicsActivityAdmissionV1<T> | undefined,
  zeroMeansAbsent: boolean,
  notApplicable: boolean,
  sourceDocumentRef: string,
): CurrentEconomicsProfileFactV1<T> {
  const canonical = factValue<T>(fact, zeroMeansAbsent, notApplicable);
  if (!admission) return canonical;
  assertActivityAdmission(admission, fact.population, sourceDocumentRef);
  const admittedNumeric = numericValue(admission.value);
  const canonicalNumeric = fact.status === "available" && fact.value !== null ? numericValue(fact.value as number | MoneyAmount) : null;
  if (canonicalNumeric !== null && canonicalNumeric !== admittedNumeric) {
    throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_CONFLICT:${admission.field}`);
  }
  if (canonical.state === "KNOWN" || canonical.state === "KNOWN_ABSENT") return canonical;
  if (notApplicable && admittedNumeric !== 0) {
    throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_ACTIVE_VALUE_IN_INACTIVE_PERIOD:${admission.field}`);
  }
  return {
    state: zeroMeansAbsent && admittedNumeric === 0 ? "KNOWN_ABSENT" : "KNOWN",
    value: structuredClone(admission.value) as T,
    population: admission.population,
    canonicalFactRefs: [fact.id],
    evidenceRefs: unique(admission.evidenceRefs),
    evidenceAccess: admission.evidenceAccess,
    limitations: unique([
      ...admission.limitations,
      `Profile-only claim-scoped admission ${admission.admissionRef}; Canonical Economics V2 and RD remain unchanged.`,
    ]),
  };
}

function averageTicket(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  admission: CurrentEconomicsActivityAdmissionV1<MoneyAmount> | undefined,
  sourceDocumentRef: string,
): CurrentEconomicsProfileFactV1<MoneyAmount> {
  const foundation = economic.pricingAnalysis.foundation;
  const metric = foundation.metrics.headlineAverageTicket;
  const numerator = foundation.financialPopulations.grossSaleVolume;
  const denominator = foundation.financialPopulations.grossSaleTransactionCount;
  if (metric.state !== "defined" || !metric.value || numerator.status !== "available" || denominator.status !== "available" ||
      ![numerator.provenanceStatus, denominator.provenanceStatus].every((value) => value === "authoritative" || value === "approved_synthetic")) {
    if (admission) {
      assertActivityAdmission(admission, "gross_sale_volume_per_gross_sale_transaction", sourceDocumentRef);
      return {
        state: "KNOWN",
        value: { ...admission.value },
        population: admission.population,
        canonicalFactRefs: [metric.numeratorFactRef, metric.denominatorFactRef],
        evidenceRefs: unique(admission.evidenceRefs),
        evidenceAccess: admission.evidenceAccess,
        limitations: unique([
          ...admission.limitations,
          `Profile-only claim-scoped admission ${admission.admissionRef}; Canonical Economics V2 and RD remain unchanged.`,
        ]),
      };
    }
    return {
      state: metric.state === "undefined_zero_count" ? "NOT_APPLICABLE" : "UNKNOWN",
      value: null,
      population: "gross_sale_volume_per_gross_sale_transaction",
      canonicalFactRefs: [metric.numeratorFactRef, metric.denominatorFactRef],
      evidenceRefs: unique([...numerator.evidenceRefs, ...denominator.evidenceRefs]),
      evidenceAccess: "UNRESOLVED",
      limitations: unique([...metric.limitations, "Average ticket is withheld unless the canonical gross-sales numerator and gross-sale-count denominator are both authoritative and compatible."]),
    };
  }
  return {
    state: "KNOWN",
    value: { ...metric.value },
    population: "gross_sale_volume_per_gross_sale_transaction",
    canonicalFactRefs: [metric.numeratorFactRef, metric.denominatorFactRef],
    evidenceRefs: unique([...numerator.evidenceRefs, ...denominator.evidenceRefs]),
    evidenceAccess: "STATEMENT_DERIVABLE",
    limitations: [...metric.limitations],
  };
}

function assertActivityAdmission(
  admission: CurrentEconomicsActivityAdmissionV1,
  population: string,
  sourceDocumentRef: string,
): void {
  const expectedField = ACTIVITY_FIELD_BY_POPULATION[population];
  if (admission.sourceDocumentRef !== sourceDocumentRef) throw new Error("CURRENT_ECONOMICS_ACTIVITY_ADMISSION_SOURCE_MISMATCH");
  if (!expectedField || admission.field !== expectedField) throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_FIELD_MISMATCH:${admission.field}`);
  if (admission.population !== population) throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_POPULATION_MISMATCH:${admission.field}`);
  if (!admission.admissionRef || admission.evidenceRefs.length === 0 || admission.controlRefs.length === 0) {
    throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_EVIDENCE_REQUIRED:${admission.field}`);
  }
  if (admission.sourceLayer !== "fiserv_claim_scoped_activity_population_admission_v1"
      || !["DIRECT_SOURCE", "RECONCILED"].includes(admission.reconciliationState)) {
    throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_AUTHORITY_INVALID:${admission.field}`);
  }
  if (!admission.exactPopulationIdentityProven || admission.canonicalMutationAllowed || admission.rdMutationAllowed) {
    throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_AUTHORITY_INVALID:${admission.field}`);
  }
  const value = numericValue(admission.value);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`CURRENT_ECONOMICS_ACTIVITY_ADMISSION_VALUE_INVALID:${admission.field}`);
}

const ACTIVITY_FIELD_BY_POPULATION: Record<string, CurrentEconomicsActivityAdmissionFieldV1> = {
  canonical_net_submitted_card_volume: "processedVolume",
  gross_sale_volume: "grossSalesVolume",
  refund_volume: "refundVolume",
  submitted_transaction_count: "transactionCount",
  gross_sale_transaction_count: "grossSaleTransactionCount",
  refund_transaction_count: "refundTransactionCount",
  authorization_count: "authorizationCount",
  chargeback_count: "chargebackCount",
  chargeback_fee_amount: "chargebackFee",
  gross_sale_volume_per_gross_sale_transaction: "averageTicket",
};

function numericValue(value: number | MoneyAmount): number {
  return typeof value === "number" ? value : value.amountMinor;
}

function authorizationToSettlement(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  compatibility: CurrentEconomicsAuthorizationSettlementCompatibilityV1 | null,
  notApplicable: boolean,
): CurrentEconomicsProfileFactV1<{ authorizationCount: number; settledTransactionCount: number; settledPerAuthorization: number }> {
  const facts = economic.pricingAnalysis.foundation.financialPopulations;
  if (notApplicable) return unavailableFact("authorization_to_settlement", "NOT_APPLICABLE", "UNRESOLVED", "No active processing population is proven.");
  if (!compatibility || compatibility.state !== "PROVEN_COMPATIBLE" || compatibility.evidenceRefs.length === 0) {
    return unavailableFact(
      "authorization_to_settlement",
      "UNKNOWN",
      compatibility?.state === "PROVEN_INCOMPATIBLE" ? "STATEMENT_DERIVABLE" : "DOCUMENT_REQUIRED",
      compatibility?.state === "PROVEN_INCOMPATIBLE"
        ? "Authorization and settlement populations are affirmatively incompatible."
        : "Authorization-to-settlement requires independently proven compatible event populations.",
      compatibility?.evidenceRefs ?? [],
      [facts.authorizationCount.id, facts.settledTransactionCount.id],
    );
  }
  const auth = factValue<number>(facts.authorizationCount, true);
  const settled = factValue<number>(facts.settledTransactionCount, true);
  if (auth.value === null || settled.value === null || auth.value <= 0) {
    return unavailableFact("authorization_to_settlement", "UNKNOWN", "STATEMENT_DERIVABLE", "Compatible populations were asserted, but the required authoritative counts are unavailable or the denominator is zero.", compatibility.evidenceRefs, [facts.authorizationCount.id, facts.settledTransactionCount.id]);
  }
  return {
    state: "KNOWN",
    value: { authorizationCount: auth.value, settledTransactionCount: settled.value, settledPerAuthorization: round(settled.value / auth.value, 6) },
    population: "proven_compatible_authorization_and_settlement_events",
    canonicalFactRefs: [facts.authorizationCount.id, facts.settledTransactionCount.id],
    evidenceRefs: unique([...auth.evidenceRefs, ...settled.evidenceRefs, ...compatibility.evidenceRefs]),
    evidenceAccess: "STATEMENT_DERIVABLE",
    limitations: ["This is a descriptive current-period relationship, not a causal authorization-efficiency finding."],
  };
}

function channelFact(admission: CurrentEconomicsChannelAdmissionV1 | null, notApplicable: boolean): CurrentEconomicsProfileFactV1<CurrentEconomicsChannelAdmissionV1["value"]> {
  if (notApplicable) return unavailableFact("processing_channel", "NOT_APPLICABLE", "UNRESOLVED", "No active processing population is proven.");
  if (!admission || !admission.canonicalFactRef || admission.evidenceRefs.length === 0) {
    return unavailableFact("processing_channel", "UNKNOWN", "MERCHANT_INPUT", "This statement does not independently establish a current component-level processing channel.");
  }
  return {
    state: "KNOWN",
    value: admission.value,
    population: "current_statement_processing_activity",
    canonicalFactRefs: [admission.canonicalFactRef],
    evidenceRefs: unique(admission.evidenceRefs),
    evidenceAccess: "STATEMENT_DERIVABLE",
    limitations: ["Channel applies only to the statement-derived scope identified by the cited fact."],
  };
}

function buildCostProfile(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  decomposition: CommercialDecompositionContractV1,
): CurrentRelationshipEconomicsProfileV1["chargedCostProfile"] {
  const foundation = economic.pricingAnalysis.foundation;
  const occurrences = new Map(foundation.sourceModel.occurrences.map((item) => [item.id, item]));
  const components = economic.pricingAnalysis.pricingArchitecture.observedPricingComponents;
  const availableRows = decomposition.rows.filter((row) => row.contributesToCanonicalTotal && row.billedAmountMinor > 0);
  const consumedRows = new Set<string>();
  const contributing = economic.economicLayer.charges.filter(contributes);
  const items = contributing.map((charge) => {
    const occurrenceRefs = charge.sourceOccurrenceRefs;
    const occurrence = occurrenceRefs.map((ref) => occurrences.get(ref)).find(Boolean) ?? null;
    const matchingComponents = componentsForOccurrence(components, occurrenceRefs);
    const row = matchCommercialRow(availableRows, consumedRows, occurrence?.sourceLabel ?? null, charge.observedAmount?.amountMinor ?? null);
    if (row) consumedRows.add(row.feeRowId);
    const concept = productConcept(row, charge, matchingComponents);
    const mapped = concept !== "UNRESOLVED_SHARED_BUNDLED_ECONOMICS" || Boolean(row && row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED");
    return {
      rdEconomicChargeRef: charge.id,
      rdSourceOccurrenceRefs: [...charge.sourceOccurrenceRefs],
      commercialFeeRowRef: row?.feeRowId ?? null,
      pricingPopulationRefs: unique([...charge.pricingPopulationRefs, ...matchingComponents.map((component) => component.populationRef)]),
      pricingComponentRefs: unique([...charge.pricingComponentRefs, ...matchingComponents.map((component) => component.id)]),
      amount: { ...charge.observedAmount! },
      financialDirection: charge.financialDirection as "debit" | "credit",
      productCostConcept: concept,
      mappingState: mapped && row ? "DETERMINISTIC_GOVERNED_MAPPING" as const : "UNRESOLVED" as const,
      amountEvidenceAccess: "STATEMENT_DERIVABLE" as const,
      classificationEvidenceAccess: mapped && row ? "PUBLIC_EVIDENCE" as const : "UNRESOLVED" as const,
      evidenceRefs: unique([...charge.evidenceRefs, ...(row?.evidenceRefs ?? [])]),
      limitations: unique([
        ...charge.limitations,
        ...(row?.limitations ?? []),
        row ? null : "No unique label-and-amount bridge linked this RD charge to the governed commercial decomposition row.",
        mapped ? null : "The Product-view category remains unresolved; the RD amount and charge identity are unchanged.",
      ]),
    };
  });
  const buckets = emptyBuckets();
  for (const item of items) {
    const bucket = buckets.find((candidate) => candidate.concept === item.productCostConcept)!;
    if (item.financialDirection === "debit") bucket.debitAmountMinor += item.amount.amountMinor;
    else bucket.creditAmountMinor += item.amount.amountMinor;
    bucket.netAmountMinor = bucket.debitAmountMinor - bucket.creditAmountMinor;
    bucket.rdEconomicChargeRefs.push(item.rdEconomicChargeRef);
  }
  const rdRemainder = economic.economicLayer.costStack.unresolvedRemainder?.amountMinor ?? 0;
  if (rdRemainder !== 0) {
    const unresolved = buckets.find((bucket) => bucket.concept === "UNRESOLVED_SHARED_BUNDLED_ECONOMICS")!;
    unresolved.netAmountMinor += rdRemainder;
    if (rdRemainder > 0) unresolved.debitAmountMinor += rdRemainder;
    else unresolved.creditAmountMinor += Math.abs(rdRemainder);
    unresolved.rdRemainderIncludedMinor = rdRemainder;
  }
  const mappedNetAmountMinor = sum(buckets.map((bucket) => bucket.netAmountMinor));
  const rdTotal = economic.economicLayer.costStack.totalStatementProcessingCost;
  const delta = rdTotal ? rdTotal.amountMinor - mappedNetAmountMinor : null;
  const itemIds = items.map((item) => item.rdEconomicChargeRef);
  const duplicateChargeContributionCount = itemIds.length - new Set(itemIds).size;
  const excludedPrincipalOccurrenceRefs = new Set(economic.economicLayer.nonFeeExclusions
    .filter((item) => item.reason === "sales_refund" || item.reason === "chargeback_principal")
    .map((item) => item.occurrenceRef));
  const nonFeePrincipalContributionCount = items.filter((item) => item.rdSourceOccurrenceRefs
    .some((ref) => excludedPrincipalOccurrenceRefs.has(ref))).length;
  return {
    additiveAuthority: "canonical_rd_economic_charge_ledger",
    rdStatementFeeFactRef: economic.economicLayer.costStack.statementFeeFactRef,
    rdCostStackCompleteness: economic.economicLayer.costStack.completeness,
    rdAuthoritativeStatementFeeTotal: cloneMoney(economic.economicLayer.costStack.authoritativeStatementFeeTotal),
    rdTotalStatementProcessingCost: cloneMoney(rdTotal),
    items,
    buckets,
    rdUnresolvedRemainderMinor: rdRemainder,
    mappedNetAmountMinor,
    profileReconciliationDeltaMinor: delta,
    ...(economic.economicLayer.costStack.roundingResidual ? { rdNonAdditiveRoundingResidual: {
      ...economic.economicLayer.costStack.roundingResidual,
      evidenceRefs: [...economic.economicLayer.costStack.roundingResidual.evidenceRefs],
    } } : {}),
    reconcilesToRdTotal: rdTotal !== null && (delta === 0 ||
      Boolean(economic.economicLayer.costStack.roundingResidual &&
        delta === economic.economicLayer.costStack.roundingResidual.signedResidualMinor)),
    duplicateChargeContributionCount,
    nonFeePrincipalContributionCount,
  };
}

function buildSensitivity(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  items: CurrentRelationshipEconomicsProfileV1["chargedCostProfile"]["items"],
  decomposition: CommercialDecompositionContractV1,
): CurrentRelationshipEconomicsProfileV1["costStructureSensitivity"] {
  const rows = new Map(decomposition.rows.map((row) => [row.feeRowId, row]));
  const components = new Map(economic.pricingAnalysis.pricingArchitecture.observedPricingComponents.map((component) => [component.id, component]));
  const count: string[] = [];
  const volume: string[] = [];
  const fixed: string[] = [];
  const unresolved: string[] = [];
  const populationRefs: string[] = [];
  for (const item of items) {
    const row = item.commercialFeeRowRef ? rows.get(item.commercialFeeRowRef) ?? null : null;
    if (!row?.claimPermissions.exactProviderControlledDollarsAllowed) continue;
    populationRefs.push(...item.pricingPopulationRefs);
    const mechanics = item.pricingComponentRefs.map((ref) => components.get(ref)).filter((value): value is CanonicalPricingComponent => Boolean(value));
    const kinds = new Set(mechanics.filter(reproducedComponent).map((component) => component.basisType));
    const rowMechanic = `${row.mechanicAndPopulation.mechanic ?? ""} ${row.recurrence.cadence ?? ""}`.toLowerCase();
    const arithmeticReproduces = row.printedArithmetic.status === "reproduces";
    if (arithmeticReproduces && (kinds.has("transaction_count") || /per.item|authorization|transaction|batch|request/.test(rowMechanic))) count.push(item.rdEconomicChargeRef);
    else if (arithmeticReproduces && (kinds.has("volume") || /rate.times.volume|ad valorem|percentage/.test(rowMechanic))) volume.push(item.rdEconomicChargeRef);
    else if (row.recurrence.state === "EXPLICIT_CADENCE_SUPPORTED" && /fixed|periodic|monthly|annual/.test(rowMechanic)) fixed.push(item.rdEconomicChargeRef);
    else unresolved.push(item.rdEconomicChargeRef);
  }
  const resolvedClasses = [count.length > 0, volume.length > 0, fixed.length > 0].filter(Boolean).length;
  const state = resolvedClasses === 0 ? "UNRESOLVED" as const
    : resolvedClasses > 1 ? "MIXED" as const
      : count.length > 0 ? "TRANSACTION_COUNT_DRIVEN" as const
        : volume.length > 0 ? "VOLUME_DRIVEN" as const
          : "FIXED_COST_DRIVEN" as const;
  const average = economic.pricingAnalysis.foundation.metrics.headlineAverageTicket;
  return {
    state,
    countDrivenChargeRefs: unique(count),
    volumeDrivenChargeRefs: unique(volume),
    fixedCostDrivenChargeRefs: unique(fixed),
    unresolvedControllableChargeRefs: unique(unresolved),
    pricingPopulationRefs: unique(populationRefs),
    averageTicketFactRef: average.state === "defined" ? average.id : null,
    averageTicketUsed: false,
    additiveDriverContributionMinor: 0,
    method: "reproduced_statement_mechanics_only",
    limitations: unique([
      "Sensitivity describes reproduced mechanics of exact provider-controlled current charges; it is not a market or savings judgment.",
      "Average ticket is preserved as context but is not used to manufacture a mechanic or primary-driver threshold.",
      unresolved.length > 0 ? "Some exact provider-controlled charges lack a reproduced count, volume, or fixed-period mechanic." : null,
      state === "UNRESOLVED" ? "No exact provider-controlled reproduced mechanic supports a sensitivity conclusion." : null,
    ]),
  };
}

function extendCountDrivenSensitivity(
  prior: CurrentRelationshipEconomicsProfileV1["costStructureSensitivity"],
  admission: ClaimScopedCountDrivenCostSensitivityAdmissionV1,
): CurrentRelationshipEconomicsProfileV1["costStructureSensitivity"] {
  const admittedRefs = admission.admissions.map((record) => record.rdChargeRef);
  const countDrivenChargeRefs = unique([...prior.countDrivenChargeRefs, ...admittedRefs]);
  const admitted = new Set(admittedRefs);
  const unresolvedControllableChargeRefs = prior.unresolvedControllableChargeRefs.filter((ref) => !admitted.has(ref));
  const resolvedClasses = [countDrivenChargeRefs.length > 0, prior.volumeDrivenChargeRefs.length > 0, prior.fixedCostDrivenChargeRefs.length > 0]
    .filter(Boolean).length;
  const state = resolvedClasses === 0 ? "UNRESOLVED" as const
    : resolvedClasses > 1 ? "MIXED" as const
      : countDrivenChargeRefs.length > 0 ? "TRANSACTION_COUNT_DRIVEN" as const
        : prior.volumeDrivenChargeRefs.length > 0 ? "VOLUME_DRIVEN" as const
          : "FIXED_COST_DRIVEN" as const;
  return {
    ...prior,
    state,
    countDrivenChargeRefs,
    unresolvedControllableChargeRefs,
    pricingPopulationRefs: unique([
      ...prior.pricingPopulationRefs,
      ...admission.admissions.flatMap((record) => record.pricingPopulationRefs),
    ]),
    limitations: unique([
      ...prior.limitations.filter((limitation) => limitation !== "No exact provider-controlled reproduced mechanic supports a sensitivity conclusion."),
      admission.aggregate.newlyAdmittedChargeCount > 0
        ? "Claim-scoped count admissions extend sensitivity only where exact governed population, count, rate, arithmetic, control, and uniqueness predicates pass."
        : null,
      state === "UNRESOLVED" ? "No exact provider-controlled reproduced mechanic supports a sensitivity conclusion." : null,
    ]),
  };
}

function extendVolumeDrivenSensitivity(
  prior: CurrentRelationshipEconomicsProfileV1["costStructureSensitivity"],
  admission: ClaimScopedVolumeDrivenCostSensitivityAdmissionV1,
): CurrentRelationshipEconomicsProfileV1["costStructureSensitivity"] {
  const admittedRefs = admission.admissions.map((record) => record.rdChargeRef);
  const volumeDrivenChargeRefs = unique([...prior.volumeDrivenChargeRefs, ...admittedRefs]);
  const admitted = new Set(admittedRefs);
  const unresolvedControllableChargeRefs = prior.unresolvedControllableChargeRefs.filter((ref) => !admitted.has(ref));
  const resolvedClasses = [prior.countDrivenChargeRefs.length > 0, volumeDrivenChargeRefs.length > 0, prior.fixedCostDrivenChargeRefs.length > 0]
    .filter(Boolean).length;
  const state = resolvedClasses === 0 ? "UNRESOLVED" as const
    : resolvedClasses > 1 ? "MIXED" as const
      : prior.countDrivenChargeRefs.length > 0 ? "TRANSACTION_COUNT_DRIVEN" as const
        : volumeDrivenChargeRefs.length > 0 ? "VOLUME_DRIVEN" as const
          : "FIXED_COST_DRIVEN" as const;
  return {
    ...prior,
    state,
    volumeDrivenChargeRefs,
    unresolvedControllableChargeRefs,
    pricingPopulationRefs: unique([
      ...prior.pricingPopulationRefs,
      ...admission.admissions.flatMap((record) => record.pricingPopulationRefs),
    ]),
    limitations: unique([
      ...prior.limitations.filter((limitation) => limitation !== "No exact provider-controlled reproduced mechanic supports a sensitivity conclusion."),
      admission.aggregate.newlyAdmittedChargeCount > 0
        ? "Claim-scoped volume admissions extend sensitivity only where exact governed base, rate, arithmetic, control, economic classification, and uniqueness predicates pass."
        : null,
      state === "UNRESOLVED" ? "No exact provider-controlled reproduced mechanic supports a sensitivity conclusion." : null,
    ]),
  };
}

function buildIncidence(
  grossCost: MoneyAmount | null,
  admission: CurrentEconomicsIncidenceAdmissionV1 | null,
): CurrentRelationshipEconomicsProfileV1["costIncidence"] {
  if (!admission || admission.evidenceRefs.length === 0) {
    return {
      state: "INCIDENCE_UNRESOLVED",
      evidenceAccess: "UNRESOLVED",
      evidenceRefs: [],
      grossProcessingCost: cloneMoney(grossCost),
      costOffsetRevenue: unavailableFact("cost_offset_revenue", "UNKNOWN", "UNRESOLVED", "Statement silence does not establish the presence or absence of a cost-offset program."),
      netMerchantBorneProcessingCost: unavailableFact("net_merchant_borne_processing_cost", "UNKNOWN", "UNRESOLVED", "Gross processing cost cannot be equated with net merchant burden while incidence is unresolved."),
      limitations: ["No surcharge, cash-discount, dual-pricing, or other incidence conclusion is inferred."],
    };
  }
  if (admission.state === "INCIDENCE_EVIDENCED_ABSENT") {
    const zero = { amountMinor: 0, currency: "USD" as const };
    return {
      state: admission.state,
      evidenceAccess: admission.evidenceAccess,
      evidenceRefs: unique(admission.evidenceRefs),
      grossProcessingCost: cloneMoney(grossCost),
      costOffsetRevenue: knownFact("cost_offset_revenue", zero, "KNOWN_ABSENT", admission.evidenceRefs),
      netMerchantBorneProcessingCost: grossCost
        ? knownFact("net_merchant_borne_processing_cost", grossCost, "KNOWN", admission.evidenceRefs)
        : unavailableFact("net_merchant_borne_processing_cost", "UNKNOWN", "STATEMENT_DERIVABLE", "Incidence absence is evidenced, but RD gross processing cost is unavailable."),
      limitations: ["The zero offset is supported only by explicit statement evidence of absence; it is not inferred from silence."],
    };
  }
  const offset = admission.exactOffsetAmount ?? null;
  const canNet = Boolean(grossCost && offset && grossCost.currency === offset.currency);
  return {
    state: admission.state,
    evidenceAccess: admission.evidenceAccess,
    evidenceRefs: unique(admission.evidenceRefs),
    grossProcessingCost: cloneMoney(grossCost),
    costOffsetRevenue: offset
      ? knownFact("cost_offset_revenue", offset, offset.amountMinor === 0 ? "KNOWN_ABSENT" : "KNOWN", admission.evidenceRefs)
      : unavailableFact("cost_offset_revenue", "UNKNOWN", "STATEMENT_DERIVABLE", "Incidence is present, but an exact applicable statement offset is not established.", admission.evidenceRefs),
    netMerchantBorneProcessingCost: canNet
      ? knownFact("net_merchant_borne_processing_cost", { amountMinor: grossCost!.amountMinor - offset!.amountMinor, currency: grossCost!.currency }, "KNOWN", admission.evidenceRefs)
      : unavailableFact("net_merchant_borne_processing_cost", "UNKNOWN", "STATEMENT_DERIVABLE", "Net burden is withheld without both reconciled RD gross cost and exact applicable statement offset.", admission.evidenceRefs),
    limitations: ["This package consumes only explicit incidence evidence; it does not detect, recommend, or evaluate an incidence program."],
  };
}

function productConcept(
  row: CommercialDecompositionRowV1 | null,
  charge: CanonicalEconomicCharge,
  components: CanonicalPricingComponent[],
): CurrentEconomicsProductCostConceptV1 {
  if (charge.subtype === "chargeback_fee") return "DISPUTE_CHARGEBACK_ECONOMICS";
  if (!row) return "UNRESOLVED_SHARED_BUNDLED_ECONOMICS";
  const layer = row.economicLayer.value;
  const identity = `${row.identity.exactValue ?? ""} ${row.identity.familyValue ?? ""} ${row.mechanicAndPopulation.mechanic ?? ""}`.toLowerCase();
  if (layer === "issuer_interchange") return "INTERCHANGE_ISSUER_ECONOMICS";
  if (/chargeback|dispute|retrieval/.test(identity)) return "DISPUTE_CHARGEBACK_ECONOMICS";
  if (layer === "card_network" && row.commercialDollarCategory !== "SHARED_BUNDLED_OR_UNRESOLVED") return "CARD_NETWORK_ECONOMICS";
  if (layer === "government_or_nonprocessing_pass_through" && row.commercialDollarCategory === "GOVERNMENT_NONPROCESSING_OR_OTHER") return "TAX_REGULATORY_PASS_THROUGH";
  if (row.commercialDollarCategory === "PROVIDER_CONTROLLED_VARIABLE" && row.claimPermissions.exactProviderControlledDollarsAllowed) {
    if (/gateway|cpu/.test(identity)) return "GATEWAY_ECONOMICS";
    const basis = new Set(components.map((component) => component.basisType));
    if (basis.has("volume") || /rate.times.volume|ad valorem|percentage/.test(identity)) return "PROVIDER_CONTROLLED_PERCENTAGE_ECONOMICS";
    if (basis.has("transaction_count") || /per.item|authorization|transaction|batch|request/.test(identity)) return "PROVIDER_CONTROLLED_PER_ITEM_ECONOMICS";
    return "UNRESOLVED_SHARED_BUNDLED_ECONOMICS";
  }
  if (row.commercialDollarCategory === "PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY") {
    if (/gateway|cpu/.test(identity)) return "GATEWAY_ECONOMICS";
    if (layer === "equipment_or_physical" || /equipment|terminal|lease|pos software/.test(identity)) return "EQUIPMENT_POS_SOFTWARE_ECONOMICS";
    if (["technology_or_service", "security_compliance_or_risk"].includes(layer ?? "")) return "ANCILLARY_SERVICE_ECONOMICS";
    if (row.recurrence.state === "EXPLICIT_CADENCE_SUPPORTED" || /fixed|periodic|monthly|annual/.test(identity)) return "FIXED_ACCOUNT_SERVICE_ECONOMICS";
  }
  return "UNRESOLVED_SHARED_BUNDLED_ECONOMICS";
}

function matchCommercialRow(
  rows: CommercialDecompositionRowV1[],
  consumed: Set<string>,
  sourceLabel: string | null,
  amountMinor: number | null,
): CommercialDecompositionRowV1 | null {
  if (!sourceLabel || amountMinor === null) return null;
  const labelKey = semanticLabelKey(sourceLabel);
  const candidates = rows.filter((row) => !consumed.has(row.feeRowId) && row.billedAmountMinor === amountMinor);
  const exact = candidates.filter((row) => semanticLabelKey(row.printedLabel) === labelKey);
  if (exact.length === 1) return exact[0]!;
  const contained = candidates.filter((row) => {
    const candidate = semanticLabelKey(row.printedLabel);
    return candidate.length >= 4 && (candidate.includes(labelKey) || labelKey.includes(candidate));
  });
  return contained.length === 1 ? contained[0]! : null;
}

function semanticLabelKey(value: string): string {
  return value.toUpperCase()
    .replace(/^(?:MASTERCARD|VISA|DISCOVER|AMERICAN EXPRESS|AMEX ACQ|OTHER)\s*-\s*/, "")
    .replace(/\[REDACTED-ID\]/g, " ")
    .replace(/\b\d+(?:[.,]\d+)*\b/g, " ")
    .replace(/[^A-Z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function componentsForOccurrence(components: CanonicalPricingComponent[], occurrenceRefs: string[]): CanonicalPricingComponent[] {
  const refs = new Set(occurrenceRefs);
  return components.filter((component) => component.occurrenceRefs.some((ref) => refs.has(ref)));
}

function reproducedComponent(component: CanonicalPricingComponent): boolean {
  if (component.derivabilityTier !== "deterministically_derivable_from_statement") return false;
  if (component.basisType === "volume") return component.appliedBaseAmount !== null && component.rate !== null && component.observedAmount !== null;
  if (component.basisType === "transaction_count") return component.appliedCount !== null && component.perItemAmount !== null && component.observedAmount !== null;
  if (component.basisType === "fixed_period") return component.fixedAmount !== null && component.observedAmount !== null;
  return false;
}

function contributes(charge: CanonicalEconomicCharge): boolean {
  return (charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved") &&
    charge.observedAmount !== null && (charge.financialDirection === "debit" || charge.financialDirection === "credit");
}

function emptyBuckets(): CurrentRelationshipEconomicsProfileV1["chargedCostProfile"]["buckets"] {
  const concepts: CurrentEconomicsProductCostConceptV1[] = [
    "INTERCHANGE_ISSUER_ECONOMICS", "CARD_NETWORK_ECONOMICS", "PROVIDER_CONTROLLED_PERCENTAGE_ECONOMICS",
    "PROVIDER_CONTROLLED_PER_ITEM_ECONOMICS", "GATEWAY_ECONOMICS", "FIXED_ACCOUNT_SERVICE_ECONOMICS",
    "ANCILLARY_SERVICE_ECONOMICS", "EQUIPMENT_POS_SOFTWARE_ECONOMICS", "DISPUTE_CHARGEBACK_ECONOMICS",
    "TAX_REGULATORY_PASS_THROUGH", "UNRESOLVED_SHARED_BUNDLED_ECONOMICS",
  ];
  return concepts.map((concept) => ({
    concept, debitAmountMinor: 0, creditAmountMinor: 0, netAmountMinor: 0, rdEconomicChargeRefs: [], rdRemainderIncludedMinor: 0,
  }));
}

function unavailableFact<T>(
  population: string,
  state: "UNKNOWN" | "NOT_APPLICABLE",
  evidenceAccess: CurrentEconomicsEvidenceAccessV1,
  limitation: string,
  evidenceRefs: string[] = [],
  canonicalFactRefs: string[] = [],
): CurrentEconomicsProfileFactV1<T> {
  return { state, value: null, population, canonicalFactRefs: unique(canonicalFactRefs), evidenceRefs: unique(evidenceRefs), evidenceAccess, limitations: [limitation] };
}

function knownFact<T>(population: string, value: T, state: "KNOWN" | "KNOWN_ABSENT", evidenceRefs: string[]): CurrentEconomicsProfileFactV1<T> {
  return { state, value: structuredClone(value), population, canonicalFactRefs: [], evidenceRefs: unique(evidenceRefs), evidenceAccess: "STATEMENT_DERIVABLE", limitations: [] };
}

function cloneMoney(value: MoneyAmount | null): MoneyAmount | null {
  return value ? { ...value } : null;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function unique<T>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== null && value !== undefined))];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

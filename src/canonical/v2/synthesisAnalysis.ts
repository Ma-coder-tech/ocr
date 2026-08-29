import type { MoneyAmount } from "../types.js";
import type { CanonicalEconomicCostBucketKind, CanonicalEconomicResolutionState, CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import type { CanonicalPricingAssertionBasis, CanonicalPricingConfidence, CanonicalPricingDerivabilityTier } from "./pricingTypes.js";
import type {
  CanonicalAccountRiskStatus,
  CanonicalAccountServiceEconomics,
  CanonicalAmexEconomics,
  CanonicalDriverAttributionMethod,
  CanonicalDriverPopulationPredicateCode,
  CanonicalDriverRelationship,
  CanonicalDriverRelationshipType,
  CanonicalEconomicCounterfactual,
  CanonicalEconomicDriver,
  CanonicalEconomicDriverStatus,
  CanonicalEconomicDriverType,
  CanonicalEconomicTheme,
  CanonicalEconomicThemeType,
  CanonicalEconomicsV2SynthesisAnalysis,
  CanonicalMerchantLever,
  CanonicalMerchantLeverState,
  CanonicalMerchantLeverType,
  CanonicalMerchantPricingProgram,
  CanonicalOffStatementExposure,
  CanonicalOperationalSignal,
  CanonicalPopulationCompatibility,
  CanonicalRefundEconomics,
  CanonicalStatementNotice,
  CanonicalSynthesisDependency,
  CanonicalSynthesisDependencyKind,
  CanonicalSynthesisDependencyStatus,
  CanonicalSynthesisEvidenceClass,
  CanonicalSynthesisCalculation,
  CanonicalSynthesisCalculationKind,
  CanonicalSynthesisClaimKind,
  CanonicalSynthesisProof,
  CanonicalSynthesisSemanticClaim,
  CanonicalSynthesisSemanticAmendmentId,
} from "./synthesisTypes.js";
import {
  buildSynthesisSemanticRegistry,
  type CanonicalSynthesisCalculationAdmission,
  type CanonicalSynthesisSemanticClaimAdmission,
} from "./synthesisSemantics.js";
import {
  CANONICAL_ECONOMICS_V2_SYNTHESIS_VERSION_MANIFEST,
  RE_SEMANTIC_AMENDMENT_REASONS,
} from "./synthesisVersionManifest.js";
import { validateCanonicalEconomicsV2SynthesisAnalysis } from "./synthesisValidate.js";
import { compileCanonicalSynthesisContractV1 } from "./synthesisContractV1.js";
import { validateCanonicalSynthesisContractV1Envelope } from "./synthesisContractV1Admission.js";

export type CanonicalSynthesisProofAdmission = {
  derivabilityTier: CanonicalPricingDerivabilityTier;
  evidenceClass: CanonicalSynthesisEvidenceClass;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence?: CanonicalPricingConfidence;
  evidenceRefs?: string[];
  dependencyKeys?: string[];
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  limitations?: string[];
};

export type CanonicalSynthesisDependencyAdmission = {
  key: string;
  kind: CanonicalSynthesisDependencyKind;
  status?: CanonicalSynthesisDependencyStatus;
  evidenceRefs?: string[];
  limitations?: string[];
};

export type CanonicalEconomicDriverAdmission = {
  key: string;
  driverType: CanonicalEconomicDriverType;
  status?: CanonicalEconomicDriverStatus;
  populationRefs: string[];
  populationPredicateCode: CanonicalDriverPopulationPredicateCode;
  sourceOccurrenceRefs?: string[];
  economicChargeRefs?: string[];
  pricingComponentRefs?: string[];
  observedVolume?: MoneyAmount | null;
  observedCount?: number | null;
  observedCost?: MoneyAmount | null;
  attributionMethod: CanonicalDriverAttributionMethod;
  relevantCostPoolRef?: CanonicalEconomicCostBucketKind | null;
  shareOfPopulation?: string | null;
  shareOfRelevantCostPool?: string | null;
  comparisonPopulationRef?: string | null;
  relationshipKeys?: string[];
  counterfactualKey?: string | null;
  populationClaimKey?: string | null;
  costPoolClaimKey?: string | null;
  shareClaimKey?: string | null;
  shareCalculationKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalDriverRelationshipAdmission = {
  key: string;
  relationshipType: CanonicalDriverRelationshipType;
  driverKeys: string[];
  allocationCalculationRef?: string | null;
  additiveAggregationAllowed?: boolean;
  relationshipClaimKey?: string | null;
  allocationCalculationKey?: string | null;
  reciprocalRelationshipKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalEconomicCounterfactualAdmission = {
  key: string;
  observedPopulationRefs: string[];
  observedChargeRefs?: string[];
  observedCost?: MoneyAmount | null;
  alternativePopulationRefs: string[];
  alternativeConditionCode?: string | null;
  alternativeEvidenceRefs?: string[];
  alternativeProvenanceId?: string | null;
  populationCompatibility: CanonicalPopulationCompatibility;
  formulaCode?: string | null;
  calculationRef?: string | null;
  assumptions?: string[];
  baselinePeriod?: string | null;
  impactPeriod?: string | null;
  cadenceEvidenceRefs?: string[];
  recurrenceProven?: boolean;
  annualized?: boolean;
  relationshipKeys?: string[];
  requestedResultState: CanonicalEconomicCounterfactual["resultState"];
  exactDelta?: MoneyAmount | null;
  lowerBound?: MoneyAmount | null;
  upperBound?: MoneyAmount | null;
  conditionCode?: string | null;
  targetClaimKey?: string | null;
  alternativeConditionClaimKey?: string | null;
  assumptionClaimKeys?: string[];
  cadenceClaimKey?: string | null;
  calculationKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalMerchantLeverAdmission = {
  key: string;
  leverType: CanonicalMerchantLeverType;
  requestedState: CanonicalMerchantLeverState;
  driverKeys?: string[];
  chargeRefs?: string[];
  counterfactualKey?: string | null;
  controlRoleRefs?: string[];
  requiredControlDimensions?: CanonicalMerchantLever["requiredControlDimensions"];
  operationalControllabilityEvidenceRefs?: string[];
  merchantInfluenceClaimKey?: string | null;
  safeActionCode: string;
  prohibitedClaimCodes?: string[];
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalRefundEconomicsAdmission = Omit<CanonicalRefundEconomics, keyof CanonicalSynthesisProof | "status" | "fieldClaimRefs"> & {
  requestedStatus: CanonicalRefundEconomics["status"];
  populationClaimKey?: string | null;
  underlyingCostReturnClaimKey?: string | null;
  processorPricingReturnClaimKey?: string | null;
  percentageBasisClaimKey?: string | null;
  returnFeeClaimKey?: string | null;
  retainedFeeClaimKey?: string | null;
  scopeClaimKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalAmexEconomicsAdmission = Omit<CanonicalAmexEconomics, keyof CanonicalSynthesisProof | "status" | "marginState" | "acceptanceClaimRef" | "marginClaimRef"> & {
  requestedStatus: CanonicalAmexEconomics["status"];
  requestedMarginState: CanonicalAmexEconomics["marginState"];
  acceptanceClaimKey?: string | null;
  marginClaimKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalAccountServiceAdmission = Omit<CanonicalAccountServiceEconomics, keyof CanonicalSynthesisProof | "id" | "chargeClaimRef" | "usageClaimRef" | "duplicationClaimRef"> & {
  key: string;
  chargeClaimKey?: string | null;
  usageClaimKey?: string | null;
  duplicationClaimKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalMerchantPricingProgramAdmission = Omit<CanonicalMerchantPricingProgram, keyof CanonicalSynthesisProof | "id" | "status" | "netBurdenState" | "flowClaimRefs"> & {
  key: string;
  requestedStatus: CanonicalMerchantPricingProgram["status"];
  flowClaimKeys?: string[];
  netBurdenCalculationKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalOffStatementExposureAdmission = Omit<CanonicalOffStatementExposure, keyof CanonicalSynthesisProof | "id" | "stateClaimRef"> & {
  key: string;
  stateClaimKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalStatementNoticeAdmission = Omit<CanonicalStatementNotice, keyof CanonicalSynthesisProof | "id" | "analyzedPeriodApplicability" | "termClaimRef"> & {
  key: string;
  termClaimKey?: string | null;
  requestedPeriodApplicability: CanonicalStatementNotice["analyzedPeriodApplicability"];
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalOperationalSignalAdmission = Omit<CanonicalOperationalSignal, keyof CanonicalSynthesisProof | "id" | "status" | "economicDriverRefs" | "associationClaimRef" | "causalityClaimRef"> & {
  key: string;
  requestedStatus: CanonicalOperationalSignal["status"];
  economicDriverKeys?: string[];
  associationClaimKey?: string | null;
  causalityClaimKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalAccountRiskAdmission = Omit<CanonicalAccountRiskStatus, keyof CanonicalSynthesisProof | "state" | "descriptiveRatioByCount" | "descriptiveRatioByValue" | "fairnessVerdict" | "compatibilityClaimRef"> & {
  requestedState: CanonicalAccountRiskStatus["state"];
  compatibilityClaimKey?: string | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalEconomicThemeAdmission = {
  key: string;
  claimKey?: string | null;
  economicQuestionCode: string;
  actionBoundaryCode: string;
  canonicalQuestionScopeFingerprint?: string;
  statementPeriod?: { start: string; end: string } | null;
  themeType: CanonicalEconomicThemeType;
  factRefs?: string[];
  chargeRefs?: string[];
  driverKeys?: string[];
  signalKeys?: string[];
  leverKeys?: string[];
  unresolvedDependencyKeys?: string[];
  materiality: CanonicalEconomicTheme["materiality"];
  actionabilityState: CanonicalEconomicTheme["actionabilityState"];
  priorityClass: CanonicalEconomicTheme["priorityClass"];
  semanticCoverageCodes?: string[];
  proof: CanonicalSynthesisProofAdmission;
};

export type BuildCanonicalEconomicsV2SynthesisInput = {
  economicAnalysis: CanonicalEconomicsV2EconomicAnalysis;
  dependencies?: CanonicalSynthesisDependencyAdmission[];
  claims?: CanonicalSynthesisSemanticClaimAdmission[];
  calculations?: CanonicalSynthesisCalculationAdmission[];
  drivers?: CanonicalEconomicDriverAdmission[];
  attributionRelationships?: CanonicalDriverRelationshipAdmission[];
  counterfactuals?: CanonicalEconomicCounterfactualAdmission[];
  merchantLevers?: CanonicalMerchantLeverAdmission[];
  refundEconomics?: CanonicalRefundEconomicsAdmission;
  amexEconomics?: CanonicalAmexEconomicsAdmission;
  accountServices?: CanonicalAccountServiceAdmission[];
  merchantPricingPrograms?: CanonicalMerchantPricingProgramAdmission[];
  offStatementExposures?: CanonicalOffStatementExposureAdmission[];
  notices?: CanonicalStatementNoticeAdmission[];
  operationalSignals?: CanonicalOperationalSignalAdmission[];
  accountRisk?: CanonicalAccountRiskAdmission;
  demonstratedAmendments?: Array<{ id: CanonicalSynthesisSemanticAmendmentId; synthesisKeys: string[] }>;
  themes?: CanonicalEconomicThemeAdmission[];
  contractV1?: {
    applications: import("./synthesisContractV1Types.js").CanonicalSynthesisContractV1Application[];
    applicationHash: string;
    rfPrecedenceChecked: true;
    boundRfSnapshotHash: string;
    evidenceRegistry: {
      registryHash: string;
      validation: { status: "valid" | "invalid"; errors: string[] };
      evidence: import("./runtime/rgEvidenceExecution.js").CanonicalRgVerifiedEvidence[];
    };
  };
  limitations?: string[];
};

type BuildContext = {
  analysis: CanonicalEconomicsV2EconomicAnalysis;
  evidenceIds: Set<string>;
  dependencyIdByKey: Map<string, string>;
  dependencyById: Map<string, CanonicalSynthesisDependency>;
  authorityAllowed: boolean;
};

export function buildCanonicalEconomicsV2SynthesisAnalysis(
  input: BuildCanonicalEconomicsV2SynthesisInput,
): CanonicalEconomicsV2SynthesisAnalysis {
  const economic = input.economicAnalysis;
  const contractErrors = input.contractV1 ? validateCanonicalSynthesisContractV1Envelope(input.contractV1) : [];
  const compiledContract = input.contractV1 && contractErrors.length === 0
    ? compileCanonicalSynthesisContractV1({ economic, applications: input.contractV1.applications }) : null;
  if (compiledContract?.state.validation.status === "invalid") contractErrors.push(...compiledContract.state.validation.errors);
  const contract = compiledContract?.state.validation.status === "valid" ? compiledContract : null;
  const evidenceIds = new Set([...economic.pricingAnalysis.foundation.sourceModel.evidence.map((item) => item.id),
    ...(contract ? input.contractV1!.evidenceRegistry.evidence.map((item) => item.evidenceId) : [])]);
  const dependencyAdmissions = [...(input.dependencies ?? []), ...(contract?.dependencies ?? [])];
  const dependencyIdByKey = idMap(dependencyAdmissions, "synthesis_dependency");
  const dependencies = dependencyAdmissions.map((item): CanonicalSynthesisDependency => ({
    id: dependencyIdByKey.get(item.key)!,
    kind: item.kind,
    status: item.status ?? "required",
    evidenceRefs: validRefs(item.evidenceRefs ?? [], evidenceIds),
    limitations: unique(item.limitations ?? []),
  }));
  const authorityAllowed = economic.validation.status === "valid" &&
    (contract !== null || economic.economicLayer.admissionProfile.source === "approved_synthetic" || economic.economicLayer.admissionProfile.source === "versioned_template") &&
    !["source_unavailable", "corpus_integrity_hold", "requires_human_review"].includes(economic.economicLayer.sourceProvenance);
  const context: BuildContext = {
    analysis: economic,
    evidenceIds,
    dependencyIdByKey,
    dependencyById: new Map(dependencies.map((item) => [item.id, item])),
    authorityAllowed,
  };

  const driverAdmissions = [...(input.drivers ?? []), ...(contract?.drivers ?? [])];
  const relationshipAdmissions = input.attributionRelationships ?? [];
  const counterfactualAdmissions = [...(input.counterfactuals ?? []), ...(contract?.counterfactuals ?? [])];
  const leverAdmissions = [...(input.merchantLevers ?? []), ...(contract?.merchantLevers ?? [])];
  const signalAdmissions = input.operationalSignals ?? [];
  const serviceAdmissions = input.accountServices ?? [];
  const programAdmissions = input.merchantPricingPrograms ?? [];
  const exposureAdmissions = input.offStatementExposures ?? [];
  const noticeAdmissions = input.notices ?? [];
  const themeAdmissions = [...(input.themes ?? []), ...(contract?.themes ?? [])];
  const driverIdByKey = idMap(driverAdmissions, "synthesis_driver");
  const relationshipIdByKey = idMap(relationshipAdmissions, "synthesis_attribution");
  const counterfactualIdByKey = idMap(counterfactualAdmissions, "synthesis_counterfactual");
  const leverIdByKey = idMap(leverAdmissions, "synthesis_lever");
  const signalIdByKey = idMap(signalAdmissions, "synthesis_signal");
  const serviceIdByKey = idMap(serviceAdmissions, "synthesis_service");
  const programIdByKey = idMap(programAdmissions, "synthesis_pricing_program");
  const exposureIdByKey = idMap(exposureAdmissions, "synthesis_off_statement");
  const noticeIdByKey = idMap(noticeAdmissions, "synthesis_notice");
  const themeContributionIdByKey = idMap(themeAdmissions, "synthesis_theme_contribution");
  const subjectIdByKey = new Map<string, string>([
    ...driverIdByKey, ...relationshipIdByKey, ...counterfactualIdByKey, ...leverIdByKey, ...signalIdByKey,
    ...serviceIdByKey, ...programIdByKey, ...exposureIdByKey, ...noticeIdByKey, ...themeContributionIdByKey,
    ["refund", "synthesis_refund"], ["amex", "synthesis_amex"], ["risk", "synthesis_risk"],
  ]);
  const registry = buildSynthesisSemanticRegistry([...(input.claims ?? []), ...(contract?.claims ?? [])],
    [...(input.calculations ?? []), ...(contract?.calculations ?? [])], {
    analysis: economic, subjectIdByKey, driverIdByKey, dependencyIdByKey, dependencies, authorityAllowed,
    contractV1Active: contract !== null,
  });
  const claim = (key: string | null | undefined, kind: Parameters<typeof supportedClaim>[2], subjectRef: string) =>
    supportedClaim(key, registry, kind, subjectRef);
  const calculation = (key: string | null | undefined, kind: Parameters<typeof validCalculation>[2], subjectRef: string) =>
    validCalculation(key, registry, kind, subjectRef);
  const futureNoticeEvidence = new Set(registry.claims.filter((item) => item.kind === "future_notice_term" && item.status === "supported")
    .flatMap((item) => item.evidenceRefs));

  const relationships = relationshipAdmissions.map((item): CanonicalDriverRelationship => {
    const id = relationshipIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const relationshipClaim = claim(item.relationshipClaimKey, "attribution_relationship", id);
    const driverRefs = unique(item.driverKeys.map((key) => driverIdByKey.get(key)).filter(isString));
    const reciprocal = item.reciprocalRelationshipKey ? relationshipAdmissions.find((candidate) => candidate.key === item.reciprocalRelationshipKey) : null;
    const supersessionValid = !["supersedes", "superseded_by"].includes(item.relationshipType) || Boolean(
      reciprocal && reciprocal.reciprocalRelationshipKey === item.key && reciprocal.driverKeys.length === 2 && item.driverKeys.length === 2 &&
      reciprocal.driverKeys[0] === item.driverKeys[1] && reciprocal.driverKeys[1] === item.driverKeys[0] &&
      ((item.relationshipType === "supersedes" && reciprocal.relationshipType === "superseded_by") ||
       (item.relationshipType === "superseded_by" && reciprocal.relationshipType === "supersedes")),
    );
    const supported = Boolean(relationshipClaim && relationshipClaim.claimCode === item.relationshipType && driverRefs.length === item.driverKeys.length && supersessionValid);
    const relationshipType = supported ? item.relationshipType : "unresolved";
    const allocation = calculation(item.allocationCalculationKey, "exclusive_driver_allocation", id);
    const participatingPopulationsCompatible = Boolean(allocation) && item.driverKeys.every((key) => {
      const driver = driverAdmissions.find((candidate) => candidate.key === key);
      return Boolean(driver && sameSet(driver.populationRefs, allocation!.populationRefs));
    });
    const exclusive = relationshipType === "exclusive_within_group" && Boolean(allocation) && sameSet(allocation!.driverRefs, driverRefs) &&
      sameSet(relationshipClaim?.populationRefs ?? [], allocation!.populationRefs) && participatingPopulationsCompatible;
    return {
      id, relationshipType, driverRefs,
      allocationCalculationRef: exclusive ? allocation!.id : null,
      additiveAggregationAllowed: Boolean(item.additiveAggregationAllowed) && exclusive,
      relationshipClaimRef: relationshipClaim?.id ?? null,
      residualContribution: exclusive ? allocation!.residualContribution : null,
      ...proof,
      limitations: unique([
        ...proof.limitations,
        ...(!supported ? ["Attribution relationship remains unresolved without a matching claim-specific admission."] : []),
        ...(item.additiveAggregationAllowed && !exclusive ? ["Additive aggregation was refused because exclusivity and deterministic allocation were not proven."] : []),
      ]),
    };
  });
  const relationshipById = new Map(relationships.map((item) => [item.id, item]));

  const counterfactuals = counterfactualAdmissions.map((item): CanonicalEconomicCounterfactual => {
    const id = counterfactualIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const relationshipRefs = unique((item.relationshipKeys ?? []).map((key) => relationshipIdByKey.get(key)).filter(isString));
    const relationshipSafe = relationshipRefs.every((ref) => ["exclusive_within_group", "counterfactual_attribution"].includes(relationshipById.get(ref)?.relationshipType ?? ""));
    const target = claim(item.targetClaimKey, "counterfactual_target", id);
    const condition = claim(item.alternativeConditionClaimKey, "counterfactual_alternative_condition", id);
    const assumptions = (item.assumptionClaimKeys ?? []).map((key) => claim(key, "counterfactual_assumption", id)).filter(isDefined);
    const cadence = claim(item.cadenceClaimKey, "cadence_recurrence", id);
    const expectedKind = item.requestedResultState === "bounded_conditional_delta" ? "counterfactual_bounded_delta" : "counterfactual_exact_delta";
    const calc = calculation(item.calculationKey, expectedKind, id);
    const requestedAssumptions = unique(item.assumptions ?? []);
    const assumptionsSafe = assumptions.length === requestedAssumptions.length && sameSet(assumptions.map((value) => value.claimCode), requestedAssumptions);
    const noFutureEvidence = [...proof.evidenceRefs, ...validRefs(item.alternativeEvidenceRefs ?? [], evidenceIds)]
      .every((ref) => !futureNoticeEvidence.has(ref));
    const statementPeriod = economic.pricingAnalysis.foundation.identity.statementPeriod;
    const canonicalPeriodCode = statementPeriod ? `${statementPeriod.start}/${statementPeriod.end}` : null;
    const periodsCompatible = Boolean(canonicalPeriodCode && item.baselinePeriod === canonicalPeriodCode && item.impactPeriod === canonicalPeriodCode);
    const populationsSafe = Boolean(target && condition && sameSet(target.populationRefs, item.observedPopulationRefs) &&
      sameSet(condition.populationRefs, item.alternativePopulationRefs));
    const cadenceSafe = !item.annualized || Boolean(cadence && item.recurrenceProven && calc && cadence.occurrencesPerYear === calc.annualizationFactor);
    const commonSafe = provesCanonical(proof, context) && item.populationCompatibility === "compatible" && populationsSafe && assumptionsSafe &&
      Boolean(calc) && relationshipSafe && cadenceSafe && periodsCompatible && noFutureEvidence;
    const exactSafe = commonSafe && expectedKind === "counterfactual_exact_delta" && moneyEqual(item.exactDelta ?? null, calc?.resultAmount ?? null);
    const boundedSafe = commonSafe && expectedKind === "counterfactual_bounded_delta" &&
      moneyEqual(item.lowerBound ?? null, calc?.lowerResultAmount ?? null) && moneyEqual(item.upperBound ?? null, calc?.upperResultAmount ?? null) &&
      item.conditionCode === condition?.claimCode;
    const resultState = exactSafe ? "exact_deterministic_delta" as const : boundedSafe ? "bounded_conditional_delta" as const :
      item.observedCost ? "verification_only" as const : "unavailable_not_derivable" as const;
    return {
      id,
      observedPopulationRefs: unique(item.observedPopulationRefs), observedChargeRefs: unique(item.observedChargeRefs ?? []), observedCost: item.observedCost ?? null,
      alternativePopulationRefs: unique(item.alternativePopulationRefs),
      alternativeConditionCode: condition?.claimCode ?? null,
      alternativeEvidenceRefs: condition?.evidenceRefs ?? [], alternativeProvenanceId: target?.id ?? null,
      populationCompatibility: item.populationCompatibility,
      formulaCode: calc?.kind ?? null, calculationRef: calc?.id ?? null,
      assumptions: assumptions.map((value) => value.claimCode), baselinePeriod: item.baselinePeriod ?? null, impactPeriod: item.impactPeriod ?? null,
      cadenceEvidenceRefs: cadence?.evidenceRefs ?? [], recurrenceProven: Boolean(item.annualized && cadence), annualized: Boolean(item.annualized && cadence),
      relationshipRefs, resultState,
      exactDelta: resultState === "exact_deterministic_delta" ? calc!.resultAmount : null,
      lowerBound: resultState === "bounded_conditional_delta" ? calc!.lowerResultAmount : null,
      upperBound: resultState === "bounded_conditional_delta" ? calc!.upperResultAmount : null,
      conditionCode: resultState === "bounded_conditional_delta" ? condition!.claimCode : null,
      targetClaimRef: target?.id ?? null, alternativeConditionClaimRef: condition?.id ?? null,
      assumptionClaimRefs: assumptions.map((value) => value.id), cadenceClaimRef: cadence?.id ?? null,
      lowerBoundCalculationRef: resultState === "bounded_conditional_delta" ? calc!.id : null,
      upperBoundCalculationRef: resultState === "bounded_conditional_delta" ? calc!.id : null,
      ...proof,
      limitations: unique([...proof.limitations, ...(!commonSafe || (!exactSafe && !boundedSafe)
        ? ["The requested counterfactual was refused because its claim, calculation, evidence, population, period, cadence, or overlap contract was incomplete."] : [])]),
    };
  });
  const counterfactualById = new Map(counterfactuals.map((item) => [item.id, item]));

  const drivers = driverAdmissions.map((item): CanonicalEconomicDriver => {
    const id = driverIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const populationClaim = claim(item.populationClaimKey, "driver_population_identity", id);
    const costPoolClaim = claim(item.costPoolClaimKey, "driver_cost_pool_relationship", id);
    const shareClaim = claim(item.shareClaimKey, "driver_share_basis", id);
    const shareCalc = calculation(item.shareCalculationKey, "driver_share", id);
    const populationSafe = Boolean(populationClaim && populationClaim.claimCode === item.populationPredicateCode &&
      sameSet(populationClaim.populationRefs, item.populationRefs));
    const costSafe = !item.observedCost && !item.relevantCostPoolRef ? true : Boolean(costPoolClaim &&
      costPoolClaim.costBucketKind === item.relevantCostPoolRef && sameSet(costPoolClaim.chargeRefs, item.economicChargeRefs ?? []));
    const requestedShares = [item.shareOfPopulation, item.shareOfRelevantCostPool].filter(isString);
    const sharesSafe = requestedShares.length === 0 || Boolean(shareClaim && shareCalc && sameSet(shareCalc.allocationShares, requestedShares));
    const supported = provesCanonical(proof, context) && populationSafe && costSafe && sharesSafe;
    const relationshipRefs = unique((item.relationshipKeys ?? []).map((key) => relationshipIdByKey.get(key)).filter(isString));
    const superseded = relationshipRefs.some((ref) => {
      const relationship = relationshipById.get(ref);
      return relationship?.relationshipType === "supersedes" && relationship.driverRefs[1] === id ||
        relationship?.relationshipType === "superseded_by" && relationship.driverRefs[0] === id;
    });
    const unresolvedContribution = relationshipRefs.some((ref) => relationshipById.get(ref)?.relationshipType === "unresolved");
    const status = supported ? item.status ?? "supported" : context.authorityAllowed ? "unresolved" : "unavailable";
    return {
      id, driverType: item.driverType, status, populationRefs: unique(item.populationRefs), populationPredicateCode: item.populationPredicateCode,
      sourceOccurrenceRefs: unique(item.sourceOccurrenceRefs ?? []), economicChargeRefs: unique(item.economicChargeRefs ?? []),
      pricingComponentRefs: unique(item.pricingComponentRefs ?? []), observedVolume: status === "supported" ? item.observedVolume ?? null : null,
      observedCount: status === "supported" ? item.observedCount ?? null : null, observedCost: status === "supported" ? item.observedCost ?? null : null,
      attributionMethod: item.attributionMethod, relevantCostPoolRef: item.relevantCostPoolRef ?? null,
      shareOfPopulation: status === "supported" ? item.shareOfPopulation ?? null : null,
      shareOfRelevantCostPool: status === "supported" ? item.shareOfRelevantCostPool ?? null : null,
      comparisonPopulationRef: item.comparisonPopulationRef ?? null, relationshipRefs,
      counterfactualRef: item.counterfactualKey ? counterfactualIdByKey.get(item.counterfactualKey) ?? null : null,
      populationClaimRef: populationClaim?.id ?? null, costPoolClaimRef: costPoolClaim?.id ?? null, shareClaimRef: shareClaim?.id ?? null,
      contributionStatus: unresolvedContribution ? "unresolved" : superseded ? "superseded" : "active",
      ...proof,
      limitations: unique([...proof.limitations, ...(!supported ? ["Driver classification remains unresolved without admitted population, cost-pool, and share semantics."] : [])]),
    };
  });

  const merchantLevers = leverAdmissions.map((item): CanonicalMerchantLever => {
    const id = leverIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const counterfactualRef = item.counterfactualKey ? counterfactualIdByKey.get(item.counterfactualKey) ?? null : null;
    const counterfactual = counterfactualRef ? counterfactualById.get(counterfactualRef) ?? null : null;
    const influenceKind = item.leverType === "operational_process_change" || item.leverType === "configuration_acceptance_method_change"
      ? "merchant_operational_controllability" as const : "merchant_change_right" as const;
    const influence = claim(item.merchantInfluenceClaimKey, influenceKind, id);
    const requestedRoles = unique(item.controlRoleRefs ?? []);
    const requiredDimensions = unique(item.requiredControlDimensions ?? []);
    const roleById = new Map(economic.economicLayer.roleClaims.map((role) => [role.id, role]));
    const influenceSafe = Boolean(influence && (influenceKind === "merchant_operational_controllability" ||
      (sameSet(influence.roleClaimRefs, requestedRoles) && requiredDimensions.every((dimension) =>
        influence.roleClaimRefs.some((ref) => roleById.get(ref)?.dimension === dimension)))));
    const impactReady = counterfactual?.resultState === "exact_deterministic_delta" || counterfactual?.resultState === "bounded_conditional_delta";
    const contractAction = contract?.state.actions.find((action) => action.safeActionCode === item.safeActionCode
      && sameSet(action.chargeRefs, item.chargeRefs ?? []));
    const eligible = item.requestedState === "eligible_supported" && provesCanonical(proof, context)
      && (contractAction ? contractAction.state === "eligible_supported" : influenceSafe && impactReady);
    const state = eligible ? "eligible_supported" as const : item.requestedState === "not_available" ? "not_available" as const :
      item.requestedState === "documentation_or_monitoring_only" ? "documentation_or_monitoring_only" as const :
      context.authorityAllowed ? "candidate_requires_verification" as const : "unresolved" as const;
    return {
      id, leverType: item.leverType, state,
      driverRefs: unique((item.driverKeys ?? []).map((key) => driverIdByKey.get(key)).filter(isString)), chargeRefs: unique(item.chargeRefs ?? []),
      counterfactualRef, controlRoleRefs: influence?.roleClaimRefs ?? [], requiredControlDimensions: requiredDimensions,
      operationalControllabilityEvidenceRefs: influenceKind === "merchant_operational_controllability" ? influence?.evidenceRefs ?? [] : [],
      calculatedImpactState: eligible && impactReady ? counterfactual!.resultState : null,
      calculatedImpact: eligible && impactReady ? counterfactual!.exactDelta : null,
      calculatedImpactLowerBound: eligible && impactReady ? counterfactual!.lowerBound : null,
      calculatedImpactUpperBound: eligible && impactReady ? counterfactual!.upperBound : null,
      safeActionCode: item.safeActionCode, prohibitedClaimCodes: unique(item.prohibitedClaimCodes ?? []), merchantInfluenceClaimRef: influence?.id ?? null,
      ...proof,
      limitations: unique([...proof.limitations, ...(item.requestedState === "eligible_supported" && !eligible
        ? [contractAction ? "Eligible action status was refused because an exact Contract-v1 prerequisite remained incomplete."
          : "Eligible lever status and calculated impact were refused because merchant influence or counterfactual proof was incomplete."] : [])]),
    };
  });

  const refundEconomics = buildRefund(input.refundEconomics, context, registry);
  const amexEconomics = buildAmex(input.amexEconomics, context, registry);
  const accountServices = serviceAdmissions.map((item): CanonicalAccountServiceEconomics => {
    const id = serviceIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const chargeClaim = claim(item.chargeClaimKey, "service_charge_observed", id);
    const usageClaim = claim(item.usageClaimKey, "service_usage", id);
    const duplicationClaim = claim(item.duplicationClaimKey, "service_duplication", id);
    let state = item.state;
    if (!chargeClaim || !sameSet(chargeClaim.chargeRefs, item.chargeRefs)) state = "unresolved";
    else if (item.state === "charge_observed_usage_proven" && !usageClaim) state = "charge_observed_usage_unknown";
    if (item.state === "potential_duplication_requires_evidence" && !duplicationClaim) state = "unresolved";
    return {
      id, serviceType: item.serviceType, state, chargeRefs: chargeClaim?.chargeRefs ?? [], participantRoleRefs: unique(item.participantRoleRefs),
      usageEvidenceRefs: usageClaim?.evidenceRefs ?? [], potentiallyDuplicativeWithRefs: duplicationClaim ? unique(item.potentiallyDuplicativeWithRefs) : [],
      chargeClaimRef: chargeClaim?.id ?? null, usageClaimRef: usageClaim?.id ?? null, duplicationClaimRef: duplicationClaim?.id ?? null,
      ...proof,
      limitations: unique([...proof.limitations, ...(!chargeClaim ? ["Service economics were limited because a service-specific charge claim was unavailable."] : [])]),
    };
  });
  const merchantPricingPrograms = programAdmissions.map((item): CanonicalMerchantPricingProgram => {
    const id = programIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const flowClaims = (item.flowClaimKeys ?? []).map((key) => claim(key, "pricing_program_flow", id)).filter(isDefined);
    const flowByScope = new Map(flowClaims.map((value) => [value.scopeCode, value]));
    const expected = [
      ["statement_observed_processor_fees", item.statementObservedProcessorFees], ["consumer_facing_revenue", item.consumerFacingRevenue],
      ["merchant_retained_amount", item.merchantRetainedAmount], ["third_party_retention", item.thirdPartyRetention], ["offsets", item.offsets],
    ] as const;
    const flowsComplete = expected.every(([scope, value]) => moneyEqual(value, flowByScope.get(scope)?.moneyValue ?? null));
    const calc = calculation(item.netBurdenCalculationKey, "pricing_program_net_burden", id);
    const netComplete = flowsComplete && Boolean(calc && moneyEqual(item.netMerchantBorneCost, calc.resultAmount));
    return {
      id, programType: item.programType, status: netComplete ? item.requestedStatus : "unresolved", coveredPopulationRefs: unique(item.coveredPopulationRefs),
      statementObservedProcessorFees: flowsComplete ? item.statementObservedProcessorFees : null,
      consumerFacingRevenue: flowsComplete ? item.consumerFacingRevenue : null, merchantRetainedAmount: flowsComplete ? item.merchantRetainedAmount : null,
      thirdPartyRetention: flowsComplete ? item.thirdPartyRetention : null, offsets: flowsComplete ? item.offsets : null,
      netMerchantBorneCost: netComplete ? calc!.resultAmount : null, netBurdenCalculationRef: netComplete ? calc!.id : null,
      netBurdenState: netComplete ? "derived_when_evidenced" : "unavailable", refundTreatment: item.refundTreatment,
      flowClaimRefs: flowClaims.map((value) => value.id), ...proof,
      limitations: unique([...proof.limitations, ...(!netComplete ? ["Net merchant burden is unavailable until all compatible program flows and deterministic calculation evidence are present."] : [])]),
    };
  });
  const offStatementExposures = exposureAdmissions.map((item): CanonicalOffStatementExposure => {
    const id = exposureIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const expectedKind = item.state === "known_absent_with_evidence" ? "off_statement_absence" : "off_statement_presence";
    const stateClaim = claim(item.stateClaimKey, expectedKind, id);
    const positiveState = item.state === "observed_with_admitted_evidence" || item.state === "known_absent_with_evidence";
    const state = positiveState && !stateClaim ? "unknown_whether_exists" as const : item.state;
    return { id, exposureType: item.exposureType, state, observedAmount: state === "observed_with_admitted_evidence" ? stateClaim?.moneyValue ?? null : null,
      sourceOccurrenceRefs: stateClaim?.occurrenceRefs ?? unique(item.sourceOccurrenceRefs), stateClaimRef: stateClaim?.id ?? null, ...proof,
      limitations: unique([...proof.limitations, ...(positiveState && !stateClaim ? ["Positive off-statement presence or absence was refused without claim-specific evidence."] : [])]) };
  });
  const notices = noticeAdmissions.map((item): CanonicalStatementNotice => {
    const id = noticeIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const termClaim = claim(item.termClaimKey, "future_notice_term", id);
    const statementPeriod = economic.pricingAnalysis.foundation.identity.statementPeriod;
    const future = Boolean(item.claimedEffectiveDate && statementPeriod && item.claimedEffectiveDate > statementPeriod.end);
    return { id, sourceOccurrenceRefs: termClaim?.occurrenceRefs ?? unique(item.sourceOccurrenceRefs), noticeDate: item.noticeDate,
      claimedEffectiveDate: item.claimedEffectiveDate, claimType: item.claimType,
      verificationState: item.verificationState === "verified" && !termClaim ? "not_independently_verified" : item.verificationState,
      analyzedPeriodApplicability: future ? "future_candidate" : item.requestedPeriodApplicability,
      candidateEconomicChangeCode: item.candidateEconomicChangeCode, termClaimRef: termClaim?.id ?? null, ...proof,
      limitations: unique([...proof.limitations, ...(future ? ["Future-dated notice remains isolated from current-period economics."] : [])]) };
  });
  const operationalSignals = signalAdmissions.map((item): CanonicalOperationalSignal => {
    const id = signalIdByKey.get(item.key)!;
    const proof = normalizeProof(item.proof, context);
    const association = claim(item.associationClaimKey, "operational_association", id);
    const causality = claim(item.causalityClaimKey, "operational_causality", id);
    const status = association ? item.requestedStatus : context.authorityAllowed ? "unresolved" : "unavailable";
    const causalStatus = item.causalStatus === "causal_relationship_supported" ? (causality ? item.causalStatus : "unresolved") :
      item.causalStatus === "association_supported" ? (association ? item.causalStatus : "unresolved") : item.causalStatus;
    return { id, signalType: item.signalType, status, populationRefs: unique(item.populationRefs), observedValueCode: item.observedValueCode,
      strength: status === "supported" ? item.strength : "unavailable", causalStatus,
      economicDriverRefs: unique((item.economicDriverKeys ?? []).map((key) => driverIdByKey.get(key)).filter(isString)),
      associationClaimRef: association?.id ?? null, causalityClaimRef: causality?.id ?? null, ...proof,
      limitations: unique([...proof.limitations, ...(item.causalStatus === "causal_relationship_supported" && !causality
        ? ["Causal status was refused because a claim-specific causal admission was unavailable."] : [])]) };
  });
  const accountRisk = buildRisk(input.accountRisk, context, registry);
  const themes = buildThemes(themeAdmissions, context, registry, driverIdByKey, signalIdByKey, leverIdByKey, dependencyIdByKey, merchantLevers);
  const allRefs = unique([
    ...drivers.map((item) => item.id), ...relationships.map((item) => item.id), ...counterfactuals.map((item) => item.id),
    ...merchantLevers.map((item) => item.id), ...accountServices.map((item) => item.id), ...merchantPricingPrograms.map((item) => item.id),
    ...offStatementExposures.map((item) => item.id), ...notices.map((item) => item.id), ...operationalSignals.map((item) => item.id), ...themes.map((item) => item.id),
  ]);
  const synthesisIdByKey = new Map<string, string>([
    ...driverIdByKey,
    ...relationshipIdByKey,
    ...counterfactualIdByKey,
    ...leverIdByKey,
    ...signalIdByKey,
    ...serviceIdByKey, ...programIdByKey, ...exposureIdByKey, ...noticeIdByKey,
    ...(input.themes ?? []).map((item) => {
      const theme = themes.find((candidate) => candidate.economicQuestionCode === item.economicQuestionCode && candidate.actionBoundaryCode === item.actionBoundaryCode);
      return [item.key, theme?.id ?? ""] as [string, string];
    }),
  ]);
  const demonstrated = input.demonstratedAmendments ?? [];
  const semanticAmendments = demonstrated.map((item) => ({
    id: item.id,
    synthesisRefs: unique(item.synthesisKeys.map((key) => synthesisIdByKey.get(key)).filter(isString).filter((ref) => allRefs.includes(ref))),
    reason: RE_SEMANTIC_AMENDMENT_REASONS[item.id],
  }));

  const draft: CanonicalEconomicsV2SynthesisAnalysis = {
    versionManifest: contract ? { ...CANONICAL_ECONOMICS_V2_SYNTHESIS_VERSION_MANIFEST,
      authority: "internal_canonical_analysis_run", persistence: "analysis_run_semantic_revision" } : CANONICAL_ECONOMICS_V2_SYNTHESIS_VERSION_MANIFEST,
    economicAnalysis: economic,
    synthesisLayer: {
      economicSchemaVersion: economic.versionManifest.schemaVersion,
      dependencies,
      claims: registry.claims,
      calculations: registry.calculations,
      drivers,
      attributionRelationships: relationships,
      counterfactuals,
      merchantLevers,
      refundEconomics,
      amexEconomics,
      accountServices,
      merchantPricingPrograms,
      offStatementExposures,
      notices,
      operationalSignals,
      accountRisk,
      themes,
      semanticAmendments,
      contractV1: contract?.state ?? null,
      limitations: unique([
        ...(input.limitations ?? []),
        ...contractErrors.map((item) => `Contract-v1 synthesis admission withheld: ${item}.`),
        ...(contract?.state.validation.warnings ?? []).map((item) => `Contract-v1 exact application withheld: ${item}.`),
        "RE is a deterministic shadow-only synthesis library and has no runtime, persistence, report, customer-language, knowledge-resolution, or account-savings authority.",
      ]),
      validation: { status: "valid", errors: [], warnings: [] },
    },
    validation: { status: "valid", errors: [], warnings: [] },
  };
  return validateCanonicalEconomicsV2SynthesisAnalysis(draft);
}

function buildRefund(input: CanonicalRefundEconomicsAdmission | undefined, context: BuildContext, registry: ReturnType<typeof buildSynthesisSemanticRegistry>): CanonicalRefundEconomics {
  if (!input) return {
    status: "unavailable",
    refundVolumeFactRef: context.analysis.pricingAnalysis.foundation.financialPopulations.refundVolume.id,
    refundCountFactRef: context.analysis.pricingAnalysis.foundation.financialPopulations.refundTransactionCount.id,
    pricingPopulationRefs: [], sourceOccurrenceRefs: [], returnFeeChargeRefs: [], retainedFeeChargeRefs: [],
    underlyingCostReturnState: "unresolved", processorPricingReturnState: "unresolved", percentagePricingBasis: "unresolved",
    fieldClaimRefs: { population: null, underlyingCostReturn: null, processorPricingReturn: null, percentageBasis: null, returnFee: null, retainedFee: null, scope: null },
    ...unavailableProof("Refund economics were not admitted."),
  };
  const proof = normalizeProof(input.proof, context);
  const subject = "synthesis_refund";
  const get = (key: string | null | undefined, kind: Parameters<typeof supportedClaim>[2]) => supportedClaim(key, registry, kind, subject);
  const population = get(input.populationClaimKey, "refund_population");
  const underlying = get(input.underlyingCostReturnClaimKey, "refund_underlying_cost_return");
  const pricingReturn = get(input.processorPricingReturnClaimKey, "refund_processor_pricing_return");
  const basis = get(input.percentageBasisClaimKey, "refund_percentage_basis");
  const returnFee = get(input.returnFeeClaimKey, "refund_return_fee");
  const retainedFee = get(input.retainedFeeClaimKey, "refund_retained_fee");
  const scope = get(input.scopeClaimKey, "refund_scope");
  const supported = Boolean(population && population.populationRefs.includes(input.refundVolumeFactRef) && population.populationRefs.includes(input.refundCountFactRef));
  return {
    status: supported ? input.requestedStatus : context.authorityAllowed ? "unresolved" : "unavailable",
    refundVolumeFactRef: input.refundVolumeFactRef,
    refundCountFactRef: input.refundCountFactRef,
    pricingPopulationRefs: unique(input.pricingPopulationRefs),
    sourceOccurrenceRefs: unique(input.sourceOccurrenceRefs),
    returnFeeChargeRefs: returnFee?.chargeRefs ?? [], retainedFeeChargeRefs: retainedFee?.chargeRefs ?? [],
    underlyingCostReturnState: underlying?.claimCode === input.underlyingCostReturnState ? input.underlyingCostReturnState : "unresolved",
    processorPricingReturnState: pricingReturn?.claimCode === input.processorPricingReturnState ? input.processorPricingReturnState : "unresolved",
    percentagePricingBasis: basis?.claimCode === input.percentagePricingBasis ? input.percentagePricingBasis : "unresolved",
    fieldClaimRefs: { population: population?.id ?? null, underlyingCostReturn: underlying?.id ?? null,
      processorPricingReturn: pricingReturn?.id ?? null, percentageBasis: basis?.id ?? null, returnFee: returnFee?.id ?? null,
      retainedFee: retainedFee?.id ?? null, scope: scope?.id ?? null },
    ...proof,
  };
}

function buildAmex(input: CanonicalAmexEconomicsAdmission | undefined, context: BuildContext, registry: ReturnType<typeof buildSynthesisSemanticRegistry>): CanonicalAmexEconomics {
  if (!input) return {
    status: "unavailable", acceptanceMode: "unknown", acceptanceModeMappingRef: null, pricingPopulationRefs: [], duplicateVolumeLinkageRefs: [],
    observedChargeRefs: [], marginChargeRefs: [], marginState: "unavailable", ownershipRoleRefs: [],
    acceptanceClaimRef: null, marginClaimRef: null, ...unavailableProof("Amex economics were not admitted."),
  };
  const proof = normalizeProof(input.proof, context);
  const acceptance = supportedClaim(input.acceptanceClaimKey, registry, "amex_acceptance_mapping", "synthesis_amex");
  const margin = supportedClaim(input.marginClaimKey, registry, "amex_margin_component", "synthesis_amex");
  const marginProven = Boolean(margin && input.requestedMarginState === "proven" && sameSet(margin.chargeRefs, input.marginChargeRefs) && sameSet(margin.roleClaimRefs, input.ownershipRoleRefs));
  return {
    status: acceptance ? input.requestedStatus : context.authorityAllowed ? "unresolved" : "unavailable",
    acceptanceMode: acceptance?.claimCode === input.acceptanceMode ? input.acceptanceMode : "unknown",
    acceptanceModeMappingRef: acceptance?.id ?? null,
    pricingPopulationRefs: unique(input.pricingPopulationRefs),
    duplicateVolumeLinkageRefs: unique(input.duplicateVolumeLinkageRefs),
    observedChargeRefs: unique(input.observedChargeRefs),
    marginChargeRefs: marginProven ? unique(input.marginChargeRefs) : [],
    marginState: marginProven ? "proven" : input.requestedMarginState === "unavailable" ? "unavailable" : "unresolved",
    ownershipRoleRefs: marginProven ? unique(input.ownershipRoleRefs) : [], acceptanceClaimRef: acceptance?.id ?? null, marginClaimRef: marginProven ? margin!.id : null,
    ...proof,
    limitations: unique([...proof.limitations, ...(input.requestedMarginState === "proven" && !marginProven ? ["Amex margin was refused without admitted margin charges and ownership evidence."] : [])]),
  };
}

function buildRisk(input: CanonicalAccountRiskAdmission | undefined, context: BuildContext, registry: ReturnType<typeof buildSynthesisSemanticRegistry>): CanonicalAccountRiskStatus {
  const facts = context.analysis.pricingAnalysis.foundation.financialPopulations;
  if (!input) return {
    state: "unavailable",
    disputeDebitAmountFactRef: facts.chargebackPrincipalDebitAmount.id,
    disputeDebitCountFactRef: facts.chargebackCount.id,
    representmentAmountFactRef: facts.chargebackRepresentmentAmount.id,
    feeChargeRefs: [], countDenominatorFactRef: null, valueDenominatorFactRef: null,
    denominatorCompatibility: "unresolved", descriptiveRatioByCount: null, descriptiveRatioByValue: null,
    monitoringStatus: "unavailable", fairnessVerdict: "unavailable",
    compatibilityClaimRef: null, ...unavailableProof("Dispute and account-risk synthesis was not admitted."),
  };
  const proof = normalizeProof(input.proof, context);
  const compatibility = supportedClaim(input.compatibilityClaimKey, registry, "risk_population_compatibility", "synthesis_risk");
  const expectedRefs = [facts.chargebackCount.id, facts.grossSaleTransactionCount.id, facts.chargebackPrincipalDebitAmount.id, facts.grossSaleVolume.id];
  const supported = Boolean(compatibility && sameSet(compatibility.populationRefs, expectedRefs) &&
    input.disputeDebitCountFactRef === facts.chargebackCount.id && input.countDenominatorFactRef === facts.grossSaleTransactionCount.id &&
    input.disputeDebitAmountFactRef === facts.chargebackPrincipalDebitAmount.id && input.valueDenominatorFactRef === facts.grossSaleVolume.id);
  const countNumerator = factNumber(context.analysis, input.disputeDebitCountFactRef);
  const countDenominator = input.countDenominatorFactRef ? factNumber(context.analysis, input.countDenominatorFactRef) : null;
  const valueNumerator = factMoney(context.analysis, input.disputeDebitAmountFactRef);
  const valueDenominator = input.valueDenominatorFactRef ? factMoney(context.analysis, input.valueDenominatorFactRef) : null;
  const ratiosAllowed = supported && input.denominatorCompatibility === "compatible" && countNumerator !== null && countDenominator !== null && countDenominator > 0 &&
    valueNumerator !== null && valueDenominator !== null && valueDenominator.amountMinor > 0;
  return {
    state: ratiosAllowed ? "descriptive_ratios_available" : input.requestedState === "no_activity_proven" && supported ? "no_activity_proven" :
      input.requestedState === "unavailable" ? "unavailable" : "observed_unreconciled",
    disputeDebitAmountFactRef: input.disputeDebitAmountFactRef,
    disputeDebitCountFactRef: input.disputeDebitCountFactRef,
    representmentAmountFactRef: input.representmentAmountFactRef,
    feeChargeRefs: unique(input.feeChargeRefs),
    countDenominatorFactRef: input.countDenominatorFactRef,
    valueDenominatorFactRef: input.valueDenominatorFactRef,
    denominatorCompatibility: input.denominatorCompatibility,
    descriptiveRatioByCount: ratiosAllowed ? decimal(countNumerator! / countDenominator!) : null,
    descriptiveRatioByValue: ratiosAllowed ? decimal(valueNumerator!.amountMinor / valueDenominator!.amountMinor) : null,
    monitoringStatus: input.monitoringStatus === "verified" && !supported ? "unresolved" : input.monitoringStatus,
    fairnessVerdict: "unavailable", compatibilityClaimRef: compatibility?.id ?? null,
    ...proof,
    limitations: unique([...proof.limitations, ...(!ratiosAllowed && input.requestedState === "descriptive_ratios_available" ? ["Dispute ratios were refused because numerator and denominator compatibility was not proven."] : [])]),
  };
}

function buildThemes(
  admissions: CanonicalEconomicThemeAdmission[],
  context: BuildContext,
  registry: ReturnType<typeof buildSynthesisSemanticRegistry>,
  driverIdByKey: Map<string, string>,
  signalIdByKey: Map<string, string>,
  leverIdByKey: Map<string, string>,
  dependencyIdByKey: Map<string, string>,
  merchantLevers: CanonicalMerchantLever[],
): CanonicalEconomicTheme[] {
  const grouped = new Map<string, CanonicalEconomicThemeAdmission[]>();
  for (const item of admissions) {
    const groupKey = `${item.economicQuestionCode}\u0000${item.canonicalQuestionScopeFingerprint ?? "legacy_unspecified_scope"}`
      + `\u0000${item.actionBoundaryCode}\u0000${item.statementPeriod ? `${item.statementPeriod.start}/${item.statementPeriod.end}` : "legacy_unspecified_period"}`;
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), item]);
  }
  return [...grouped.values()].map((items, index): CanonicalEconomicTheme => {
    const first = items[0]!;
    const contributions = items.map((item) => {
      const id = `synthesis_theme_contribution_${String(admissions.indexOf(item) + 1).padStart(3, "0")}`;
      const proof = normalizeProof(item.proof, context);
      const contributionClaim = supportedClaim(item.claimKey, registry, "theme_contribution", id);
      const requestedLeverRefs = unique((item.leverKeys ?? []).map((key) => leverIdByKey.get(key)).filter(isString));
      const actionabilitySupported = item.actionabilityState !== "eligible_supported" || requestedLeverRefs.some((ref) =>
        merchantLevers.find((lever) => lever.id === ref)?.state === "eligible_supported");
      const coverageCode = unique(item.semanticCoverageCodes ?? []).join("|");
      const supported = Boolean(contributionClaim && contributionClaim.claimCode === coverageCode && actionabilitySupported);
      return {
        id, status: supported ? "supported" as const : "unresolved" as const,
        factRefs: supported ? unique(item.factRefs ?? []) : [], chargeRefs: supported ? unique(item.chargeRefs ?? []) : [],
        driverRefs: supported ? unique((item.driverKeys ?? []).map((key) => driverIdByKey.get(key)).filter(isString)) : [],
        signalRefs: supported ? unique((item.signalKeys ?? []).map((key) => signalIdByKey.get(key)).filter(isString)) : [],
        leverRefs: supported ? requestedLeverRefs : [],
        unresolvedDependencyRefs: unique((item.unresolvedDependencyKeys ?? []).map((key) => dependencyIdByKey.get(key)).filter(isString)),
        materiality: supported ? item.materiality : "unresolved" as const,
        actionabilityState: supported ? item.actionabilityState : "unresolved" as const,
        priorityClass: supported ? item.priorityClass : "unresolved" as const,
        semanticCoverageCodes: supported ? unique(item.semanticCoverageCodes ?? []) : [], claimRef: contributionClaim?.id ?? null,
        ...proof,
        limitations: unique([...proof.limitations, ...(!supported ? ["Theme contribution remained unresolved because its semantic support or actionability boundary was not proven."] : [])]),
      };
    });
    const supported = contributions.filter((item) => item.status === "supported");
    const proof = normalizeProof(first.proof, context);
    return {
      ...proof,
      id: stableId("synthesis_theme", index),
      economicQuestionCode: first.economicQuestionCode,
      actionBoundaryCode: first.actionBoundaryCode,
      canonicalQuestionScopeFingerprint: first.canonicalQuestionScopeFingerprint ?? "legacy_unspecified_scope",
      statementPeriod: first.statementPeriod ?? context.analysis.pricingAnalysis.foundation.identity.statementPeriod,
      themeType: first.themeType,
      factRefs: unique(supported.flatMap((item) => item.factRefs)), chargeRefs: unique(supported.flatMap((item) => item.chargeRefs)),
      driverRefs: unique(supported.flatMap((item) => item.driverRefs)), signalRefs: unique(supported.flatMap((item) => item.signalRefs)),
      leverRefs: unique(supported.flatMap((item) => item.leverRefs)),
      unresolvedDependencyRefs: unique(contributions.flatMap((item) => item.unresolvedDependencyRefs)),
      materiality: supported.some((item) => item.materiality === "material") ? "material" : supported[0]?.materiality ?? "unresolved",
      actionabilityState: supported.some((item) => item.actionabilityState === "eligible_supported") ? "eligible_supported" : supported[0]?.actionabilityState ?? "unresolved",
      priorityClass: supported[0]?.priorityClass ?? "unresolved",
      projectionPermission: "structured_only_no_customer_prose",
      semanticCoverageCodes: unique(supported.flatMap((item) => item.semanticCoverageCodes)), contributions,
      evidenceRefs: unique(contributions.flatMap((item) => item.evidenceRefs)), dependencyRefs: unique(contributions.flatMap((item) => item.dependencyRefs)),
      limitations: unique([...proof.limitations, ...(items.length > 1 ? ["Theme contributions were retained separately and aggregated by economic question and action boundary."] : [])]),
    };
  });
}

function supportedClaim(
  key: string | null | undefined,
  registry: ReturnType<typeof buildSynthesisSemanticRegistry>,
  kind: CanonicalSynthesisClaimKind,
  subjectRef: string,
): CanonicalSynthesisSemanticClaim | null {
  if (!key) return null;
  const id = registry.claimIdByKey.get(key);
  const claim = id ? registry.claimById.get(id) : null;
  return claim?.status === "supported" && claim.kind === kind && claim.subjectRef === subjectRef ? claim : null;
}

function validCalculation(
  key: string | null | undefined,
  registry: ReturnType<typeof buildSynthesisSemanticRegistry>,
  kind: CanonicalSynthesisCalculationKind,
  subjectRef: string,
): CanonicalSynthesisCalculation | null {
  if (!key) return null;
  const id = registry.calculationIdByKey.get(key);
  const calculation = id ? registry.calculationById.get(id) : null;
  return calculation?.status === "valid" && calculation.kind === kind && calculation.subjectRef === subjectRef ? calculation : null;
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function moneyEqual(left: MoneyAmount | null | undefined, right: MoneyAmount | null | undefined): boolean {
  return Boolean(left && right && left.currency === right.currency && left.amountMinor === right.amountMinor);
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function normalizeProof(input: CanonicalSynthesisProofAdmission, context: BuildContext): CanonicalSynthesisProof {
  return {
    derivabilityTier: input.derivabilityTier,
    evidenceClass: input.evidenceClass,
    assertionBasis: input.assertionBasis,
    confidence: input.confidence ?? "unavailable",
    evidenceRefs: validRefs(input.evidenceRefs ?? [], context.evidenceIds),
    dependencyRefs: unique((input.dependencyKeys ?? []).map((key) => context.dependencyIdByKey.get(key)).filter(isString)),
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    limitations: unique(input.limitations ?? []),
  };
}

function unavailableProof(reason: string): CanonicalSynthesisProof {
  return {
    derivabilityTier: "unresolved", evidenceClass: "unresolved", assertionBasis: "source_fact", confidence: "unavailable",
    evidenceRefs: [], dependencyRefs: [], effectiveFrom: null, effectiveTo: null, limitations: [reason],
  };
}

function provesCanonical(proof: CanonicalSynthesisProof, context: BuildContext): boolean {
  const positiveBases = new Set<CanonicalPricingAssertionBasis>(["source_fact", "deterministic_math", "rule_application", "external_verified"]);
  const positiveTiers = new Set<CanonicalPricingDerivabilityTier>([
    "stated_on_statement", "deterministically_derivable_from_statement", "inferable_from_statement_with_qualification",
  ]);
  const positiveEvidence = new Set<CanonicalSynthesisEvidenceClass>([
    "statement_confirmed", "deterministically_derived", "approved_knowledge_supported", "public_documentation_verified",
    "merchant_document_supported", "multi_statement_supported",
  ]);
  const truthfulExternalRoute = proof.assertionBasis === "external_verified" && (
    proof.evidenceClass === "public_documentation_verified" && proof.derivabilityTier === "requires_external_rule_or_schedule"
    || proof.evidenceClass === "merchant_document_supported" && proof.derivabilityTier === "requires_merchant_pricing_document"
    || proof.evidenceClass === "multi_statement_supported" && proof.derivabilityTier === "requires_additional_statement_history"
    || proof.evidenceClass === "approved_knowledge_supported" && ["requires_external_rule_or_schedule",
      "requires_merchant_pricing_document", "requires_additional_statement_history", "requires_processor_explanation"].includes(proof.derivabilityTier));
  return context.authorityAllowed && positiveBases.has(proof.assertionBasis) && (positiveTiers.has(proof.derivabilityTier) || truthfulExternalRoute) &&
    positiveEvidence.has(proof.evidenceClass) && proof.evidenceRefs.length > 0 &&
    proof.dependencyRefs.every((ref) => context.dependencyById.get(ref)?.status === "satisfied_by_admitted_evidence");
}

function factNumber(analysis: CanonicalEconomicsV2EconomicAnalysis, id: string): number | null {
  const fact = Object.values(analysis.pricingAnalysis.foundation.financialPopulations).find((item) => item.id === id);
  return typeof fact?.value === "number" ? fact.value : null;
}

function factMoney(analysis: CanonicalEconomicsV2EconomicAnalysis, id: string): MoneyAmount | null {
  const fact = Object.values(analysis.pricingAnalysis.foundation.financialPopulations).find((item) => item.id === id);
  return fact?.value && typeof fact.value === "object" && "amountMinor" in fact.value ? fact.value as MoneyAmount : null;
}

function idMap<T extends { key: string }>(items: T[], prefix: string): Map<string, string> {
  return new Map(items.map((item, index) => [item.key, stableId(prefix, index)]));
}

function stableId(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(3, "0")}`;
}

function validRefs(values: string[], allowed: Set<string>): string[] {
  return unique(values.filter((value) => allowed.has(value)));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string";
}

function decimal(value: number): string {
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export function controlClaimResolution(
  analysis: CanonicalEconomicsV2EconomicAnalysis,
  ref: string,
): CanonicalEconomicResolutionState | null {
  return analysis.economicLayer.roleClaims.find((claim) => claim.id === ref)?.resolution ?? null;
}

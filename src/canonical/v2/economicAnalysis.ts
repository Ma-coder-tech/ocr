import type { MoneyAmount } from "../types.js";
import type {
  CanonicalEconomicAdmissionProfile,
  CanonicalEconomicCategory,
  CanonicalEconomicCharge,
  CanonicalEconomicChargeSubtype,
  CanonicalEconomicControlDimension,
  CanonicalEconomicControlRoleClaim,
  CanonicalEconomicCostBucket,
  CanonicalEconomicCostBucketKind,
  CanonicalEconomicCostStack,
  CanonicalEconomicDependencyKind,
  CanonicalEconomicDependencyStatus,
  CanonicalEconomicEvidenceDependency,
  CanonicalEconomicFinancialDirection,
  CanonicalEconomicIdentityStatus,
  CanonicalEconomicNonFeeExclusion,
  CanonicalEconomicNonFeeExclusionReason,
  CanonicalEconomicParticipant,
  CanonicalEconomicParticipantRole,
  CanonicalEconomicPeriodApplicability,
  CanonicalEconomicResolutionState,
  CanonicalEconomicsV2EconomicAnalysis,
} from "./economicTypes.js";
import { CANONICAL_ECONOMICS_V2_ECONOMIC_VERSION_MANIFEST, RD_SEMANTIC_AMENDMENT_REASONS } from "./economicVersionManifest.js";
import type {
  CanonicalPricingAssertionBasis,
  CanonicalPricingConfidence,
  CanonicalPricingDerivabilityTier,
  CanonicalEconomicsV2PricingAnalysis,
} from "./pricingTypes.js";
import type { CanonicalEconomicsV2SourceOccurrence } from "./types.js";
import { validateCanonicalEconomicsV2EconomicAnalysis } from "./economicValidate.js";

export type CanonicalEconomicParticipantAdmission = {
  key: string;
  identity?: string | null;
  identityStatus: CanonicalEconomicIdentityStatus;
  roles: CanonicalEconomicParticipantRole[];
  roleResolution?: CanonicalEconomicResolutionState;
  processorTemplateScope?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  evidenceRefs?: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence?: CanonicalPricingConfidence;
  limitations?: string[];
};

export type CanonicalEconomicDependencyAdmission = {
  key: string;
  kind: CanonicalEconomicDependencyKind;
  status?: CanonicalEconomicDependencyStatus;
  claimKeys?: string[];
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  evidenceRefs?: string[];
  limitations?: string[];
};

export type CanonicalEconomicRoleClaimAdmission = {
  key: string;
  chargeKey: string;
  dimension: CanonicalEconomicControlDimension;
  participantKey?: string | null;
  constraintCode?: string | null;
  resolution: CanonicalEconomicResolutionState;
  periodApplicability?: CanonicalEconomicPeriodApplicability;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  evidenceRefs?: string[];
  dependencyKeys?: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence?: CanonicalPricingConfidence;
  limitations?: string[];
};

export type CanonicalEconomicChargeAdmission = {
  key: string;
  sourceOccurrenceRefs: string[];
  contributingOccurrenceRef?: string | null;
  representationGroupRef?: string | null;
  pricingComponentRefs?: string[];
  pricingPopulationRefs?: string[];
  category: CanonicalEconomicCategory;
  categoryResolution: CanonicalEconomicResolutionState;
  subtype?: CanonicalEconomicChargeSubtype;
  financialDirection: CanonicalEconomicFinancialDirection;
  uniqueEconomicOccurrenceProven: boolean;
  feeOccurrenceProven: boolean;
  directionProven: boolean;
  supportingDetailAdmission?: {
    admissionId: string;
    evidenceRefs: string[];
    assertionBasis: CanonicalPricingAssertionBasis;
  };
  periodApplicability?: CanonicalEconomicPeriodApplicability;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  roleClaimKeys?: string[];
  dependencyKeys?: string[];
  reconciliationRefs?: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence?: CanonicalPricingConfidence;
  limitations?: string[];
};

export type CanonicalEconomicNonFeeAdmission = {
  occurrenceRef: string;
  reason: CanonicalEconomicNonFeeExclusionReason;
  evidenceRefs: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  limitations?: string[];
};

export type BuildCanonicalEconomicsV2EconomicInput = {
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis;
  admissionProfile: CanonicalEconomicAdmissionProfile;
  participants?: CanonicalEconomicParticipantAdmission[];
  dependencies?: CanonicalEconomicDependencyAdmission[];
  charges?: CanonicalEconomicChargeAdmission[];
  roleClaims?: CanonicalEconomicRoleClaimAdmission[];
  nonFeeAdmissions?: CanonicalEconomicNonFeeAdmission[];
  documentedRoundingReconciliationRef?: string | null;
  limitations?: string[];
};

const BUCKET_KINDS = [
  "issuer_interchange_cost",
  "network_card_brand_cost",
  "processor_controlled_pricing",
  "processor_service_admin_cost",
  "third_party_equipment_cost",
  "operational_penalty_cost",
  "processing_fee_taxes",
  "other_source_grounded_fee",
  "unresolved_cost",
] as const satisfies readonly CanonicalEconomicCostBucketKind[];

const PROVING_BASES = new Set<CanonicalPricingAssertionBasis>([
  "source_fact",
  "deterministic_math",
  "rule_application",
  "external_verified",
]);
const PROVING_TIERS = new Set<CanonicalPricingDerivabilityTier>([
  "stated_on_statement",
  "deterministically_derivable_from_statement",
  "inferable_from_statement_with_qualification",
]);

export function buildCanonicalEconomicsV2EconomicAnalysis(
  input: BuildCanonicalEconomicsV2EconomicInput,
): CanonicalEconomicsV2EconomicAnalysis {
  const foundation = input.pricingAnalysis.foundation;
  const sourceUnavailable = foundation.identity.provenanceStatus === "source_unavailable" ||
    foundation.identity.provenanceStatus === "corpus_integrity_hold";
  const observational = input.admissionProfile.source === "observational";
  const admissionAuthorityAllowed = input.admissionProfile.source === "approved_synthetic"
    ? foundation.identity.provenanceStatus === "approved_synthetic"
    : input.admissionProfile.source === "versioned_template"
      ? foundation.identity.provenanceStatus === "authoritative" &&
        foundation.templateCapability.identityStatus === "proven" &&
        foundation.templateCapability.admissionStatus === "admitted"
      : input.admissionProfile.source === "runtime_capability"
        ? foundation.templateCapability.identityStatus === "proven" &&
          foundation.templateCapability.admissionStatus === "admitted" &&
          foundation.templateCapability.admissionAuthority !== null
        : false;
  const occurrenceById = new Map(foundation.sourceModel.occurrences.map((item) => [item.id, item]));
  const evidenceIds = new Set(foundation.sourceModel.evidence.map((item) => item.id));

  const participantAdmissions = input.participants ?? [];
  const participantIdByKey = new Map(participantAdmissions.map((item, index) => [item.key, `economic_participant_${pad(index + 1)}`]));
  const participants = participantAdmissions.map((item): CanonicalEconomicParticipant => {
    const provenIdentityAllowed = admissionAuthorityAllowed && !sourceUnavailable && item.assertionBasis !== "ai_hypothesis" && PROVING_BASES.has(item.assertionBasis);
    const participantPeriodApplicability = periodApplicability(
      foundation.identity.statementPeriod,
      item.effectiveFrom ?? null,
      item.effectiveTo ?? null,
      input.admissionProfile.statementPeriodApplicabilityProven,
    );
    const identityStatus = item.identityStatus === "proven" && (!provenIdentityAllowed || participantPeriodApplicability !== "applicable")
      ? "observed_only"
      : item.identityStatus;
    const roleEvidenceAllowed = provenIdentityAllowed && PROVING_TIERS.has(item.derivabilityTier) && participantPeriodApplicability === "applicable" &&
      validRefs(item.evidenceRefs ?? [], evidenceIds).length > 0;
    const roleResolution = sourceUnavailable
      ? "unavailable"
      : (item.roleResolution ?? "unresolved") === "proven" && !roleEvidenceAllowed
        ? "unresolved"
        : item.roleResolution ?? "unresolved";
    return {
      id: participantIdByKey.get(item.key)!,
      identity: sourceUnavailable ? null : item.identity ?? null,
      identityStatus: sourceUnavailable ? "unavailable" : identityStatus,
      roles: unique(item.roles),
      roleResolution,
      processorTemplateScope: item.processorTemplateScope ?? null,
      periodApplicability: sourceUnavailable ? "unproven" : participantPeriodApplicability,
      effectiveFrom: item.effectiveFrom ?? null,
      effectiveTo: item.effectiveTo ?? null,
      evidenceRefs: validRefs(item.evidenceRefs ?? [], evidenceIds),
      derivabilityTier: sourceUnavailable ? "not_derivable_from_this_document_class" : item.derivabilityTier,
      assertionBasis: item.assertionBasis,
      confidence: sourceUnavailable ? "unavailable" : item.confidence ?? "unavailable",
      limitations: unique([
        ...(item.limitations ?? []),
        ...(item.identityStatus === "proven" && (!provenIdentityAllowed || participantPeriodApplicability !== "applicable")
          ? ["Observational, pattern, AI, or period-inapplicable evidence cannot prove participant identity."]
          : []),
        ...((item.roleResolution ?? "unresolved") === "proven" && !roleEvidenceAllowed
          ? ["Participant roles were not proven by admitted, period-applicable evidence."]
          : []),
      ]),
    };
  });

  const chargeAdmissions = input.charges ?? [];
  const chargeIdByKey = new Map(chargeAdmissions.map((item, index) => [item.key, `economic_charge_${pad(index + 1)}`]));
  const claimAdmissions = input.roleClaims ?? [];
  const claimIdByKey = new Map(claimAdmissions.map((item, index) => [item.key, `economic_role_claim_${pad(index + 1)}`]));
  const dependencyAdmissions = input.dependencies ?? [];
  const dependencyIdByKey = new Map(dependencyAdmissions.map((item, index) => [item.key, `economic_dependency_${pad(index + 1)}`]));

  const dependencies = dependencyAdmissions.map((item): CanonicalEconomicEvidenceDependency => ({
    id: dependencyIdByKey.get(item.key)!,
    kind: item.kind,
    status: item.status ?? "required",
    claimRefs: unique((item.claimKeys ?? []).map((key) => claimIdByKey.get(key)).filter(isString)),
    effectiveFrom: item.effectiveFrom ?? null,
    effectiveTo: item.effectiveTo ?? null,
    evidenceRefs: validRefs(item.evidenceRefs ?? [], evidenceIds),
    limitations: unique(item.limitations ?? []),
  }));
  const dependencyById = new Map(dependencies.map((item) => [item.id, item]));

  const roleClaims = claimAdmissions.map((item): CanonicalEconomicControlRoleClaim => {
    const positiveEvidenceAllowed = admissionAuthorityAllowed && !sourceUnavailable && PROVING_BASES.has(item.assertionBasis) && PROVING_TIERS.has(item.derivabilityTier) &&
      item.assertionBasis !== "ai_hypothesis" && validRefs(item.evidenceRefs ?? [], evidenceIds).length > 0;
    const claimPeriodApplicability = item.effectiveFrom || item.effectiveTo
      ? periodApplicability(
          foundation.identity.statementPeriod,
          item.effectiveFrom ?? null,
          item.effectiveTo ?? null,
          input.admissionProfile.statementPeriodApplicabilityProven,
        )
      : item.periodApplicability ?? periodApplicability(
          foundation.identity.statementPeriod,
          null,
          null,
          input.admissionProfile.statementPeriodApplicabilityProven,
        );
    const dependencyRefs = unique((item.dependencyKeys ?? []).map((key) => dependencyIdByKey.get(key)).filter(isString));
    const requestedDependencyKeys = unique(item.dependencyKeys ?? []);
    const dependenciesSatisfied = dependencyRefs.length === requestedDependencyKeys.length &&
      dependencyRefs.every((ref) => dependencyById.get(ref)?.status === "satisfied_by_admitted_evidence");
    const resolution = sourceUnavailable
      ? "unavailable"
      : item.resolution === "proven" && (!positiveEvidenceAllowed || claimPeriodApplicability !== "applicable" || !dependenciesSatisfied)
        ? "unresolved"
        : item.resolution;
    return {
      id: claimIdByKey.get(item.key)!,
      chargeRef: chargeIdByKey.get(item.chargeKey) ?? `economic_charge_missing_${item.chargeKey}`,
      dimension: item.dimension,
      participantRef: resolution === "proven" && item.participantKey ? participantIdByKey.get(item.participantKey) ?? null : null,
      constraintCode: item.dimension === "constraint" ? item.constraintCode ?? null : null,
      resolution,
      periodApplicability: sourceUnavailable ? "unproven" : claimPeriodApplicability,
      effectiveFrom: item.effectiveFrom ?? null,
      effectiveTo: item.effectiveTo ?? null,
      evidenceRefs: validRefs(item.evidenceRefs ?? [], evidenceIds),
      dependencyRefs,
      derivabilityTier: sourceUnavailable ? "not_derivable_from_this_document_class" : resolution === "proven" ? item.derivabilityTier : unresolvedTier(item.derivabilityTier),
      assertionBasis: item.assertionBasis,
      confidence: sourceUnavailable ? "unavailable" : item.confidence ?? "unavailable",
      limitations: unique([
        ...(item.limitations ?? []),
        ...(item.resolution === "proven" && (!positiveEvidenceAllowed || claimPeriodApplicability !== "applicable" || !dependenciesSatisfied)
          ? ["The role claim was refused because positive admitted, period-applicable evidence was unavailable or non-authoritative."]
          : []),
      ]),
    };
  });

  const charges = chargeAdmissions.map((item): CanonicalEconomicCharge => chargeFromAdmission({
    item,
    chargeId: chargeIdByKey.get(item.key)!,
    occurrenceById,
    evidenceIds,
    pricingAnalysis: input.pricingAnalysis,
    roleClaimRefs: (item.roleClaimKeys ?? []).map((key) => claimIdByKey.get(key)).filter(isString),
    dependencyRefs: (item.dependencyKeys ?? []).map((key) => dependencyIdByKey.get(key)).filter(isString),
    dependencyById,
    observational,
    admissionAuthorityAllowed,
    sourceUnavailable,
    profile: input.admissionProfile,
  }));

  const automaticNonFeeExclusions = foundation.sourceModel.occurrences
    .map(nonFeeExclusion)
    .filter((item): item is CanonicalEconomicNonFeeExclusion => item !== null);
  const explicitNonFeeExclusions = (input.nonFeeAdmissions ?? []).map((item): CanonicalEconomicNonFeeExclusion | null => {
    const occurrence = occurrenceById.get(item.occurrenceRef);
    const proving = admissionAuthorityAllowed && !sourceUnavailable && PROVING_BASES.has(item.assertionBasis) && PROVING_TIERS.has(item.derivabilityTier) &&
      item.assertionBasis !== "ai_hypothesis" && item.evidenceRefs.length > 0 &&
      item.evidenceRefs.every((ref) => evidenceIds.has(ref));
    const eligibleSource = occurrence && !["fee_charge", "fee_credit", "chargeback_fee"].includes(occurrence.semanticRole);
    if (!occurrence || !proving || !eligibleSource) return null;
    return {
      occurrenceRef: occurrence.id,
      reason: item.reason,
      evidenceRefs: unique(item.evidenceRefs),
      derivabilityTier: item.derivabilityTier,
      assertionBasis: item.assertionBasis,
      limitations: unique(item.limitations ?? []),
    };
  }).filter((item): item is CanonicalEconomicNonFeeExclusion => item !== null);
  const explicitRefs = new Set(explicitNonFeeExclusions.map((item) => item.occurrenceRef));
  const nonFeeExclusions = [
    ...automaticNonFeeExclusions.filter((item) => !explicitRefs.has(item.occurrenceRef)),
    ...explicitNonFeeExclusions,
  ];
  const costStack = buildCostStack({
    pricingAnalysis: input.pricingAnalysis,
    profile: input.admissionProfile,
    participants,
    charges,
    roleClaims,
    documentedRoundingReconciliationRef: input.documentedRoundingReconciliationRef ?? null,
  });
  const economicRefs = unique([
    ...charges.map((item) => item.id),
    ...roleClaims.map((item) => item.id),
    ...participants.map((item) => item.id),
  ]);
  const layer = {
    pricingSchemaVersion: input.pricingAnalysis.versionManifest.schemaVersion,
    sourceProvenance: foundation.identity.provenanceStatus,
    admissionProfile: {
      ...input.admissionProfile,
      evidenceRefs: validRefs(input.admissionProfile.evidenceRefs, evidenceIds),
      limitations: unique(input.admissionProfile.limitations),
    },
    participants,
    charges,
    roleClaims,
    dependencies,
    nonFeeExclusions,
    costStack,
    semanticAmendments: Object.entries(RD_SEMANTIC_AMENDMENT_REASONS).map(([id, reason]) => ({
      id: id as keyof typeof RD_SEMANTIC_AMENDMENT_REASONS,
      economicRefs,
      reason,
    })),
    limitations: unique([
      ...(input.limitations ?? []),
      ...input.admissionProfile.limitations,
      "RD is shadow-only statement economics and cannot establish total acceptance cost, actionability, savings, or merchant recommendations.",
    ]),
    validation: { status: "valid" as const, errors: [], warnings: [] },
  };
  return validateCanonicalEconomicsV2EconomicAnalysis({
    versionManifest: { ...CANONICAL_ECONOMICS_V2_ECONOMIC_VERSION_MANIFEST },
    pricingAnalysis: input.pricingAnalysis,
    economicLayer: layer,
    validation: { status: "valid", errors: [], warnings: [] },
  });
}

function chargeFromAdmission(input: {
  item: CanonicalEconomicChargeAdmission;
  chargeId: string;
  occurrenceById: Map<string, CanonicalEconomicsV2SourceOccurrence>;
  evidenceIds: Set<string>;
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis;
  roleClaimRefs: string[];
  dependencyRefs: string[];
  dependencyById: Map<string, CanonicalEconomicEvidenceDependency>;
  observational: boolean;
  admissionAuthorityAllowed: boolean;
  sourceUnavailable: boolean;
  profile: CanonicalEconomicAdmissionProfile;
}): CanonicalEconomicCharge {
  const { item } = input;
  const occurrences = item.sourceOccurrenceRefs.map((ref) => input.occurrenceById.get(ref)).filter((value): value is CanonicalEconomicsV2SourceOccurrence => Boolean(value));
  const contributingOccurrence = input.occurrenceById.get(item.contributingOccurrenceRef ?? item.sourceOccurrenceRefs[0] ?? "") ?? null;
  const nonFee = occurrences.some((occurrence) => nonFeeExclusion(occurrence) !== null);
  const representationValid = representationIsValid(item, input.pricingAnalysis);
  const supportingAdmissionValid = supportingDetailAdmissionIsValid(item, input.evidenceIds, input.admissionAuthorityAllowed, input.sourceUnavailable);
  const feeRoleValid = contributingOccurrence !== null && feeRole(contributingOccurrence, item, supportingAdmissionValid);
  const positiveAdmission = input.admissionAuthorityAllowed && !input.sourceUnavailable && PROVING_BASES.has(item.assertionBasis) &&
    PROVING_TIERS.has(item.derivabilityTier) && item.assertionBasis !== "ai_hypothesis";
  const dependenciesSatisfied = input.dependencyRefs.length === unique(item.dependencyKeys ?? []).length &&
    input.dependencyRefs.every((ref) => input.dependencyById.get(ref)?.status === "satisfied_by_admitted_evidence");
  const identityProven = item.uniqueEconomicOccurrenceProven && positiveAdmission && representationValid && dependenciesSatisfied;
  const feeProven = item.feeOccurrenceProven && positiveAdmission && feeRoleValid && !nonFee;
  const directionProven = item.directionProven && positiveAdmission && directionMatches(item.financialDirection, occurrences);
  const applicable = item.effectiveFrom || item.effectiveTo
    ? periodApplicability(
        input.pricingAnalysis.foundation.identity.statementPeriod,
        item.effectiveFrom ?? null,
        item.effectiveTo ?? null,
        input.profile.statementPeriodApplicabilityProven,
      )
    : item.periodApplicability ?? periodApplicability(
        input.pricingAnalysis.foundation.identity.statementPeriod,
        null,
        null,
        input.profile.statementPeriodApplicabilityProven,
      );
  const amount = contributingOccurrence?.printedAmount ?? null;
  const canContribute = identityProven && feeProven && directionProven && amount !== null && applicable === "applicable";
  const categoryResolution = input.sourceUnavailable
    ? "unavailable"
    : item.categoryResolution === "proven" && !positiveAdmission
      ? "unresolved"
      : item.categoryResolution;
  const contributionStatus = nonFee
    ? "excluded_non_fee" as const
    : !representationValid || !identityProven
      ? "blocked_representation" as const
      : !directionProven || item.financialDirection === "unresolved"
        ? "blocked_direction" as const
        : canContribute && categoryResolution === "proven" && item.category !== "unresolved_unclassified"
          ? "contributes_classified" as const
          : canContribute
            ? "contributes_unresolved" as const
            : "noncontributing_support" as const;
  const status = input.sourceUnavailable
    ? "unavailable" as const
    : nonFee
      ? "excluded_non_fee" as const
      : canContribute
        ? categoryResolution === "conflicting" ? "conflicting" as const : categoryResolution === "proven" ? "admitted" as const : "unresolved" as const
        : "unresolved" as const;
  const pricingComponentIds = new Set(input.pricingAnalysis.pricingArchitecture.observedPricingComponents.map((component) => component.id));
  const pricingPopulationIds = new Set(input.pricingAnalysis.pricingArchitecture.pricingPopulations.map((population) => population.id));
  return {
    id: input.chargeId,
    status,
    sourceOccurrenceRefs: unique(item.sourceOccurrenceRefs),
    representationGroupRef: item.representationGroupRef ?? null,
    contributingOccurrenceRef: canContribute ? contributingOccurrence?.id ?? null : null,
    supportingDetailAdmissionId: supportingAdmissionValid && contributingOccurrence?.contributionRole === "supporting_detail"
      ? item.supportingDetailAdmission?.admissionId ?? null
      : null,
    supportingDetailAdmissionEvidenceRefs: supportingAdmissionValid && contributingOccurrence?.contributionRole === "supporting_detail"
      ? validRefs(item.supportingDetailAdmission?.evidenceRefs ?? [], input.evidenceIds)
      : [],
    supportingDetailAdmissionAssertionBasis: supportingAdmissionValid && contributingOccurrence?.contributionRole === "supporting_detail"
      ? item.supportingDetailAdmission?.assertionBasis ?? null
      : null,
    pricingComponentRefs: unique((item.pricingComponentRefs ?? []).filter((ref) => pricingComponentIds.has(ref))),
    pricingPopulationRefs: unique((item.pricingPopulationRefs ?? []).filter((ref) => pricingPopulationIds.has(ref))),
    observedAmount: amount === null ? null : { ...amount, amountMinor: Math.abs(amount.amountMinor) },
    financialDirection: directionProven ? item.financialDirection : "unresolved",
    category: categoryResolution === "proven" ? item.category : "unresolved_unclassified",
    categoryResolution,
    subtype: item.subtype ?? "unresolved",
    contributionStatus,
    statementPeriodApplicability: input.sourceUnavailable ? "unproven" : applicable,
    effectiveFrom: item.effectiveFrom ?? null,
    effectiveTo: item.effectiveTo ?? null,
    roleClaimRefs: unique(input.roleClaimRefs),
    dependencyRefs: unique(input.dependencyRefs),
    evidenceRefs: validRefs(occurrences.map((occurrence) => occurrence.evidenceRef), input.evidenceIds),
    reconciliationRefs: unique(item.reconciliationRefs ?? []),
    derivabilityTier: input.sourceUnavailable ? "not_derivable_from_this_document_class" : canContribute ? item.derivabilityTier : unresolvedTier(item.derivabilityTier),
    assertionBasis: item.assertionBasis,
    confidence: input.sourceUnavailable ? "unavailable" : item.confidence ?? "unavailable",
    limitations: unique([
      ...(item.limitations ?? []),
      ...(!identityProven ? ["Unique economic occurrence identity is not proven."] : []),
      ...(!feeProven ? ["The source occurrence is not admitted as processing-fee economics."] : []),
      ...(!directionProven ? ["Fee direction is not proven."] : []),
      ...(applicable !== "applicable" ? ["Statement-period applicability is not proven."] : []),
      ...(!dependenciesSatisfied ? ["A required economic-charge dependency is not satisfied by admitted evidence."] : []),
      ...(input.observational ? ["Observational evidence cannot self-promote into authoritative economic charge truth."] : []),
    ]),
  };
}

function buildCostStack(input: {
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis;
  profile: CanonicalEconomicAdmissionProfile;
  participants: CanonicalEconomicParticipant[];
  charges: CanonicalEconomicCharge[];
  roleClaims: CanonicalEconomicControlRoleClaim[];
  documentedRoundingReconciliationRef: string | null;
}): CanonicalEconomicCostStack {
  const foundation = input.pricingAnalysis.foundation;
  const feeFact = foundation.financialPopulations.totalStatementProcessingFees;
  const buckets = BUCKET_KINDS.map(emptyBucket);
  const bucketByKind = new Map(buckets.map((bucket) => [bucket.kind, bucket]));
  const contributing = input.charges.filter((charge) => charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved");
  for (const charge of contributing) {
    if (!charge.observedAmount || charge.financialDirection === "unresolved") continue;
    const kind = bucketForCharge(charge, input.participants, input.roleClaims);
    addToBucket(bucketByKind.get(kind)!, charge);
  }
  const classifiedNetMinor = sum(buckets.map((bucket) => bucket.netAmount.amountMinor));
  const authoritativeMinor = feeFact.status === "available" ? feeFact.value?.amountMinor ?? null : null;
  if (authoritativeMinor === null) {
    return {
      statementFeeFactRef: feeFact.id,
      authoritativeStatementFeeTotal: null,
      buckets,
      classifiedChargeNet: money(classifiedNetMinor),
      unresolvedRemainder: null,
      totalStatementProcessingCost: null,
      reconciliationDeltaMinor: null,
      reconciliationRef: null,
      completeness: "not_derivable_from_document",
      limitations: ["Authoritative statement processing fees are unavailable."],
    };
  }
  let deltaMinor = authoritativeMinor - classifiedNetMinor;
  let unresolvedRemainder: MoneyAmount | null = null;
  const unresolvedCharges = contributing.some((charge) => charge.contributionStatus === "contributes_unresolved") ||
    bucketByKind.get("unresolved_cost")!.chargeRefs.length > 0;
  const incompleteCoverage = input.profile.feeDetailCoverage === "incomplete";
  if (incompleteCoverage && deltaMinor !== 0) {
    unresolvedRemainder = money(deltaMinor);
    addSignedRemainder(bucketByKind.get("unresolved_cost")!, deltaMinor);
    deltaMinor = 0;
  }
  const roundingControl = input.documentedRoundingReconciliationRef === null
    ? null
    : foundation.reconciliation.find((control) =>
        control.id === input.documentedRoundingReconciliationRef &&
        control.status === "pass_with_rounding" &&
        control.factRefs.includes(feeFact.id) &&
        contributing.every((charge) => Boolean(charge.contributingOccurrenceRef) && control.occurrenceRefs.includes(charge.contributingOccurrenceRef!)),
      ) ?? null;
  const roundingToleranceMinor = roundingControl?.tolerance === null || roundingControl?.tolerance === undefined
    ? null
    : Math.round(Math.abs(Number(roundingControl.tolerance)) * 100);
  const documentedRounding = deltaMinor !== 0 && roundingToleranceMinor !== null && Number.isFinite(roundingToleranceMinor) &&
    Math.abs(deltaMinor) <= roundingToleranceMinor;
  const semanticPartial = unresolvedCharges || incompleteCoverage || input.profile.feeDetailCoverage === "unknown";
  const completeness = deltaMinor === 0
    ? semanticPartial ? "partial_but_financially_reconciled" as const : "complete" as const
    : documentedRounding
      ? semanticPartial ? "partial_but_financially_reconciled" as const : "complete_with_rounding" as const
      : "financially_unreconciled" as const;
  return {
    statementFeeFactRef: feeFact.id,
    authoritativeStatementFeeTotal: feeFact.value,
    buckets,
    classifiedChargeNet: money(classifiedNetMinor),
    unresolvedRemainder,
    totalStatementProcessingCost: completeness === "financially_unreconciled" ? null : feeFact.value,
    reconciliationDeltaMinor: deltaMinor,
    reconciliationRef: roundingControl?.id ?? findPassingFeeReconciliation(foundation.reconciliation),
    completeness,
    limitations: unique([
      ...(semanticPartial ? ["The stack is financially reconciled only by preserving unresolved or incomplete economic allocation."] : []),
      ...(completeness === "financially_unreconciled" ? ["Admitted charges do not reconcile to authoritative statement processing fees."] : []),
      "This stack represents statement-evidenced processing cost, not complete total acceptance cost.",
    ]),
  };
}

function bucketForCharge(
  charge: CanonicalEconomicCharge,
  participants: CanonicalEconomicParticipant[],
  claims: CanonicalEconomicControlRoleClaim[],
): CanonicalEconomicCostBucketKind {
  if (charge.contributionStatus === "contributes_unresolved" || charge.categoryResolution !== "proven") return "unresolved_cost";
  if (charge.category === "issuer_interchange_economics") return "issuer_interchange_cost";
  if (charge.category === "network_card_brand_economics") return "network_card_brand_cost";
  if (charge.category === "processor_service_administrative_cost") return "processor_service_admin_cost";
  if (charge.category === "third_party_service_equipment") return "third_party_equipment_cost";
  if (charge.category === "operational_exception_penalty_fee") return "operational_penalty_cost";
  if (charge.category === "processing_fee_tax") return "processing_fee_taxes";
  if (charge.category === "other_source_grounded_fee") return "other_source_grounded_fee";
  if (charge.category === "processor_acquirer_pricing") {
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    const control = claims.some((claim) => {
      if (!charge.roleClaimRefs.includes(claim.id) || claim.resolution !== "proven" || claim.periodApplicability !== "applicable") return false;
      if (!claim.participantRef || !["price_setter", "negotiator_change_authority", "contractual_controller"].includes(claim.dimension)) return false;
      const participant = participantById.get(claim.participantRef);
      const roles = participant?.roles ?? [];
      return participant?.roleResolution === "proven" && (roles.includes("processor_platform") || roles.includes("acquirer"));
    });
    return control ? "processor_controlled_pricing" : "unresolved_cost";
  }
  return "unresolved_cost";
}

function representationIsValid(item: CanonicalEconomicChargeAdmission, pricing: CanonicalEconomicsV2PricingAnalysis): boolean {
  if (item.sourceOccurrenceRefs.length === 0) return false;
  if (!item.representationGroupRef) return item.sourceOccurrenceRefs.length === 1 && Boolean(item.contributingOccurrenceRef ?? item.sourceOccurrenceRefs[0]);
  const group = pricing.foundation.sourceModel.representationGroups.find((candidate) => candidate.id === item.representationGroupRef);
  if (!group || group.duplicateHandling !== "one_authoritative_contributor" || !group.authoritativeContributionOccurrenceRef) return false;
  if (!item.sourceOccurrenceRefs.every((ref) => group.occurrenceRefs.includes(ref))) return false;
  return (item.contributingOccurrenceRef ?? group.authoritativeContributionOccurrenceRef) === group.authoritativeContributionOccurrenceRef;
}

function feeRole(
  occurrence: CanonicalEconomicsV2SourceOccurrence,
  admission: CanonicalEconomicChargeAdmission,
  supportingAdmissionValid: boolean,
): boolean {
  if (!["fee_charge", "fee_credit", "chargeback_fee"].includes(occurrence.semanticRole)) return false;
  if (occurrence.contributionRole === "authoritative_contributor") return true;
  if (occurrence.contributionRole === "supporting_detail") return supportingAdmissionValid && !admission.representationGroupRef;
  if (occurrence.contributionRole === "repeated_representation") {
    return Boolean(admission.representationGroupRef);
  }
  return false;
}

function supportingDetailAdmissionIsValid(
  item: CanonicalEconomicChargeAdmission,
  evidenceIds: Set<string>,
  admissionAuthorityAllowed: boolean,
  sourceUnavailable: boolean,
): boolean {
  const admission = item.supportingDetailAdmission;
  return Boolean(admission?.admissionId.trim()) && admissionAuthorityAllowed && !sourceUnavailable &&
    admission!.assertionBasis !== "ai_hypothesis" && PROVING_BASES.has(admission!.assertionBasis) &&
    admission!.evidenceRefs.length > 0 && admission!.evidenceRefs.every((ref) => evidenceIds.has(ref));
}

function directionMatches(direction: CanonicalEconomicFinancialDirection, occurrences: CanonicalEconomicsV2SourceOccurrence[]): boolean {
  if (direction === "unresolved" || occurrences.length === 0) return false;
  return occurrences.every((occurrence) => {
    if (occurrence.semanticRole === "fee_credit") return direction === "credit" && occurrence.printedDirection === "negative";
    if (occurrence.semanticRole === "fee_charge" || occurrence.semanticRole === "chargeback_fee") {
      return direction === "debit" && ["positive", "unsigned"].includes(occurrence.printedDirection);
    }
    return false;
  });
}

function nonFeeExclusion(occurrence: CanonicalEconomicsV2SourceOccurrence): CanonicalEconomicNonFeeExclusion | null {
  const reason = occurrence.semanticRole === "settlement_adjustment"
    ? "settlement_adjustment" as const
    : occurrence.semanticRole === "refund"
      ? "sales_refund" as const
      : occurrence.semanticRole === "chargeback_principal_debit"
        ? "chargeback_principal" as const
        : occurrence.semanticRole === "chargeback_representment"
          ? "chargeback_representment" as const
          : occurrence.semanticRole === "funded_amount" || occurrence.semanticRole === "third_party_funding"
            ? "funding_activity" as const
          : occurrence.contributionRole === "funding_only"
            ? "funding_activity" as const
            : null;
  return reason ? {
    occurrenceRef: occurrence.id,
    reason,
    evidenceRefs: [occurrence.evidenceRef],
    derivabilityTier: "stated_on_statement",
    assertionBasis: "source_fact",
    limitations: [],
  } : null;
}

function emptyBucket(kind: CanonicalEconomicCostBucketKind): CanonicalEconomicCostBucket {
  return { kind, debitAmount: money(0), creditAmount: money(0), netAmount: money(0), chargeRefs: [] };
}

function addToBucket(bucket: CanonicalEconomicCostBucket, charge: CanonicalEconomicCharge): void {
  const amount = charge.observedAmount?.amountMinor ?? 0;
  if (charge.financialDirection === "debit") bucket.debitAmount.amountMinor += amount;
  if (charge.financialDirection === "credit") bucket.creditAmount.amountMinor += amount;
  bucket.netAmount.amountMinor = bucket.debitAmount.amountMinor - bucket.creditAmount.amountMinor;
  bucket.chargeRefs.push(charge.id);
}

function addSignedRemainder(bucket: CanonicalEconomicCostBucket, deltaMinor: number): void {
  if (deltaMinor > 0) bucket.debitAmount.amountMinor += deltaMinor;
  if (deltaMinor < 0) bucket.creditAmount.amountMinor += Math.abs(deltaMinor);
  bucket.netAmount.amountMinor = bucket.debitAmount.amountMinor - bucket.creditAmount.amountMinor;
}

function periodApplicability(
  statementPeriod: { start: string; end: string } | null,
  effectiveFrom: string | null,
  effectiveTo: string | null,
  statementPeriodApplicabilityProven: boolean,
): CanonicalEconomicPeriodApplicability {
  if (!statementPeriodApplicabilityProven || !statementPeriod) return "unproven";
  if (effectiveFrom && statementPeriod.end < effectiveFrom) return "not_applicable";
  if (effectiveTo && statementPeriod.start > effectiveTo) return "not_applicable";
  return "applicable";
}

function findPassingFeeReconciliation(reconciliations: CanonicalEconomicsV2PricingAnalysis["foundation"]["reconciliation"]): string | null {
  return reconciliations.find((control) => control.status === "pass" || control.status === "pass_with_rounding")?.id ?? null;
}

function unresolvedTier(tier: CanonicalPricingDerivabilityTier): CanonicalPricingDerivabilityTier {
  return [
    "requires_external_rule_or_schedule",
    "requires_merchant_pricing_document",
    "requires_additional_statement_history",
    "requires_processor_explanation",
    "not_derivable_from_this_document_class",
  ].includes(tier) ? tier : "unresolved";
}

function validRefs(refs: string[], valid: Set<string>): string[] {
  return unique(refs.filter((ref) => valid.has(ref)));
}

function money(amountMinor: number): MoneyAmount {
  return { amountMinor, currency: "USD" };
}

function pad(value: number): string {
  return String(value).padStart(3, "0");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

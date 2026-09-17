import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  type CanonicalEconomicChargeAdmission,
  type CanonicalEconomicParticipantAdmission,
  type CanonicalEconomicRoleClaimAdmission,
  type CanonicalEconomicSemanticApplicationAdmission,
} from "./economicAnalysis.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import type { CanonicalEconomicsV2PricingAnalysis } from "./pricingTypes.js";
import { fiservFeeLedgerOccurrences } from "./fiservAdapter.js";
import {
  fiservClaimScopedFeeAdmissionMatchesFoundationV1,
  fiservClaimScopedFeeBoundSourceDigestV1,
  type FiservClaimScopedFeeOccurrenceAdmissionV1,
} from "./fiservClaimScopedFeeOccurrenceAdmissionV1.js";
import {
  fiservClaimScopedFeeRoundingMatchesFoundationV1,
  fiservClaimScopedFeeRoundingBoundSourceDigestV1,
  type FiservClaimScopedFeeRoundingResidualV1,
} from "./fiservClaimScopedFeeRoundingResidualV1.js";

const CAPABILITY_BOUND_LEDGER_ADMISSION_ID = "fiserv_runtime_fee_ledger_capability_v1";
const CLAIM_SCOPED_FEE_LEDGER_ADMISSION_ID = "fiserv_claim_scoped_fee_occurrence_admission_v1";
const CLAIM_SCOPED_FEE_ROUNDING_ADMISSION_ID = "fiserv_claim_scoped_fee_rounding_residual_v1";

/**
 * Carries only already-proven RB fee occurrence authority into RD. It can prove
 * that an amount contributes to statement processing cost, but it cannot prove
 * category, ownership, control, actionability, pricing architecture, or savings.
 */
export function buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis,
  semanticApplications: readonly CanonicalEconomicSemanticApplicationAdmission[] = [],
  admittedExternalEvidenceRefs: readonly string[] = [],
  claimScopedFeeAdmission: FiservClaimScopedFeeOccurrenceAdmissionV1 | null = null,
  claimScopedFeeRounding: FiservClaimScopedFeeRoundingResidualV1 | null = null,
): CanonicalEconomicsV2EconomicAnalysis {
  const foundation = pricingAnalysis.foundation;
  const feeTotal = capability(foundation, "fee_total");
  const feeDetail = capability(foundation, "fee_detail");
  const statementPeriod = capability(foundation, "statement_period");
  const admitted = foundation.templateCapability.identityStatus === "proven" &&
    foundation.templateCapability.admissionStatus === "admitted" &&
    foundation.templateCapability.admissionAuthority !== null;
  const feeTotalSupported = admitted && feeTotal?.status === "supported" && feeTotal.proofEvidenceRefs.length > 0 &&
    foundation.financialPopulations.totalStatementProcessingFees.status === "available" &&
    foundation.financialPopulations.totalStatementProcessingFees.provenanceStatus === "authoritative";
  const claimScopedSupported = claimScopedFeeAdmission?.status === "ADMITTED" &&
    fiservClaimScopedFeeAdmissionMatchesFoundationV1(claimScopedFeeAdmission, foundation) &&
    claimScopedFeeAdmission.control.exactIntegerMinorUnitReconciliation &&
    claimScopedFeeAdmission.control.authoritativeFeeTotalOccurrenceRef !== null &&
    claimScopedFeeAdmission.control.authoritativeFeeTotalEvidenceRef !== null &&
    claimScopedFeeAdmission.control.authoritativeFeeTotalMinor !== null &&
    claimScopedFeeAdmission.control.controlId !== null;
  const useClaimScoped = !feeTotalSupported && claimScopedSupported;
  const roundingSupported = claimScopedFeeRounding?.status === "ADMITTED" &&
    fiservClaimScopedFeeRoundingMatchesFoundationV1(claimScopedFeeRounding, foundation) &&
    claimScopedFeeRounding.control.controlResult === "pass_with_rounding" &&
    claimScopedFeeRounding.control.reconciliationState === "accepted_bounded_rounding_nonadditive" &&
    claimScopedFeeRounding.control.authoritativeFeeTotalOccurrenceRef !== null &&
    claimScopedFeeRounding.control.authoritativeFeeTotalEvidenceRef !== null &&
    claimScopedFeeRounding.control.printedStatementFeeTotalMinor !== null &&
    claimScopedFeeRounding.control.admittedFeeOccurrenceSumMinor !== null &&
    claimScopedFeeRounding.control.signedResidualMinor !== null &&
    claimScopedFeeRounding.control.absoluteResidualMinor !== null &&
    claimScopedFeeRounding.control.absoluteResidualMinor >= 1 &&
    claimScopedFeeRounding.control.absoluteResidualMinor <= 2 &&
    claimScopedFeeRounding.control.controlId !== null;
  const runtimeDetailAndPeriodSupported = feeDetail?.status === "supported" && feeDetail.proofEvidenceRefs.length > 0 &&
    statementPeriod?.status === "supported" && statementPeriod.proofEvidenceRefs.length > 0 &&
    foundation.identity.statementPeriod !== null;
  const useRoundingScoped = !useClaimScoped && roundingSupported && (!feeTotalSupported || !runtimeDetailAndPeriodSupported);

  if (!feeTotalSupported && !claimScopedSupported && !roundingSupported) return buildObservationalCanonicalEconomicsV2FromFiservPricing(pricingAnalysis);

  const detailSupported = useClaimScoped || useRoundingScoped || feeDetail?.status === "supported" && feeDetail.proofEvidenceRefs.length > 0;
  const periodSupported = useClaimScoped || useRoundingScoped || statementPeriod?.status === "supported" && statementPeriod.proofEvidenceRefs.length > 0 &&
    foundation.identity.statementPeriod !== null;
  const claimScopedRefs = new Set(useRoundingScoped
    ? claimScopedFeeRounding!.admittedOccurrenceRefs
    : claimScopedFeeAdmission?.admittedOccurrenceRefs ?? []);
  const feeOccurrences = detailSupported && periodSupported
    ? fiservFeeLedgerOccurrences(foundation).filter((occurrence) => useClaimScoped || useRoundingScoped
      ? claimScopedRefs.has(occurrence.id)
      :
      occurrence.printedAmount !== null && occurrence.printedAmount.amountMinor !== 0 &&
      feeDetail!.proofEvidenceRefs.includes(occurrence.evidenceRef))
    : [];
  const participants: CanonicalEconomicParticipantAdmission[] = [];
  const roleClaims: CanonicalEconomicRoleClaimAdmission[] = [];
  const chargeRoleKeys = new Map<string, string[]>();
  for (const application of semanticApplications.filter((item) => item.claimClass === "participant_control_role")) {
    if (application.value.kind !== "role" || application.value.controlDimension === "constraint") continue;
    const participantKey = `claim_scoped_participant_${application.key}`;
    const roleKey = `claim_scoped_role_${application.key}`;
    const derivabilityTier = semanticRoleDerivability(application);
    const assertionBasis = application.sourceKind === "governed_rf_snapshot" ? "rule_application" : "external_verified";
    if (application.value.state === "proven" && application.value.participantRole) {
      participants.push({
        key: participantKey, identity: null, identityStatus: "unresolved", roles: [application.value.participantRole],
        roleResolution: "proven", effectiveFrom: application.effectiveFrom, effectiveTo: application.effectiveTo,
        externalEvidenceRefs: application.externalEvidenceRefs, derivabilityTier,
        semanticApplicationKey: application.key,
        assertionBasis, confidence: "unavailable",
        limitations: ["This participant is claim-scoped by proven role class; no participant identity was inferred."],
      });
    }
    if (application.value.state !== "proven" && application.value.state !== "not_applicable") continue;
    roleClaims.push({
      key: roleKey,
      chargeKey: chargeKeyForRef(application.chargeRef),
      dimension: application.value.controlDimension,
      participantKey: application.value.state === "proven" ? participantKey : null,
      resolution: application.value.state,
      periodApplicability: "applicable",
      effectiveFrom: application.effectiveFrom,
      effectiveTo: application.effectiveTo,
      externalEvidenceRefs: application.externalEvidenceRefs,
      semanticApplicationKey: application.key,
      derivabilityTier,
      assertionBasis,
      confidence: "unavailable",
      limitations: ["Only this independently evidenced control-role facet is resolved."],
    });
    chargeRoleKeys.set(application.chargeRef, [...(chargeRoleKeys.get(application.chargeRef) ?? []), roleKey]);
  }
  const charges = feeOccurrences.map((occurrence, index): CanonicalEconomicChargeAdmission => {
    const key = `capability_bound_charge_${index + 1}`;
    const chargeRef = `economic_charge_${String(index + 1).padStart(3, "0")}`;
    const categoryApplication = semanticApplications.find((application) =>
      application.chargeRef === chargeRef && application.occurrenceRef === occurrence.id && application.claimClass === "economic_category",
    );
    return {
      key,
      sourceOccurrenceRefs: [occurrence.id],
      contributingOccurrenceRef: occurrence.id,
      category: categoryApplication?.value.kind === "mapping"
        ? categoryApplication.value.canonicalCode as CanonicalEconomicChargeAdmission["category"]
        : "unresolved_unclassified",
      categoryResolution: categoryApplication ? "proven" : "unresolved",
      subtype: occurrence.semanticRole === "fee_credit" ? "fee_credit"
        : occurrence.semanticRole === "chargeback_fee" ? "chargeback_fee" : "unresolved",
      financialDirection: occurrence.semanticRole === "fee_credit" ? "credit" : "debit",
      uniqueEconomicOccurrenceProven: true,
      feeOccurrenceProven: true,
      directionProven: true,
      supportingDetailAdmission: {
        admissionId: `${useRoundingScoped ? CLAIM_SCOPED_FEE_ROUNDING_ADMISSION_ID : useClaimScoped ? CLAIM_SCOPED_FEE_LEDGER_ADMISSION_ID : CAPABILITY_BOUND_LEDGER_ADMISSION_ID}:${index + 1}`,
        evidenceRefs: [occurrence.evidenceRef],
        assertionBasis: "source_fact",
      },
      periodApplicability: "applicable",
      reconciliationRefs: occurrence.reconciliationRefs,
      derivabilityTier: "stated_on_statement",
      assertionBasis: "source_fact",
      confidence: "unavailable",
      semanticApplicationKeys: categoryApplication ? [categoryApplication.key] : [],
      roleClaimKeys: chargeRoleKeys.get(chargeRef) ?? [],
      limitations: [
        "This admitted fee occurrence contributes to statement processing cost only.",
        ...(categoryApplication
          ? [categoryResolutionLimitation(categoryApplication)]
          : ["Economic category, ownership, control, actionability, pricing architecture, benchmark position, and savings remain unresolved."]),
      ],
    };
  });

  return buildCanonicalEconomicsV2EconomicAnalysis({
    pricingAnalysis,
    admissionProfile: {
      source: useRoundingScoped ? "claim_scoped_fee_rounding" : useClaimScoped ? "claim_scoped_fee_occurrence" : "runtime_capability",
      admissionId: useRoundingScoped ? CLAIM_SCOPED_FEE_ROUNDING_ADMISSION_ID : useClaimScoped ? CLAIM_SCOPED_FEE_LEDGER_ADMISSION_ID : CAPABILITY_BOUND_LEDGER_ADMISSION_ID,
      feeDetailCoverage: detailSupported && periodSupported ? "complete" : "incomplete",
      statementPeriodApplicabilityProven: periodSupported,
      evidenceRefs: useRoundingScoped ? unique(claimScopedFeeRounding!.proofEvidenceRefs) : useClaimScoped ? unique(claimScopedFeeAdmission!.proofEvidenceRefs) : unique([
        ...(feeTotal?.proofEvidenceRefs ?? []), ...(feeDetail?.proofEvidenceRefs ?? []), ...(statementPeriod?.proofEvidenceRefs ?? []),
      ]),
      ...(useClaimScoped ? { claimScopedFeeControl: {
        sourceDocumentRef: claimScopedFeeAdmission!.sourceDocumentRef,
        boundSourceDigest: fiservClaimScopedFeeBoundSourceDigestV1(claimScopedFeeAdmission!)!,
        statementPeriodStart: claimScopedFeeAdmission!.statementPeriod!.start,
        statementPeriodEnd: claimScopedFeeAdmission!.statementPeriod!.end,
        authoritativeFeeFactRef: foundation.financialPopulations.totalStatementProcessingFees.id,
        authoritativeFeeTotalOccurrenceRef: claimScopedFeeAdmission!.control.authoritativeFeeTotalOccurrenceRef!,
        authoritativeFeeTotalEvidenceRef: claimScopedFeeAdmission!.control.authoritativeFeeTotalEvidenceRef!,
        authoritativeFeeTotal: {
          amountMinor: claimScopedFeeAdmission!.control.authoritativeFeeTotalMinor!, currency: "USD",
        },
        exactReconciliationControlId: claimScopedFeeAdmission!.control.controlId!,
        admittedOccurrenceRefs: [...claimScopedFeeAdmission!.admittedOccurrenceRefs],
        zeroDollarOccurrenceRefs: [...claimScopedFeeAdmission!.zeroDollarOccurrenceRefs],
      } } : {}),
      ...(useRoundingScoped ? { claimScopedFeeRoundingControl: {
        sourceDocumentRef: claimScopedFeeRounding!.sourceDocumentRef,
        boundSourceDigest: fiservClaimScopedFeeRoundingBoundSourceDigestV1(claimScopedFeeRounding!)!,
        statementPeriodStart: claimScopedFeeRounding!.statementPeriod!.start,
        statementPeriodEnd: claimScopedFeeRounding!.statementPeriod!.end,
        authoritativeFeeFactRef: foundation.financialPopulations.totalStatementProcessingFees.id,
        authoritativeFeeTotalOccurrenceRef: claimScopedFeeRounding!.control.authoritativeFeeTotalOccurrenceRef!,
        authoritativeFeeTotalEvidenceRef: claimScopedFeeRounding!.control.authoritativeFeeTotalEvidenceRef!,
        authoritativeFeeTotal: { amountMinor: claimScopedFeeRounding!.control.printedStatementFeeTotalMinor!, currency: "USD" },
        admittedFeeOccurrenceSumMinor: claimScopedFeeRounding!.control.admittedFeeOccurrenceSumMinor!,
        signedResidualMinor: claimScopedFeeRounding!.control.signedResidualMinor!,
        absoluteResidualMinor: claimScopedFeeRounding!.control.absoluteResidualMinor!,
        maximumAcceptedAbsoluteResidualMinor: claimScopedFeeRounding!.control.maximumAcceptedAbsoluteResidualMinor,
        reconciliationControlId: claimScopedFeeRounding!.control.controlId!,
        reconciliationControlResult: "pass_with_rounding",
        evidenceRefs: [...claimScopedFeeRounding!.proofEvidenceRefs],
        admittedOccurrenceRefs: [...claimScopedFeeRounding!.admittedOccurrenceRefs],
        zeroDollarOccurrenceRefs: [...claimScopedFeeRounding!.zeroDollarOccurrenceRefs],
      } } : {}),
      limitations: [
        useRoundingScoped
          ? "Bounded-rounding authority is RD-only and claim-scoped to statement-bound fee identity, amount, direction, coverage, and a non-additive residual of at most two minor units."
          : useClaimScoped
          ? "Exact-control authority is RD-only and claim-scoped to statement-bound fee identity, amount, direction, coverage, and exact reconciliation."
          : "Capability authority is claim-scoped to statement fee identity, amount, direction, coverage, and reconciliation.",
        "Unresolved economic semantics remain unresolved and cannot be inferred from source labels.",
      ],
    },
    charges,
    participants,
    roleClaims,
    semanticApplications: [...semanticApplications],
    externalEvidenceRefs: unique([...admittedExternalEvidenceRefs]),
    limitations: [
      useRoundingScoped
        ? "The bounded-rounding claim-scoped ledger proves statement-observed processing cost without allocating or adding its reconciliation residual."
        : useClaimScoped
        ? "The claim-scoped ledger proves statement-observed processing cost, not total acceptance cost."
        : "The capability-bound ledger proves statement-observed processing cost, not total acceptance cost.",
      "No fee category, participant, ownership, control, actionability, pricing, benchmark, or savings rule was introduced.",
    ],
  });
}

function chargeKeyForRef(chargeRef: string): string {
  const match = /^economic_charge_(\d+)$/.exec(chargeRef);
  return match ? `capability_bound_charge_${Number(match[1])}` : `missing_${chargeRef}`;
}

function semanticRoleDerivability(
  application: CanonicalEconomicSemanticApplicationAdmission,
): CanonicalEconomicParticipantAdmission["derivabilityTier"] {
  return application.sourceAuthorities.includes("merchant_contract")
    ? "requires_merchant_pricing_document"
    : "requires_external_rule_or_schedule";
}

function categoryResolutionLimitation(application: CanonicalEconomicSemanticApplicationAdmission): string {
  return application.sourceKind === "governed_rf_snapshot"
    ? "Admitted RF knowledge resolves only this charge's economic category; ownership, control, and actionability remain independent."
    : "Verified current-run external evidence resolves only this charge's economic category; ownership, control, and actionability remain independent.";
}

export function buildObservationalCanonicalEconomicsV2FromFiservPricing(
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis,
): CanonicalEconomicsV2EconomicAnalysis {
  const candidateOccurrences = pricingAnalysis.foundation.sourceModel.occurrences.filter((occurrence) =>
    occurrence.contributionRole !== "funding_only" && ["fee_charge", "fee_credit", "chargeback_fee"].includes(occurrence.semanticRole),
  );
  const charges = candidateOccurrences.map((occurrence, index): CanonicalEconomicChargeAdmission => ({
    key: `observed_charge_${index + 1}`,
    sourceOccurrenceRefs: [occurrence.id],
    contributingOccurrenceRef: occurrence.id,
    category: "unresolved_unclassified",
    categoryResolution: "unresolved",
    subtype: occurrence.semanticRole === "chargeback_fee"
      ? "chargeback_fee"
      : occurrence.semanticRole === "fee_credit"
        ? "fee_credit"
        : "unresolved",
    financialDirection: occurrence.semanticRole === "fee_credit" ? "credit" : "debit",
    uniqueEconomicOccurrenceProven: false,
    feeOccurrenceProven: false,
    directionProven: false,
    periodApplicability: "unproven",
    dependencyKeys: ["template_admission"],
    derivabilityTier: "requires_external_rule_or_schedule",
    assertionBasis: "source_fact",
    confidence: "unavailable",
    limitations: ["Fiserv evidence remains observational until a versioned source/template admission proves economic identity, direction, and coverage."],
  }));
  return buildCanonicalEconomicsV2EconomicAnalysis({
    pricingAnalysis,
    admissionProfile: {
      source: "observational",
      admissionId: "fiserv_economic_observation_v1",
      feeDetailCoverage: "unknown",
      statementPeriodApplicabilityProven: false,
      evidenceRefs: [],
      limitations: ["Customer-delivery scope is unchanged; this adapter does not admit a Fiserv template or expand processor support."],
    },
    dependencies: [{
      key: "template_admission",
      kind: "requires_versioned_source_template_admission",
      status: "required",
      limitations: ["A versioned admission must prove occurrence identity, fee direction, and economic coverage."],
    }],
    charges,
  });
}

function capability(
  foundation: CanonicalEconomicsV2PricingAnalysis["foundation"],
  id: "fee_total" | "fee_detail" | "statement_period",
) {
  return foundation.templateCapability.capabilities.find((item) => item.capability === id);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

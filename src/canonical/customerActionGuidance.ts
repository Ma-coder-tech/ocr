import { CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION } from "./customerStateTypes.js";
import type {
  CanonicalCustomerActionGuidance,
  CanonicalFeeClassificationResolution,
  CanonicalFeeDocumentationRequirement,
  CanonicalOpportunityComponent,
  CanonicalOpportunityEngine,
} from "./types.js";

export function buildCanonicalCustomerActionGuidance(input: {
  opportunityEngine: CanonicalOpportunityEngine;
  classifications: CanonicalFeeClassificationResolution[];
}): CanonicalCustomerActionGuidance[] {
  const classificationByFeeRowId = new Map(input.classifications.map((classification) => [classification.feeRowId, classification]));
  return input.opportunityEngine.components
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((component) => actionsForComponent(component, classificationByFeeRowId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function actionsForComponent(
  component: CanonicalOpportunityComponent,
  classificationByFeeRowId: Map<string, CanonicalFeeClassificationResolution>,
): CanonicalCustomerActionGuidance[] {
  const feeRowRefs = component.feeRowRefs.map((ref) => ref.feeRowId).sort();
  const classifications = feeRowRefs
    .map((feeRowId) => classificationByFeeRowId.get(feeRowId))
    .filter((classification): classification is CanonicalFeeClassificationResolution => Boolean(classification));
  const classificationCandidateRefs = classifications.map((classification) => classification.selected.candidateId).sort();
  const calculationRefs = component.calculation.calculationRef ? [component.calculation.calculationRef] : [];
  const common = {
    feeRowRefs,
    classificationCandidateRefs,
    evidenceRefs: [...new Set(component.evidenceRefs)].sort(),
    calculationRefs,
    documentationRequirement: strongestDocumentationRequirement(classifications.map((classification) => classification.selected.documentationRequirement)),
    confidence: component.confidence,
    limitationCodes: [...component.limitations].sort(),
  };
  if (
    feeRowRefs.length === 0 ||
    classificationCandidateRefs.length === 0 ||
    common.evidenceRefs.length === 0 ||
    (component.observedAmount?.amount.amountMinor ?? 0) === 0
  ) {
    return [];
  }

  if (component.inclusionStatus === "included" && (component.eligibility === "deterministic" || component.eligibility === "approved_estimate")) {
    const actionType = removalSupport(component, classifications) ? "request_removal" : repricingSupport(component, classifications) ? "request_repricing" : null;
    if (actionType) {
      return [
        {
          id: `customer_action_${actionType}_${component.id}`,
          policyVersion: CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION,
          actionType,
          opportunityComponentRefs: [component.id],
          verificationComponentRefs: [],
          ...common,
          reasonCodes: [component.eligibility === "deterministic" ? "eligible_deterministic_component" : "eligible_approved_estimate_component"],
        },
      ];
    }
  }

  if (component.eligibility === "verification_only" && component.actionabilityCeiling !== "not_actionable") {
    return [
      {
        id: `customer_action_verify_${component.id}`,
        policyVersion: CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION,
        actionType: component.actionabilityCeiling === "potentially_actionable" ? "verify_charge" : "request_explanation",
        opportunityComponentRefs: [],
        verificationComponentRefs: [component.id],
        ...common,
        reasonCodes: ["verification_only_component", "canonical_support_required_before_savings"],
      },
    ];
  }

  if (component.eligibility === "excluded" && component.actionabilityCeiling !== "not_actionable") {
    return [
      {
        id: `customer_action_review_${component.id}`,
        policyVersion: CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION,
        actionType: "review_documentation",
        opportunityComponentRefs: [],
        verificationComponentRefs: [component.id],
        ...common,
        reasonCodes: ["excluded_component_documentation_review_only"],
      },
    ];
  }

  return [];
}

function strongSupportForIncludedAction(component: CanonicalOpportunityComponent, classifications: CanonicalFeeClassificationResolution[]): boolean {
  return (
    component.actionabilityCeiling === "potentially_actionable" &&
    component.target.type !== "none" &&
    component.observedAmount?.aiSourced === false &&
    component.target.aiSourced === false &&
    component.targetProvenance.aiSourced === false &&
    component.cadence.aiSourced === false &&
    component.calculation.aiSourced === false &&
    classifications.every((classification) => classification.selected.confidence !== "low" && selectedCandidateSource(classification) !== "ai_suggestion") &&
    component.targetProvenance.evidenceRefs.length > 0 &&
    component.calculation.calculationRef !== null &&
    component.calculation.evidenceRefs.length > 0 &&
    component.cadence.annualizationAllowed
  );
}

function removalSupport(component: CanonicalOpportunityComponent, classifications: CanonicalFeeClassificationResolution[]): boolean {
  if (component.kind !== "fee_removal" || !strongSupportForIncludedAction(component, classifications)) return false;
  if (component.target.type === "zero_removal") return component.target.proofEvidenceRefs.length > 0;
  if (component.target.type === "monetary") return component.target.amount.amountMinor === 0 && component.targetProvenance.authoritativeForDeterministic;
  if (component.target.type === "model_monetary") return component.target.amount.amountMinor === 0 && component.targetProvenance.approvedForEstimate;
  return false;
}

function repricingSupport(component: CanonicalOpportunityComponent, classifications: CanonicalFeeClassificationResolution[]): boolean {
  if (!strongSupportForIncludedAction(component, classifications)) return false;
  if (component.kind !== "rate_repricing" && component.kind !== "per_item_repricing" && component.kind !== "hidden_processor_spread") return false;
  const processorControlled = component.ownership.contractualController === "processor" || component.ownership.economicBeneficiary === "processor";
  return processorControlled && component.target.type !== "zero_removal";
}

function selectedCandidateSource(classification: CanonicalFeeClassificationResolution): string | null {
  return classification.candidates.find((candidate) => candidate.id === classification.selected.candidateId)?.sourceType ?? null;
}

function strongestDocumentationRequirement(values: CanonicalFeeDocumentationRequirement[]): CanonicalFeeDocumentationRequirement {
  const order: CanonicalFeeDocumentationRequirement[] = ["none", "recommended", "required_for_authority", "required_for_savings", "blocking"];
  return values.reduce((strongest, value) => (order.indexOf(value) > order.indexOf(strongest) ? value : strongest), "none");
}

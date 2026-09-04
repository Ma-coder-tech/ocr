export type ScalarValue = string | number | boolean | null;

export type ObservationAuthority = "source_printed" | "deterministic_extraction" | "parser_candidate";

export type ObservationKind =
  | "amount"
  | "count"
  | "date"
  | "identifier"
  | "label"
  | "relation"
  | "text"
  | "boolean";

export interface SourceLocator {
  documentId: string;
  page?: number;
  section?: string;
  row?: string;
  label?: string;
  extractedText?: string;
}

export interface Observation {
  id: string;
  kind: ObservationKind;
  value: ScalarValue;
  authority: ObservationAuthority;
  locator: SourceLocator;
  relatedObservationRefs?: string[];
}

export type LifecycleStage =
  | "authorized"
  | "submitted"
  | "rejected"
  | "resubmitted"
  | "settled"
  | "funded"
  | "returned"
  | "adjusted"
  | "unknown";

export interface EventNode {
  id: string;
  stage: LifecycleStage;
  observationRefs: string[];
}

export interface PopulationNode {
  id: string;
  observationRefs: string[];
  dimensions: Record<string, string>;
}

export type ClaimSupport =
  | "source_observation"
  | "deterministic_derivation"
  | "structural_hypothesis"
  | "ai_hypothesis"
  | "parser_candidate";

export interface Claim {
  key: string;
  value: ScalarValue;
  support: ClaimSupport;
  observationRefs: string[];
  controlRefs?: string[];
}

export type HypothesisOrigin = "deterministic" | "ai" | "recorded_provider";

export type HypothesisOwnership =
  | { kind: "deterministic_system"; immutable: true }
  | { kind: "provider"; providerId: string; proposalId: string; immutable: true };

export type HypothesisEvidenceClass = "compatibility_only" | "claim_proof";
export type HypothesisAlternativeCoverage = "non_exhaustive" | "exhaustive_for_claim";
export type InferenceConfidenceLevel = "low" | "medium" | "high";
export type QualifiedInferenceStrength = "strong" | "moderate" | "weak" | "unknown_competing";
export type InferenceSourceCompleteness = "proven_complete" | "proven_incomplete" | "unproven";
export type InferenceCompletenessRequirement = "observed_rows_sufficient" | "complete_statement_required";
export type InferenceEvidenceEffect = "supports" | "contradicts";
export type InferenceEvidenceDiagnosticity = "contextual" | "material" | "decisive";
export type InferenceEvidenceActivation = "all_pass" | "any_fail";
export type InferenceEvidenceFactorState = "satisfied" | "not_satisfied" | "unresolved";
export type InferenceVerificationCheckType = "row_pair_match" | "identifier_pair_match";
export type InferenceVerificationRole =
  | "left_amount"
  | "right_amount"
  | "left_count"
  | "right_count"
  | "earlier_date"
  | "later_date"
  | "left_identifier"
  | "right_identifier";
export type InferenceVerificationClassification = "supporting" | "contradicting" | "unresolved" | "irrelevant";
export type InferenceVerificationOutcomeClassification = Exclude<InferenceVerificationClassification, "unresolved">;

export interface InferenceVerificationCandidateDefinition {
  id: string;
  description: string;
  roleBindings: Array<{
    role: InferenceVerificationRole;
    observationRef: string;
  }>;
  alternativeImpacts: Array<{
    alternativeId: string;
    pass: InferenceVerificationOutcomeClassification;
    fail: InferenceVerificationOutcomeClassification;
    diagnosticity: InferenceEvidenceDiagnosticity;
    independenceGroupId: string;
  }>;
}

export interface InferenceVerificationRecipeDefinition {
  id: string;
  description: string;
  checkType: InferenceVerificationCheckType;
  roles: Array<{
    role: InferenceVerificationRole;
    description: string;
    allowedObservationRefs: string[];
    allowedKinds: ObservationKind[];
  }>;
  candidates: InferenceVerificationCandidateDefinition[];
}

/** Provider request after opaque source references have been translated by RateReveal. */
export interface InferenceVerificationRequest {
  requestId: string;
  recipeId: string;
  candidateId: string;
  roleBindings: Array<{
    role: InferenceVerificationRole;
    observationRef: string;
  }>;
}

export interface InferenceVerificationResult {
  requestId: string;
  recipeId: string;
  candidateId: string;
  validationState: "accepted" | "rejected";
  controlState: ControlState;
  classification: InferenceVerificationClassification;
  observationRefs: string[];
  componentResults: Array<{
    component: "amount_equality" | "count_equality" | "temporal_order" | "identifier_equality";
    state: ControlState;
  }>;
  evidenceFactor?: InferenceEvidenceFactorEvaluation;
  reason: string;
}

/** RateReveal-owned evidence policy. Providers cannot add factors or select controls. */
export interface InferenceEvidenceFactorDefinition {
  id: string;
  description: string;
  alternativeIds: string[];
  effect: InferenceEvidenceEffect;
  diagnosticity: InferenceEvidenceDiagnosticity;
  independenceGroupId: string;
  controlIds: string[];
  activation: InferenceEvidenceActivation;
}

export interface InferenceEvidenceFactorEvaluation {
  factorId: string;
  effect: InferenceEvidenceEffect;
  diagnosticity: InferenceEvidenceDiagnosticity;
  independenceGroupId: string;
  controlIds: string[];
  state: InferenceEvidenceFactorState;
}

export interface InferenceEvidencePosture {
  modelVersion: "ratereveal-inference-evidence-posture-v1";
  alternativeId: string;
  outcome: "qualified" | "contradicted";
  factorEvaluations: InferenceEvidenceFactorEvaluation[];
  satisfiedSupportFactorIds: string[];
  satisfiedContradictionFactorIds: string[];
  unresolvedFactorIds: string[];
  independentSupportGroups: Array<{
    independenceGroupId: string;
    diagnosticity: InferenceEvidenceDiagnosticity;
    factorIds: string[];
  }>;
  baseStrength: QualifiedInferenceStrength;
  qualifiedStrength: QualifiedInferenceStrength;
  sourceCompleteness: InferenceSourceCompleteness;
  unresolvedProofObligationIds: string[];
  allMaterialEvidenceNeedsAcknowledged: boolean;
  allRequiredProofObligationsValidated: boolean;
  providerConfidenceUsed: false;
  reasonCodes: string[];
}

/**
 * RateReveal-owned posture for one permitted alternative. Unlike a provider
 * hypothesis result, this exists even when no provider proposes the alternative.
 */
export interface RateRevealAlternativeEvidencePosture {
  modelVersion: "ratereveal-alternative-evidence-posture-v1";
  topicId: string;
  alternativeId: string;
  outcome: "qualified" | "contradicted";
  factorEvaluations: InferenceEvidenceFactorEvaluation[];
  satisfiedSupportFactorIds: string[];
  satisfiedContradictionFactorIds: string[];
  unresolvedFactorIds: string[];
  independentSupportGroups: InferenceEvidencePosture["independentSupportGroups"];
  baseStrength: QualifiedInferenceStrength;
  qualifiedStrength: QualifiedInferenceStrength;
  sourceCompleteness: InferenceSourceCompleteness;
  unresolvedProofObligationIds: string[];
  providerProposalRequired: false;
  providerConfidenceUsed: false;
  reasonCodes: string[];
}

/** Source-bound deterministic verification evidence that can survive provider omission. */
export interface VerifiedInferenceEvidence {
  modelVersion: "ratereveal-verified-inference-evidence-v1";
  sourceContentSha256: string;
  topicId: string;
  alternativeId: string;
  factor: InferenceEvidenceFactorEvaluation;
  verification: {
    requestId: string;
    recipeId: string;
    candidateId: string;
  };
  verificationResult: InferenceVerificationResult;
}

export interface HypothesisInference {
  confidence: InferenceConfidenceLevel;
  rationale: string;
  missingProof: string[];
  acknowledgedEvidenceNeedIds?: string[];
  proofObligationBindings?: ProofObligationBinding[];
  proofObligationValidation?: ProofObligationValidation;
  verificationRequests?: InferenceVerificationRequest[];
}

export interface InferenceTopicClaim {
  key: string;
  allowedValues: ScalarValue[];
}

export type ProofObligationGapKind =
  | "identity_linkage"
  | "calculation_basis"
  | "component_reconciliation"
  | "temporal_linkage"
  | "source_completeness";

export type ProofObligationObservationRole =
  | "subject"
  | "counterpart"
  | "missing_subject_attribute"
  | "missing_counterpart_attribute"
  | "reported_total"
  | "visible_subtotal"
  | "discrepancy"
  | "document_completeness_gap";

export type ProofObligationMissingProperty =
  | "stable_identity_link"
  | "underlying_calculation_basis"
  | "complete_component_membership"
  | "row_level_temporal_link"
  | "complete_source_scope";

export type ProofObligationResolutionEvidenceKind =
  | "stable_source_identifier"
  | "explicit_source_relation"
  | "unrounded_source_amounts"
  | "processor_rounding_method"
  | "complete_fee_detail"
  | "reconciliation_mapping"
  | "row_level_date"
  | "explicit_temporal_relation"
  | "complete_source_document";

export type ProofObligationValueState = "present" | "missing" | "any";

export interface ProofObligationObservationRequirement {
  role: ProofObligationObservationRole;
  description: string;
  observationRefs: string[];
  allowedKinds: ObservationKind[];
  valueState: ProofObligationValueState;
}

/** RateReveal-owned definition. Providers can bind to it but cannot define it. */
export interface ProofObligationDefinition {
  id: string;
  description: string;
  gapKind: ProofObligationGapKind;
  evidenceNeedIds: string[];
  observationRequirements: ProofObligationObservationRequirement[];
  missingProperty: ProofObligationMissingProperty;
  resolutionEvidenceKinds: ProofObligationResolutionEvidenceKind[];
}

/** Provider answer constrained to a RateReveal-owned proof obligation. */
export interface ProofObligationBinding {
  obligationId: string;
  gapKind: ProofObligationGapKind;
  observationBindings: Array<{
    role: ProofObligationObservationRole;
    observationRefs: string[];
  }>;
  missingProperty: ProofObligationMissingProperty;
  resolutionEvidenceKinds: ProofObligationResolutionEvidenceKind[];
}

export interface InferenceTopicMaterialAlternative {
  id: string;
  description: string;
  claim: { key: string; value: ScalarValue };
  requiredProofObligationIds: string[];
  /** RateReveal-owned checks the provider must select when proposing this alternative. */
  requiredVerificationRecipeIds: string[];
}

export interface ProofObligationBindingEvaluation {
  obligationId: string;
  valid: boolean;
  errors: string[];
}

export interface ProofObligationValidation {
  modelVersion: "ratereveal-proof-obligations-v1";
  requiredObligationIds: string[];
  validatedObligationIds: string[];
  evaluations: ProofObligationBindingEvaluation[];
  errors: string[];
}

/**
 * A RateReveal-owned question offered to a proposer. The proposer may select an
 * offered topic, but cannot create its identity, grouping, controls, or proof
 * policy.
 */
export interface InferenceTopic {
  id: string;
  hypothesisGroupId: string;
  question: string;
  observationRefs: string[];
  allowedClaims: InferenceTopicClaim[];
  materialAlternatives: InferenceTopicMaterialAlternative[];
  proofObligations: ProofObligationDefinition[];
  verificationRecipes: InferenceVerificationRecipeDefinition[];
  qualification: {
    maximumStrength: Exclude<QualifiedInferenceStrength, "unknown_competing">;
    compatibilityControlIds: string[];
    evidenceFactors: InferenceEvidenceFactorDefinition[];
    materialEvidenceNeedIds: string[];
    sourceCompleteness: InferenceSourceCompleteness;
    completenessRequirement: InferenceCompletenessRequirement;
  };
}

export interface SystemInferenceTopicAssignment {
  topicId: string;
  hypothesisGroupId: string;
  alternativeId: string;
  requiredProofObligationIds: string[];
  proofObligations: ProofObligationDefinition[];
  verificationRecipes: InferenceVerificationRecipeDefinition[];
  immutable: true;
  qualification: InferenceTopic["qualification"];
}

export interface Hypothesis {
  id: string;
  groupId: string;
  origin: HypothesisOrigin;
  ownership: HypothesisOwnership;
  evidenceClass: HypothesisEvidenceClass;
  alternativeCoverage: HypothesisAlternativeCoverage;
  inference?: HypothesisInference;
  inferenceTopic?: SystemInferenceTopicAssignment;
  description: string;
  observationRefs: string[];
  events: EventNode[];
  populations: PopulationNode[];
  claims: Claim[];
  requiredControlIds: string[];
  contradictedByControlIds?: string[];
}

interface ControlBase {
  id: string;
  description: string;
}

export interface EqualityControl extends ControlBase {
  kind: "equal" | "not_equal";
  leftObservationRef: string;
  rightObservationRef: string;
  tolerance?: number;
}

export interface ComparisonControl extends ControlBase {
  kind: "compare";
  observationRef: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  expected: number | boolean | string;
  tolerance?: number;
}

export interface ArithmeticTerm {
  observationRef: string;
  coefficient: number;
  absolute?: boolean;
}

export interface ArithmeticControl extends ControlBase {
  kind: "arithmetic";
  terms: ArithmeticTerm[];
  expectedObservationRef?: string;
  expectedLiteral?: number;
  tolerance?: number;
}

export interface RelationControl extends ControlBase {
  kind: "relation";
  relationObservationRef: string;
  expectedRelation: string;
  subjectObservationRefs: string[];
}

export interface TemporalControl extends ControlBase {
  kind: "temporal_order";
  earlierObservationRef: string;
  laterObservationRef: string;
  allowEqual?: boolean;
}

export interface LifecycleControl extends ControlBase {
  kind: "lifecycle_transition";
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  earlierObservationRef?: string;
  laterObservationRef?: string;
}

export type DeterministicControl =
  | EqualityControl
  | ComparisonControl
  | ArithmeticControl
  | RelationControl
  | TemporalControl
  | LifecycleControl;

export type ControlState = "pass" | "fail" | "unresolved";

export interface ControlResult {
  controlId: string;
  state: ControlState;
  reason: string;
  observationRefs: string[];
}

export type FeatureKind =
  | "exact_amount_match"
  | "exact_count_match"
  | "exact_identifier_match"
  | "same_date"
  | "temporal_order"
  | "explicit_relation";

export interface DeterministicFeature {
  id: string;
  kind: FeatureKind;
  observationRefs: string[];
  value?: string;
}

export type EvidenceScope = "statement_local" | "private_authorized" | "public_rg" | "unresolvable";

export interface EvidenceNeed {
  id: string;
  hypothesisGroupId: string;
  description: string;
  material: boolean;
  availableScopes: EvidenceScope[];
  exhaustedScopes?: EvidenceScope[];
}

export interface EvidenceRoute {
  evidenceNeedId: string;
  scope: EvidenceScope;
  publicRgBlocked: boolean;
  reason: string;
}

export interface ReconstructionInput {
  statementId: string;
  observations: Observation[];
  baseClaims: Claim[];
  controls: DeterministicControl[];
  hypotheses: Hypothesis[];
  evidenceNeeds: EvidenceNeed[];
  limits?: Partial<KernelLimits>;
}

export interface KernelLimits {
  maxObservations: number;
  maxControls: number;
  maxHypotheses: number;
  maxPossibleWorlds: number;
}

export type HypothesisState = "supported" | "viable_unresolved" | "rejected";
export type InterpretationState =
  | "confirmed_fact"
  | "strong_inference"
  | "moderate_inference"
  | "weak_inference"
  | "unknown_or_competing_interpretations"
  | "rejected";

export interface HypothesisResult {
  hypothesisId: string;
  groupId: string;
  state: HypothesisState;
  interpretationState: InterpretationState;
  ownership: HypothesisOwnership;
  evidenceClass: HypothesisEvidenceClass;
  alternativeCoverage: HypothesisAlternativeCoverage;
  inference?: HypothesisInference;
  inferenceTopicId?: string;
  providerReportedConfidence?: InferenceConfidenceLevel;
  qualifiedInferenceStrength?: QualifiedInferenceStrength;
  qualificationReasonCodes?: string[];
  evidencePosture?: InferenceEvidencePosture;
  verificationResults?: InferenceVerificationResult[];
  reason: string;
}

export type PossibleWorldClaimOwner =
  | { kind: "base_claim" }
  | { kind: "hypothesis_claim"; hypothesisId: string; hypothesisOwnership: HypothesisOwnership };

export interface PossibleWorldClaim extends Claim {
  owner: PossibleWorldClaimOwner;
}

export interface PossibleWorld {
  id: string;
  hypothesisIds: string[];
  claims: PossibleWorldClaim[];
}

export interface CanonicalClaim extends Claim {
  invariantAcrossWorldCount: number;
}

export type KernelStatus = "complete" | "bounded_overflow" | "invalid_input";

export interface ReconstructionResult {
  statementId: string;
  status: KernelStatus;
  errors: string[];
  features: DeterministicFeature[];
  controlResults: ControlResult[];
  hypothesisResults: HypothesisResult[];
  possibleWorlds: PossibleWorld[];
  canonicalClaims: CanonicalClaim[];
  unresolvedHypothesisGroupIds: string[];
  evidenceRoutes: EvidenceRoute[];
  limits: KernelLimits;
}

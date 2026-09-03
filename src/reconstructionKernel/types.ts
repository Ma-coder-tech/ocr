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

export interface HypothesisInference {
  confidence: InferenceConfidenceLevel;
  rationale: string;
  missingProof: string[];
  acknowledgedEvidenceNeedIds?: string[];
}

export interface InferenceTopicClaim {
  key: string;
  allowedValues: ScalarValue[];
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
  qualification: {
    maximumStrength: Exclude<QualifiedInferenceStrength, "unknown_competing">;
    compatibilityControlIds: string[];
    materialEvidenceNeedIds: string[];
    sourceCompleteness: InferenceSourceCompleteness;
    completenessRequirement: InferenceCompletenessRequirement;
  };
}

export interface SystemInferenceTopicAssignment {
  topicId: string;
  hypothesisGroupId: string;
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

export const SHADOW_AI_ECONOMIC_RESOLUTION_PLANNER_SCHEMA_VERSION =
  "shadow_ai_economic_resolution_planner_2026_09_14_v1" as const;

export const SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION =
  "shadow_ai_economic_resolution_packet_2026_09_14_v1" as const;

export const SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION =
  "shadow_ai_economic_resolution_output_2026_09_14_v1" as const;

export const SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1 = Object.freeze({
  manifestVersion: "shadow_ai_economic_resolution_manifest_2026_09_14_v1" as const,
  authority: "EVALUATION_ONLY" as const,
  maximumSelectedIssuesPerStatement: 6,
  maximumProviderCallsPerStatement: 1,
  maximumInputBytes: 120_000,
  maximumOutputTokens: 12_000,
  maximumEstimatedCostUsdMicros: 250_000,
  timeoutMs: 20_000,
  automaticRetries: 0,
  researchOperationsAllowed: 0,
  sourceAdmissionsAllowed: 0,
  customerRoutingAllowed: false,
});

export const SHADOW_AI_RESOLUTION_PATHS = [
  "RESOLVABLE_FROM_EXISTING_EVIDENCE",
  "PUBLIC_RESEARCH_REQUIRED",
  "MERCHANT_INPUT_REQUIRED",
  "DOCUMENT_REQUIRED",
  "PROCESSOR_OR_GATEWAY_DATA_REQUIRED",
  "MULTI_STATEMENT_REQUIRED",
  "COMPARATOR_EVIDENCE_REQUIRED",
  "NOT_RESOLVABLE_CURRENT_SCOPE",
] as const;

export type ShadowAiResolutionPathV1 = typeof SHADOW_AI_RESOLUTION_PATHS[number];

export const SHADOW_AI_ISSUE_CLASSES = [
  "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS",
  "QUALIFICATION_INTEGRITY_ROOT_CAUSE",
  "PARTICIPANT_CONTROL_UNCERTAINTY",
  "GATEWAY_PROCESSOR_TERMINOLOGY",
  "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE",
  "COST_INCIDENCE_UNCERTAINTY",
  "CONTRACT_OFF_STATEMENT_EVIDENCE_NEED",
] as const;

export type ShadowAiEconomicIssueClassV1 = typeof SHADOW_AI_ISSUE_CLASSES[number];

export const SHADOW_AI_EVIDENCE_CLASSES = [
  "ACCEPTED_STATEMENT_FACT",
  "GOVERNED_PUBLIC_SOURCE",
  "MERCHANT_ATTESTATION",
  "MERCHANT_CONTRACT_OR_SCHEDULE",
  "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA",
  "ADDITIONAL_COMPATIBLE_STATEMENT",
  "COMPARATOR_SOURCE_EVIDENCE",
  "DETERMINISTIC_RECONSTRUCTION_RECHECK",
] as const;

export type ShadowAiRequiredEvidenceClassV1 = typeof SHADOW_AI_EVIDENCE_CLASSES[number];

export type ShadowAiMerchantBusinessContextV1 = Readonly<{
  privacyClassification: "PURPOSE_BOUND_BUSINESS_IDENTITY";
  businessName: string | null;
  naturalPersonOrSoleProprietorAmbiguity: "POSSIBLE" | "NOT_INDICATED";
  admittedBusinessCategory: string | null;
  businessLocation: Readonly<{
    country: string | null;
    region: string | null;
    city: string | null;
  }>;
  knownChannel: string | null;
  acceptedAverageTicket: Readonly<{ amountMinor: number; currency: "USD" }> | null;
  supportedOperatingContext: readonly string[];
}>;

export type ShadowAiAcceptedActivityFactV1 = Readonly<{
  factRef: string;
  field: string;
  state: "KNOWN" | "KNOWN_ABSENT" | "UNKNOWN" | "NOT_APPLICABLE";
  value: number | Readonly<{ amountMinor: number; currency: "USD" }> | string | null;
  population: string;
  evidenceRefs: readonly string[];
}>;

export type ShadowAiParticipantControlStateV1 = Readonly<{
  rdChargeRef: string;
  collector: Readonly<{ state: string; value: string | null }>;
  economicBeneficiary: Readonly<{ state: string; value: string | null }>;
  ruleSetter: Readonly<{ state: string; value: string | null }>;
  priceSetter: Readonly<{ state: string; value: string | null }>;
  merchantFacingPriceController: Readonly<{ state: string; value: string | null }>;
}>;

export type ShadowAiEconomicResolutionIssueV1 = Readonly<{
  issueId: string;
  issueClass: ShadowAiEconomicIssueClassV1;
  selectionPriority: 1 | 2 | 3;
  decisionMaterialityTier: "D2" | "D1";
  selectedRdChargeRefs: readonly string[];
  sanitizedFeeLabels: readonly string[];
  acceptedEconomicCategories: readonly string[];
  acceptedSensitivityStates: readonly string[];
  acceptedQualificationIntegrityState: string;
  acceptedParticipantControlStates: readonly ShadowAiParticipantControlStateV1[];
  unresolvedClaimFacets: readonly string[];
  unresolvedReasonCodes: readonly string[];
  acceptedFactRefs: readonly string[];
  governedEvidenceRefs: readonly string[];
  allowedEvidenceClasses: readonly ShadowAiRequiredEvidenceClassV1[];
  prohibitedConclusions: readonly string[];
  competingHypothesisRequired: boolean;
  amountUnderReviewMinor: number | null;
  selectionReasonCodes: readonly string[];
}>;

export type ShadowAiEconomicResolutionSelectionV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_ECONOMIC_RESOLUTION_PLANNER_SCHEMA_VERSION;
  authority: "DETERMINISTIC_ISSUE_SELECTION";
  selectedIssues: readonly ShadowAiEconomicResolutionIssueV1[];
  suppressedIssues: readonly Readonly<{
    issueId: string;
    issueClass: ShadowAiEconomicIssueClassV1;
    reasonCode:
      | "ALREADY_RESOLVED_BY_GOVERNED_KNOWLEDGE"
      | "DUPLICATE_INVESTIGATION"
      | "IMMATERIAL_OR_CONTEXT_ONLY"
      | "NO_ACCEPTED_UNRESOLVED_INPUT"
      | "STATEMENT_ISSUE_BUDGET_EXHAUSTED";
  }>[];
}>;

export type ShadowAiEconomicResolutionPacketV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION;
  purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY";
  outputAuthorityRequired: "NON_AUTHORITATIVE";
  opaqueRunRef: string;
  issueId: string;
  issueClass: ShadowAiEconomicIssueClassV1;
  processorFamily: string | null;
  processorProgram: string | null;
  statementPeriod: Readonly<{ start: string; end: string }> | null;
  acceptedIssueRelevantActivityFacts: readonly ShadowAiAcceptedActivityFactV1[];
  selectedRdChargeRefs: readonly string[];
  sanitizedFeeLabels: readonly string[];
  acceptedEconomicCategories: readonly string[];
  acceptedSensitivityStates: readonly string[];
  acceptedQualificationIntegrityState: string;
  acceptedParticipantControlStates: readonly ShadowAiParticipantControlStateV1[];
  unresolvedClaimFacets: readonly string[];
  unresolvedReasonCodes: readonly string[];
  acceptedFactRefs: readonly string[];
  currentGovernedEvidenceRefs: readonly string[];
  allowedEvidenceClasses: readonly ShadowAiRequiredEvidenceClassV1[];
  prohibitedConclusions: readonly string[];
  merchantBusinessContext: ShadowAiMerchantBusinessContextV1 | null;
  competingHypothesisRequired: boolean;
  immutableInputHash: string;
}>;

export type ShadowAiHypothesisV1 = Readonly<{
  hypothesis: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  supportingFactRefs: readonly string[];
  contradictingFactRefs: readonly string[];
  acknowledgedEvidenceGaps: readonly string[];
  confirmationRequirements: readonly string[];
  falsificationConditions: readonly string[];
}>;

export type ShadowAiFinancialReconstructionSuspicionV1 = Readonly<{
  outcomeType: "FINANCIAL_RECONSTRUCTION_SUSPICION";
  authority: "NON_AUTHORITATIVE";
  admissionStatus: "NOT_ADMITTED";
  truthEffect: "NONE";
  financialMutationAllowed: false;
  exactAcceptedFactOrOccurrenceRefs: readonly string[];
  reasonForSuspicion: string;
  conflictingEvidenceRefs: readonly string[];
  requestedDeterministicRecheckType:
    | "PARSER_SOURCE_OCCURRENCE_RECHECK"
    | "RD_RECONCILIATION_RECHECK"
    | "POPULATION_IDENTITY_RECHECK"
    | "DIRECTION_SIGN_RECHECK"
    | "DUPLICATE_OCCURRENCE_RECHECK"
    | "ROUNDING_CONTROL_RECHECK";
}>;

export type ShadowAiEconomicResolutionPlanV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION;
  outputType: "AI_INFERENCE_ONLY";
  authority: "NON_AUTHORITATIVE";
  admissionStatus: "NOT_ADMITTED";
  truthEffect: "NONE";
  financialMutationAllowed: false;
  customerRenderingAllowed: false;
  issueId: string;
  inputHash: string;
  exactCitedFactRefs: readonly string[];
  unresolvedQuestion: string;
  primaryHypothesis: ShadowAiHypothesisV1;
  alternativeHypotheses: readonly ShadowAiHypothesisV1[];
  acknowledgedEvidenceGaps: readonly string[];
  recommendedResolutionPath: ShadowAiResolutionPathV1;
  requiredEvidenceClasses: readonly ShadowAiRequiredEvidenceClassV1[];
  researchQuerySuggestions: readonly string[];
  merchantQuestionSuggestions: readonly string[];
  documentRequestSuggestions: readonly string[];
  operationalDataRequests: readonly string[];
  internalExplanationDraft: string | null;
  unresolvedAfterAnalysis: true;
  limitationCodes: readonly string[];
  reconstructionSuspicions: readonly ShadowAiFinancialReconstructionSuspicionV1[];
}>;

export type ShadowAiPlannerProviderUsageV1 = Readonly<{
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsdMicros: number;
  latencyMs: number;
}>;

export type ShadowAiPlannerAdapterV1 = Readonly<{
  adapterId: string;
  transport: "PROVIDER" | "EVALUATION_STUB";
  invoke(input: Readonly<{
    manifest: typeof SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1;
    packets: readonly ShadowAiEconomicResolutionPacketV1[];
    signal: AbortSignal;
  }>): Promise<Readonly<{
    outputs: readonly unknown[];
    usage: ShadowAiPlannerProviderUsageV1;
  }>>;
}>;

export type ShadowAiEconomicResolutionPlannerRunV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_ECONOMIC_RESOLUTION_PLANNER_SCHEMA_VERSION;
  mode: "SHADOW";
  authority: "EVALUATION_ONLY";
  status: "COMPLETED" | "NOT_NEEDED" | "UNAVAILABLE" | "SAFETY_BLOCKED";
  selection: ShadowAiEconomicResolutionSelectionV1;
  packets: readonly ShadowAiEconomicResolutionPacketV1[];
  plans: readonly ShadowAiEconomicResolutionPlanV1[];
  invalidOutputs: readonly Readonly<{ issueId: string | null; errorCodes: readonly string[] }>[];
  accounting: Readonly<{
    plannerOperationCount: number;
    providerCallAttempts: number;
    providerCallCompleted: number;
    providerNetworkCalls: number;
    inputBytes: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsdMicros: number;
    latencyMs: number;
    retries: 0;
    researchOperations: 0;
    sourceAdmissions: 0;
  }>;
  deterministicResultPreserved: true;
  customerOutputCreated: false;
  limitationCodes: readonly string[];
}>;

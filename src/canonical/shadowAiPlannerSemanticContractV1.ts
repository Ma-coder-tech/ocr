import type {
  ShadowAiEconomicIssueClassV1,
  ShadowAiRequiredEvidenceClassV1,
  ShadowAiResolutionPathV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";

export const SHADOW_AI_GUIDANCE_CHANNELS_V1 = [
  "NONE",
  "PUBLIC_RESEARCH",
  "MERCHANT_INPUT",
  "DOCUMENT_REQUEST",
  "OPERATIONAL_DATA",
] as const;

export type ShadowAiGuidanceChannelV1 = typeof SHADOW_AI_GUIDANCE_CHANNELS_V1[number];

export type ShadowAiIssueSemanticContractV1 = Readonly<{
  resolutionPath: ShadowAiResolutionPathV1;
  requiredEvidenceClasses: readonly [ShadowAiRequiredEvidenceClassV1];
  guidanceChannel: ShadowAiGuidanceChannelV1;
}>;

const CONTRACTS: Readonly<Record<ShadowAiEconomicIssueClassV1, ShadowAiIssueSemanticContractV1>> = Object.freeze({
  SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS: contract(
    "PUBLIC_RESEARCH_REQUIRED", "GOVERNED_PUBLIC_SOURCE", "PUBLIC_RESEARCH",
  ),
  QUALIFICATION_INTEGRITY_ROOT_CAUSE: contract(
    "PROCESSOR_OR_GATEWAY_DATA_REQUIRED", "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", "OPERATIONAL_DATA",
  ),
  PARTICIPANT_CONTROL_UNCERTAINTY: contract(
    "PUBLIC_RESEARCH_REQUIRED", "GOVERNED_PUBLIC_SOURCE", "PUBLIC_RESEARCH",
  ),
  GATEWAY_PROCESSOR_TERMINOLOGY: contract(
    "PUBLIC_RESEARCH_REQUIRED", "GOVERNED_PUBLIC_SOURCE", "PUBLIC_RESEARCH",
  ),
  AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE: contract(
    "PROCESSOR_OR_GATEWAY_DATA_REQUIRED", "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", "OPERATIONAL_DATA",
  ),
  COST_INCIDENCE_UNCERTAINTY: contract(
    "MERCHANT_INPUT_REQUIRED", "MERCHANT_ATTESTATION", "MERCHANT_INPUT",
  ),
  CONTRACT_OFF_STATEMENT_EVIDENCE_NEED: contract(
    "DOCUMENT_REQUIRED", "MERCHANT_CONTRACT_OR_SCHEDULE", "DOCUMENT_REQUEST",
  ),
});

/**
 * Deterministic request policy. The model drafts hypotheses and bounded guidance;
 * it does not choose the authoritative routing/evidence envelope.
 */
export function shadowAiIssueSemanticContractV1(
  issueClass: ShadowAiEconomicIssueClassV1,
): ShadowAiIssueSemanticContractV1 {
  return CONTRACTS[issueClass];
}

function contract(
  resolutionPath: ShadowAiResolutionPathV1,
  requiredEvidenceClass: ShadowAiRequiredEvidenceClassV1,
  guidanceChannel: ShadowAiGuidanceChannelV1,
): ShadowAiIssueSemanticContractV1 {
  return Object.freeze({
    resolutionPath,
    requiredEvidenceClasses: Object.freeze([requiredEvidenceClass]) as readonly [ShadowAiRequiredEvidenceClassV1],
    guidanceChannel,
  });
}

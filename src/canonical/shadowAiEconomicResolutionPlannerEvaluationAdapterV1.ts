import { canonicalJson } from "./v2/canonicalJson.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
  type ShadowAiEconomicIssueClassV1,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiEconomicResolutionPlanV1,
  type ShadowAiHypothesisV1,
  type ShadowAiPlannerAdapterV1,
  type ShadowAiRequiredEvidenceClassV1,
  type ShadowAiResolutionPathV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import { shadowAiIssueSemanticContractV1 } from "./shadowAiPlannerSemanticContractV1.js";

/**
 * Offline-only evaluator. It exercises the full packet and output contracts without
 * calling a model, network, research tool, or admission path. It is intentionally
 * not exported from any production runtime entry point.
 */
export function createShadowAiEconomicResolutionEvaluationAdapterV1(): ShadowAiPlannerAdapterV1 {
  return Object.freeze({
    adapterId: "shadow-economic-resolution-offline-evaluation-v1",
    transport: "EVALUATION_STUB" as const,
    async invoke(input) {
      if (input.signal.aborted) throw new Error("shadow_planner_evaluation_aborted");
      const outputs = input.packets.map(buildEvaluationPlan);
      return Object.freeze({
        outputs,
        usage: Object.freeze({
          inputTokens: estimateTokens(canonicalJson(input.packets)),
          outputTokens: estimateTokens(canonicalJson(outputs)),
          estimatedCostUsdMicros: 0,
          latencyMs: 0,
        }),
      });
    },
  });
}

function buildEvaluationPlan(packet: ShadowAiEconomicResolutionPacketV1): ShadowAiEconomicResolutionPlanV1 {
  const semanticContract = shadowAiIssueSemanticContractV1(packet.issueClass);
  const route = semanticContract.resolutionPath;
  const cited = [...packet.acceptedFactRefs];
  const support = unique([
    ...packet.acceptedFactRefs,
    ...packet.currentGovernedEvidenceRefs,
    ...packet.selectedRdChargeRefs,
    ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef),
  ]).slice(0, 2);
  const gap = gapFor(packet.issueClass);
  const primary = hypothesis(
    primaryText(packet.issueClass), support, gap,
    confirmationFor(route), falsificationFor(packet.issueClass), support.length > 0 ? "MEDIUM" : "LOW",
  );
  const alternatives = packet.competingHypothesisRequired
    ? [hypothesis(
      alternativeText(packet.issueClass), support.slice(0, 1), gap,
      alternativeConfirmationFor(route), alternativeFalsificationFor(packet.issueClass), "LOW",
    )]
    : [];
  const requiredEvidence = [...semanticContract.requiredEvidenceClasses];

  return deepFreeze({
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
    outputType: "AI_INFERENCE_ONLY",
    authority: "NON_AUTHORITATIVE",
    admissionStatus: "NOT_ADMITTED",
    truthEffect: "NONE",
    financialMutationAllowed: false,
    customerRenderingAllowed: false,
    issueId: packet.issueId,
    inputHash: packet.immutableInputHash,
    exactCitedFactRefs: cited,
    unresolvedQuestion: questionFor(packet.issueClass),
    primaryHypothesis: primary,
    alternativeHypotheses: alternatives,
    acknowledgedEvidenceGaps: [gap],
    recommendedResolutionPath: route,
    requiredEvidenceClasses: requiredEvidence,
    researchQuerySuggestions: route === "PUBLIC_RESEARCH_REQUIRED"
      ? [publicQueryFor(packet)] : [],
    merchantQuestionSuggestions: route === "MERCHANT_INPUT_REQUIRED"
      ? ["Does the business use a surcharge, cash-discount, or other cost-offset program during this statement period?"] : [],
    documentRequestSuggestions: route === "DOCUMENT_REQUIRED"
      ? ["Obtain the merchant agreement and pricing schedule covering the statement period."] : [],
    operationalDataRequests: route === "PROCESSOR_OR_GATEWAY_DATA_REQUIRED"
      ? ["Request the period-matched authorization, approval, settlement, and qualification detail with documented population definitions."] : [],
    internalExplanationDraft: "This is an internal, non-authoritative planning inference. The accepted economics remain unchanged until governed evidence resolves the stated gap.",
    unresolvedAfterAnalysis: true,
    limitationCodes: ["offline_evaluation_stub", "no_new_evidence_admitted", "deterministic_inputs_unchanged"],
    reconstructionSuspicions: [],
  });
}

function hypothesis(
  text: string,
  refs: readonly string[],
  gap: string,
  confirmation: string,
  falsification: string,
  confidence: ShadowAiHypothesisV1["confidence"],
): ShadowAiHypothesisV1 {
  return {
    hypothesis: text,
    confidence,
    supportingFactRefs: [...refs],
    contradictingFactRefs: [],
    acknowledgedEvidenceGaps: [gap],
    confirmationRequirements: [confirmation],
    falsificationConditions: [falsification],
  };
}

function questionFor(issueClass: ShadowAiEconomicIssueClassV1): string {
  const questions: Record<ShadowAiEconomicIssueClassV1, string> = {
    SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS: "What evidence can separate the bundled charge into supported economic roles?",
    QUALIFICATION_INTEGRITY_ROOT_CAUSE: "What period-matched operational condition accounts for the accepted qualification or integrity condition?",
    PARTICIPANT_CONTROL_UNCERTAINTY: "Which participant held the relevant rule-setting and merchant-facing price-control roles for this charge?",
    GATEWAY_PROCESSOR_TERMINOLOGY: "Which service role does the printed gateway or processor terminology represent in this context?",
    AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE: "Which defined authorization, approval, and settlement populations apply to the period?",
    COST_INCIDENCE_UNCERTAINTY: "Was any accepted processing cost offset by a merchant-operated program during the period?",
    CONTRACT_OFF_STATEMENT_EVIDENCE_NEED: "Which period-effective contract terms govern the charge and change authority?",
  };
  return questions[issueClass];
}

function primaryText(issueClass: ShadowAiEconomicIssueClassV1): string {
  const values: Record<ShadowAiEconomicIssueClassV1, string> = {
    SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS: "The charge may combine more than one service role that the accepted statement facts do not separate.",
    QUALIFICATION_INTEGRITY_ROOT_CAUSE: "A period-specific operational condition may account for the accepted qualification or integrity condition.",
    PARTICIPANT_CONTROL_UNCERTAINTY: "The collecting participant may differ from the rule setter or merchant-facing price controller.",
    GATEWAY_PROCESSOR_TERMINOLOGY: "The printed term may describe a technical service role without establishing the economic beneficiary or price controller.",
    AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE: "The available activity populations may use different definitions and therefore cannot yet be compared.",
    COST_INCIDENCE_UNCERTAINTY: "The statement alone may be insufficient to determine whether a separate merchant program offset any processing cost.",
    CONTRACT_OFF_STATEMENT_EVIDENCE_NEED: "The period-effective agreement may contain the missing control and pricing terms.",
  };
  return values[issueClass];
}

function alternativeText(issueClass: ShadowAiEconomicIssueClassV1): string {
  return issueClass === "COST_INCIDENCE_UNCERTAINTY"
    ? "No separate offset program may have operated during the period, but statement silence does not establish that state."
    : "The unresolved state may reflect a documentation or population-definition gap rather than the proposed operational explanation.";
}

function gapFor(issueClass: ShadowAiEconomicIssueClassV1): string {
  const values: Record<ShadowAiEconomicIssueClassV1, string> = {
    SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS: "No governed source currently separates the bundled components for this exact context.",
    QUALIFICATION_INTEGRITY_ROOT_CAUSE: "Period-matched qualification and operational detail is absent from accepted evidence.",
    PARTICIPANT_CONTROL_UNCERTAINTY: "Accepted evidence does not establish each participant's contractual role.",
    GATEWAY_PROCESSOR_TERMINOLOGY: "The printed term is not bound to a governed service-role definition for this program.",
    AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE: "Comparable authorization, approval, and settlement population definitions are missing.",
    COST_INCIDENCE_UNCERTAINTY: "Accepted evidence does not establish merchant program use or cost-offset revenue.",
    CONTRACT_OFF_STATEMENT_EVIDENCE_NEED: "The period-effective merchant agreement and pricing schedule are not accepted evidence.",
  };
  return values[issueClass];
}

function confirmationFor(route: ShadowAiResolutionPathV1): string {
  if (route === "PUBLIC_RESEARCH_REQUIRED") return "A governed public source must match the processor, program, period, and exact terminology.";
  if (route === "MERCHANT_INPUT_REQUIRED") return "A period-specific merchant attestation must describe the program and its operation.";
  if (route === "DOCUMENT_REQUIRED") return "A period-effective signed agreement or pricing schedule must state the relevant term.";
  return "Processor or gateway data must define each population and bind it to the statement period.";
}

function alternativeConfirmationFor(route: ShadowAiResolutionPathV1): string {
  return `Independent ${route.toLowerCase().replaceAll("_", " ")} evidence must support the alternative explanation.`;
}

function falsificationFor(issueClass: ShadowAiEconomicIssueClassV1): string {
  return `Period-matched governed evidence assigning a different state to ${issueClass.toLowerCase().replaceAll("_", " ")} would falsify this hypothesis.`;
}

function alternativeFalsificationFor(issueClass: ShadowAiEconomicIssueClassV1): string {
  return `Complete period-matched evidence resolving ${issueClass.toLowerCase().replaceAll("_", " ")} without the proposed gap would falsify the alternative.`;
}

function publicQueryFor(packet: ShadowAiEconomicResolutionPacketV1): string {
  const processor = packet.processorFamily ?? "payment processor";
  const labels = packet.sanitizedFeeLabels.slice(0, 2).join(" ") || packet.issueClass.toLowerCase().replaceAll("_", " ");
  return `${processor} ${labels} official documentation service role and pricing control`;
}

function estimateTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, "utf8") / 4);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}

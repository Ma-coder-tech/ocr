import { canonicalJson } from "./v2/canonicalJson.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
  SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
  SHADOW_AI_ECONOMIC_RESOLUTION_PLANNER_SCHEMA_VERSION,
  SHADOW_AI_EVIDENCE_CLASSES,
  SHADOW_AI_RESOLUTION_PATHS,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiEconomicResolutionPlanV1,
  type ShadowAiEconomicResolutionPlannerRunV1,
  type ShadowAiEconomicResolutionSelectionV1,
  type ShadowAiFinancialReconstructionSuspicionV1,
  type ShadowAiHypothesisV1,
  type ShadowAiPlannerAdapterV1,
  type ShadowAiPlannerProviderUsageV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "./shadowAiEconomicResolutionIssueSelectionV1.js";
import { shadowAiIssueSemanticContractV1 } from "./shadowAiPlannerSemanticContractV1.js";

const PLAN_KEYS = new Set([
  "schemaVersion", "outputType", "authority", "admissionStatus", "truthEffect",
  "financialMutationAllowed", "customerRenderingAllowed", "issueId", "inputHash",
  "exactCitedFactRefs", "unresolvedQuestion", "primaryHypothesis", "alternativeHypotheses",
  "acknowledgedEvidenceGaps", "recommendedResolutionPath", "requiredEvidenceClasses",
  "researchQuerySuggestions", "merchantQuestionSuggestions", "documentRequestSuggestions",
  "operationalDataRequests", "internalExplanationDraft", "unresolvedAfterAnalysis",
  "limitationCodes", "reconstructionSuspicions",
]);

const HYPOTHESIS_KEYS = new Set([
  "hypothesis", "confidence", "supportingFactRefs", "contradictingFactRefs",
  "acknowledgedEvidenceGaps", "confirmationRequirements", "falsificationConditions",
]);

const SUSPICION_KEYS = new Set([
  "outcomeType", "authority", "admissionStatus", "truthEffect", "financialMutationAllowed",
  "exactAcceptedFactOrOccurrenceRefs", "reasonForSuspicion", "conflictingEvidenceRefs",
  "requestedDeterministicRecheckType",
]);

export function validateShadowAiEconomicResolutionPlanV1(
  raw: unknown,
  packet: ShadowAiEconomicResolutionPacketV1,
): { ok: true; plan: ShadowAiEconomicResolutionPlanV1; errors: [] } |
   { ok: false; plan: null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, plan: null, errors: ["shadow_planner_output_not_object"] };
  exactKeys(raw, PLAN_KEYS, "output", errors);
  if (raw.schemaVersion !== SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION) errors.push("shadow_planner_output_schema_invalid");
  if (raw.outputType !== "AI_INFERENCE_ONLY" || raw.authority !== "NON_AUTHORITATIVE" ||
      raw.admissionStatus !== "NOT_ADMITTED" || raw.truthEffect !== "NONE" ||
      raw.financialMutationAllowed !== false || raw.customerRenderingAllowed !== false) {
    errors.push("shadow_planner_output_authority_invalid");
  }
  if (raw.issueId !== packet.issueId || raw.inputHash !== packet.immutableInputHash) errors.push("shadow_planner_output_binding_invalid");
  if (raw.unresolvedAfterAnalysis !== true) errors.push("shadow_planner_output_must_remain_unresolved");

  const allowedFactRefs = new Set(packet.acceptedFactRefs);
  const allowedSupportRefs = new Set([
    ...allowedFactRefs,
    ...packet.currentGovernedEvidenceRefs,
    ...packet.selectedRdChargeRefs,
    ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef),
  ]);
  const cited = strings(raw.exactCitedFactRefs, "exactCitedFactRefs", errors);
  if (cited.some((ref) => !allowedFactRefs.has(ref))) errors.push("shadow_planner_hallucinated_fact_ref");
  if (cited.length === 0 && allowedFactRefs.size > 0) errors.push("shadow_planner_missing_fact_citation");

  const primary = hypothesis(raw.primaryHypothesis, "primaryHypothesis", allowedSupportRefs, allowedSupportRefs.size > 0, errors);
  const alternatives = array(raw.alternativeHypotheses, "alternativeHypotheses", errors)
    .map((item, index) => hypothesis(item, `alternativeHypotheses[${index}]`, allowedSupportRefs, allowedSupportRefs.size > 0, errors))
    .filter((item): item is ShadowAiHypothesisV1 => item !== null);
  if (packet.competingHypothesisRequired && alternatives.length === 0) errors.push("shadow_planner_competing_hypothesis_required");
  if (primary && primary.acknowledgedEvidenceGaps.length === 0) errors.push("shadow_planner_primary_evidence_gap_required");

  const unresolvedQuestion = text(raw.unresolvedQuestion, "unresolvedQuestion", errors);
  const evidenceGaps = strings(raw.acknowledgedEvidenceGaps, "acknowledgedEvidenceGaps", errors);
  if (evidenceGaps.length === 0) errors.push("shadow_planner_evidence_gap_required");
  const resolutionPath = SHADOW_AI_RESOLUTION_PATHS.includes(raw.recommendedResolutionPath as never)
    ? raw.recommendedResolutionPath as ShadowAiEconomicResolutionPlanV1["recommendedResolutionPath"] : null;
  if (!resolutionPath) errors.push("shadow_planner_resolution_path_invalid");
  const evidenceClasses = strings(raw.requiredEvidenceClasses, "requiredEvidenceClasses", errors);
  if (evidenceClasses.some((value) => !SHADOW_AI_EVIDENCE_CLASSES.includes(value as never)
    || !packet.allowedEvidenceClasses.includes(value as never))) errors.push("shadow_planner_required_evidence_class_invalid");
  const research = strings(raw.researchQuerySuggestions, "researchQuerySuggestions", errors);
  const merchant = strings(raw.merchantQuestionSuggestions, "merchantQuestionSuggestions", errors);
  const documents = strings(raw.documentRequestSuggestions, "documentRequestSuggestions", errors);
  const operational = strings(raw.operationalDataRequests, "operationalDataRequests", errors);
  const semanticContract = shadowAiIssueSemanticContractV1(packet.issueClass);
  if (resolutionPath !== semanticContract.resolutionPath) errors.push("shadow_planner_resolution_path_contract_mismatch");
  if (canonicalJson([...evidenceClasses].sort()) !== canonicalJson([...semanticContract.requiredEvidenceClasses].sort())) {
    errors.push("shadow_planner_required_evidence_contract_mismatch");
  }
  const guidance = { PUBLIC_RESEARCH: research, MERCHANT_INPUT: merchant, DOCUMENT_REQUEST: documents, OPERATIONAL_DATA: operational } as const;
  for (const [channel, values] of Object.entries(guidance)) {
    const selected = channel === semanticContract.guidanceChannel;
    if (selected && values.length === 0) errors.push("shadow_planner_required_guidance_channel_empty");
    if (!selected && values.length > 0) errors.push("shadow_planner_cross_channel_guidance_forbidden");
  }

  const internalExplanationDraft = raw.internalExplanationDraft === null
    ? null : text(raw.internalExplanationDraft, "internalExplanationDraft", errors);
  const limitationCodes = strings(raw.limitationCodes, "limitationCodes", errors);
  if (limitationCodes.length === 0) errors.push("shadow_planner_limitation_code_required");
  const suspicions = array(raw.reconstructionSuspicions, "reconstructionSuspicions", errors)
    .map((item, index) => suspicion(item, `reconstructionSuspicions[${index}]`, allowedSupportRefs, errors))
    .filter((item): item is ShadowAiFinancialReconstructionSuspicionV1 => item !== null);
  if (suspicions.length > 0) errors.push("shadow_planner_reconstruction_suspicion_not_allowed_without_accepted_conflict");

  const hypothesisLanguage = (item: ShadowAiHypothesisV1): string[] => [
    item.hypothesis,
    ...item.acknowledgedEvidenceGaps,
    ...item.confirmationRequirements,
    ...item.falsificationConditions,
  ];
  const language = [
    unresolvedQuestion,
    internalExplanationDraft,
    ...evidenceGaps,
    ...limitationCodes,
    ...(primary ? hypothesisLanguage(primary) : []),
    ...alternatives.flatMap(hypothesisLanguage),
    ...research,
    ...merchant,
    ...documents,
    ...operational,
    ...suspicions.map((item) => item.reasonForSuspicion),
  ]
    .filter((value): value is string => Boolean(value)).join(" ");
  if (FORBIDDEN_CONCLUSION.test(language)) errors.push("shadow_planner_forbidden_conclusion");
  if (CUSTOMER_LANGUAGE.test(language)) errors.push("shadow_planner_customer_facing_language_forbidden");

  if (errors.length > 0 || !primary || !resolutionPath) return { ok: false, plan: null, errors: unique(errors).sort() };
  const plan: ShadowAiEconomicResolutionPlanV1 = {
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
    unresolvedQuestion: unresolvedQuestion!,
    primaryHypothesis: primary,
    alternativeHypotheses: alternatives,
    acknowledgedEvidenceGaps: evidenceGaps,
    recommendedResolutionPath: resolutionPath,
    requiredEvidenceClasses: evidenceClasses as ShadowAiEconomicResolutionPlanV1["requiredEvidenceClasses"],
    researchQuerySuggestions: research,
    merchantQuestionSuggestions: merchant,
    documentRequestSuggestions: documents,
    operationalDataRequests: operational,
    internalExplanationDraft,
    unresolvedAfterAnalysis: true,
    limitationCodes,
    reconstructionSuspicions: suspicions,
  };
  return { ok: true, plan: deepFreeze(plan), errors: [] };
}

export async function runShadowAiEconomicResolutionPlannerV1(input: {
  selection: ShadowAiEconomicResolutionSelectionV1;
  packets: readonly ShadowAiEconomicResolutionPacketV1[];
  adapter?: ShadowAiPlannerAdapterV1 | null;
}): Promise<ShadowAiEconomicResolutionPlannerRunV1> {
  if (input.selection.selectedIssues.length !== input.packets.length || input.packets.some((packet, index) =>
    packet.issueId !== input.selection.selectedIssues[index]?.issueId)) throw new Error("shadow_planner_selection_packet_binding_invalid");
  const inputBytes = Buffer.byteLength(canonicalJson(input.packets), "utf8");
  const privacyErrors = unique(input.packets.flatMap((packet) => inspectShadowAiEconomicResolutionPacketPrivacyV1(packet).reasonCodes));
  if (privacyErrors.length > 0) {
    return result(input, "SAFETY_BLOCKED", [], [{ issueId: null, errorCodes: privacyErrors }],
      emptyUsage(inputBytes), ["planner_packet_privacy_rejected"]);
  }
  if (inputBytes > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumInputBytes) {
    return result(input, "SAFETY_BLOCKED", [], [{ issueId: null, errorCodes: ["shadow_planner_input_budget_exceeded"] }],
      emptyUsage(inputBytes), ["input_budget_exceeded"]);
  }
  if (input.packets.length === 0) return result(input, "NOT_NEEDED", [], [], emptyUsage(inputBytes), ["no_selected_issues"]);
  if (!input.adapter) return result(input, "UNAVAILABLE", [], [], emptyUsage(inputBytes), ["planner_adapter_unavailable"]);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const operation = Promise.resolve()
    .then(() => input.adapter!.invoke({ manifest: SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1, packets: input.packets, signal: controller.signal }))
    .then((value) => ({ kind: "value" as const, value }))
    .catch((error) => ({ kind: "error" as const, error }));
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ kind: "timeout" }); }, SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.timeoutMs);
    timer.unref?.();
  });
  const completed = await Promise.race([operation, timeout]);
  if (completed.kind !== "timeout" && timer) clearTimeout(timer);
  if (completed.kind === "timeout") {
    void operation;
    return result(input, "UNAVAILABLE", [], [], accounting(input, inputBytes, null, false), ["planner_timed_out"]);
  }
  if (completed.kind === "error") {
    return result(input, "UNAVAILABLE", [], [], accounting(input, inputBytes, null, false), ["planner_provider_failed"]);
  }
  const usageErrors = validateUsage(completed.value.usage);
  if (usageErrors.length > 0) {
    return result(input, "SAFETY_BLOCKED", [], [{ issueId: null, errorCodes: usageErrors }],
      accounting(input, inputBytes, completed.value.usage, true), ["planner_usage_invalid"]);
  }

  const plans: ShadowAiEconomicResolutionPlanV1[] = [];
  const invalid: Array<{ issueId: string | null; errorCodes: string[] }> = [];
  for (const [index, packet] of input.packets.entries()) {
    const validated = validateShadowAiEconomicResolutionPlanV1(completed.value.outputs[index], packet);
    if (validated.ok) plans.push(validated.plan);
    else invalid.push({ issueId: packet.issueId, errorCodes: validated.errors });
  }
  if (completed.value.outputs.length !== input.packets.length) {
    invalid.push({ issueId: null, errorCodes: ["shadow_planner_output_coverage_invalid"] });
  }
  return result(input, invalid.length > 0 ? "SAFETY_BLOCKED" : "COMPLETED", plans, invalid,
    accounting(input, inputBytes, completed.value.usage, true), invalid.length > 0 ? ["planner_output_rejected"] : []);
}

function hypothesis(
  value: unknown,
  path: string,
  allowedRefs: Set<string>,
  supportRequired: boolean,
  errors: string[],
): ShadowAiHypothesisV1 | null {
  if (!isRecord(value)) { errors.push(`${path}_invalid`); return null; }
  exactKeys(value, HYPOTHESIS_KEYS, path, errors);
  const hypothesisText = text(value.hypothesis, `${path}.hypothesis`, errors);
  const confidence = ["LOW", "MEDIUM", "HIGH"].includes(String(value.confidence))
    ? value.confidence as ShadowAiHypothesisV1["confidence"] : null;
  if (!confidence) errors.push(`${path}_confidence_invalid`);
  const supporting = strings(value.supportingFactRefs, `${path}.supportingFactRefs`, errors);
  const contradicting = strings(value.contradictingFactRefs, `${path}.contradictingFactRefs`, errors);
  if ([...supporting, ...contradicting].some((ref) => !allowedRefs.has(ref))) errors.push("shadow_planner_hallucinated_evidence_ref");
  const gaps = strings(value.acknowledgedEvidenceGaps, `${path}.acknowledgedEvidenceGaps`, errors);
  const confirmations = strings(value.confirmationRequirements, `${path}.confirmationRequirements`, errors);
  const falsifiers = strings(value.falsificationConditions, `${path}.falsificationConditions`, errors);
  if (gaps.length === 0 || confirmations.length === 0 || falsifiers.length === 0) errors.push(`${path}_epistemic_boundary_incomplete`);
  if (supportRequired && supporting.length === 0) errors.push(`${path}_issue_supporting_reference_required`);
  if (!supportRequired && supporting.length > 0) errors.push(`${path}_support_forbidden_without_issue_supporting_reference`);
  if (!supportRequired && confidence !== "LOW") errors.push(`${path}_low_confidence_required_without_issue_supporting_reference`);
  if (!hypothesisText || !confidence) return null;
  return { hypothesis: hypothesisText, confidence, supportingFactRefs: supporting, contradictingFactRefs: contradicting,
    acknowledgedEvidenceGaps: gaps, confirmationRequirements: confirmations, falsificationConditions: falsifiers };
}

function suspicion(value: unknown, path: string, allowedRefs: Set<string>, errors: string[]): ShadowAiFinancialReconstructionSuspicionV1 | null {
  if (!isRecord(value)) { errors.push(`${path}_invalid`); return null; }
  exactKeys(value, SUSPICION_KEYS, path, errors);
  if (value.outcomeType !== "FINANCIAL_RECONSTRUCTION_SUSPICION" || value.authority !== "NON_AUTHORITATIVE" ||
      value.admissionStatus !== "NOT_ADMITTED" || value.truthEffect !== "NONE" || value.financialMutationAllowed !== false) {
    errors.push("shadow_planner_reconstruction_suspicion_authority_invalid");
  }
  const refs = strings(value.exactAcceptedFactOrOccurrenceRefs, `${path}.exactAcceptedFactOrOccurrenceRefs`, errors);
  if (refs.length === 0) errors.push("shadow_planner_reconstruction_suspicion_exact_ref_required");
  const evidence = strings(value.conflictingEvidenceRefs, `${path}.conflictingEvidenceRefs`, errors);
  if (evidence.length === 0) errors.push("shadow_planner_reconstruction_suspicion_conflicting_ref_required");
  if (refs.some((reference) => evidence.includes(reference))) errors.push("shadow_planner_reconstruction_suspicion_conflict_refs_not_distinct");
  if ([...refs, ...evidence].some((ref) => !allowedRefs.has(ref))) errors.push("shadow_planner_reconstruction_suspicion_reference_invalid");
  const reason = text(value.reasonForSuspicion, `${path}.reasonForSuspicion`, errors);
  const recheck = ["PARSER_SOURCE_OCCURRENCE_RECHECK", "RD_RECONCILIATION_RECHECK", "POPULATION_IDENTITY_RECHECK",
    "DIRECTION_SIGN_RECHECK", "DUPLICATE_OCCURRENCE_RECHECK", "ROUNDING_CONTROL_RECHECK"].includes(String(value.requestedDeterministicRecheckType))
    ? value.requestedDeterministicRecheckType as ShadowAiFinancialReconstructionSuspicionV1["requestedDeterministicRecheckType"] : null;
  if (!recheck) errors.push("shadow_planner_reconstruction_suspicion_recheck_invalid");
  if (!reason || !recheck) return null;
  return { outcomeType: "FINANCIAL_RECONSTRUCTION_SUSPICION", authority: "NON_AUTHORITATIVE", admissionStatus: "NOT_ADMITTED",
    truthEffect: "NONE", financialMutationAllowed: false, exactAcceptedFactOrOccurrenceRefs: refs,
    reasonForSuspicion: reason, conflictingEvidenceRefs: evidence, requestedDeterministicRecheckType: recheck };
}

function validateUsage(usage: ShadowAiPlannerProviderUsageV1): string[] {
  if (!isRecord(usage)) return ["shadow_planner_usage_missing"];
  const errors: string[] = [];
  for (const key of ["inputTokens", "outputTokens", "estimatedCostUsdMicros", "latencyMs"] as const) {
    if (!Number.isSafeInteger(usage[key]) || usage[key] < 0) errors.push(`shadow_planner_usage_${key}_invalid`);
  }
  if (usage.outputTokens > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumOutputTokens) errors.push("shadow_planner_output_token_budget_exceeded");
  if (usage.estimatedCostUsdMicros > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumEstimatedCostUsdMicros) errors.push("shadow_planner_cost_budget_exceeded");
  return errors;
}

function result(
  input: { selection: ShadowAiEconomicResolutionSelectionV1; packets: readonly ShadowAiEconomicResolutionPacketV1[]; adapter?: ShadowAiPlannerAdapterV1 | null },
  status: ShadowAiEconomicResolutionPlannerRunV1["status"],
  plans: readonly ShadowAiEconomicResolutionPlanV1[],
  invalidOutputs: readonly { issueId: string | null; errorCodes: readonly string[] }[],
  runAccounting: ShadowAiEconomicResolutionPlannerRunV1["accounting"],
  limitationCodes: readonly string[],
): ShadowAiEconomicResolutionPlannerRunV1 {
  return deepFreeze({
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PLANNER_SCHEMA_VERSION,
    mode: "SHADOW",
    authority: "EVALUATION_ONLY",
    status,
    selection: input.selection,
    packets: input.packets,
    plans,
    invalidOutputs,
    accounting: runAccounting,
    deterministicResultPreserved: true,
    customerOutputCreated: false,
    limitationCodes,
  });
}

function emptyUsage(inputBytes: number): ShadowAiEconomicResolutionPlannerRunV1["accounting"] {
  return { plannerOperationCount: 0, providerCallAttempts: 0, providerCallCompleted: 0, providerNetworkCalls: 0,
    inputBytes, inputTokens: 0, outputTokens: 0, estimatedCostUsdMicros: 0, latencyMs: 0, retries: 0,
    researchOperations: 0, sourceAdmissions: 0 };
}

function accounting(
  input: { adapter?: ShadowAiPlannerAdapterV1 | null },
  inputBytes: number,
  usage: ShadowAiPlannerProviderUsageV1 | null,
  completed: boolean,
): ShadowAiEconomicResolutionPlannerRunV1["accounting"] {
  return {
    plannerOperationCount: 1,
    providerCallAttempts: input.adapter?.transport === "PROVIDER" ? 1 : 0,
    providerCallCompleted: input.adapter?.transport === "PROVIDER" && completed ? 1 : 0,
    providerNetworkCalls: input.adapter?.transport === "PROVIDER" ? 1 : 0,
    inputBytes,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    estimatedCostUsdMicros: usage?.estimatedCostUsdMicros ?? 0,
    latencyMs: usage?.latencyMs ?? 0,
    retries: 0,
    researchOperations: 0,
    sourceAdmissions: 0,
  };
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]): void {
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length > 0) errors.push(`${path}_unknown_keys:${extra.sort().join(",")}`);
  const missing = [...allowed].filter((key) => !(key in value));
  if (missing.length > 0) errors.push(`${path}_missing_keys:${missing.sort().join(",")}`);
}

function strings(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > 500)) {
    errors.push(`${path}_invalid`);
    return [];
  }
  if (new Set(value).size !== value.length) errors.push(`${path}_duplicates`);
  return value.map((item) => item.trim());
}

function array(value: unknown, path: string, errors: string[]): unknown[] {
  if (!Array.isArray(value)) { errors.push(`${path}_invalid`); return []; }
  return value;
}

function text(value: unknown, path: string, errors: string[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2_000) {
    errors.push(`${path}_invalid`);
    return null;
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const FORBIDDEN_CONCLUSION = /\b(?:savings?|save\s+\$|overpaid|overpaying|annual(?:ize|ized|ization)|avoidable|merchant\s+(?:fault|blame|responsible)|processor\s+(?:fault|blame|responsible)|should\s+switch|better\s+provider|guaranteed|definitely\s+(?:means|is|caused))\b/i;
const CUSTOMER_LANGUAGE = /\b(?:dear merchant|we recommend that you|your savings|take this action now)\b/i;

function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}

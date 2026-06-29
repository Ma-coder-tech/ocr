export const FISERV_AI_PAID_TO_PARTIES = [
  "card_network",
  "issuer_or_interchange",
  "processor_or_iso",
  "third_party",
  "unknown",
] as const;

export const FISERV_AI_PASS_THROUGH_PROOF_POSTURES = [
  "source_backed_math_candidate",
  "not_applicable_processor_controlled",
  "not_pass_through",
  "not_enough_evidence",
] as const;

export const FISERV_AI_NEGOTIABILITY_VALUES = ["likely_negotiable", "likely_non_negotiable", "unknown"] as const;
export const FISERV_AI_AVOIDABLE_LIKELIHOOD_VALUES = ["high", "medium", "low", "unknown"] as const;
export const FISERV_AI_MERCHANT_ACTIONS = [
  "request_fee_removal_or_reduction",
  "request_pass_through_documentation",
  "verify_service_or_contract",
  "fix_terminal_or_gateway_configuration",
  "monitor",
  "none",
] as const;

export type FiservAiPaidToParty = (typeof FISERV_AI_PAID_TO_PARTIES)[number];
export type FiservAiPassThroughProofPosture = (typeof FISERV_AI_PASS_THROUGH_PROOF_POSTURES)[number];
export type FiservAiNegotiability = (typeof FISERV_AI_NEGOTIABILITY_VALUES)[number];
export type FiservAiAvoidableLikelihood = (typeof FISERV_AI_AVOIDABLE_LIKELIHOOD_VALUES)[number];
export type FiservAiMerchantAction = (typeof FISERV_AI_MERCHANT_ACTIONS)[number];

export type FiservAiFeeAssessment = {
  paidToParty: FiservAiPaidToParty;
  passThroughProofPosture: FiservAiPassThroughProofPosture;
  negotiability: FiservAiNegotiability;
  avoidableLikelihood: FiservAiAvoidableLikelihood;
  merchantAction: FiservAiMerchantAction;
  recommendation: string | null;
  evidence: string[];
  sourceEvidence: {
    sourceName: string | null;
    referenceId: string | null;
    referenceRate: number | null;
    statementRate: number | null;
    statementAmount: number | null;
    mathSummary: string | null;
    verificationNote: string;
  };
};

type AssessmentDefaults = {
  paidToParty: FiservAiPaidToParty;
  passThroughProofPosture: FiservAiPassThroughProofPosture;
  negotiability: FiservAiNegotiability;
  avoidableLikelihood?: FiservAiAvoidableLikelihood;
  merchantAction?: FiservAiMerchantAction;
  recommendation?: string | null;
  evidence?: string[];
  sourceEvidence?: Partial<FiservAiFeeAssessment["sourceEvidence"]>;
};

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function shortText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeFiservAiFeeAssessment(
  value: unknown,
  defaults: AssessmentDefaults,
): FiservAiFeeAssessment {
  const candidate = value && typeof value === "object" ? (value as Partial<FiservAiFeeAssessment>) : {};
  const sourceCandidate =
    candidate.sourceEvidence && typeof candidate.sourceEvidence === "object"
      ? candidate.sourceEvidence
      : ({} as Partial<FiservAiFeeAssessment["sourceEvidence"]>);
  const defaultSource = defaults.sourceEvidence ?? {};
  const evidence = Array.isArray(candidate.evidence)
    ? candidate.evidence.map((item) => shortText(item, 240)).filter((item): item is string => Boolean(item)).slice(0, 6)
    : [];
  const defaultEvidence = (defaults.evidence ?? []).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6);
  const sourceName = shortText(sourceCandidate.sourceName, 160) ?? defaultSource.sourceName ?? null;
  const referenceId = shortText(sourceCandidate.referenceId, 80) ?? defaultSource.referenceId ?? null;
  const referenceRate = finiteNumber(sourceCandidate.referenceRate) ?? defaultSource.referenceRate ?? null;
  const statementRate = finiteNumber(sourceCandidate.statementRate) ?? defaultSource.statementRate ?? null;
  const statementAmount = finiteNumber(sourceCandidate.statementAmount) ?? defaultSource.statementAmount ?? null;
  const mathSummary = shortText(sourceCandidate.mathSummary, 360) ?? defaultSource.mathSummary ?? null;
  const requestedProofPosture = enumValue(
    candidate.passThroughProofPosture,
    FISERV_AI_PASS_THROUGH_PROOF_POSTURES,
    defaults.passThroughProofPosture,
  );
  const hasSourceEvidence = Boolean(sourceName || referenceId);
  const hasMathEvidence = Boolean(mathSummary || referenceRate !== null || statementRate !== null || statementAmount !== null);
  const passThroughProofPosture =
    requestedProofPosture === "source_backed_math_candidate" && (!hasSourceEvidence || !hasMathEvidence)
      ? "not_enough_evidence"
      : requestedProofPosture;

  return {
    paidToParty: enumValue(candidate.paidToParty, FISERV_AI_PAID_TO_PARTIES, defaults.paidToParty),
    passThroughProofPosture,
    negotiability: enumValue(candidate.negotiability, FISERV_AI_NEGOTIABILITY_VALUES, defaults.negotiability),
    avoidableLikelihood: enumValue(
      candidate.avoidableLikelihood,
      FISERV_AI_AVOIDABLE_LIKELIHOOD_VALUES,
      defaults.avoidableLikelihood ?? "unknown",
    ),
    merchantAction: enumValue(candidate.merchantAction, FISERV_AI_MERCHANT_ACTIONS, defaults.merchantAction ?? "none"),
    recommendation: shortText(candidate.recommendation, 500) ?? defaults.recommendation ?? null,
    evidence: evidence.length > 0 ? evidence : defaultEvidence,
    sourceEvidence: {
      sourceName,
      referenceId,
      referenceRate,
      statementRate,
      statementAmount,
      mathSummary,
      verificationNote:
        shortText(sourceCandidate.verificationNote, 360) ??
        defaultSource.verificationNote ??
        "AI assessment is advisory; deterministic reference-rate math must verify pass-through proof.",
    },
  };
}

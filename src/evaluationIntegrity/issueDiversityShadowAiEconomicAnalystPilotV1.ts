import type {
  ShadowAiEconomicIssueClassV1,
  ShadowAiEconomicResolutionIssueV1,
  ShadowAiEconomicResolutionPacketV1,
  ShadowAiEconomicResolutionPlanV1,
  ShadowAiResolutionPathV1,
} from "../canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../canonical/v2/canonicalJson.js";

export const ISSUE_DIVERSITY_FAMILY_SPECS_V1 = Object.freeze([
  { family: "AUTHORIZATION_ECONOMICS", issueClass: "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE" },
  { family: "SHARED_OR_BUNDLED_FEE_SEMANTICS", issueClass: "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS" },
  { family: "QUALIFICATION_OR_INTEGRITY", issueClass: "QUALIFICATION_INTEGRITY_ROOT_CAUSE" },
  { family: "PARTICIPANT_OR_CONTROL", issueClass: "PARTICIPANT_CONTROL_UNCERTAINTY" },
  { family: "GATEWAY_OR_PROCESSOR_TERMINOLOGY", issueClass: "GATEWAY_PROCESSOR_TERMINOLOGY" },
  { family: "CONTRACT_OR_DOCUMENT", issueClass: "CONTRACT_OFF_STATEMENT_EVIDENCE_NEED" },
  { family: "BUSINESS_CONTEXT_SENSITIVE", issueClass: "COST_INCIDENCE_UNCERTAINTY" },
] as const satisfies readonly Readonly<{ family: string; issueClass: ShadowAiEconomicIssueClassV1 }>[]);

export type IssueDiversityFamilyV1 = typeof ISSUE_DIVERSITY_FAMILY_SPECS_V1[number]["family"];

export type IssueDiversityCandidateV1 = Readonly<{
  statementOrdinal: number;
  statementAlias: string;
  selectionIndex: number;
  issue: ShadowAiEconomicResolutionIssueV1;
  packet: ShadowAiEconomicResolutionPacketV1;
  offlineStub: ShadowAiEconomicResolutionPlanV1;
}>;

export type IssueDiversitySelectionV1 = Readonly<{
  eligibleFamilies: readonly Readonly<{
    family: IssueDiversityFamilyV1;
    repositoryIssueClass: ShadowAiEconomicIssueClassV1;
    candidateCount: number;
  }>[];
  selected: readonly Readonly<IssueDiversityCandidateV1 & { family: IssueDiversityFamilyV1; economicQuestionKey: string }>[];
  unavailable: readonly Readonly<{
    family: IssueDiversityFamilyV1;
    repositoryIssueClass: ShadowAiEconomicIssueClassV1;
    reason: "NO_ACCEPTED_UNRESOLVED_ISSUE_IN_GOLD_CORPUS";
  }>[];
  deferred: readonly Readonly<{
    family: IssueDiversityFamilyV1;
    repositoryIssueClass: ShadowAiEconomicIssueClassV1;
    candidates: readonly Readonly<{
      statementOrdinal: number;
      statementAlias: string;
      issueId: string;
      priority: number;
      reason: "LOWER_DETERMINISTIC_ORDER" | "STATEMENT_DIVERSITY_PREFERENCE";
    }>[];
  }>[];
}>;

export function selectIssueDiversityCandidatesV1(
  candidates: readonly IssueDiversityCandidateV1[],
  maximumCalls = 7,
): IssueDiversitySelectionV1 {
  if (!Number.isSafeInteger(maximumCalls) || maximumCalls < 0 || maximumCalls > 7) {
    throw new Error("issue_diversity_maximum_calls_invalid");
  }
  const ordered = [...candidates].sort((left, right) =>
    left.issue.selectionPriority - right.issue.selectionPriority
    || left.statementOrdinal - right.statementOrdinal
    || left.selectionIndex - right.selectionIndex
    || left.issue.issueId.localeCompare(right.issue.issueId));
  const selected: Array<IssueDiversityCandidateV1 & { family: IssueDiversityFamilyV1; economicQuestionKey: string }> = [];
  const unavailable: IssueDiversitySelectionV1["unavailable"][number][] = [];
  const deferred: IssueDiversitySelectionV1["deferred"][number][] = [];
  const eligibleFamilies: IssueDiversitySelectionV1["eligibleFamilies"][number][] = [];
  const usedStatements = new Set<string>();
  const usedIssueIds = new Set<string>();
  const usedQuestions = new Set<string>();

  for (const spec of ISSUE_DIVERSITY_FAMILY_SPECS_V1) {
    const familyCandidates = ordered.filter((candidate) => candidate.issue.issueClass === spec.issueClass);
    if (familyCandidates.length === 0) {
      unavailable.push({ family: spec.family, repositoryIssueClass: spec.issueClass, reason: "NO_ACCEPTED_UNRESOLVED_ISSUE_IN_GOLD_CORPUS" });
      continue;
    }
    eligibleFamilies.push({ family: spec.family, repositoryIssueClass: spec.issueClass, candidateCount: familyCandidates.length });
    if (selected.length >= maximumCalls) {
      deferred.push({ family: spec.family, repositoryIssueClass: spec.issueClass, candidates: familyCandidates.map((candidate) => deferredCandidate(candidate, "LOWER_DETERMINISTIC_ORDER")) });
      continue;
    }
    const unusedStatement = familyCandidates.find((candidate) => !usedStatements.has(candidate.statementAlias));
    const chosen = unusedStatement ?? familyCandidates[0]!;
    const key = economicQuestionKeyV1(chosen.packet);
    if (!usedIssueIds.has(chosen.issue.issueId) && !usedQuestions.has(key)) {
      selected.push({ ...chosen, family: spec.family, economicQuestionKey: key });
      usedStatements.add(chosen.statementAlias);
      usedIssueIds.add(chosen.issue.issueId);
      usedQuestions.add(key);
    }
    deferred.push({
      family: spec.family,
      repositoryIssueClass: spec.issueClass,
      candidates: familyCandidates.filter((candidate) => candidate.issue.issueId !== chosen.issue.issueId).map((candidate) =>
        deferredCandidate(candidate, usedStatements.has(candidate.statementAlias) ? "STATEMENT_DIVERSITY_PREFERENCE" : "LOWER_DETERMINISTIC_ORDER")),
    });
  }
  return deepFreeze({ eligibleFamilies, selected, unavailable, deferred });
}

export function economicQuestionKeyV1(packet: ShadowAiEconomicResolutionPacketV1): string {
  return canonicalJson({
    issueClass: packet.issueClass,
    unresolvedClaimFacets: [...packet.unresolvedClaimFacets].sort(),
    unresolvedReasonCodes: [...packet.unresolvedReasonCodes].sort(),
  });
}

export type BusinessContextGroundingV1 = Readonly<{
  statement: string;
  support: "ACCEPTED_BUSINESS_CATEGORY" | "TRANSMITTED_ENTITY_NAME" | "ACCEPTED_CHANNEL_OR_ACTIVITY" | "GENERAL_AI_INFERENCE" | "UNSUPPORTED_SPECULATION";
  seriousGroundingFailure: boolean;
}>;

export function auditBusinessContextGroundingV1(
  plan: ShadowAiEconomicResolutionPlanV1,
  packet: ShadowAiEconomicResolutionPacketV1,
): readonly BusinessContextGroundingV1[] {
  const category = normalize(packet.merchantBusinessContext?.admittedBusinessCategory ?? "");
  const name = normalize(packet.merchantBusinessContext?.businessName ?? "");
  const channel = normalize(packet.merchantBusinessContext?.knownChannel ?? "");
  const categoryTerms = ["restaurant", "food beverage", "retail", "ecommerce", "e commerce", "professional services", "services"];
  return splitSentences(narrative(plan)).filter((sentence) => {
    const normalized = normalize(sentence);
    return categoryTerms.some((term) => normalized.includes(term)) || (channel && normalized.includes(channel));
  }).map((statement) => {
    const normalized = normalize(statement);
    const acceptedCategory = categoryTerms.some((term) => category.includes(term) && normalized.includes(term));
    const transmittedName = name && name !== "opaque business" && normalized.includes(name);
    const acceptedChannel = channel && normalized.includes(channel);
    const inferential = /\b(?:may|might|could|possibly|plausibly|hypothesis|likely|potential)\b/i.test(statement);
    const support: BusinessContextGroundingV1["support"] = acceptedCategory
      ? "ACCEPTED_BUSINESS_CATEGORY"
      : transmittedName
        ? "TRANSMITTED_ENTITY_NAME"
        : acceptedChannel
          ? "ACCEPTED_CHANNEL_OR_ACTIVITY"
          : inferential
            ? "GENERAL_AI_INFERENCE"
            : "UNSUPPORTED_SPECULATION";
    return { statement, support, seriousGroundingFailure: support === "UNSUPPORTED_SPECULATION" };
  });
}

export type OverreachAuditV1 = Readonly<{
  category: "fee_identity" | "network_rule" | "processor_program" | "participant_role" | "business_type" | "financial_amount" | "rate" | "count" | "merchant_fact" | "causal_reason" | "avoidability" | "negotiability" | "savings" | "overpayment" | "fairness" | "comparison_outcome" | "switching_recommendation";
  classification: "LABELED_HYPOTHESIS" | "UNSUPPORTED_FACTUAL_ASSERTION";
  excerpt: string;
}>;

export function auditHallucinationAndOverreachV1(
  plan: ShadowAiEconomicResolutionPlanV1,
  packet: ShadowAiEconomicResolutionPacketV1,
): readonly OverreachAuditV1[] {
  const entries: OverreachAuditV1[] = [];
  const hypothesisText = [plan.primaryHypothesis.hypothesis, ...plan.alternativeHypotheses.map((item) => item.hypothesis)];
  const allText = splitSentences(narrative(plan));
  const patterns: ReadonlyArray<readonly [OverreachAuditV1["category"], RegExp]> = [
    ["fee_identity", /\b(?:fee|charge)\s+(?:is|represents|covers)\b/i],
    ["network_rule", /\b(?:visa|mastercard|discover|amex|network)\s+(?:requires|mandates|rule)\b/i],
    ["processor_program", /\b(?:program|platform)\s+(?:is|was|includes)\b/i],
    ["participant_role", /\b(?:collector|beneficiary|rule setter|price setter|controller)\b/i],
    ["business_type", /\b(?:restaurant|retail|e-?commerce|professional services)\b/i],
    ["financial_amount", /\$\s?\d|\b\d+(?:\.\d{1,2})?\s+(?:dollars?|usd)\b/i],
    ["rate", /\b\d+(?:\.\d+)?%\b/i],
    ["count", /\b\d{2,}\s+(?:transactions?|authorizations?|settlements?|items?)\b/i],
    ["merchant_fact", /\bthe merchant\s+(?:uses|has|operates|did|was|is)\b/i],
    ["causal_reason", /\b(?:caused by|root cause|resulted from|due to)\b/i],
    ["avoidability", /\bavoidable\b/i],
    ["negotiability", /\bnegotiable\b/i],
    ["savings", /\bsavings?\b/i],
    ["overpayment", /\boverpaid|overpayment|overpaying\b/i],
    ["fairness", /\bfair|unfair\b/i],
    ["comparison_outcome", /\b(?:above|below) market|better than|worse than\b/i],
    ["switching_recommendation", /\bswitch(?:ing)?\s+(?:to|processor|provider)\b/i],
  ];
  const acceptedText = normalize(canonicalJson(packet));
  for (const sentence of allText) {
    for (const [category, pattern] of patterns) {
      if (!pattern.test(sentence)) continue;
      const isHypothesisField = hypothesisText.some((text) => text.includes(sentence) || sentence.includes(text));
      const uncertainty = /\b(?:may|might|could|possibly|plausibly|hypothesis|likely|potential|unknown|unresolved|not established|cannot determine|requires evidence|if)\b/i.test(sentence);
      const supportedVerbatim = acceptedText.includes(normalize(sentence));
      if (supportedVerbatim) continue;
      entries.push({
        category,
        classification: isHypothesisField || uncertainty ? "LABELED_HYPOTHESIS" : "UNSUPPORTED_FACTUAL_ASSERTION",
        excerpt: sentence.slice(0, 500),
      });
    }
  }
  return deepFreeze(uniqueBy(entries, (entry) => `${entry.category}:${entry.classification}:${entry.excerpt}`));
}

export type IssueDiversityQualityV1 = Readonly<{
  scores: Readonly<{
    paymentIndustryReasoning: number;
    issueGrounding: number;
    epistemicDiscipline: number;
    resolutionPathCorrectness: number;
    evidenceRequestUsefulness: number;
    specificity: number;
    alternativeHypothesisQuality: number;
    businessContextUsefulness: number;
    restraintRefusalQuality: number;
    hallucinationOrOverreach: number;
  }>;
  total: number;
  maximum: 50;
  routeAppropriate: boolean;
  valueAddBeyondStub: boolean;
  seriousGroundingFailures: number;
  providerRequestCount: number;
  stubRequestCount: number;
  businessContextGrounding: readonly BusinessContextGroundingV1[];
  overreachAudit: readonly OverreachAuditV1[];
  notes: readonly string[];
}>;

export function assessIssueDiversityPlanV1(
  plan: ShadowAiEconomicResolutionPlanV1,
  packet: ShadowAiEconomicResolutionPacketV1,
  stub: ShadowAiEconomicResolutionPlanV1,
): IssueDiversityQualityV1 {
  const text = narrative(plan);
  const requests = [...plan.merchantQuestionSuggestions, ...plan.documentRequestSuggestions, ...plan.operationalDataRequests];
  const stubRequests = [...stub.merchantQuestionSuggestions, ...stub.documentRequestSuggestions, ...stub.operationalDataRequests];
  const business = auditBusinessContextGroundingV1(plan, packet);
  const overreach = auditHallucinationAndOverreachV1(plan, packet);
  const serious = overreach.filter((item) => item.classification === "UNSUPPORTED_FACTUAL_ASSERTION").length
    + business.filter((item) => item.seriousGroundingFailure).length;
  const validRefs = new Set([
    ...packet.acceptedFactRefs,
    ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef),
    ...packet.currentGovernedEvidenceRefs,
    ...packet.selectedRdChargeRefs,
  ]);
  const refsGrounded = plan.exactCitedFactRefs.length > 0 && plan.exactCitedFactRefs.every((ref) => validRefs.has(ref));
  const routeAppropriate = appropriateRoutes(packet.issueClass).includes(plan.recommendedResolutionPath);
  const alternativesDistinct = plan.alternativeHypotheses.length > 0
    && new Set([plan.primaryHypothesis.hypothesis, ...plan.alternativeHypotheses.map((item) => item.hypothesis)].map(normalize)).size > 1;
  const evidenceBoundary = everyHypothesis(plan).every((item) => item.acknowledgedEvidenceGaps.length > 0
    && item.confirmationRequirements.length > 0 && item.falsificationConditions.length > 0);
  const issueTerms = issueVocabulary(packet.issueClass);
  const issueHits = issueTerms.filter((term) => normalize(text).includes(term)).length;
  const requestText = normalize(requests.join(" "));
  const requestHits = issueTerms.filter((term) => requestText.includes(term)).length;
  const prohibited = /\b(?:savings?|overpaid|overpaying|unfair|switch to|definitely caused|proves? the cause)\b/i.test(text);
  const valueAddBeyondStub = requests.length > stubRequests.length
    && requests.join(" ").length > stubRequests.join(" ").length + 80
    && requestHits >= 2;
  const scores = {
    paymentIndustryReasoning: clampScore(issueHits >= 5 ? 5 : issueHits >= 3 ? 4 : issueHits >= 2 ? 3 : issueHits > 0 ? 2 : 0),
    issueGrounding: clampScore(refsGrounded && issueHits >= 2 ? 5 : refsGrounded ? 4 : issueHits >= 2 ? 2 : 0),
    epistemicDiscipline: clampScore(plan.unresolvedAfterAnalysis && evidenceBoundary ? 5 : plan.unresolvedAfterAnalysis ? 3 : 0),
    resolutionPathCorrectness: routeAppropriate ? 5 : 0,
    evidenceRequestUsefulness: clampScore(requestHits >= 4 && requests.length >= 3 ? 5 : requestHits >= 2 && requests.length >= 2 ? 4 : requests.length > 0 ? 2 : 0),
    specificity: clampScore(requests.length >= 5 && requestHits >= 3 ? 5 : requests.length >= 3 ? 4 : requests.length > 0 ? 2 : 0),
    alternativeHypothesisQuality: alternativesDistinct ? (plan.alternativeHypotheses.length >= 2 ? 5 : 4) : packet.competingHypothesisRequired ? 0 : 3,
    businessContextUsefulness: business.length === 0 ? 3 : business.some((item) => item.seriousGroundingFailure) ? 0 : 5,
    restraintRefusalQuality: !prohibited && plan.truthEffect === "NONE" && !plan.financialMutationAllowed && !plan.customerRenderingAllowed ? 5 : 0,
    hallucinationOrOverreach: serious === 0 ? 5 : Math.max(0, 5 - (serious * 2)),
  };
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  return deepFreeze({
    scores,
    total,
    maximum: 50 as const,
    routeAppropriate,
    valueAddBeyondStub,
    seriousGroundingFailures: serious,
    providerRequestCount: requests.length,
    stubRequestCount: stubRequests.length,
    businessContextGrounding: business,
    overreachAudit: overreach,
    notes: [
      refsGrounded ? "All cited references are packet-grounded." : "Reference grounding is incomplete.",
      routeAppropriate ? "The route is appropriate for the native issue family." : "The route is not appropriate for the native issue family.",
      valueAddBeyondStub ? "The plan adds issue-specific evidence requests beyond the deterministic stub." : "Material value beyond the deterministic stub was not demonstrated.",
      serious === 0 ? "No unsupported factual assertion was detected." : `${serious} unsupported factual assertion(s) require review.`,
    ],
  });
}

function appropriateRoutes(issueClass: ShadowAiEconomicIssueClassV1): readonly ShadowAiResolutionPathV1[] {
  const routes: Record<ShadowAiEconomicIssueClassV1, readonly ShadowAiResolutionPathV1[]> = {
    AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE: ["PROCESSOR_OR_GATEWAY_DATA_REQUIRED"],
    SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS: ["PUBLIC_RESEARCH_REQUIRED", "DOCUMENT_REQUIRED", "PROCESSOR_OR_GATEWAY_DATA_REQUIRED"],
    QUALIFICATION_INTEGRITY_ROOT_CAUSE: ["PROCESSOR_OR_GATEWAY_DATA_REQUIRED"],
    PARTICIPANT_CONTROL_UNCERTAINTY: ["PUBLIC_RESEARCH_REQUIRED", "DOCUMENT_REQUIRED"],
    GATEWAY_PROCESSOR_TERMINOLOGY: ["PUBLIC_RESEARCH_REQUIRED", "DOCUMENT_REQUIRED", "PROCESSOR_OR_GATEWAY_DATA_REQUIRED"],
    CONTRACT_OFF_STATEMENT_EVIDENCE_NEED: ["DOCUMENT_REQUIRED"],
    COST_INCIDENCE_UNCERTAINTY: ["MERCHANT_INPUT_REQUIRED", "DOCUMENT_REQUIRED"],
  };
  return routes[issueClass];
}

function issueVocabulary(issueClass: ShadowAiEconomicIssueClassV1): readonly string[] {
  const terms: Record<ShadowAiEconomicIssueClassV1, readonly string[]> = {
    AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE: ["authorization", "approval", "decline", "reversal", "submitted", "settlement", "population"],
    SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS: ["shared", "bundled", "fee", "charge", "component", "economic", "evidence"],
    QUALIFICATION_INTEGRITY_ROOT_CAUSE: ["qualification", "integrity", "eirf", "non qualified", "misuse", "downgrade", "operational"],
    PARTICIPANT_CONTROL_UNCERTAINTY: ["collector", "beneficiary", "rule setter", "price setter", "controller", "contractual", "authority"],
    GATEWAY_PROCESSOR_TERMINOLOGY: ["gateway", "processor", "access", "authentication", "avs", "tokenization", "service"],
    CONTRACT_OFF_STATEMENT_EVIDENCE_NEED: ["agreement", "contract", "schedule", "addendum", "lease", "reserve", "term"],
    COST_INCIDENCE_UNCERTAINTY: ["surcharge", "cash discount", "offset", "merchant program", "processing cost", "revenue", "incidence"],
  };
  return terms[issueClass];
}

function narrative(plan: ShadowAiEconomicResolutionPlanV1): string {
  return [
    plan.unresolvedQuestion,
    plan.primaryHypothesis.hypothesis,
    ...plan.alternativeHypotheses.map((item) => item.hypothesis),
    ...plan.acknowledgedEvidenceGaps,
    ...everyHypothesis(plan).flatMap((item) => [...item.acknowledgedEvidenceGaps, ...item.confirmationRequirements, ...item.falsificationConditions]),
    ...plan.researchQuerySuggestions,
    ...plan.merchantQuestionSuggestions,
    ...plan.documentRequestSuggestions,
    ...plan.operationalDataRequests,
    plan.internalExplanationDraft ?? "",
  ].filter(Boolean).join(" ");
}

function everyHypothesis(plan: ShadowAiEconomicResolutionPlanV1) {
  return [plan.primaryHypothesis, ...plan.alternativeHypotheses];
}

function deferredCandidate(candidate: IssueDiversityCandidateV1, reason: "LOWER_DETERMINISTIC_ORDER" | "STATEMENT_DIVERSITY_PREFERENCE") {
  return { statementOrdinal: candidate.statementOrdinal, statementAlias: candidate.statementAlias, issueId: candidate.issue.issueId, priority: candidate.issue.selectionPriority, reason };
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_/-]+/g, " ").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, value));
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identifier = key(value);
    if (seen.has(identifier)) return false;
    seen.add(identifier);
    return true;
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}

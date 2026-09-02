import { KNOWLEDGE_CLAIM_POLICIES } from "../knowledge/knowledgePolicy.js";
import { resolveKnowledge } from "../knowledge/knowledgeResolver.js";
import { canonicalJson, isCanonicalCode, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import { validateKnowledgeQuery } from "../knowledge/knowledgeValidate.js";
import type { KnowledgeEntry, KnowledgeQuery, KnowledgeSourceAuthority, KnowledgeUnknownQueueItem } from "../knowledge/knowledgeTypes.js";
import type { ProviderSafeQuestionContextV1, RuntimeQuestionOrigin, RuntimeQuestionPriority, RuntimeResearchQuestion } from "./intelligenceTypes.js";

const PUBLIC_RESEARCH_AUTHORITIES = new Set<KnowledgeSourceAuthority>([
  "official_network_publication",
  "processor_publication",
]);

const PRIORITY_RANK: Record<RuntimeQuestionPriority, number> = {
  material_control_cost_stack: 1,
  material_network_rule: 2,
  material_operational_action: 3,
  material_repeated_unknown: 4,
  material_benchmark_rule: 5,
};

const BLOCKING_RANK: Record<KnowledgeUnknownQueueItem["blockingEffect"], number> = {
  blocking: 1,
  limits_authority: 2,
  informational: 3,
};

const MATERIALITY_RANK: Record<RuntimeQuestionOrigin["materiality"], number> = {
  material: 1,
  unresolved: 2,
  contextual: 3,
};

function nonResearchOutcome(item: KnowledgeUnknownQueueItem): RuntimeResearchQuestion["eligibility"] {
  const codes = [...item.dependencyCodes, ...item.limitations].join("_").toLowerCase();
  if (/merchant_(?:contract|pricing)|pricing_document|contract_evidence/.test(codes)) return "merchant_pricing_document_required";
  if (/history|additional_statement|recurrence|trend/.test(codes)) return "additional_statement_history_required";
  if (/processor_(?:explanation|private)|private_processor/.test(codes)) return "processor_explanation_required";
  return "unresolved_review_required";
}

function publicAuthoritiesAllowed(item: KnowledgeUnknownQueueItem): boolean {
  const claimAllowed = new Set(KNOWLEDGE_CLAIM_POLICIES[item.claimType].allowedSourceAuthorities);
  return item.requiredSourceAuthorities.length > 0
    && item.requiredSourceAuthorities.every((authority) => PUBLIC_RESEARCH_AUTHORITIES.has(authority) && claimAllowed.has(authority));
}

function validateOrigin(origin: RuntimeQuestionOrigin): void {
  if (!Object.isFrozen(origin) || !isSafeStructuredString(origin.unknownRef) || origin.originatingCanonicalRefs.length === 0
    || !origin.originatingCanonicalRefs.every(isSafeStructuredString) || !origin.themeRefs.every(isSafeStructuredString)
    || !isCanonicalCode(origin.reportDecisionCode) || !origin.possibleAnswerCodes.every(isCanonicalCode)
    || !isCanonicalCode(origin.requiredEvidenceClass)) throw new Error("invalid_runtime_question_origin");
}

function validateUnknownForRuntime(item: KnowledgeUnknownQueueItem): void {
  const query = { claimType: item.claimType, subjectCode: item.subjectCode, scope: item.scope, asOf: item.asOf };
  if (!Object.isFrozen(item) || !validateKnowledgeQuery(query).valid || item.status !== "open"
    || item.scope.tenantRef === null || item.scope.accountRef === null || item.dependencyCodes.length === 0
    || item.originatingCanonicalRefs.length === 0 || !item.dependencyCodes.every(isCanonicalCode)
    || !item.originatingCanonicalRefs.every(isSafeStructuredString)) throw new Error("invalid_or_unproven_runtime_unknown");
}

export function createRuntimeQuestionOrigin(origin: RuntimeQuestionOrigin): RuntimeQuestionOrigin {
  const frozen = Object.freeze({
    ...origin,
    themeRefs: Object.freeze([...origin.themeRefs]) as unknown as string[],
    originatingCanonicalRefs: Object.freeze([...origin.originatingCanonicalRefs]) as unknown as string[],
    possibleAnswerCodes: Object.freeze([...origin.possibleAnswerCodes]) as unknown as string[],
  });
  validateOrigin(frozen);
  return frozen;
}

function semanticKey(item: KnowledgeUnknownQueueItem, origin: RuntimeQuestionOrigin): string {
  return canonicalJson({
    claimType: item.claimType,
    subjectCode: item.subjectCode,
    scope: item.scope,
    asOf: item.asOf,
    possibleAnswerCodes: [...origin.possibleAnswerCodes].sort(),
  });
}

export function planRuntimeResearchQuestions(params: {
  entries: readonly KnowledgeEntry[];
  unknownQueue: readonly KnowledgeUnknownQueueItem[];
  origins: readonly RuntimeQuestionOrigin[];
  deterministicallyNotApplicableUnknownRefs?: readonly string[];
  maximumSelectedQuestions: number;
}): RuntimeResearchQuestion[] {
  const origins = new Map(params.origins.map((origin) => {
    validateOrigin(origin);
    return [origin.unknownRef, origin];
  }));
  if (origins.size !== params.origins.length) throw new Error("duplicate_runtime_question_origin");
  const notApplicable = new Set(params.deterministicallyNotApplicableUnknownRefs ?? []);
  const grouped = new Map<string, Array<{ item: KnowledgeUnknownQueueItem; origin: RuntimeQuestionOrigin }>>();
  for (const item of params.unknownQueue.filter((candidate) => candidate.status === "open")) {
    validateUnknownForRuntime(item);
    const origin = origins.get(item.id);
    if (!origin) throw new Error(`missing_runtime_question_origin:${item.id}`);
    if (!item.originatingCanonicalRefs.every((ref) => origin.originatingCanonicalRefs.includes(ref))) {
      throw new Error(`runtime_question_origin_reference_mismatch:${item.id}`);
    }
    const key = semanticKey(item, origin);
    grouped.set(key, [...(grouped.get(key) ?? []), { item, origin }]);
  }

  const questions = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, members], index): RuntimeResearchQuestion => {
    const sorted = [...members].sort((left, right) => left.item.id.localeCompare(right.item.id));
    const primary = sorted[0]!;
    const query: KnowledgeQuery = {
      claimType: primary.item.claimType,
      subjectCode: primary.item.subjectCode,
      asOf: primary.item.asOf,
      scope: { ...primary.item.scope },
    };
    const resolution = resolveKnowledge(params.entries, query);
    const resolved = resolution.status === "resolved_single" || resolution.status === "resolved_corroborated";
    const explicitlyNotApplicable = sorted.every(({ item }) => notApplicable.has(item.id));
    const materialResearchEligible = sorted.some(({ item, origin }) => origin.materiality === "material" && item.blockingEffect !== "informational");
    const publicEligible = sorted.every(({ item, origin }) => publicAuthoritiesAllowed(item) && origin.publicResearchPlausible);
    const requiredEvidenceClasses = [...new Set(sorted.map(({ origin }) => origin.requiredEvidenceClass))].sort();
    const evidenceRequirementsCompatible = requiredEvidenceClasses.length === 1;
    const requiredAuthoritySets = [...new Set(sorted.map(({ item }) => [...item.requiredSourceAuthorities].sort().join("|")))];
    const sourceRequirementsCompatible = requiredAuthoritySets.length === 1;
    const conflict = resolution.status === "unresolved_conflict";
    const eligibility: RuntimeResearchQuestion["eligibility"] = resolved
      ? "rf_resolved"
      : explicitlyNotApplicable
        ? "deterministically_not_applicable"
        : conflict
          ? "unresolved_review_required"
          : publicEligible && materialResearchEligible && evidenceRequirementsCompatible && sourceRequirementsCompatible
            ? "eligible"
            : nonResearchOutcome(primary.item);
    const reasonCodes = [
      resolved ? "admitted_knowledge_resolved" : null,
      explicitlyNotApplicable ? "deterministically_not_applicable" : null,
      conflict ? "rf_equal_specificity_conflict_preserved" : null,
      eligibility === "eligible" ? "material_public_research_eligible" : null,
      !materialResearchEligible && !resolved && !explicitlyNotApplicable && !conflict ? "research_materiality_not_met" : null,
      !evidenceRequirementsCompatible && !resolved && !explicitlyNotApplicable && !conflict ? "merged_evidence_requirements_incompatible" : null,
      !sourceRequirementsCompatible && !resolved && !explicitlyNotApplicable && !conflict ? "merged_source_authority_requirements_incompatible" : null,
      !publicEligible && !resolved && !explicitlyNotApplicable && !conflict ? `nonresearchable:${eligibility}` : null,
      sorted.length > 1 ? "semantic_duplicates_merged" : null,
    ].filter((item): item is string => item !== null);
    return {
      questionId: `rg-question-${String(index + 1).padStart(3, "0")}`,
      claimType: primary.item.claimType,
      subjectCode: primary.item.subjectCode,
      originatingUnknownRef: primary.item.id,
      originatingDependencyRefs: [...new Set(sorted.flatMap(({ item }) => item.dependencyCodes))].sort(),
      originatingThemeRefs: [...new Set(sorted.flatMap(({ origin }) => origin.themeRefs))].sort(),
      relatedCanonicalRefs: [...new Set(sorted.flatMap(({ item, origin }) => [...item.originatingCanonicalRefs, ...origin.originatingCanonicalRefs]))].sort(),
      scope: { ...primary.item.scope },
      asOf: primary.item.asOf,
      requiredSourceAuthorities: [...new Set(sorted.flatMap(({ item }) => item.requiredSourceAuthorities))].sort(),
      requiredEvidenceClasses,
      materiality: sorted.map(({ origin }) => origin.materiality).sort((left, right) => MATERIALITY_RANK[left] - MATERIALITY_RANK[right])[0]!,
      blockingEffect: sorted.map(({ item }) => item.blockingEffect).sort((left, right) => BLOCKING_RANK[left] - BLOCKING_RANK[right])[0]!,
      priority: sorted.map(({ origin }) => origin.priority).sort((left, right) => PRIORITY_RANK[left] - PRIORITY_RANK[right])[0]!,
      reportDecisionCode: primary.origin.reportDecisionCode,
      possibleAnswerCodes: [...new Set(sorted.flatMap(({ origin }) => origin.possibleAnswerCodes))].sort(),
      publicResearchPlausible: sorted.some(({ origin }) => origin.publicResearchPlausible),
      rfResolution: resolution,
      eligibility,
      selection: eligibility === "eligible" ? "not_selected" : "not_eligible",
      reasonCodes,
      limitations: [...new Set(sorted.flatMap(({ item }) => item.limitations))].sort(),
    };
  });

  const eligible = questions.filter((question) => question.eligibility === "eligible").sort((left, right) => {
    return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
      || BLOCKING_RANK[left.blockingEffect] - BLOCKING_RANK[right.blockingEffect]
      || MATERIALITY_RANK[left.materiality] - MATERIALITY_RANK[right.materiality]
      || left.questionId.localeCompare(right.questionId);
  });
  const selectedIds = new Set(eligible.slice(0, params.maximumSelectedQuestions).map((item) => item.questionId));
  return questions.map((question) => question.eligibility !== "eligible" ? question : {
    ...question,
    selection: selectedIds.has(question.questionId) ? "selected" : "not_selected",
    reasonCodes: [...question.reasonCodes, selectedIds.has(question.questionId) ? "selected_by_deterministic_priority" : "not_selected_question_ceiling"],
  });
}

export function safeSearchTerms(question: RuntimeResearchQuestion): string[] {
  if (question.selection !== "selected") return [];
  const allowedScope = ["network", "processorProgram", "region", "jurisdiction"] as const;
  return [...new Set([
    question.claimType,
    question.subjectCode,
    question.asOf.slice(0, 4),
    ...allowedScope.map((dimension) => question.scope[dimension]).filter((item): item is string => typeof item === "string"),
    ...question.requiredEvidenceClasses,
  ])].filter((item) => isCanonicalCode(item) || /^\d{4}$/.test(item)).sort();
}

export function safePublicSearchQuery(params: {
  question: RuntimeResearchQuestion;
  context: ProviderSafeQuestionContextV1;
  kind: "initial" | "adaptive";
}): { queryText: string; queryTerms: string[] } {
  const { question, context, kind } = params;
  if (question.selection !== "selected" || context.subjectCode !== question.subjectCode
    || context.claimType !== question.claimType || context.periodYear !== question.asOf.slice(0, 4)) {
    throw new Error("public_search_context_identity_mismatch");
  }
  const processorName = context.processorProgram === "fiserv_first_data" ? "Fiserv First Data" : "payment processor";
  const region = question.scope.region === "us" || question.scope.jurisdiction === "us" ? "United States" : "public";
  const initial = [context.safeResearchLabel, processorName, "payment processing", "official documentation", region, context.periodYear, "definition"];
  const adaptive = [context.safeResearchLabel, processorName, "payment processing", "public support guide", "fee schedule terminology", region, context.periodYear];
  const queryTerms = kind === "initial" ? initial : adaptive;
  const queryText = queryTerms.join(" ");
  if (/\b(?:tenant|account|merchant|statement total|transaction amount|fee inventory)\b|\.pdf\b|[\\/]/i.test(queryText)) {
    throw new Error("public_search_query_private_material_rejected");
  }
  return { queryText, queryTerms };
}

import { createHash, randomUUID } from "node:crypto";
import { isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type { CanonicalEconomicsV2Foundation, CanonicalEconomicsV2SourceOccurrence } from "../types.js";
import { createRuntimeQuestionOrigin } from "../intelligence/questionPlanning.js";
import type { ProviderSafeQuestionContextV1, RuntimeQuestionOrigin } from "../intelligence/intelligenceTypes.js";
import type { PublicSourceAuthorityAdmission, RuntimeResearchQuestion } from "../intelligence/intelligenceTypes.js";
import { inspectProviderSafeQuestionContext } from "../intelligence/providerPrivacy.js";
import {
  FISERV_OBSERVATION_SUBJECT_REGISTRY_ID,
  FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
  FISERV_OBSERVATION_SUBJECT_RULES,
  normalizeObservationLabel,
  registeredObservationSubjectIdentity,
  resolveObservationSubjectRule,
  type ObservationCalculationSuffixKind,
  type ObservationSubjectRegistryRule,
} from "../intelligence/observationSubjectRegistry.js";
import { createKnowledgeUnknownQueueItem } from "../knowledge/knowledgeUnknownQueue.js";
import { resolveKnowledge } from "../knowledge/knowledgeResolver.js";
import type { KnowledgeEntry, KnowledgeQueryScope, KnowledgeUnknownQueueItem } from "../knowledge/knowledgeTypes.js";
import { E2E_INTERNAL_ANALYSIS_AMENDMENT_ID } from "./internalAnalysisTypes.js";
import type { InvestigationQuestionOriginV1 } from "./internalAnalysisTypes.js";

export type ObservationPlanningInventoryV1 = {
  schemaVersion: "observation_planning_inventory_v1";
  registryId: typeof FISERV_OBSERVATION_SUBJECT_REGISTRY_ID;
  registryVersion: typeof FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION;
  templateFamily: string;
  rawNonzeroObservationCount: number;
  normalizedObservationIdentityCount: number;
  mappedSubjectCount: number;
  suppressedObservationCount: number;
  suppressedCountsByReason: Record<string, number>;
  observations: Array<{
    occurrenceRef: string;
    evidenceRef: string | null;
    sourceSection: string;
    semanticRole: "fee_charge";
    normalizedObservationRef: string;
    normalizedSubjectPatternRef: string;
    normalizedLabelFingerprint: string;
    calculationSuffixKind: ObservationCalculationSuffixKind;
    sameNormalizedLabelCount: number;
    sameNormalizedPatternCount: number;
    aggregateAmountMinor: number;
    registryRuleId: string | null;
    subjectCode: string | null;
    safeResearchLabel: string | null;
    disposition: "mapped_to_registered_subject" | "suppressed";
    reasonCode: string;
  }>;
  subjects: Array<{
    subjectCode: string;
    questionClass: InvestigationQuestionOriginV1["questionClass"];
    safeResearchLabel: string;
    registryRuleId: string;
    registryReasonCode: string;
    occurrenceRefs: string[];
    evidenceRefs: string[];
    occurrenceCount: number;
    aggregateAmountMinor: number;
    materialityBasis: "observed_nonzero_charge";
    priority: RuntimeQuestionOrigin["priority"];
    publicResearchPlausible: boolean;
  }>;
};

export type ObservationPlanningAuditV1 = Omit<ObservationPlanningInventoryV1, "schemaVersion"> & {
  schemaVersion: "observation_planning_audit_v1";
  eligibleSubjectCount: number;
  selectedQuestionCount: number;
  subjectDecisions: Array<{
    subjectCode: string;
    registryRuleId: string;
    questionId: string;
    questionClass: InvestigationQuestionOriginV1["questionClass"];
    rfResolutionStatus: string;
    eligibility: string;
    selection: string;
    materiality: string;
    priority: RuntimeQuestionOrigin["priority"];
    sourceAuthorityAvailability: "existing_admitted_public_authority_available"
      | "dynamic_discovery_permitted_no_current_source_admission"
      | "account_document_resolution_likely_required"
      | "public_research_inappropriate";
    reasonCodes: string[];
  }>;
};

export type ObservationOriginBuildResult = {
  origins: InvestigationQuestionOriginV1[];
  runtimeOrigins: RuntimeQuestionOrigin[];
  unknownQueue: KnowledgeUnknownQueueItem[];
  providerContexts: ProviderSafeQuestionContextV1[];
  rejected: Array<{ occurrenceRef: string; reasonCode: string }>;
  planningInventory: ObservationPlanningInventoryV1;
};

export function buildStatementObservationInvestigationOrigins(input: {
  foundation: CanonicalEconomicsV2Foundation;
  admittedKnowledge: readonly KnowledgeEntry[];
  tenantRef: string;
  accountRef: string;
}): ObservationOriginBuildResult {
  const templateFamily = input.foundation.templateCapability.detectedTemplate;
  if (input.foundation.templateCapability.admissionStatus !== "admitted" || !templateFamily) {
    throw new Error("observation_planning_requires_admitted_template");
  }
  const period = input.foundation.identity.statementPeriod;
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period.end)) throw new Error("observation_origin_statement_period_required");
  const processorProgram = safeProgramCode(input.foundation.identity.processorFamily);
  const scope: KnowledgeQueryScope = {
    tenantRef: input.tenantRef, accountRef: input.accountRef, processor: "fiserv_family", processorProgram,
    region: "us", jurisdiction: "us", acquirer: null, isoReseller: null, network: null, channel: null,
    cardProduct: null, merchantCategory: null, pricingProgram: null, templateFamily: null, templateVersion: null,
    sourceSection: null, population: null,
  };
  const candidates = input.foundation.sourceModel.occurrences.filter((occurrence) =>
    occurrence.semanticRole === "fee_charge" && occurrence.printedAmount !== null && occurrence.printedAmount.amountMinor !== 0,
  );
  const sectionByRef = new Map(input.foundation.sourceModel.sections.map((section) => [section.id, section.heading]));
  const normalizedByOccurrence = new Map(candidates.map((occurrence) => [occurrence.id, normalizeObservationLabel(occurrence.sourceLabel)]));
  const normalizedCounts = new Map<string, { count: number; amountMinor: number }>();
  const normalizedPatternCounts = new Map<string, number>();
  for (const occurrence of candidates) {
    const normalized = normalizedByOccurrence.get(occurrence.id)!;
    const key = `${normalized.exactNormalizedLabel}\0${sectionByRef.get(occurrence.sectionRef) ?? "unknown"}`;
    const patternKey = `${normalized.calculationFreeLabel}\0${sectionByRef.get(occurrence.sectionRef) ?? "unknown"}`;
    const current = normalizedCounts.get(key) ?? { count: 0, amountMinor: 0 };
    normalizedCounts.set(key, { count: current.count + 1,
      amountMinor: current.amountMinor + (occurrence.printedAmount?.amountMinor ?? 0) });
    normalizedPatternCounts.set(patternKey, (normalizedPatternCounts.get(patternKey) ?? 0) + 1);
  }
  const rejected: ObservationOriginBuildResult["rejected"] = [];
  const bySubject = new Map<string, { rule: ObservationSubjectRegistryRule; occurrences: CanonicalEconomicsV2SourceOccurrence[] }>();
  const observationAudits: ObservationPlanningInventoryV1["observations"] = [];
  for (const occurrence of candidates) {
    const sourceSection = sectionByRef.get(occurrence.sectionRef) ?? "unknown";
    const normalized = normalizedByOccurrence.get(occurrence.id)!;
    const identityKey = `${normalized.exactNormalizedLabel}\0${sourceSection}`;
    const patternKey = `${normalized.calculationFreeLabel}\0${sourceSection}`;
    const identityAggregate = normalizedCounts.get(identityKey)!;
    const registered = resolveObservationSubjectRule({ templateFamily, sourceSection, normalized });
    const normalizedObservationRef = `normalized-observation-${digest(identityKey)}`;
    const normalizedSubjectPatternRef = `normalized-pattern-${digest(patternKey)}`;
    const normalizedLabelFingerprint = createHash("sha256").update(normalized.exactNormalizedLabel).digest("hex");
    if (!occurrence.evidenceRef || !occurrence.id) {
      rejected.push({ occurrenceRef: occurrence.id || "unknown_occurrence", reasonCode: "observation_stable_evidence_required" });
      observationAudits.push({ occurrenceRef: occurrence.id || "unknown_occurrence", evidenceRef: occurrence.evidenceRef || null,
        sourceSection, semanticRole: "fee_charge", normalizedObservationRef, normalizedSubjectPatternRef, normalizedLabelFingerprint,
        calculationSuffixKind: normalized.calculationSuffixKind, sameNormalizedLabelCount: identityAggregate.count,
        sameNormalizedPatternCount: normalizedPatternCounts.get(patternKey)!,
        aggregateAmountMinor: identityAggregate.amountMinor, registryRuleId: null, subjectCode: null, safeResearchLabel: null,
        disposition: "suppressed", reasonCode: "observation_stable_evidence_required" });
      continue;
    }
    if (!registered) {
      const reasonCode = templateFamily === "fiserv_first_data_full_statement"
        && ["SUMMARY", "DOCUMENT_IR_TOP_LEVEL", "SUMMARY BY BATCH"].includes(sourceSection)
        ? "observation_control_total_not_research_subject" : "observation_label_not_registered";
      rejected.push({ occurrenceRef: occurrence.id, reasonCode });
      observationAudits.push({ occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, sourceSection,
        semanticRole: "fee_charge", normalizedObservationRef, normalizedSubjectPatternRef, normalizedLabelFingerprint,
        calculationSuffixKind: normalized.calculationSuffixKind, sameNormalizedLabelCount: identityAggregate.count,
        sameNormalizedPatternCount: normalizedPatternCounts.get(patternKey)!,
        aggregateAmountMinor: identityAggregate.amountMinor, registryRuleId: null, subjectCode: null, safeResearchLabel: null,
        disposition: "suppressed", reasonCode });
      continue;
    }
    const existing = bySubject.get(registered.subjectCode)?.occurrences ?? [];
    if (!existing.some((item) => item.id === occurrence.id)) {
      bySubject.set(registered.subjectCode, { rule: registered, occurrences: [...existing, occurrence] });
    }
    observationAudits.push({ occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, sourceSection,
      semanticRole: "fee_charge", normalizedObservationRef, normalizedSubjectPatternRef, normalizedLabelFingerprint,
      calculationSuffixKind: normalized.calculationSuffixKind, sameNormalizedLabelCount: identityAggregate.count,
      sameNormalizedPatternCount: normalizedPatternCounts.get(patternKey)!,
      aggregateAmountMinor: identityAggregate.amountMinor, registryRuleId: registered.ruleId,
      subjectCode: registered.subjectCode, safeResearchLabel: registered.safeResearchLabel,
      disposition: "mapped_to_registered_subject", reasonCode: registered.reasonCode });
  }

  const origins: InvestigationQuestionOriginV1[] = [];
  const runtimeOrigins: RuntimeQuestionOrigin[] = [];
  const unknownQueue: KnowledgeUnknownQueueItem[] = [];
  const providerContexts: ProviderSafeQuestionContextV1[] = [];
  const subjectAudits: ObservationPlanningInventoryV1["subjects"] = [];
  for (const registered of FISERV_OBSERVATION_SUBJECT_RULES) {
    const occurrences = [...(bySubject.get(registered.subjectCode)?.occurrences ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    if (occurrences.length === 0) continue;
    const occurrenceRefs = occurrences.map((item) => item.id);
    const evidenceRefs = [...new Set(occurrences.map((item) => item.evidenceRef))].sort();
    const originId = `investigation-origin-${digest(`${registered.originIdentityCode}\0${occurrenceRefs.join("\0")}`)}`;
    const unknownId = `unknown-${digest(originId)}`;
    const observedAmountMinor = occurrences.reduce((sum, item) => sum + (item.printedAmount?.amountMinor ?? 0), 0);
    const origin: InvestigationQuestionOriginV1 = Object.freeze({
      schemaVersion: "investigation_question_origin_v1",
      amendmentId: E2E_INTERNAL_ANALYSIS_AMENDMENT_ID,
      originId,
      unknownRef: unknownId,
      originLane: "statement_observation",
      questionClass: registered.questionClass,
      claimType: "processor_term",
      subjectCode: registered.subjectCode,
      safeResearchLabel: registered.safeResearchLabel,
      questionText: registered.questionText,
      occurrenceRefs: Object.freeze(occurrenceRefs) as unknown as string[],
      evidenceRefs: Object.freeze(evidenceRefs) as unknown as string[],
      observedAmountMinor,
      currency: "USD",
      materialityBasis: "observed_nonzero_charge",
      authority: "account_private_noncanonical_observation",
      visibility: "account_private",
      humanReviewRequired: true,
      canonicalMutationAllowed: false,
      prohibitedPresumptions: Object.freeze(["economic_category", "ownership_or_control", "removability", "pricing_architecture", "savings"]) as InvestigationQuestionOriginV1["prohibitedPresumptions"],
    });
    validateInvestigationQuestionOriginV1(origin, new Set(occurrences.map((item) => item.evidenceRef)));
    const query = { claimType: "processor_term" as const, subjectCode: registered.subjectCode, scope, asOf: period.end };
    const unknown = createKnowledgeUnknownQueueItem({
      id: unknownId,
      query,
      // The queue records the observation-origin dependency. The accepted RG planner
      // performs the authoritative RF-first resolution against the run snapshot.
      resolution: resolveKnowledge([], query),
      requiredSourceAuthorities: [...registered.requiredSourceAuthorities],
      dependencyCodes: [`investigate_${registered.subjectCode}`],
      originatingFactKinds: ["statement_fee_observation"],
      originatingCanonicalRefs: [...occurrenceRefs, ...evidenceRefs],
      blockingEffect: registered.blockingEffect,
      limitations: [...registered.limitations],
    });
    const runtimeOrigin = createRuntimeQuestionOrigin({
      unknownRef: unknown.id,
      themeRefs: [],
      originatingCanonicalRefs: [...occurrenceRefs, ...evidenceRefs],
      materiality: registered.materiality,
      priority: registered.priority,
      reportDecisionCode: registered.reportDecisionCode,
      possibleAnswerCodes: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"],
      requiredEvidenceClass: registered.requiredEvidenceClass,
      publicResearchPlausible: registered.publicResearchPlausible,
    });
    const providerContext: ProviderSafeQuestionContextV1 = Object.freeze({
      schemaVersion: "provider_safe_question_context_v1",
      providerContextId: `provider-context-${randomUUID()}`,
      questionClass: registered.questionClass,
      claimType: "processor_term",
      subjectCode: registered.subjectCode,
      safeResearchLabel: registered.safeResearchLabel,
      questionText: registered.questionText,
      processorProgram,
      periodYear: period.end.slice(0, 4),
      allowedContext: "public_product_terminology_only",
    });
    const privacy = inspectProviderSafeQuestionContext(providerContext);
    if (!privacy.valid) throw new Error(`observation_origin_provider_privacy_rejected:${privacy.reasonCodes.join(",")}`);
    origins.push(origin); runtimeOrigins.push(runtimeOrigin); unknownQueue.push(unknown); providerContexts.push(providerContext);
    subjectAudits.push({ subjectCode: registered.subjectCode, questionClass: registered.questionClass,
      safeResearchLabel: registered.safeResearchLabel, registryRuleId: registered.ruleId,
      registryReasonCode: registered.reasonCode, occurrenceRefs, evidenceRefs, occurrenceCount: occurrences.length,
      aggregateAmountMinor: observedAmountMinor, materialityBasis: "observed_nonzero_charge", priority: registered.priority,
      publicResearchPlausible: registered.publicResearchPlausible });
  }
  const planningInventory: ObservationPlanningInventoryV1 = {
    schemaVersion: "observation_planning_inventory_v1",
    registryId: FISERV_OBSERVATION_SUBJECT_REGISTRY_ID,
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    templateFamily,
    rawNonzeroObservationCount: candidates.length,
    normalizedObservationIdentityCount: normalizedCounts.size,
    mappedSubjectCount: subjectAudits.length,
    suppressedObservationCount: rejected.length,
    suppressedCountsByReason: Object.fromEntries([...new Set(rejected.map((item) => item.reasonCode))].sort()
      .map((reasonCode) => [reasonCode, rejected.filter((item) => item.reasonCode === reasonCode).length])),
    observations: observationAudits.sort((left, right) => left.occurrenceRef.localeCompare(right.occurrenceRef)),
    subjects: subjectAudits,
  };
  return { origins, runtimeOrigins, unknownQueue, providerContexts, rejected, planningInventory };
}

export function finalizeObservationPlanningAudit(input: {
  inventory: ObservationPlanningInventoryV1;
  questions: readonly RuntimeResearchQuestion[];
  publicSourceAuthorityAdmissions: readonly PublicSourceAuthorityAdmission[];
}): ObservationPlanningAuditV1 {
  const subjectDecisions = input.inventory.subjects.map((subject) => {
    const question = input.questions.find((item) => item.subjectCode === subject.subjectCode);
    if (!question) throw new Error(`observation_planning_question_missing:${subject.subjectCode}`);
    const admittedAuthorityAvailable = input.publicSourceAuthorityAdmissions.some((admission) =>
      admission.allowedSubjectCodes.includes(question.subjectCode)
      && admission.allowedClaimTypes.includes(question.claimType)
      && admission.allowedEvidenceClasses.some((item) => question.requiredEvidenceClasses.includes(item))
      && (admission.allowedProcessorPrograms.length === 0 || (typeof question.scope.processorProgram === "string"
        && admission.allowedProcessorPrograms.includes(question.scope.processorProgram))));
    const sourceAuthorityAvailability = admittedAuthorityAvailable
      ? "existing_admitted_public_authority_available" as const
      : ["merchant_pricing_document_required", "processor_explanation_required", "unresolved_review_required"]
          .includes(question.eligibility)
        ? "account_document_resolution_likely_required" as const
        : question.publicResearchPlausible
          ? "dynamic_discovery_permitted_no_current_source_admission" as const
          : "public_research_inappropriate" as const;
    return { subjectCode: subject.subjectCode, registryRuleId: subject.registryRuleId,
      questionId: question.questionId, questionClass: subject.questionClass,
      rfResolutionStatus: question.rfResolution.status, eligibility: question.eligibility,
      selection: question.selection, materiality: question.materiality, priority: question.priority,
      sourceAuthorityAvailability, reasonCodes: [...question.reasonCodes] };
  });
  return {
    ...input.inventory,
    schemaVersion: "observation_planning_audit_v1",
    eligibleSubjectCount: subjectDecisions.filter((item) => item.eligibility === "eligible").length,
    selectedQuestionCount: subjectDecisions.filter((item) => item.selection === "selected").length,
    subjectDecisions,
  };
}

export function validateInvestigationQuestionOriginV1(origin: InvestigationQuestionOriginV1, availableEvidenceRefs?: ReadonlySet<string>): void {
  const exactPresumptions = ["economic_category", "ownership_or_control", "pricing_architecture", "removability", "savings"];
  const refsValid = origin.occurrenceRefs.length > 0 && origin.evidenceRefs.length > 0
    && origin.occurrenceRefs.every(isSafeStructuredString) && origin.evidenceRefs.every(isSafeStructuredString)
    && new Set(origin.occurrenceRefs).size === origin.occurrenceRefs.length && new Set(origin.evidenceRefs).size === origin.evidenceRefs.length;
  if (!Object.isFrozen(origin) || origin.schemaVersion !== "investigation_question_origin_v1"
    || origin.amendmentId !== E2E_INTERNAL_ANALYSIS_AMENDMENT_ID || origin.originLane !== "statement_observation"
    || origin.authority !== "account_private_noncanonical_observation" || origin.visibility !== "account_private"
    || origin.humanReviewRequired !== true || origin.canonicalMutationAllowed !== false
    || !isSafeStructuredString(origin.originId) || !isSafeStructuredString(origin.unknownRef)
    || !refsValid || origin.materialityBasis !== "observed_nonzero_charge" || origin.currency !== "USD"
    || JSON.stringify([...origin.prohibitedPresumptions].sort()) !== JSON.stringify(exactPresumptions)
    || origin.observedAmountMinor === null || !Number.isSafeInteger(origin.observedAmountMinor) || origin.observedAmountMinor <= 0
    || (availableEvidenceRefs && origin.evidenceRefs.some((ref) => !availableEvidenceRefs.has(ref)))) {
    throw new Error("invalid_investigation_question_origin_v1");
  }
  const registered = FISERV_OBSERVATION_SUBJECT_RULES.find((entry) => entry.questionClass === origin.questionClass
    && entry.subjectCode === origin.subjectCode && entry.safeResearchLabel === origin.safeResearchLabel);
  if (!registered || !registeredObservationSubjectIdentity(origin)
    || registered.questionText !== origin.questionText) throw new Error("unregistered_investigation_question_origin");
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 20); }
function safeProgramCode(value: string | null): string | null {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ?? "";
  return normalized && /^[a-z][a-z0-9_]{0,63}$/.test(normalized) ? normalized : null;
}

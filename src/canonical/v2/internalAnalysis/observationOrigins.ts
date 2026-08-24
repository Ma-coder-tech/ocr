import { createHash, randomUUID } from "node:crypto";
import { isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type { CanonicalEconomicsV2Foundation, CanonicalEconomicsV2SourceOccurrence } from "../types.js";
import { createRuntimeQuestionOrigin } from "../intelligence/questionPlanning.js";
import type { ProviderSafeQuestionContextV1, RuntimeQuestionOrigin } from "../intelligence/intelligenceTypes.js";
import { inspectProviderSafeQuestionContext } from "../intelligence/providerPrivacy.js";
import { createKnowledgeUnknownQueueItem } from "../knowledge/knowledgeUnknownQueue.js";
import { resolveKnowledge } from "../knowledge/knowledgeResolver.js";
import type { KnowledgeEntry, KnowledgeQueryScope, KnowledgeUnknownQueueItem } from "../knowledge/knowledgeTypes.js";
import { E2E_INTERNAL_ANALYSIS_AMENDMENT_ID } from "./internalAnalysisTypes.js";
import type { InvestigationQuestionClassV1, InvestigationQuestionOriginV1 } from "./internalAnalysisTypes.js";

type RegisteredClass = {
  questionClass: InvestigationQuestionClassV1;
  subjectCode: InvestigationQuestionOriginV1["subjectCode"];
  safeResearchLabel: InvestigationQuestionOriginV1["safeResearchLabel"];
  matches(normalizedLabel: string): boolean;
  questionText: string;
  reportDecisionCode: string;
};

const REGISTERED_CLASSES: readonly RegisteredClass[] = Object.freeze([
  {
    questionClass: "application_fee_public_definition",
    subjectCode: "application_fee_terminology",
    safeResearchLabel: "application fee",
    matches: (label) => label === "application fee",
    questionText: "Does an eligible authoritative public processor, platform, or program source define application fee terminology for the relevant public product context and period, and exactly what does that source establish?",
    reportDecisionCode: "application_fee_terminology_review",
  },
  {
    questionClass: "non_swiped_discount_public_definition",
    subjectCode: "non_swiped_discount_terminology",
    safeResearchLabel: "non swiped discount",
    matches: (label) => label.startsWith("non swiped discount"),
    questionText: "Does an eligible authoritative public source define non swiped discount terminology, calculation, or program context, and exactly what remains account specific?",
    reportDecisionCode: "non_swiped_discount_terminology_review",
  },
]);

export type ObservationOriginBuildResult = {
  origins: InvestigationQuestionOriginV1[];
  runtimeOrigins: RuntimeQuestionOrigin[];
  unknownQueue: KnowledgeUnknownQueueItem[];
  providerContexts: ProviderSafeQuestionContextV1[];
  rejected: Array<{ occurrenceRef: string; reasonCode: string }>;
};

export function buildStatementObservationInvestigationOrigins(input: {
  foundation: CanonicalEconomicsV2Foundation;
  admittedKnowledge: readonly KnowledgeEntry[];
  tenantRef: string;
  accountRef: string;
}): ObservationOriginBuildResult {
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
  const rejected: ObservationOriginBuildResult["rejected"] = [];
  const byClass = new Map<InvestigationQuestionClassV1, CanonicalEconomicsV2SourceOccurrence[]>();
  for (const occurrence of candidates) {
    const registered = REGISTERED_CLASSES.find((entry) => entry.matches(normalizeLabel(occurrence.sourceLabel)));
    if (!registered) {
      rejected.push({ occurrenceRef: occurrence.id, reasonCode: "observation_label_not_registered" });
      continue;
    }
    if (!occurrence.evidenceRef || !occurrence.id) {
      rejected.push({ occurrenceRef: occurrence.id || "unknown_occurrence", reasonCode: "observation_stable_evidence_required" });
      continue;
    }
    const existing = byClass.get(registered.questionClass) ?? [];
    if (!existing.some((item) => item.id === occurrence.id)) byClass.set(registered.questionClass, [...existing, occurrence]);
  }

  const origins: InvestigationQuestionOriginV1[] = [];
  const runtimeOrigins: RuntimeQuestionOrigin[] = [];
  const unknownQueue: KnowledgeUnknownQueueItem[] = [];
  const providerContexts: ProviderSafeQuestionContextV1[] = [];
  for (const registered of REGISTERED_CLASSES) {
    const occurrences = [...(byClass.get(registered.questionClass) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    if (occurrences.length === 0) continue;
    const occurrenceRefs = occurrences.map((item) => item.id);
    const evidenceRefs = [...new Set(occurrences.map((item) => item.evidenceRef))].sort();
    const originId = `investigation-origin-${digest(`${registered.questionClass}\0${occurrenceRefs.join("\0")}`)}`;
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
      requiredSourceAuthorities: ["processor_publication"],
      dependencyCodes: [`investigate_${registered.subjectCode}`],
      originatingFactKinds: ["statement_fee_observation"],
      originatingCanonicalRefs: [...occurrenceRefs, ...evidenceRefs],
      blockingEffect: "limits_authority",
      limitations: ["public_definition_does_not_establish_account_applicability", "no_economic_category_or_savings_inference"],
    });
    const runtimeOrigin = createRuntimeQuestionOrigin({
      unknownRef: unknown.id,
      themeRefs: [],
      originatingCanonicalRefs: [...occurrenceRefs, ...evidenceRefs],
      materiality: "material",
      priority: "material_operational_action",
      reportDecisionCode: registered.reportDecisionCode,
      possibleAnswerCodes: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"],
      requiredEvidenceClass: "official_processor_terminology",
      publicResearchPlausible: true,
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
  }
  return { origins, runtimeOrigins, unknownQueue, providerContexts, rejected };
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
  const registered = REGISTERED_CLASSES.find((entry) => entry.questionClass === origin.questionClass);
  if (!registered || registered.subjectCode !== origin.subjectCode || registered.safeResearchLabel !== origin.safeResearchLabel
    || registered.questionText !== origin.questionText) throw new Error("unregistered_investigation_question_origin");
}

function normalizeLabel(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 20); }
function safeProgramCode(value: string | null): string | null {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ?? "";
  return normalized && /^[a-z][a-z0-9_]{0,63}$/.test(normalized) ? normalized : null;
}

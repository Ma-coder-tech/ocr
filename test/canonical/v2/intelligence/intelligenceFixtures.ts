import type {
  IntelligencePorts,
  IntelligenceTimeoutResult,
  KnowledgeEntry,
  KnowledgeQueryScope,
  KnowledgeUnknownQueueItem,
  RuntimeClock,
  RuntimeQuestionOrigin,
} from "../../../../src/canonical/v2/index.js";
import { createKnowledgeUnknownQueueItem, createPublicSourceAuthorityAdmission, createRuntimeQuestionOrigin, knowledgeExact, resolveKnowledge, unboundedKnowledgeScope } from "../../../../src/canonical/v2/index.js";

export const queryScope: KnowledgeQueryScope = {
  tenantRef: "tenant-a",
  accountRef: "account-a",
  processor: "fiserv",
  acquirer: "fiserv",
  isoReseller: "iso-a",
  processorProgram: "program-a",
  network: "visa",
  region: "us",
  channel: "card_present",
  cardProduct: "credit",
  merchantCategory: "restaurant",
  pricingProgram: "interchange_plus",
  templateFamily: "fiserv",
  templateVersion: "v1",
  sourceSection: "notice",
  population: "visa_credit",
  jurisdiction: "us",
};

export function unknownItem(overrides: Partial<KnowledgeUnknownQueueItem> = {}): KnowledgeUnknownQueueItem {
  const merged: KnowledgeUnknownQueueItem = {
    id: "unknown-rule-1",
    claimType: "notice_external_rule",
    subjectCode: "visa_future_rule",
    status: "open",
    reason: "unresolved_no_admitted_knowledge",
    requiredSourceAuthorities: ["official_network_publication"],
    dependencyCodes: ["admitted_effective_dated_network_rule"],
    originatingFactKinds: ["statement_notice"],
    originatingCanonicalRefs: ["notice-1"],
    scope: { ...queryScope },
    asOf: "2026-08-01",
    blockingEffect: "limits_authority",
    limitations: [],
    resolvedByEntryRefs: [],
    ...overrides,
  };
  const query = { claimType: merged.claimType, subjectCode: merged.subjectCode, scope: merged.scope, asOf: merged.asOf };
  return createKnowledgeUnknownQueueItem({ id: merged.id, query, resolution: resolveKnowledge([], query), requiredSourceAuthorities: merged.requiredSourceAuthorities,
    dependencyCodes: merged.dependencyCodes, originatingFactKinds: merged.originatingFactKinds,
    originatingCanonicalRefs: merged.originatingCanonicalRefs, blockingEffect: merged.blockingEffect, limitations: merged.limitations });
}

export function questionOrigin(unknownRef = "unknown-rule-1", overrides: Partial<RuntimeQuestionOrigin> = {}): RuntimeQuestionOrigin {
  return createRuntimeQuestionOrigin({
    unknownRef,
    themeRefs: ["theme-1"],
    originatingCanonicalRefs: ["notice-1"],
    materiality: "material",
    priority: "material_network_rule",
    reportDecisionCode: "future_rule_applicability",
    possibleAnswerCodes: ["applies", "does_not_apply"],
    requiredEvidenceClass: "official_rule_publication",
    publicResearchPlausible: true,
    ...overrides,
  });
}

export function verifiedSearchMetadata(candidateCount: number, sequence = 1) {
  return {
    providerResponseId: `injected-search-response-${sequence}`,
    modelIdentifier: "injected-search-model",
    finishReason: "stop",
    webSearchRequestCount: 1,
    annotationCount: candidateCount,
    normalizedCandidateCount: candidateCount,
    providerCompletionState: "completed" as const,
    toolExecutionState: "verified" as const,
  };
}

export const officialSourceAdmission = createPublicSourceAuthorityAdmission({
  admissionId: "public-source-admission-1", admissionVersion: 1, authority: "official_network_publication", origin: "https://example.com",
  publicationFamilyCode: "official_network_rules", publicationMetadata: { title: "Official network rules", version: "v1", publicationDate: null,
    samplePeriodStart: null, samplePeriodEnd: null, effectiveFrom: null, effectiveTo: null, periodApplicabilityPolicy: "period_not_applicable",
    retrievalVerifiedOn: "2026-08-24", provenanceUrls: [] }, pathMatchMode: "path_family", maximumEvidentiaryScope: "claim_class_only",
  allowedClaimTypes: ["notice_external_rule"],
  allowedEvidenceClasses: ["official_rule_publication"], allowedSourceTypeCodes: ["official_rule"],
  allowedSubjectCodes: ["visa_future_rule"], allowedProcessorPrograms: ["program-a"],
  allowedGeographyCodes: ["us"], allowedPathPrefixes: ["/rule*", "/official-rule", "/current", "/injection"],
  approvedDocumentFingerprints: [],
});

export function admittedRule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "knowledge-rule-1",
    version: 1,
    claimType: "notice_external_rule",
    subjectCode: "visa_future_rule",
    value: { kind: "rule", ruleCode: "visa_future_rule", outcomeCode: "applies" },
    scope: {
      ...unboundedKnowledgeScope(),
      processor: knowledgeExact("fiserv"),
      processorProgram: knowledgeExact("program-a"),
      network: knowledgeExact("visa"),
      region: knowledgeExact("us"),
      jurisdiction: knowledgeExact("us"),
    },
    visibility: "reusable",
    tenantRef: null,
    accountRef: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    evidence: [{ ref: "official-rule-1", sourceAuthority: "official_network_publication", private: false }],
    admission: {
      lifecycle: "admitted",
      authorityClass: "authorized_domain_reviewer",
      authorityRef: "review-role-1",
      admittedAt: "2026-01-02T00:00:00Z",
      conditions: [],
    },
    supersedes: [],
    limitations: [],
    confidence: "high",
    ...overrides,
  };
}

export class FakeClock implements RuntimeClock {
  private value = 0;
  constructor(private readonly forced: "completed" | "timeout" | "failed" = "completed", private readonly elapsedPerCall = 1) {}
  nowMs(): number { return this.value; }
  advance(ms: number): void { this.value += ms; }
  async runWithTimeout<T>(_timeoutMs: number, operation: () => Promise<T>): Promise<IntelligenceTimeoutResult<T>> {
    this.value += this.elapsedPerCall;
    if (this.forced === "timeout") return { status: "timeout" };
    if (this.forced === "failed") return { status: "failed", reasonCode: "fake_provider_failure" };
    try {
      return { status: "completed", value: await operation() };
    } catch {
      return { status: "failed", reasonCode: "fake_operation_failure" };
    }
  }
}

export function disabledPorts(clock: RuntimeClock = new FakeClock()): IntelligencePorts {
  return { clock };
}

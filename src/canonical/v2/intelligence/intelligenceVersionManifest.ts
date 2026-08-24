import type { RgSemanticAmendmentId } from "./intelligenceTypes.js";
import { RG_SEMANTIC_AMENDMENT_IDS } from "./intelligenceTypes.js";

export const CANONICAL_INTELLIGENCE_V2_VERSION_MANIFEST = Object.freeze({
  schemaVersion: "canonical_intelligence_v2_runtime_v1",
  policyVersion: "runtime_intelligence_policy_v0_1",
  budgetProfile: "RG-FREE-v1",
  authority: "shadow_non_authoritative",
  persistence: "none",
  providerExecution: "injected_evaluation",
  automaticProviderRetries: 0,
  schemaRepairRetries: 0,
  knowledgeAdmissionAuthority: "prohibited",
  canonicalMutationAuthority: "prohibited",
  reportAuthority: "prohibited",
  customerExposure: "none",
  semanticAmendments: [...RG_SEMANTIC_AMENDMENT_IDS] as RgSemanticAmendmentId[],
} as const);

export const RG_SEMANTIC_AMENDMENT_REASONS: Record<RgSemanticAmendmentId, string> = {
  "RG-AMEND-001-DETERMINISTIC-QUESTION-SELECTION": "Research questions originate from explicit unresolved canonical dependencies and deterministic materiality.",
  "RG-AMEND-002-ADMITTED-KNOWLEDGE-FIRST": "Applicable admitted RF knowledge resolves a question before any external research budget is spent.",
  "RG-AMEND-003-RESERVATION-BOUNDED-EXECUTION": "Every bounded operation reserves its approved budget before execution and failures remain consumed.",
  "RG-AMEND-004-IDENTITY-COMPLETE-RESEARCH-GRAPH": "Question, attempt, candidate, document, locator, support, and candidate-packet identities remain exact.",
  "RG-AMEND-005-SEMANTIC-NOT-SUBSTRING-SUPPORT": "Text presence can locate evidence but cannot semantically verify a claim.",
  "RG-AMEND-006-CANDIDATE-NOT-ADMISSION": "Research emits account-private RF candidates requiring human admission and never self-promotes.",
  "RG-AMEND-007-FAILURE-PRESERVES-CANONICAL-TRUTH": "Provider, retrieval, document, budget, and semantic failures leave deterministic truth intact.",
  "RG-AMEND-008-AI-NON-MUTATION": "AI observations have no financial, economic, knowledge-admission, or report mutation authority.",
  "RG-AMEND-009-UNTRUSTED-CONTENT-ISOLATION": "Statement and external content remain untrusted data and cannot modify runtime instructions or tools.",
  "RG-AMEND-010-BOUNDED-THEME-LANGUAGE-CANDIDATE": "Theme language remains non-authoritative, validated against canonical references, and always has a deterministic fallback.",
};

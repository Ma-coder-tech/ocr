export const CANONICAL_KNOWLEDGE_V2_SCHEMA_VERSION = "payments_knowledge_library_v0_2" as const;

export const CANONICAL_KNOWLEDGE_V2_AMENDMENTS = [
  "RF-AMEND-001-CLAIM-SPECIFIC-KNOWLEDGE",
  "RF-AMEND-002-SCOPE-TENANT-ISOLATION",
  "RF-AMEND-003-EXPLICIT-ADMISSION",
  "RF-AMEND-004-DETERMINISTIC-SPECIFICITY",
  "RF-AMEND-005-CONFLICT-REFUSAL",
  "RF-AMEND-006-EFFECTIVE-DATED-SUPERSESSION",
  "RF-AMEND-007-CANDIDATE-AUTHORITY-SEPARATION",
  "RF-AMEND-008-FIRST-CLASS-UNKNOWN-QUEUE",
] as const;

export const canonicalKnowledgeV2VersionManifest = {
  schemaVersion: CANONICAL_KNOWLEDGE_V2_SCHEMA_VERSION,
  authority: "shadow_non_authoritative",
  persistence: "durable_append_only_governed_catalog",
  runtimeConnection: "production_analysis_run_immutable_snapshot",
  customerVisibility: "none",
  aiAuthority: "prohibited",
  realSeedAdmission: "prohibited",
  intervalConvention: "closed_open_[effectiveFrom,effectiveTo)",
  amendments: CANONICAL_KNOWLEDGE_V2_AMENDMENTS,
} as const;

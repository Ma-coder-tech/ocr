export const F1_GRAPH_SCHEMA_VERSION = "claim_authority_graph_f1_v1" as const;
export const F1_EVALUATOR_VERSION = "claim_authority_representational_f1_v1" as const;

// Version-pinned vocabulary. Tests compare this mirror with the frozen Gold register.
export const claimDimensions = [
  "observation", "calculation", "template_relationship", "economic_broad_category",
  "official_normalized_identity", "pricing_architecture", "biller_statement_issuer",
  "collector", "economic_beneficiary", "contractual_controller",
  "merchant_facing_price_controller", "retained_margin_recipient", "reference_comparison",
  "contractual_pass_through", "recurrence", "cadence", "annualization_permission",
  "annualized_amount", "estimated_annual_amount", "benchmark", "counterfactual",
  "actionability", "savings", "product_policy", "resolution",
] as const;
export const reasoningClasses = [
  "direct_observation", "deterministic_calculation", "template_structural_inference",
  "economic_structural_inference", "governed_public_dependency", "merchant_private_dependency",
  "product_policy_judgment",
] as const;
export const authorityLanes = [
  "statement_source_document", "deterministic_arithmetic", "versioned_template_mapping",
  "statement_structural_evidence", "governed_network_regulator",
  "governed_processor_acquirer_publication", "governed_public_mixed",
  "merchant_private_contract_or_correspondence", "reviewed_product_policy",
  "synthetic_falsification_input",
] as const;
export const universalityScopes = [
  "universal_acquiring_accounting", "network_specific", "processor_family_specific",
  "template_specific", "merchant_account_specific", "product_policy_only",
] as const;

export type ClaimDimension = (typeof claimDimensions)[number];
export type ReasoningClass = (typeof reasoningClasses)[number];
export type AuthorityLane = (typeof authorityLanes)[number];
export type UniversalityScope = (typeof universalityScopes)[number];

export const identityFactPaths = [
  "identity.merchantName", "identity.merchantIdentifier", "identity.processorName",
  "identity.processorFamily", "identity.statementPeriod", "identity.businessType",
] as const;
export const financialFactPaths = [
  "financialFacts.processedSales", "financialFacts.totalFees",
  "financialFacts.rateRevealCalculatedAllInRate", "financialFacts.processorStatedRate",
  "financialFacts.averageTicket", "financialFacts.amountFunded", "financialFacts.adjustments",
  "financialFacts.credits", "financialFacts.refunds",
] as const;
export const transactionCountPaths = [
  "financialFacts.transactionCounts.submittedTransactions",
  "financialFacts.transactionCounts.settledTransactions",
  "financialFacts.transactionCounts.authorizations",
  "financialFacts.transactionCounts.captures",
  "financialFacts.transactionCounts.refunds",
  "financialFacts.transactionCounts.chargebacks",
  "financialFacts.transactionCounts.networkTransactions",
  "financialFacts.transactionCounts.cardTypeItems",
  "financialFacts.transactionCounts.auditSpecificCounts",
  "financialFacts.transactionCounts.unknownCounts",
] as const;
export const canonicalFactPaths = [...identityFactPaths, ...financialFactPaths, ...transactionCountPaths] as const;
export type CanonicalFactPath = (typeof canonicalFactPaths)[number];

export type CanonicalRef =
  | { kind: "fact"; path: CanonicalFactPath; selectedCandidateId: string | null }
  | { kind: "fee_row" | "fee_occurrence" | "fee_interpretation" | "fee_control" | "calculation" | "evidence" | "cross_summary_node" | "cross_summary_relationship" | "fee_rollup"; id: string };

export type F1ClaimValue =
  | { kind: "known"; representation: "canonical_reference"; ref: CanonicalRef }
  | { kind: "known"; representation: "semantic_code"; code: string }
  | { kind: "unknown"; reasonCode: string }
  | { kind: "not_applicable"; reasonCode: string };

export type F1Claim = {
  claimId: string;
  candidateKey: string;
  subject: CanonicalRef;
  dimension: ClaimDimension;
  semanticCode: string;
  value: F1ClaimValue;
  reasoning: {
    primaryClass: ReasoningClass | null;
    supportingClasses: ReasoningClass[];
    ruleId: string | null;
    ruleVersion: string | null;
  };
  authority: {
    requiredLanes: AuthorityLane[];
    satisfiedLanes: AuthorityLane[];
    assessment: "not_evaluated";
  };
  resolution: {
    status: "represented_observation" | "candidate_only" | "unresolved" | "not_applicable" | "conflict" | "refused";
    reasonCode: string | null;
    blockedDimensions: ClaimDimension[];
  };
  temporal: { start: string; end: string } | null;
  universality: UniversalityScope;
  evidenceRefs: string[];
  calculationRefs: string[];
  canonicalRefs: CanonicalRef[];
  policyDependency: { ruleId: string; ruleVersion: string } | null;
};

export type F1ClaimDraft = Omit<F1Claim, "claimId">;
export type F1Edge = {
  kind: "depends_on" | "contradicts" | "policy_depends_on";
  fromClaimId: string;
  toClaimId: string;
};
export type F1EdgeDraft = {
  kind: F1Edge["kind"];
  fromCandidateKey: string;
  toCandidateKey: string;
};
export type F1ConflictGroup = {
  conflictId: string;
  claimIds: string[];
  sourceRelationshipRef: CanonicalRef | null;
  status: "unresolved";
};
export type F1ConflictDraft = {
  candidateKeys: string[];
  sourceRelationshipRef: CanonicalRef | null;
};

export type F1ClaimGraph = {
  schemaVersion: typeof F1_GRAPH_SCHEMA_VERSION;
  evaluatorVersion: typeof F1_EVALUATOR_VERSION;
  canonicalAnalysisId: string;
  canonicalSchemaVersion: "canonical_statement_analysis_v1";
  canonicalVersionDigest: string;
  canonicalInputDigest: string;
  graphId: string;
  claims: F1Claim[];
  edges: F1Edge[];
  conflicts: F1ConflictGroup[];
};

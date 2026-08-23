import type {
  KnowledgeClaimType,
  KnowledgeScopeDimensionName,
  KnowledgeSourceAuthority,
} from "./knowledgeTypes.js";

export type KnowledgeClaimPolicy = {
  allowedSourceAuthorities: readonly KnowledgeSourceAuthority[];
  precedence: readonly (readonly KnowledgeSourceAuthority[])[];
  reusableUnboundedDimensions: readonly KnowledgeScopeDimensionName[];
};

const PUBLIC_OR_REVIEWED = [
  "official_network_publication",
  "processor_publication",
  "admitted_template_specification",
  "approved_internal_manual_mapping",
  "synthetic_test_fixture",
] as const;

const CONTRACT_OR_OBSERVED = [
  "merchant_contract",
  "account_statement_observation",
  "processor_publication",
  "official_network_publication",
  "synthetic_test_fixture",
] as const;

const policy = (
  allowedSourceAuthorities: readonly KnowledgeSourceAuthority[],
  precedence: readonly (readonly KnowledgeSourceAuthority[])[] = [],
  reusableUnboundedDimensions: readonly KnowledgeScopeDimensionName[] = [],
): KnowledgeClaimPolicy => ({ allowedSourceAuthorities, precedence, reusableUnboundedDimensions });

const ALL_SCOPE_DIMENSIONS: readonly KnowledgeScopeDimensionName[] = [
  "processor", "processorProgram", "network", "region", "channel", "cardProduct",
  "merchantCategory", "pricingProgram", "templateFamily", "templateVersion",
  "acquirer", "isoReseller", "sourceSection", "population", "jurisdiction",
];
const EXCEPT_NETWORK = ALL_SCOPE_DIMENSIONS.filter((item) => item !== "network");
const EXCEPT_NETWORK_REGION = ALL_SCOPE_DIMENSIONS.filter((item) => item !== "network" && item !== "region" && item !== "jurisdiction");
const EXCEPT_TEMPLATE = ALL_SCOPE_DIMENSIONS.filter((item) => item !== "templateFamily" && item !== "templateVersion");

export const KNOWLEDGE_CLAIM_POLICIES: Record<KnowledgeClaimType, KnowledgeClaimPolicy> = {
  template_identity: policy(PUBLIC_OR_REVIEWED, [["admitted_template_specification"]], EXCEPT_TEMPLATE),
  template_section_semantics: policy(PUBLIC_OR_REVIEWED, [["admitted_template_specification"]], EXCEPT_TEMPLATE),
  alias_identity: policy(PUBLIC_OR_REVIEWED, [["approved_internal_manual_mapping"], ["official_network_publication", "processor_publication"]], ALL_SCOPE_DIMENSIONS),
  network_program_mapping: policy(PUBLIC_OR_REVIEWED, [["official_network_publication"], ["approved_internal_manual_mapping"]], EXCEPT_NETWORK),
  stable_facet_mapping: policy(PUBLIC_OR_REVIEWED, [["admitted_template_specification"], ["approved_internal_manual_mapping"]], ALL_SCOPE_DIMENSIONS),
  published_network_rate: policy(
    ["official_network_publication", "synthetic_test_fixture"],
    [["official_network_publication"]],
    EXCEPT_NETWORK_REGION,
  ),
  processor_term: policy(["processor_publication", "merchant_contract", "synthetic_test_fixture"], [["merchant_contract"], ["processor_publication"]], ALL_SCOPE_DIMENSIONS),
  merchant_account_term: policy(["merchant_contract", "account_statement_observation", "statement_observation", "verified_cross_statement_observation", "synthetic_test_fixture"], [["merchant_contract"], ["account_statement_observation", "statement_observation", "verified_cross_statement_observation"]], ALL_SCOPE_DIMENSIONS),
  refund_underlying_cost_rule: policy(["official_network_publication", "merchant_contract", "synthetic_test_fixture"], [["merchant_contract"], ["official_network_publication"]], ALL_SCOPE_DIMENSIONS),
  refund_processor_pricing_rule: policy(["merchant_contract", "processor_publication", "synthetic_test_fixture"], [["merchant_contract"], ["processor_publication"]], ALL_SCOPE_DIMENSIONS),
  pricing_program_rule: policy(CONTRACT_OR_OBSERVED, [["merchant_contract"], ["processor_publication"], ["official_network_publication"]], ALL_SCOPE_DIMENSIONS),
  dispute_threshold_rule: policy(["official_network_publication", "merchant_contract", "synthetic_test_fixture"], [["official_network_publication"], ["merchant_contract"]], ALL_SCOPE_DIMENSIONS),
  participant_control_role: policy(["merchant_contract", "processor_publication", "official_network_publication", "synthetic_test_fixture"], [["merchant_contract"], ["official_network_publication", "processor_publication"]], ALL_SCOPE_DIMENSIONS),
  amex_acceptance_structure: policy(["merchant_contract", "processor_publication", "official_network_publication", "synthetic_test_fixture"], [["merchant_contract"], ["official_network_publication", "processor_publication"]], ALL_SCOPE_DIMENSIONS),
  notice_notification_fact: policy(["account_statement_observation", "statement_observation", "verified_cross_statement_observation", "merchant_contract", "synthetic_test_fixture"], [["merchant_contract"], ["account_statement_observation", "statement_observation", "verified_cross_statement_observation"]], ALL_SCOPE_DIMENSIONS),
  notice_external_rule: policy(["official_network_publication", "processor_publication", "merchant_contract", "synthetic_test_fixture"], [["merchant_contract"], ["official_network_publication", "processor_publication"]], ALL_SCOPE_DIMENSIONS),
  merchant_lever_availability: policy(["merchant_contract", "official_network_publication", "processor_publication", "synthetic_test_fixture"], [["merchant_contract"], ["official_network_publication", "processor_publication"]], ALL_SCOPE_DIMENSIONS),
  benchmark_qualification: policy(["official_network_publication", "processor_publication", "merchant_contract", "synthetic_test_fixture"], [["official_network_publication", "processor_publication"], ["merchant_contract"]], ALL_SCOPE_DIMENSIONS),
};

export const RESOLVING_LIFECYCLE_STATES = new Set(["admitted", "admitted_with_conditions"]);
export const APPROVED_ADMISSION_AUTHORITIES = new Set(["product_owner", "authorized_domain_reviewer", "data_steward"]);
export const NON_AUTHORITATIVE_SOURCE_CLASSES = new Set(["legacy_reference_candidate", "automated_retrieval", "ai_inference"]);

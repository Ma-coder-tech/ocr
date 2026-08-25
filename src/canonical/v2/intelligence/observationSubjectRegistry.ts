import type { RuntimeQuestionPriority } from "./intelligenceTypes.js";
import type { KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";

export const FISERV_OBSERVATION_SUBJECT_REGISTRY_ID = "fiserv_observation_subject_registry" as const;
export const FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION = "1.0.0" as const;

export type ObservationResearchQuestionClass =
  | "application_fee_public_definition"
  | "non_swiped_discount_public_definition"
  | "observed_statement_term_public_definition";

export type RegisteredObservationSubjectCode =
  | "application_fee_terminology"
  | "non_swiped_discount_terminology"
  | "payment_network_assessment_fee_terminology"
  | "network_authorization_fee_terminology"
  | "discover_data_usage_fee_terminology"
  | "visa_transaction_integrity_fee_terminology";

export type ObservationCalculationSuffixKind =
  | "none"
  | "transaction_count_at_rate"
  | "rate_times_amount"
  | "transaction_count_totaling_amount";

export type NormalizedObservationLabel = {
  exactNormalizedLabel: string;
  calculationFreeLabel: string;
  calculationSuffixKind: ObservationCalculationSuffixKind;
};

export type ObservationSubjectRegistryRule = {
  ruleId: string;
  registryVersion: typeof FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION;
  eligibleTemplateFamilies: readonly string[];
  eligibleSourceSections: readonly string[];
  matchKind: "exact_calculation_free_label" | "normalized_prefix";
  normalizedPatterns: readonly string[];
  permittedCalculationSuffixes: readonly ObservationCalculationSuffixKind[];
  subjectCode: RegisteredObservationSubjectCode;
  claimType: "processor_term";
  questionClass: ObservationResearchQuestionClass;
  safeResearchLabel: string;
  questionText: string;
  reportDecisionCode: string;
  requiredSourceAuthorities: readonly KnowledgeSourceAuthority[];
  requiredEvidenceClass: "official_processor_terminology";
  priority: RuntimeQuestionPriority;
  materiality: "material";
  blockingEffect: "limits_authority";
  publicResearchPlausible: true;
  reasonCode: string;
  limitations: readonly string[];
  originIdentityCode: string;
};

const SHARED_LIMITATIONS = Object.freeze([
  "public_definition_does_not_establish_account_applicability",
  "no_economic_category_ownership_control_or_savings_inference",
]);

function rule(value: ObservationSubjectRegistryRule): ObservationSubjectRegistryRule {
  return Object.freeze(value);
}

export const FISERV_OBSERVATION_SUBJECT_RULES = [
  rule({
    ruleId: "fiserv_short_application_fee_exact_v1",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_short_structural_mapping"],
    eligibleSourceSections: ["ACCOUNT FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: ["application fee"],
    permittedCalculationSuffixes: ["none"],
    subjectCode: "application_fee_terminology",
    claimType: "processor_term",
    questionClass: "application_fee_public_definition",
    safeResearchLabel: "application fee",
    questionText: "Does an eligible authoritative public processor, platform, or program source define application fee terminology for the relevant public product context and period, and exactly what does that source establish?",
    reportDecisionCode: "application_fee_terminology_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_short_application_fee_exact",
    limitations: SHARED_LIMITATIONS,
    originIdentityCode: "application_fee_public_definition",
  }),
  rule({
    ruleId: "fiserv_short_non_swiped_discount_prefix_v1",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_short_structural_mapping"],
    eligibleSourceSections: ["TRANSACTION FEES"],
    matchKind: "normalized_prefix",
    normalizedPatterns: ["non swiped discount"],
    permittedCalculationSuffixes: ["none"],
    subjectCode: "non_swiped_discount_terminology",
    claimType: "processor_term",
    questionClass: "non_swiped_discount_public_definition",
    safeResearchLabel: "non swiped discount",
    questionText: "Does an eligible authoritative public source define non swiped discount terminology, calculation, or program context, and exactly what remains account specific?",
    reportDecisionCode: "non_swiped_discount_terminology_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_short_non_swiped_discount_prefix",
    limitations: SHARED_LIMITATIONS,
    originIdentityCode: "non_swiped_discount_public_definition",
  }),
  rule({
    ruleId: "fiserv_full_assessment_fee_terms_v1",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_full_statement"],
    eligibleSourceSections: ["TRANSACTION FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: [
      "amex assessment fee",
      "discover assessment fee",
      "discover dues assessment fee",
      "mastercard assessment fee",
      "visa assessment fee cr",
      "visa assessment fee db",
    ],
    permittedCalculationSuffixes: ["rate_times_amount"],
    subjectCode: "payment_network_assessment_fee_terminology",
    claimType: "processor_term",
    questionClass: "observed_statement_term_public_definition",
    safeResearchLabel: "payment network assessment fee",
    questionText: "Does an eligible authoritative public processor publication define or present payment network assessment fee terminology for the relevant public product context and period, and what scope limitations does it state?",
    reportDecisionCode: "payment_network_assessment_fee_terminology_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_assessment_fee_term",
    limitations: SHARED_LIMITATIONS,
    originIdentityCode: "observed_statement_term_public_definition:payment_network_assessment_fee_terminology",
  }),
  rule({
    ruleId: "fiserv_full_network_authorization_fee_exact_v1",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_full_statement"],
    eligibleSourceSections: ["TRANSACTION FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: ["network authorization fee"],
    permittedCalculationSuffixes: ["transaction_count_at_rate"],
    subjectCode: "network_authorization_fee_terminology",
    claimType: "processor_term",
    questionClass: "observed_statement_term_public_definition",
    safeResearchLabel: "network authorization fee",
    questionText: "Does an eligible authoritative public processor publication define or present network authorization fee terminology for the relevant public product context and period, and what scope limitations does it state?",
    reportDecisionCode: "network_authorization_fee_terminology_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_network_authorization_fee_exact",
    limitations: SHARED_LIMITATIONS,
    originIdentityCode: "observed_statement_term_public_definition:network_authorization_fee_terminology",
  }),
  rule({
    ruleId: "fiserv_full_discover_data_usage_fee_exact_v1",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_full_statement"],
    eligibleSourceSections: ["TRANSACTION FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: ["discover data usage fee"],
    permittedCalculationSuffixes: ["transaction_count_at_rate"],
    subjectCode: "discover_data_usage_fee_terminology",
    claimType: "processor_term",
    questionClass: "observed_statement_term_public_definition",
    safeResearchLabel: "discover data usage fee",
    questionText: "Does an eligible authoritative public processor publication define or present Discover data usage fee terminology for the relevant public product context and period, and what scope limitations does it state?",
    reportDecisionCode: "discover_data_usage_fee_terminology_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_discover_data_usage_fee_exact",
    limitations: SHARED_LIMITATIONS,
    originIdentityCode: "observed_statement_term_public_definition:discover_data_usage_fee_terminology",
  }),
  rule({
    ruleId: "fiserv_full_visa_transaction_integrity_fee_exact_v1",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_full_statement"],
    eligibleSourceSections: ["ACCOUNT FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: ["vi transaction integrity fee"],
    permittedCalculationSuffixes: ["transaction_count_at_rate"],
    subjectCode: "visa_transaction_integrity_fee_terminology",
    claimType: "processor_term",
    questionClass: "observed_statement_term_public_definition",
    safeResearchLabel: "visa transaction integrity fee",
    questionText: "Does an eligible authoritative public processor publication define or present Visa transaction integrity fee terminology for the relevant public product context and period, and what scope limitations does it state?",
    reportDecisionCode: "visa_transaction_integrity_fee_terminology_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_visa_transaction_integrity_fee_exact",
    limitations: SHARED_LIMITATIONS,
    originIdentityCode: "observed_statement_term_public_definition:visa_transaction_integrity_fee_terminology",
  }),
] as const satisfies readonly ObservationSubjectRegistryRule[];

export function normalizeObservationLabel(value: string): NormalizedObservationLabel {
  const exactNormalizedLabel = value.toLowerCase().replace(/\[redacted-id\]/g, " redacted id ")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const suffixes: Array<[ObservationCalculationSuffixKind, RegExp]> = [
    ["transaction_count_at_rate", /\s+\d+\s+transactions?\s+at\s+.+$/],
    ["transaction_count_totaling_amount", /\s+\d+\s+trans\s+totaling\s+.+$/],
    ["rate_times_amount", /\s+(?:\d|redacted\s+id)(?:[a-z0-9 ]*?)\s+(?:disc\s+rate\s+)?times(?:\s+.*)?$/],
  ];
  for (const [kind, expression] of suffixes) {
    const calculationFreeLabel = exactNormalizedLabel.replace(expression, "").trim();
    if (calculationFreeLabel !== exactNormalizedLabel && calculationFreeLabel.length > 0) {
      return { exactNormalizedLabel, calculationFreeLabel, calculationSuffixKind: kind };
    }
  }
  return { exactNormalizedLabel, calculationFreeLabel: exactNormalizedLabel, calculationSuffixKind: "none" };
}

export function resolveObservationSubjectRule(input: {
  templateFamily: string | null;
  sourceSection: string;
  normalized: NormalizedObservationLabel;
}): ObservationSubjectRegistryRule | null {
  return FISERV_OBSERVATION_SUBJECT_RULES.find((rule) => {
    if (!input.templateFamily || !rule.eligibleTemplateFamilies.includes(input.templateFamily)
      || !rule.eligibleSourceSections.includes(input.sourceSection)
      || !rule.permittedCalculationSuffixes.includes(input.normalized.calculationSuffixKind)) return false;
    return rule.matchKind === "normalized_prefix"
      ? rule.normalizedPatterns.some((pattern) => input.normalized.exactNormalizedLabel.startsWith(pattern))
      : rule.normalizedPatterns.includes(input.normalized.calculationFreeLabel);
  }) ?? null;
}

export function registeredObservationSubjectIdentity(input: {
  questionClass: string;
  subjectCode?: string;
  safeResearchLabel?: string;
}): boolean {
  return FISERV_OBSERVATION_SUBJECT_RULES.some((rule) => rule.questionClass === input.questionClass
    && (input.subjectCode === undefined || rule.subjectCode === input.subjectCode)
    && (input.safeResearchLabel === undefined || rule.safeResearchLabel === input.safeResearchLabel));
}

export function registryRuleForSubject(subjectCode: string): ObservationSubjectRegistryRule | null {
  return FISERV_OBSERVATION_SUBJECT_RULES.find((rule) => rule.subjectCode === subjectCode) ?? null;
}

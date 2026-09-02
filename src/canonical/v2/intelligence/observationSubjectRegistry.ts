import type { ExtractedLocator, RuntimeQuestionPriority } from "./intelligenceTypes.js";
import type { KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";
import {
  normalizeObservationLabel,
  type NormalizedObservationLabel,
  type ObservationCalculationSuffixKind,
} from "../sourceLabelIdentity.js";

export { normalizeObservationLabel } from "../sourceLabelIdentity.js";
export type { NormalizedObservationLabel, ObservationCalculationSuffixKind } from "../sourceLabelIdentity.js";

export const FISERV_OBSERVATION_SUBJECT_REGISTRY_ID = "fiserv_observation_subject_registry" as const;
export const FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION = "2.0.0" as const;

export type ObservationResearchQuestionClass =
  | "application_fee_public_definition"
  | "non_swiped_discount_public_definition"
  | "observed_processor_term_historical_presentation";

export type RegisteredObservationSubjectCode =
  | "application_fee_terminology"
  | "non_swiped_discount_terminology"
  | "fiserv_multi_network_assessment_fee_historical_presentation"
  | "fiserv_discover_network_authorization_fee_historical_presentation"
  | "fiserv_discover_data_usage_fee_historical_presentation"
  | "fiserv_visa_transaction_integrity_fee_historical_presentation";

export type ProcessorPresentationLocatorCoverageRequirement = {
  coverageCode: string;
  requiredNormalizedTerms: readonly string[];
};

export type ProcessorPresentationLocatorTarget = {
  coverageCode: string;
  locator: ExtractedLocator;
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
  processorPresentationLocatorCoverage: readonly ProcessorPresentationLocatorCoverageRequirement[];
};

const SHARED_LIMITATIONS = Object.freeze([
  "public_definition_does_not_establish_account_applicability",
  "no_economic_category_ownership_control_or_savings_inference",
]);

const HISTORICAL_PROCESSOR_PRESENTATION_LIMITATIONS = Object.freeze([
  "historical_processor_presentation_only",
  "fiserv_cardpointe_publication_scope_only",
  "processor_publication_not_network_authority",
  "october_2024_continuity_unproven",
  "statement_account_and_clover_applicability_unproven",
  "merchant_contract_applicability_unproven",
  "ownership_margin_markup_and_pass_through_unresolved",
  "merchant_control_negotiability_avoidability_and_removability_unresolved",
  "statement_calculation_and_savings_unresolved",
  "contract_or_bundling_terms_may_control",
]);

function rule(value: ObservationSubjectRegistryRule): ObservationSubjectRegistryRule {
  return Object.freeze({
    ...value,
    processorPresentationLocatorCoverage: Object.freeze(value.processorPresentationLocatorCoverage.map((coverage) => Object.freeze({
      ...coverage,
      requiredNormalizedTerms: Object.freeze([...coverage.requiredNormalizedTerms]),
    }))),
  });
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
    processorPresentationLocatorCoverage: [],
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
    processorPresentationLocatorCoverage: [],
  }),
  rule({
    ruleId: "fiserv_full_multi_network_assessment_historical_presentation_v2",
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
    subjectCode: "fiserv_multi_network_assessment_fee_historical_presentation",
    claimType: "processor_term",
    questionClass: "observed_processor_term_historical_presentation",
    safeResearchLabel: "Fiserv historical multi network assessment fee presentation",
    questionText: "Does an eligible Fiserv processor publication historically present the complete Visa, Mastercard, Discover, and American Express assessment label set, and exactly what historical explanations and scope limitations does that processor publication state?",
    reportDecisionCode: "fiserv_multi_network_assessment_fee_historical_presentation_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_fiserv_multi_network_assessment_historical_presentation",
    limitations: HISTORICAL_PROCESSOR_PRESENTATION_LIMITATIONS,
    originIdentityCode: "observed_processor_term_historical_presentation:fiserv_multi_network_assessment_fee",
    processorPresentationLocatorCoverage: [
      { coverageCode: "visa_assessment_presentation", requiredNormalizedTerms: ["visa assessment fee db", "visa assessment fee cr"] },
      { coverageCode: "mastercard_assessment_presentation", requiredNormalizedTerms: ["mastercard assessment fee"] },
      { coverageCode: "discover_assessment_presentation", requiredNormalizedTerms: ["discover assessment fee"] },
      { coverageCode: "american_express_assessment_presentation", requiredNormalizedTerms: ["american express assessment fee", "amex assessment fee"] },
    ],
  }),
  rule({
    ruleId: "fiserv_full_discover_network_authorization_historical_presentation_v2",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_full_statement"],
    eligibleSourceSections: ["TRANSACTION FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: ["network authorization fee"],
    permittedCalculationSuffixes: ["transaction_count_at_rate"],
    subjectCode: "fiserv_discover_network_authorization_fee_historical_presentation",
    claimType: "processor_term",
    questionClass: "observed_processor_term_historical_presentation",
    safeResearchLabel: "Fiserv historical Discover Network Authorization Fee presentation",
    questionText: "Does an eligible Fiserv processor publication historically present Discover Network Authorization Fee as Network Authorization Fee, and exactly what historical explanation, network context, contract or bundling caveat, and scope limitations does that processor publication state?",
    reportDecisionCode: "fiserv_discover_network_authorization_fee_historical_presentation_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_fiserv_discover_network_authorization_historical_presentation",
    limitations: HISTORICAL_PROCESSOR_PRESENTATION_LIMITATIONS,
    originIdentityCode: "observed_processor_term_historical_presentation:fiserv_discover_network_authorization_fee",
    processorPresentationLocatorCoverage: [
      { coverageCode: "discover_network_authorization_presentation", requiredNormalizedTerms: ["discover network authorization fee", "network authorization fee"] },
    ],
  }),
  rule({
    ruleId: "fiserv_full_discover_data_usage_historical_presentation_v2",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_full_statement"],
    eligibleSourceSections: ["TRANSACTION FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: ["discover data usage fee"],
    permittedCalculationSuffixes: ["transaction_count_at_rate"],
    subjectCode: "fiserv_discover_data_usage_fee_historical_presentation",
    claimType: "processor_term",
    questionClass: "observed_processor_term_historical_presentation",
    safeResearchLabel: "Fiserv historical Discover Data Usage Fee presentation",
    questionText: "Does an eligible Fiserv processor publication historically present Discover Data Usage Fee, and exactly what historical explanation, network context, contract or bundling caveat, and scope limitations does that processor publication state?",
    reportDecisionCode: "fiserv_discover_data_usage_fee_historical_presentation_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_fiserv_discover_data_usage_historical_presentation",
    limitations: HISTORICAL_PROCESSOR_PRESENTATION_LIMITATIONS,
    originIdentityCode: "observed_processor_term_historical_presentation:fiserv_discover_data_usage_fee",
    processorPresentationLocatorCoverage: [
      { coverageCode: "discover_data_usage_presentation", requiredNormalizedTerms: ["discover data usage fee"] },
    ],
  }),
  rule({
    ruleId: "fiserv_full_visa_transaction_integrity_historical_presentation_v2",
    registryVersion: FISERV_OBSERVATION_SUBJECT_REGISTRY_VERSION,
    eligibleTemplateFamilies: ["fiserv_first_data_full_statement"],
    eligibleSourceSections: ["ACCOUNT FEES"],
    matchKind: "exact_calculation_free_label",
    normalizedPatterns: ["vi transaction integrity fee"],
    permittedCalculationSuffixes: ["transaction_count_at_rate"],
    subjectCode: "fiserv_visa_transaction_integrity_fee_historical_presentation",
    claimType: "processor_term",
    questionClass: "observed_processor_term_historical_presentation",
    safeResearchLabel: "Fiserv historical Visa Transaction Integrity Fee presentation",
    questionText: "Does an eligible Fiserv processor publication historically present VI Transaction Integrity Fee and an associated historical explanation, and exactly what processor-publication scope limitations remain without asserting Visa network-program authority?",
    reportDecisionCode: "fiserv_visa_transaction_integrity_fee_historical_presentation_review",
    requiredSourceAuthorities: ["processor_publication"],
    requiredEvidenceClass: "official_processor_terminology",
    priority: "material_operational_action",
    materiality: "material",
    blockingEffect: "limits_authority",
    publicResearchPlausible: true,
    reasonCode: "registered_full_fiserv_visa_transaction_integrity_historical_presentation",
    limitations: HISTORICAL_PROCESSOR_PRESENTATION_LIMITATIONS,
    originIdentityCode: "observed_processor_term_historical_presentation:fiserv_visa_transaction_integrity_fee",
    processorPresentationLocatorCoverage: [
      { coverageCode: "visa_transaction_integrity_presentation", requiredNormalizedTerms: ["visa credit debit integrity fee", "vi transaction integrity fee"] },
    ],
  }),
] as const satisfies readonly ObservationSubjectRegistryRule[];

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

function normalizePublicLocatorText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function processorPresentationLocatorTargets(input: {
  subjectCode: string;
  locators: readonly ExtractedLocator[];
}): { requiredCoverageCodes: string[]; targets: ProcessorPresentationLocatorTarget[]; missingCoverageCodes: string[] } {
  const requirements = registryRuleForSubject(input.subjectCode)?.processorPresentationLocatorCoverage ?? [];
  const normalizedLocators = input.locators.map((locator) => ({ locator, text: normalizePublicLocatorText(locator.text) }));
  const targets = requirements.flatMap((requirement): ProcessorPresentationLocatorTarget[] => {
    const locator = normalizedLocators.find((candidate) => requirement.requiredNormalizedTerms
      .every((term) => candidate.text.includes(term)))?.locator;
    return locator ? [{ coverageCode: requirement.coverageCode, locator }] : [];
  });
  const covered = new Set(targets.map((target) => target.coverageCode));
  return {
    requiredCoverageCodes: requirements.map((requirement) => requirement.coverageCode),
    targets,
    missingCoverageCodes: requirements.map((requirement) => requirement.coverageCode).filter((code) => !covered.has(code)),
  };
}

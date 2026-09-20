import type { AuthorityLane, ClaimDimension } from "../claimAuthorityF1/types.js";
import { claimDimensions } from "../claimAuthorityF1/types.js";
import type { F2Rule } from "./types.js";

const statement: AuthorityLane = "statement_source_document";
const arithmetic: AuthorityLane = "deterministic_arithmetic";
const structure: AuthorityLane = "statement_structural_evidence";
const template: AuthorityLane = "versioned_template_mapping";
const network: AuthorityLane = "governed_network_regulator";
const publisher: AuthorityLane = "governed_processor_acquirer_publication";
const mixed: AuthorityLane = "governed_public_mixed";
const privateLane: AuthorityLane = "merchant_private_contract_or_correspondence";
const policy: AuthorityLane = "reviewed_product_policy";

function rule(dimension: ClaimDimension, lanes: AuthorityLane[][], reasoning: F2Rule["allowedReasoning"], gates: F2Rule["requiredGates"], facets: string[] = [], missingAuthorityOutcome: F2Rule["missingAuthorityOutcome"] = "missing_authority"): F2Rule {
  return { dimension, laneAlternatives: lanes, allowedLanes: [...new Set(lanes.flat())], allowedReasoning: reasoning, requiredGates: gates, requiredFacets: facets, facetLanes: {}, missingAuthorityOutcome };
}

// Explicit exhaustive table: no generic fallback and no global source hierarchy.
export const dimensionRules: Record<ClaimDimension, F2Rule> = {
  observation: rule("observation", [[statement]], ["direct_observation"], ["observed_page_fact"]),
  calculation: rule("calculation", [[arithmetic]], ["deterministic_calculation"], []),
  template_relationship: rule("template_relationship", [[statement, template], [arithmetic]], ["template_structural_inference", "deterministic_calculation"], ["observed_page_fact"]),
  economic_broad_category: rule("economic_broad_category", [[statement, structure]], ["economic_structural_inference"], ["observed_page_fact"]),
  official_normalized_identity: rule("official_normalized_identity", [[statement, network], [statement, publisher]], ["governed_public_dependency"], ["observed_page_fact"], ["official_mapping", "compatible_identity"]),
  pricing_architecture: rule("pricing_architecture", [[statement, structure]], ["economic_structural_inference"], ["pricing_architecture"]),
  biller_statement_issuer: rule("biller_statement_issuer", [[statement]], ["direct_observation"], ["observed_page_fact"], ["explicit_biller_or_issuer"]),
  collector: rule("collector", [[statement]], ["direct_observation"], ["observed_page_fact"], ["explicit_collector"]),
  economic_beneficiary: rule("economic_beneficiary", [[privateLane], [network], [publisher]], ["merchant_private_dependency", "governed_public_dependency"], ["observed_page_fact"], ["dimension_specific_beneficiary"]),
  contractual_controller: rule("contractual_controller", [[privateLane]], ["merchant_private_dependency"], ["observed_page_fact"], ["merchant_contractual_control"]),
  merchant_facing_price_controller: rule("merchant_facing_price_controller", [[privateLane]], ["merchant_private_dependency"], ["observed_page_fact"], ["merchant_price_control"]),
  retained_margin_recipient: rule("retained_margin_recipient", [[privateLane]], ["merchant_private_dependency"], ["observed_page_fact"], ["retention_trace"]),
  reference_comparison: rule("reference_comparison", [[statement, arithmetic, network], [statement, arithmetic, publisher], [statement, arithmetic, mixed]], ["governed_public_dependency", "deterministic_calculation"], ["comparison"], ["observed_rate", "observed_basis", "admitted_reference", "publisher", "effective_period", "scope_and_population", "approved_tolerance"]),
  contractual_pass_through: rule("contractual_pass_through", [[privateLane]], ["merchant_private_dependency"], ["comparison"], ["merchant_private_contractual_terms", "separately_billed_spread_analysis", "processor_retention_evidence"], "refused"),
  recurrence: rule("recurrence", [[statement], [privateLane], [network], [publisher]], ["direct_observation", "governed_public_dependency", "merchant_private_dependency"], ["observed_page_fact"], ["recurrence_basis"]),
  cadence: rule("cadence", [[statement], [privateLane], [network], [publisher]], ["direct_observation", "governed_public_dependency", "merchant_private_dependency"], ["observed_page_fact"], ["frequency"]),
  annualization_permission: rule("annualization_permission", [[statement], [privateLane], [network], [publisher]], ["direct_observation", "merchant_private_dependency", "governed_public_dependency"], ["observed_page_fact"], ["proven_recurrence", "frequency", "annualization_permission"], "refused"),
  annualized_amount: rule("annualized_amount", [[statement, arithmetic]], ["deterministic_calculation"], ["observed_page_fact"], ["observed_statement_period_amount", "proven_recurrence", "frequency", "annualization_permission"], "refused"),
  estimated_annual_amount: rule("estimated_annual_amount", [[statement, arithmetic]], ["deterministic_calculation"], ["observed_page_fact"], ["observed_statement_period_amount", "proven_recurrence", "frequency", "annualization_permission"], "refused"),
  benchmark: rule("benchmark", [[statement, network], [statement, publisher], [statement, mixed]], ["governed_public_dependency"], ["comparison"], ["compatible_identity", "scope_and_population", "effective_period"]),
  counterfactual: rule("counterfactual", [[privateLane], [network], [publisher]], ["merchant_private_dependency", "governed_public_dependency"], ["comparison"], ["named_counterfactual", "target_authority", "merchant_applicability"], "refused"),
  actionability: rule("actionability", [[privateLane, policy]], ["merchant_private_dependency", "product_policy_judgment"], ["actionability"], ["dimension_specific_control_authority", "merchant_applicability"], "refused"),
  savings: rule("savings", [[privateLane, arithmetic, policy], [network, arithmetic, policy], [publisher, arithmetic, policy]], ["deterministic_calculation", "product_policy_judgment"], ["statement_total", "fee_composition", "savings"], ["named_counterfactual", "target_authority", "compatible_fee_identity", "scope", "population", "denominator", "historical_effective_period", "merchant_applicability", "recurrence_cadence", "document_completeness", "no_overlap"], "refused"),
  product_policy: rule("product_policy", [[policy]], ["product_policy_judgment"], [], ["reviewed_rule"], "refused"),
  resolution: rule("resolution", [[statement]], ["direct_observation"], [], []),
};

export const processorMarkupRule = {
  dimension: "economic_broad_category",
  allowedReasoning: ["economic_structural_inference", "merchant_private_dependency"] as F2Rule["allowedReasoning"],
  allowedLanes: [statement, structure, network, publisher, privateLane],
  laneAlternatives: [[statement, structure, network], [statement, structure, publisher], [statement, structure, privateLane]],
  requiredGates: ["observed_page_fact", "comparison"] as F2Rule["requiredGates"],
  requiredFacets: ["observed_merchant_facing_component", "compatible_underlying_cost_or_merchant_private_processor_control"],
  facetLanes: {
    observed_merchant_facing_component: [statement, structure],
    compatible_underlying_cost_or_merchant_private_processor_control: [network, publisher, privateLane],
  },
  missingAuthorityOutcome: "refused",
} satisfies F2Rule;

dimensionRules.reference_comparison.facetLanes = {
  observed_rate: [statement], observed_basis: [statement], approved_tolerance: [arithmetic],
  admitted_reference: [network, publisher, mixed], publisher: [network, publisher, mixed],
  effective_period: [network, publisher, mixed], scope_and_population: [network, publisher, mixed],
};
dimensionRules.contractual_pass_through.facetLanes = {
  merchant_private_contractual_terms: [privateLane], separately_billed_spread_analysis: [privateLane], processor_retention_evidence: [privateLane],
};
dimensionRules.economic_beneficiary.facetLanes = { dimension_specific_beneficiary: [privateLane, network, publisher] };
dimensionRules.product_policy.facetLanes = { reviewed_rule: [policy] };
dimensionRules.actionability.facetLanes = { dimension_specific_control_authority: [privateLane], merchant_applicability: [privateLane] };

export function ruleFor(dimension: ClaimDimension, semanticCode: string): F2Rule {
  if (!claimDimensions.includes(dimension)) throw new Error("F2 unknown claim dimension");
  if (semanticCode === "processor_markup") return processorMarkupRule;
  if (semanticCode === "proven_at_cost" || semanticCode === "processor_profit") return rule(dimension, [], [], [], [], "refused");
  return dimensionRules[dimension];
}

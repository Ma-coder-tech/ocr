import type { InternalAnalystFinding } from "../../src/canonical/internalAnalystFindingV1.js";
import type { GovernedKnowledgeResolution } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { CanonicalFeeRow } from "../../src/canonical/types.js";

export const COMMERCIAL_DECOMPOSITION_DIAGNOSTIC_V1 =
  "commercial_decomposition_validation_e1_e2_2026_09_09_v1" as const;

export type CommercialRoleV1 =
  | "UNDERLYING_EXTERNALLY_SET_COST"
  | "INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE"
  | "PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE"
  | "PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE"
  | "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS";

export type CommercialRoleDiagnosticV1 = {
  feeRowId: string;
  printedLabel: string;
  amountMinor: number;
  primaryRole: CommercialRoleV1;
  secondaryAttributes: Array<
    | "UNDERLYING_EXTERNALLY_SET"
    | "INCIDENCE_OR_CONFIGURATION_SENSITIVE"
    | "PER_EVENT"
    | "PROPORTIONAL_TO_VOLUME"
    | "FIXED_OR_PERIODIC"
    | "CONDITIONAL_OR_EXCEPTION"
    | "BUNDLED_OR_COMPOSITE"
  >;
  confidence: "CONFIRMED" | "STRONG" | "LIKELY" | "CATEGORY_ONLY" | "UNRESOLVED";
  evidenceRefs: string[];
  rationale: string;
  unresolvedOrSharedPortion: boolean;
  controlScope:
    | "affirmative_acquiring_side_control"
    | "broad_acquiring_side_category"
    | "broad_service_or_third_party_category"
    | "external_underlying"
    | "unresolved";
  changesExistingActionability: false;
  actionClass: string;
  lineCommercialComparisonPermitted: boolean;
  overallCommercialComparisonPermitted: false;
  determinant: {
    exactIdentityState: string;
    exactIdentity: string | null;
    familyState: string;
    family: string | null;
    economicLayerState: string;
    economicLayer: string | null;
    mechanicState: string;
    mechanic: string | null;
    populationState: string;
    population: string | null;
    sufficiency: string;
    merchantFacingPriceControllerState: string;
    merchantFacingPriceController: string | null;
  };
};

export function classifyCommercialRoleV1(input: {
  row: CanonicalFeeRow;
  knowledge: GovernedKnowledgeResolution;
  finding: InternalAnalystFinding | null;
}): CommercialRoleDiagnosticV1 {
  const open = input.knowledge.openWorldDeterminants.rowsByFeeRowId[input.row.id];
  const pricing = input.knowledge.pricingLayers.rowsByFeeRowId[input.row.id];
  const focused = input.knowledge.mastercardFocusedEvidence.rowsByFeeRowId[input.row.id];
  if (!open || !pricing || !focused) throw new Error(`missing governed commercial inputs for ${input.row.id}`);

  const layer = open.d1EconomicLayerAndControl.economicLayer;
  const controller = open.d1EconomicLayerAndControl.merchantFacingPriceController;
  const sensitivity = open.d3Materiality.volumeSensitivity;
  const attributes: CommercialRoleDiagnosticV1["secondaryAttributes"] = [];
  if (layer.value === "issuer_interchange" || layer.value === "card_network") attributes.push("UNDERLYING_EXTERNALLY_SET");
  if (open.d4Actionability.actionClass === "N2") attributes.push("INCIDENCE_OR_CONFIGURATION_SENSITIVE");
  if (sensitivity === "per_event") attributes.push("PER_EVENT");
  if (sensitivity === "proportional") attributes.push("PROPORTIONAL_TO_VOLUME");
  if (sensitivity === "fixed_or_periodic") attributes.push("FIXED_OR_PERIODIC");
  if (sensitivity === "conditional_or_exception") attributes.push("CONDITIONAL_OR_EXCEPTION");
  const label = input.row.selectedLabel.toUpperCase();
  const genericProgramTokenOnly =
    /\bPROGRAM\b/.test(label) &&
    !/BUNDLE|PACKAGE|COMPOSITE|ADDITIONAL FEES|OTHER FEES/.test(label);
  const reconciledNetworkProgramCost =
    pricing.broaderEconomicCategory === "network_program_cost" &&
    pricing.amexProgramCostReconciliation?.state === "reconciles_within_rounding";
  const exactNetworkProgramFamily =
    genericProgramTokenOnly &&
    layer.value === "card_network" &&
    open.exactIdentity.state === "exact_supported";
  const genericProgramBundlingFalsePositive = genericProgramTokenOnly && (reconciledNetworkProgramCost || exactNetworkProgramFamily);
  const effectiveBundlingSignal =
    (open.attributes.includes("bundled_or_composite") || open.cardinality.value === "multiple_components") &&
    !genericProgramBundlingFalsePositive;
  if (effectiveBundlingSignal) attributes.push("BUNDLED_OR_COMPOSITE");

  const explicitlyShared =
    effectiveBundlingSignal ||
    pricing.broaderEconomicCategory === "bundled_merchant_facing_pricing" ||
    focused.assessment2024 !== null ||
    focused.residualDecomposition?.state === "UNRESOLVED";
  const suspiciousNetworkLabeledAdministrativeFallback =
    open.family.value === "F7" &&
    /(?:VISA|MASTERCARD|MASTER CARD|DISCOVER|AMEX).*(?:INTL|INTERNATIONAL).*SERVICE FEE/.test(label);
  const networkWordingVsAcquiringLayerConflict =
    layer.value === "acquiring_commercial" &&
    /\b(?:NABU|NETWORK ACCESS AUTH(?:ORIZATION)? FEE)\b/.test(label);
  const affirmativeProviderControl =
    layer.state === "supported" &&
    layer.value === "acquiring_commercial" &&
    controller.state === "supported" &&
    controller.value === "acquiring_side_program";
  const affirmativeServiceControl =
    layer.state === "supported" &&
    ["technology_or_service", "equipment_or_physical"].includes(layer.value ?? "") &&
    controller.state === "supported" &&
    controller.value === "technology_or_service_provider";

  let primaryRole: CommercialRoleV1;
  let rationale: string;
  let confidence: CommercialRoleDiagnosticV1["confidence"];
  let controlScope: CommercialRoleDiagnosticV1["controlScope"] = "unresolved";
  if (explicitlyShared || suspiciousNetworkLabeledAdministrativeFallback || networkWordingVsAcquiringLayerConflict) {
    primaryRole = "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS";
    rationale = networkWordingVsAcquiringLayerConflict
      ? "The current acquiring-side determinant conflicts with explicit network-access wording and an existing governed network-access/NABU family. The diagnostic preserves the competing interpretations instead of assigning provider control."
      : suspiciousNetworkLabeledAdministrativeFallback
      ? "The broad administrative fallback conflicts with network/international-service wording. The diagnostic refuses to turn that category-only fallback into provider control."
      : "Governed cardinality, pricing-layer, or component evidence says the printed amount is bundled, allocated, or not safely separable.";
    confidence = open.cardinality.value === "multiple_components" || focused.assessment2024 ? "LIKELY" : "UNRESOLVED";
  } else if (layer.value === "LAYER_UNRESOLVED" || layer.state === "unresolved") {
    primaryRole = "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS";
    rationale = "The current authority does not establish the economic layer or merchant-facing price controller; absence from a network catalog is not provider-control evidence.";
    confidence = "UNRESOLVED";
  } else if ((layer.value === "issuer_interchange" || layer.value === "card_network") && open.d4Actionability.actionClass === "N2") {
    primaryRole = "INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE";
    rationale = "The underlying charge is externally set, while governed action evidence says qualification, configuration, timing, data quality, or behavior can affect incidence.";
    confidence = layer.confidence;
    controlScope = "external_underlying";
  } else if (layer.value === "issuer_interchange" || layer.value === "card_network") {
    primaryRole = "UNDERLYING_EXTERNALLY_SET_COST";
    rationale = genericProgramBundlingFalsePositive
      ? "Stronger governed identity/layer evidence supports a network program-cost or program-integrity fee; the generic PROGRAM-token bundling signal is not treated as composition proof. This does not assert official par or absence of uplift."
      : "Governed evidence supports an issuer-interchange or card-network economic layer. This does not assert official par, processor-independent incidence, or absence of uplift.";
    confidence = layer.confidence;
    controlScope = "external_underlying";
  } else if (affirmativeProviderControl && ["proportional", "per_event", "conditional_or_exception"].includes(sensitivity)) {
    primaryRole = "PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE";
    rationale = "Both the acquiring-side economic layer and merchant-facing acquiring-side price control are affirmatively supported; the mechanic varies with volume, events, or exceptions.";
    confidence = minimumConfidence(layer.confidence, controller.confidence);
    controlScope = "affirmative_acquiring_side_control";
  } else if ((affirmativeProviderControl || affirmativeServiceControl) && sensitivity === "fixed_or_periodic") {
    primaryRole = "PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE";
    rationale = "Governed evidence affirmatively supports acquiring-side or service-provider control and a fixed/periodic mechanic.";
    confidence = minimumConfidence(layer.confidence, controller.confidence);
    controlScope = affirmativeProviderControl ? "affirmative_acquiring_side_control" : "broad_service_or_third_party_category";
  } else if (affirmativeServiceControl) {
    primaryRole = "PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE";
    rationale = "Governed evidence affirmatively supports a technology, service, or equipment provider as merchant-facing price controller; it is treated as ancillary without asserting processor retention.";
    confidence = minimumConfidence(layer.confidence, controller.confidence);
    controlScope = "broad_service_or_third_party_category";
  } else if (
    layer.state === "supported" &&
    ["F7", "F9", "F10", "F11"].includes(open.family.value ?? "")
  ) {
    primaryRole = "PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE";
    rationale = open.family.value === "F7"
      ? "Affirmative acquiring-commercial layer evidence and a fixed/administrative family support the broad provider-side category. Exact controller, allocation, and retention remain unresolved."
      : "Affirmative technology, service, security, compliance, or equipment layer evidence supports the broad ancillary category. Exact provider, processor retention, and revenue sharing remain unresolved.";
    confidence = open.family.confidence;
    controlScope = open.family.value === "F7" ? "broad_acquiring_side_category" : "broad_service_or_third_party_category";
  } else if (layer.value === "government_or_nonprocessing_pass_through") {
    primaryRole = "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS";
    rationale = "The five-role payment-cost decomposition has no separate government/non-processing bucket, so the amount remains separately disclosed rather than forced into network or provider economics.";
    confidence = "CATEGORY_ONLY";
  } else {
    primaryRole = "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS";
    rationale = "The current governed claims do not affirmatively support one of the four assignable commercial roles.";
    confidence = "UNRESOLVED";
  }

  const evidenceRefs = unique([
    ...open.matchedRuleRefs,
    ...open.family.evidenceRefs,
    ...layer.evidenceRefs,
    ...controller.evidenceRefs,
    ...open.d2MechanicAndPopulation.mechanic.evidenceRefs,
    ...open.d2MechanicAndPopulation.population.evidenceRefs,
    ...pricing.matchedRuleRefs,
    ...pricing.evidenceRefs,
    ...focused.matchedRuleRefs,
  ]);
  const comparisonState = input.finding?.commercialReasonableness.state;

  return {
    feeRowId: input.row.id,
    printedLabel: input.row.selectedLabel,
    amountMinor: input.row.selectedAmount?.amountMinor ?? 0,
    primaryRole,
    secondaryAttributes: unique(attributes),
    confidence,
    evidenceRefs,
    rationale,
    unresolvedOrSharedPortion: primaryRole === "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS",
    controlScope,
    changesExistingActionability: false,
    actionClass: open.d4Actionability.actionClass,
    lineCommercialComparisonPermitted: comparisonState === "industry_judgment",
    overallCommercialComparisonPermitted: false,
    determinant: {
      exactIdentityState: open.exactIdentity.state,
      exactIdentity: open.exactIdentity.value,
      familyState: open.family.state,
      family: open.family.value,
      economicLayerState: layer.state,
      economicLayer: layer.value,
      mechanicState: open.d2MechanicAndPopulation.mechanic.state,
      mechanic: open.d2MechanicAndPopulation.mechanic.value,
      populationState: open.d2MechanicAndPopulation.population.state,
      population: open.d2MechanicAndPopulation.population.value,
      sufficiency: open.determinantSufficiency,
      merchantFacingPriceControllerState: controller.state,
      merchantFacingPriceController: controller.value,
    },
  };
}

function minimumConfidence(
  left: CommercialRoleDiagnosticV1["confidence"],
  right: CommercialRoleDiagnosticV1["confidence"],
): CommercialRoleDiagnosticV1["confidence"] {
  const rank: Record<CommercialRoleDiagnosticV1["confidence"], number> = {
    UNRESOLVED: 0,
    CATEGORY_ONLY: 1,
    LIKELY: 2,
    STRONG: 3,
    CONFIRMED: 4,
  };
  return rank[left] <= rank[right] ? left : right;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

import type { FeeSemanticsShadowRowResult } from "./feeSemanticsShadowStatementIntegration.js";
import type { GovernedCurrent2026UsCoreNetworkResolution } from "./governedCurrent2026UsCoreNetworkReferenceV1.js";
import type { GovernedCommercialClassificationAdjudicationResolutionV1 } from "./governedCommercialClassificationAdjudicationV1.js";
import type { GovernedDatedNetworkFeeEvidenceResolution } from "./governedDatedNetworkFeeEvidenceV1.js";
import type { GovernedPerItemResolution, GovernedPerItemUnit } from "./governedPerItemKnowledgeV1.js";
import type { GovernedPricingLayerResolution } from "./governedPricingLayerKnowledgeV1.js";
import type { GovernedUsNetworkFeeEvidenceResolution } from "./governedUsNetworkFeeEvidence2020_2026V1.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";

export const GOVERNED_OPEN_WORLD_DETERMINANT_V1 =
  "governed_open_world_determinant_unknown_fee_analysis_2026_09_08_v1" as const;

export type OpenWorldFeeFamilyCode =
  | "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7"
  | "F8" | "F9" | "F10" | "F11" | "F12" | "F13";

export type OpenWorldEconomicLayer =
  | "issuer_interchange"
  | "card_network"
  | "acquiring_commercial"
  | "technology_or_service"
  | "security_compliance_or_risk"
  | "equipment_or_physical"
  | "government_or_nonprocessing_pass_through"
  | "not_a_fee"
  | "LAYER_UNRESOLVED";

export type OpenWorldActionClass = "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N7";
export type OpenWorldAttribute =
  | "bundled_or_composite"
  | "component_of_bounded_fee"
  | "undescribed"
  | "third_party_possible"
  | "contract_locked_possible"
  | "conditional"
  | "expected_but_absent"
  | "layer_unresolved"
  | "identity_unresolved"
  | "price_controller_unresolved";

export type OpenWorldClaim<T> = {
  state: "supported" | "category_only" | "unresolved" | "not_applicable";
  value: T | null;
  confidence: "CONFIRMED" | "STRONG" | "LIKELY" | "CATEGORY_ONLY" | "UNRESOLVED";
  evidenceRefs: string[];
  explanation: string;
};

export type OpenWorldFeeDeterminant = {
  feeRowId: string;
  printedLabel: string;
  exactIdentity: {
    state: "exact_supported" | "family_known_identity_unresolved" | "identity_unresolved" | "not_applicable";
    value: string | null;
    necessaryForUsefulAction: boolean;
    explanation: string;
  };
  family: OpenWorldClaim<OpenWorldFeeFamilyCode>;
  attributes: OpenWorldAttribute[];
  cardinality: OpenWorldClaim<"single_fee" | "multiple_components" | "bounded_component" | "not_a_fee">;
  retrieval: {
    candidateConceptIds: string[];
    fuzzyCandidatePresent: boolean;
    candidateOnly: boolean;
    promotedToFactByThisLayer: false;
  };
  d1EconomicLayerAndControl: {
    economicLayer: OpenWorldClaim<OpenWorldEconomicLayer>;
    collector: OpenWorldClaim<"processor_or_acquirer">;
    economicBeneficiary: OpenWorldClaim<"issuer" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">;
    ruleSetter: OpenWorldClaim<"issuer_or_network" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">;
    priceSetter: OpenWorldClaim<"issuer_or_network" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">;
    merchantFacingPriceController: OpenWorldClaim<"card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">;
  };
  d2MechanicAndPopulation: {
    mechanic: OpenWorldClaim<string>;
    population: OpenWorldClaim<string>;
  };
  d3Materiality: {
    material: boolean;
    highMateriality: boolean;
    currentPeriodAmountMinor: number | null;
    shareOfMaterialFeeDollarsPercent: number | null;
    shareOfProcessedSalesBasisPoints: number | null;
    volumeSensitivity: "proportional" | "per_event" | "fixed_or_periodic" | "conditional_or_exception" | "not_applicable" | "unresolved";
    annualizationAllowed: boolean;
  };
  d4Actionability: {
    actionClass: OpenWorldActionClass | "NOT_APPLICABLE";
    action: string;
    merchantAgreementRequiredForAction: false;
    merchantAgreementRequiredForContractConclusion: boolean;
    explanation: string;
  };
  determinantSufficiency: "DETERMINANT_SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";
  stoppingReason: "S1_DETERMINANT_SUFFICIENCY" | "S2_BELOW_MATERIALITY_FLOOR" | "S3_RESEARCH_STAGNATION" | "S4_SOURCE_QUALITY_FAILURE" | "S5_REUSABLE_KNOWLEDGE_OPPORTUNITY" | null;
  research: {
    disposition: "NOT_ESCALATED" | "ESCALATE_BOUNDED_RESEARCH" | "DEFER_REUSABLE_KNOWLEDGE" | "STOP";
    reasonCodes: string[];
    question: string | null;
  };
  renderingPermissions: {
    exactIdentityAllowed: boolean;
    familyLanguageAllowed: boolean;
    acquiringSideLanguageAllowed: boolean;
    networkOwnershipLanguageAllowed: boolean;
    negotiationLanguageAllowed: boolean;
    contractComplianceLanguageAllowed: false;
    candidateAsFactAllowed: false;
  };
  matchedRuleRefs: string[];
  limitations: string[];
};

export type GovernedOpenWorldDeterminantResolution = {
  catalogVersion: typeof GOVERNED_OPEN_WORLD_DETERMINANT_V1;
  rules: ReturnType<typeof governedOpenWorldRulesV1>;
  families: ReturnType<typeof governedOpenWorldFeeFamiliesV1>;
  rowsByFeeRowId: Readonly<Record<string, OpenWorldFeeDeterminant>>;
  diagnostics: {
    rows: number;
    materialRows: number;
    exactIdentitySupportedRows: number;
    familyKnownIdentityUnresolvedRows: number;
    identityAndLayerUnresolvedRows: number;
    determinantSufficientRows: number;
    actionableRows: number;
    highMaterialityRows: number;
    actionableHighMaterialityRows: number;
    researchEscalations: number;
    stoppedWithoutResearch: number;
    materialDollarTotalMinor: number;
    explainedMaterialDollarsMinor: number;
    actionableClassifiedDollarsMinor: number;
    unexplainedMaterialDollarsMinor: number;
  };
  canonicalMutationAllowed: false;
};

export function governedOpenWorldActionClassesV1(): Array<{ code: OpenWorldActionClass; title: string }> {
  return [
    { code: "N1", title: "network-set price verification" },
    { code: "N2", title: "network-set price with influenceable incidence" },
    { code: "N3", title: "acquiring-side commercial review" },
    { code: "N4", title: "acquiring-side commonly waivable or reducible" },
    { code: "N5", title: "third-party or service verification" },
    { code: "N6", title: "contract or term dependent" },
    { code: "N7", title: "price control unresolved" },
  ];
}

export function applyOpenWorldResearchStopV1(input: {
  row: OpenWorldFeeDeterminant;
  independentResearchPasses: number;
  evidenceTierImproved: boolean;
  sourceQuality: "adequate" | "stale_circular_inconsistent_or_insufficient";
}): OpenWorldFeeDeterminant["research"] & { stoppingReason: OpenWorldFeeDeterminant["stoppingReason"] } {
  if (input.sourceQuality === "stale_circular_inconsistent_or_insufficient") {
    return { disposition: "STOP", reasonCodes: ["source_quality_failure"], question: null, stoppingReason: "S4_SOURCE_QUALITY_FAILURE" };
  }
  if (input.independentResearchPasses > 0 && !input.evidenceTierImproved) {
    return { disposition: "STOP", reasonCodes: ["research_stagnation_no_evidence_tier_improvement"], question: null, stoppingReason: "S3_RESEARCH_STAGNATION" };
  }
  return { ...input.row.research, stoppingReason: input.row.stoppingReason };
}

export type OpenWorldResearchOutcomeV1 = {
  feeRowId: string;
  familyChanged: boolean;
  economicLayerChanged: boolean;
  mechanicOrPopulationChanged: boolean;
  actionClassChanged: boolean;
  evidenceTierImproved: boolean;
  usefulOutcome: boolean;
};

export function evaluateOpenWorldResearchOutcomeV1(input: {
  before: OpenWorldFeeDeterminant;
  after: OpenWorldFeeDeterminant;
  evidenceTierImproved: boolean;
}): OpenWorldResearchOutcomeV1 {
  const familyChanged = input.before.family.value !== input.after.family.value;
  const economicLayerChanged = input.before.d1EconomicLayerAndControl.economicLayer.value !== input.after.d1EconomicLayerAndControl.economicLayer.value;
  const mechanicOrPopulationChanged = input.before.d2MechanicAndPopulation.mechanic.value !== input.after.d2MechanicAndPopulation.mechanic.value || input.before.d2MechanicAndPopulation.population.value !== input.after.d2MechanicAndPopulation.population.value;
  const actionClassChanged = input.before.d4Actionability.actionClass !== input.after.d4Actionability.actionClass;
  return {
    feeRowId: input.before.feeRowId,
    familyChanged,
    economicLayerChanged,
    mechanicOrPopulationChanged,
    actionClassChanged,
    evidenceTierImproved: input.evidenceTierImproved,
    usefulOutcome: familyChanged || economicLayerChanged || mechanicOrPopulationChanged || actionClassChanged || input.evidenceTierImproved,
  };
}

export function measureOpenWorldResearchEfficiencyV1(outcomes: OpenWorldResearchOutcomeV1[]) {
  const usefulOutcomes = outcomes.filter((outcome) => outcome.usefulOutcome).length;
  return {
    executedResearchQuestions: outcomes.length,
    usefulOutcomes,
    determinantOrActionChanges: outcomes.filter((outcome) => outcome.familyChanged || outcome.economicLayerChanged || outcome.mechanicOrPopulationChanged || outcome.actionClassChanged).length,
    evidenceTierImprovements: outcomes.filter((outcome) => outcome.evidenceTierImproved).length,
    usefulOutcomeRatePercent: outcomes.length > 0 ? round(usefulOutcomes / outcomes.length * 100, 2) : null,
    status: outcomes.length > 0 ? "MEASURED" as const : "NOT_MEASURED_NO_RESEARCH_EXECUTED" as const,
  };
}

const PRODUCT_SPEC_REF = "RateReveal_Unknown_Fee_Long_Tail_Strategy_FINAL_Product_Adjudicated.md";
const PRODUCT_SPEC_SHA256 = "2700148b053925b8463bc2e6fc16e2737f5e52520eada2676415e59298ae6261";
const PRODUCT_INSTRUCTION_REF = "RateReveal_Product_Open_World_Determinant_Unknown_Fee_Analysis_v1_2026_09_08";
const PRODUCT_INSTRUCTION_SHA256 = "1748c86376cab870f149a5555345fdbd505b0f69131da29e2d2f474d877875be";

const FAMILY_TITLES: Record<OpenWorldFeeFamilyCode, string> = {
  F1: "interchange",
  F2: "network assessments and dues",
  F3: "network per-event, integrity, or access",
  F4: "network fixed or periodic",
  F5: "acquiring ad-valorem",
  F6: "acquiring per-item",
  F7: "acquiring fixed or administrative",
  F8: "acquiring exception or event",
  F9: "technology, gateway, or software",
  F10: "security, compliance, or risk",
  F11: "equipment, physical, or lease",
  F12: "tax, government, or non-processing pass-through",
  F13: "not a fee",
};

export function governedOpenWorldFeeFamiliesV1() {
  return (Object.entries(FAMILY_TITLES) as Array<[OpenWorldFeeFamilyCode, string]>).map(([familyCode, title]) => ({
    familyCode,
    title,
    unknownIsFamily: false as const,
    processorNeutral: true as const,
  }));
}

export function governedOpenWorldRulesV1() {
  const common = {
    admissionStatus: "product_adjudicated_admitted" as const,
    sourceRefs: [PRODUCT_SPEC_REF, PRODUCT_INSTRUCTION_REF],
    sourceFingerprints: [PRODUCT_SPEC_SHA256, PRODUCT_INSTRUCTION_SHA256],
    reviewedAt: "2026-09-08" as const,
  };
  return [
    { ...common, ruleId: "OWD-01", title: "Determinants are independent", admittedClaim: "Exact identity, family, economic layer/control, mechanic/population, materiality, and actionability are independently resolved." },
    { ...common, ruleId: "OWD-02", title: "Unknown is not a fee family", admittedClaim: "A row may retain LAYER_UNRESOLVED and identity_unresolved without being forced into a processor or network family." },
    { ...common, ruleId: "OWD-03", title: "Acquiring-side claims require affirmative evidence", admittedClaim: "Catalog failure, collection, and unfamiliar terminology do not establish acquiring-side ownership, control, or negotiability." },
    { ...common, ruleId: "OWD-04", title: "Identity is not always necessary", admittedClaim: "Research stops when economic layer, mechanic, materiality, and a safe useful action are sufficiently supported." },
    { ...common, ruleId: "OWD-05", title: "Research is bounded and selective", admittedClaim: "Only material determinant gaps or reusable knowledge opportunities enter the existing research transport; fuzzy and AI outputs remain candidates." },
    { ...common, ruleId: "OWD-06", title: "Action classes do not imply contract outcomes", admittedClaim: "A commercial or operational review can be recommended without an agreement; exact contractual compliance, rights, and remedies remain contract-dependent." },
    { ...common, ruleId: "OWD-07", title: "Rendering cannot strengthen claims", admittedClaim: "Exact identity, acquiring-side, network ownership, negotiation, and contract language are separately gated by the supported determinant state." },
  ];
}

export function resolveGovernedOpenWorldDeterminantV1(input: {
  analysis: CanonicalStatementAnalysis;
  semanticRows: FeeSemanticsShadowRowResult[];
  pricingLayers: GovernedPricingLayerResolution;
  perItem: GovernedPerItemResolution;
  datedNetworkFeeEvidence: GovernedDatedNetworkFeeEvidenceResolution;
  usNetworkFeeEvidence: GovernedUsNetworkFeeEvidenceResolution;
  current2026UsCoreNetworkReference: GovernedCurrent2026UsCoreNetworkResolution;
  commercialClassificationAdjudication: GovernedCommercialClassificationAdjudicationResolutionV1;
}): GovernedOpenWorldDeterminantResolution {
  const semanticById = new Map(input.semanticRows.map((row) => [row.feeRowId, row]));
  const materialDollarTotalMinor = input.analysis.feeLedger.rows
    .filter((row) => isMaterial(row, input.analysis))
    .reduce((sum, row) => sum + (row.selectedAmount?.amountMinor ?? 0), 0);
  const rows = input.analysis.feeLedger.rows.map((row) => resolveRow({
    row,
    analysis: input.analysis,
    semantic: semanticById.get(row.id)!,
    pricing: input.pricingLayers.rowsByFeeRowId[row.id]!,
    perItem: input.perItem.rowsByFeeRowId[row.id]!,
    datedNetwork: input.datedNetworkFeeEvidence.rowsByFeeRowId[row.id]!,
    usNetwork: input.usNetworkFeeEvidence.rowsByFeeRowId[row.id]!,
    current: input.current2026UsCoreNetworkReference.rowsByFeeRowId[row.id]!,
    commercialAdjudication: input.commercialClassificationAdjudication.rowsByFeeRowId[row.id]!,
    materialDollarTotalMinor,
  }));
  const materialRows = rows.filter((row) => row.d3Materiality.material);
  const highMaterialityRows = materialRows.filter((row) => row.d3Materiality.highMateriality);
  const dollars = (predicate: (row: OpenWorldFeeDeterminant) => boolean) => materialRows
    .filter(predicate).reduce((sum, row) => sum + (row.d3Materiality.currentPeriodAmountMinor ?? 0), 0);
  return deepFreeze({
    catalogVersion: GOVERNED_OPEN_WORLD_DETERMINANT_V1,
    rules: governedOpenWorldRulesV1(),
    families: governedOpenWorldFeeFamiliesV1(),
    rowsByFeeRowId: Object.fromEntries(rows.map((row) => [row.feeRowId, row])),
    diagnostics: {
      rows: rows.length,
      materialRows: materialRows.length,
      exactIdentitySupportedRows: materialRows.filter((row) => row.exactIdentity.state === "exact_supported").length,
      familyKnownIdentityUnresolvedRows: materialRows.filter((row) => row.exactIdentity.state === "family_known_identity_unresolved").length,
      identityAndLayerUnresolvedRows: materialRows.filter((row) => row.exactIdentity.state === "identity_unresolved" && row.d1EconomicLayerAndControl.economicLayer.value === "LAYER_UNRESOLVED").length,
      determinantSufficientRows: materialRows.filter((row) => row.determinantSufficiency === "DETERMINANT_SUFFICIENT").length,
      actionableRows: materialRows.filter((row) => row.d4Actionability.actionClass !== "N7").length,
      highMaterialityRows: highMaterialityRows.length,
      actionableHighMaterialityRows: highMaterialityRows.filter((row) => row.d4Actionability.actionClass !== "N7").length,
      researchEscalations: materialRows.filter((row) => row.research.disposition === "ESCALATE_BOUNDED_RESEARCH").length,
      stoppedWithoutResearch: materialRows.filter((row) => row.research.disposition === "STOP").length,
      materialDollarTotalMinor,
      explainedMaterialDollarsMinor: dollars((row) => row.d1EconomicLayerAndControl.economicLayer.value !== "LAYER_UNRESOLVED" && row.family.value !== null),
      actionableClassifiedDollarsMinor: dollars((row) => row.d4Actionability.actionClass !== "N7"),
      unexplainedMaterialDollarsMinor: dollars((row) => row.d1EconomicLayerAndControl.economicLayer.value === "LAYER_UNRESOLVED"),
    },
    canonicalMutationAllowed: false,
  });
}

type RowInput = {
  row: CanonicalFeeRow;
  analysis: CanonicalStatementAnalysis;
  semantic: FeeSemanticsShadowRowResult;
  pricing: GovernedPricingLayerResolution["rowsByFeeRowId"][string];
  perItem: GovernedPerItemResolution["rowsByFeeRowId"][string];
  datedNetwork: GovernedDatedNetworkFeeEvidenceResolution["rowsByFeeRowId"][string];
  usNetwork: GovernedUsNetworkFeeEvidenceResolution["rowsByFeeRowId"][string];
  current: GovernedCurrent2026UsCoreNetworkResolution["rowsByFeeRowId"][string];
  commercialAdjudication: GovernedCommercialClassificationAdjudicationResolutionV1["rowsByFeeRowId"][string];
  materialDollarTotalMinor: number;
};

function resolveRow(input: RowInput): OpenWorldFeeDeterminant {
  const label = input.row.selectedLabel.toUpperCase();
  const evidenceRefs = [...new Set([...input.semantic.feeRowEvidenceRefs, ...input.pricing.evidenceRefs, ...input.perItem.evidenceRefs, ...input.commercialAdjudication.evidenceRefs])];
  const nonFee = !input.row.contributesToUniqueTotal || ["section_subtotal", "fee_bucket_total", "statement_control_total", "informational_rate_row", "zero_dollar_reference_row", "duplicate_representation", "supporting_evidence_only"].includes(input.row.role);
  const exactIdentity = input.commercialAdjudication.applicable
    ? input.commercialAdjudication.exactIdentity
    : input.usNetwork.identity.state === "supported"
    ? input.usNetwork.identity.value
    : input.pricing.exactFeeIdentity ?? (input.semantic.status === "resolved_exact_trusted" && input.perItem.exactIdentityDisposition !== "suppress_as_unresolved" ? input.semantic.semanticAxes?.identity.value ?? input.semantic.conceptId : null);
  const family = determineFamily(input, label, nonFee);
  const economicLayer = layerFor(family, input);
  const mechanic = determineMechanic(input, family);
  const population = determinePopulation(input, mechanic);
  const attributes = determineAttributes(input, label, family, economicLayer, exactIdentity);
  const cardinality = determineCardinality(input, nonFee, label, evidenceRefs);
  const material = isMaterial(input.row, input.analysis);
  const amountMinor = input.row.selectedAmount?.amountMinor ?? null;
  const processedSalesMinor = input.analysis.financialFacts.processedSales.value?.amountMinor ?? null;
  const processedSalesBps = amountMinor !== null && processedSalesMinor && processedSalesMinor > 0 ? round(amountMinor / processedSalesMinor * 10_000, 2) : null;
  const controller = nonFee ? notApplicable<"card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">("No merchant-facing fee price applies.") : determineController(family, input, evidenceRefs);
  const beneficiary = nonFee ? notApplicable<"issuer" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">("No fee beneficiary applies.") : determineBeneficiary(family, input, evidenceRefs);
  const ruleSetter = nonFee ? notApplicable<"issuer_or_network" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">("No fee rule setter applies.") : determineRuleSetter(family, input, evidenceRefs);
  const priceSetter = nonFee ? notApplicable<"issuer_or_network" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party">("No fee price setter applies.") : determinePriceSetter(family, input, evidenceRefs);
  const action = determineAction(family, economicLayer.value, controller.value, input, label);
  const d1Supported = economicLayer.value !== "LAYER_UNRESOLVED";
  const d2Supported = mechanic.state !== "unresolved" || family.value === "F1";
  const d4Supported = action.actionClass !== "N7";
  const determinantSufficiency = d1Supported && d2Supported && d4Supported
    ? "DETERMINANT_SUFFICIENT"
    : [d1Supported, d2Supported, d4Supported].filter(Boolean).length >= 2 ? "PARTIAL" : "INSUFFICIENT";
  const highPriorityResearch = !input.commercialAdjudication.applicable && (input.usNetwork.research.priority === "high" || input.current.research.priority === "high");
  const conflict = !input.commercialAdjudication.applicable && (input.semantic.status === "unresolved_conflict" || input.usNetwork.sourceConflicts.length > 0 || input.current.reference.conflicts.length > 0);
  const exactIdentityNecessary = material && !exactIdentity && (
    action.actionClass === "N7" ||
    highPriorityResearch
  );
  const reusable = material && determinantSufficiency !== "DETERMINANT_SUFFICIENT" && (input.semantic.candidateConceptIds.length > 0 || input.semantic.retrievalLeadConceptIds.length > 0);
  const research = !material
    ? { disposition: "STOP" as const, reasonCodes: ["below_materiality_floor"], question: null }
    : input.commercialAdjudication.applicable && !input.commercialAdjudication.researchWarrantRequired
      ? { disposition: "STOP" as const, reasonCodes: ["product_adjudicated_no_new_public_research_required"], question: null }
    : highPriorityResearch || conflict
      ? { disposition: "ESCALATE_BOUNDED_RESEARCH" as const, reasonCodes: compactStrings([highPriorityResearch ? "applicable_dated_value_or_scope_gap" : null, conflict ? "competing_interpretations" : null]), question: input.current.research.question ?? input.usNetwork.research.question ?? determinantQuestion(input, family, economicLayer.value, exactIdentity) }
      : determinantSufficiency === "DETERMINANT_SUFFICIENT"
        ? { disposition: "STOP" as const, reasonCodes: ["determinants_sufficient_exact_identity_not_required"], question: null }
        : reusable
          ? { disposition: "DEFER_REUSABLE_KNOWLEDGE" as const, reasonCodes: ["reusable_candidate_requires_domain_admission"], question: determinantQuestion(input, family, economicLayer.value, exactIdentity) }
          : { disposition: "ESCALATE_BOUNDED_RESEARCH" as const, reasonCodes: ["material_determinant_gap"], question: determinantQuestion(input, family, economicLayer.value, exactIdentity) };
  const stoppingReason = research.disposition === "STOP"
    ? material ? "S1_DETERMINANT_SUFFICIENCY" : "S2_BELOW_MATERIALITY_FLOOR"
    : research.disposition === "DEFER_REUSABLE_KNOWLEDGE" ? "S5_REUSABLE_KNOWLEDGE_OPPORTUNITY" : null;

  return {
    feeRowId: input.row.id,
    printedLabel: input.row.selectedLabel,
    exactIdentity: {
      state: nonFee ? "not_applicable" : exactIdentity ? "exact_supported" : family.value ? "family_known_identity_unresolved" : "identity_unresolved",
      value: nonFee ? null : exactIdentity,
      necessaryForUsefulAction: exactIdentityNecessary,
      explanation: exactIdentity ? "Exact identity is inherited only from existing admitted governed knowledge." : family.value ? "The economic family is useful while exact identity remains unresolved." : "Neither exact identity nor a defensible family is established.",
    },
    family,
    attributes,
    cardinality,
    retrieval: {
      candidateConceptIds: [...new Set([...input.semantic.candidateConceptIds, ...input.semantic.retrievalLeadConceptIds])],
      fuzzyCandidatePresent: input.semantic.retrievalBasis === "fuzzy_similarity",
      candidateOnly: input.semantic.status !== "resolved_exact_trusted" && (input.semantic.candidateConceptIds.length > 0 || input.semantic.retrievalLeadConceptIds.length > 0),
      promotedToFactByThisLayer: false,
    },
    d1EconomicLayerAndControl: {
      economicLayer,
      collector: nonFee ? notApplicable("No fee collector applies.") : input.analysis.identity.processorFamily.evidenceRefs.length > 0 ? supported("processor_or_acquirer", evidenceRefs, "The processor/acquirer presents or collects the statement charge; collection does not prove economic ownership.") : unresolved("Collector is not established."),
      economicBeneficiary: beneficiary,
      ruleSetter,
      priceSetter,
      merchantFacingPriceController: controller,
    },
    d2MechanicAndPopulation: { mechanic, population },
    d3Materiality: {
      material,
      highMateriality: material && ((processedSalesBps ?? 0) >= 10 || (amountMinor ?? 0) >= 10_000),
      currentPeriodAmountMinor: amountMinor,
      shareOfMaterialFeeDollarsPercent: amountMinor !== null && input.materialDollarTotalMinor > 0 ? round(amountMinor / input.materialDollarTotalMinor * 100, 2) : null,
      shareOfProcessedSalesBasisPoints: processedSalesBps,
      volumeSensitivity: volumeSensitivity(family, mechanic.value),
      annualizationAllowed: Boolean(material && mechanic.value === "fixed_periodic_charge" && /MONTHLY|MTHLY|PER MONTH/.test(label)),
    },
    d4Actionability: action,
    determinantSufficiency,
    stoppingReason,
    research,
    renderingPermissions: {
      exactIdentityAllowed: Boolean(exactIdentity),
      familyLanguageAllowed: family.value !== null,
      acquiringSideLanguageAllowed: economicLayer.value === "acquiring_commercial" && family.confidence !== "UNRESOLVED" && (!input.commercialAdjudication.applicable || input.commercialAdjudication.renderingPermissions.acquiringSideLanguageAllowed),
      networkOwnershipLanguageAllowed: economicLayer.value === "card_network" && (input.commercialAdjudication.renderingPermissions.networkRelatedLanguageAllowed || input.datedNetwork.applicable || input.usNetwork.applicable || input.pricing.broaderEconomicCategory === "network_program_cost"),
      negotiationLanguageAllowed: ["N3", "N4"].includes(action.actionClass),
      contractComplianceLanguageAllowed: false,
      candidateAsFactAllowed: false,
    },
    matchedRuleRefs: [...new Set(["OWD-01", "OWD-02", "OWD-03", "OWD-04", "OWD-05", "OWD-06", "OWD-07", ...input.commercialAdjudication.evidenceRefs.filter((ref) => ref.startsWith("RR-GCCA-"))])],
    limitations: [
      "This determinant analysis cannot change fee membership, statement amounts, arithmetic, or canonical financial truth.",
      "Family classification does not establish exact identity, ultimate retention, contract compliance, or a market benchmark.",
      "Retrieval aliases, fuzzy matches, and AI output remain candidates until independently evidenced and admitted.",
    ],
  };
}

function determineFamily(input: RowInput, label: string, nonFee: boolean): OpenWorldClaim<OpenWorldFeeFamilyCode> {
  const refs = [...new Set([...input.semantic.feeRowEvidenceRefs, ...input.pricing.matchedRuleRefs, ...input.perItem.matchedRuleRefs, ...input.datedNetwork.matchedRuleRefs, ...input.usNetwork.matchedRuleRefs, ...input.commercialAdjudication.evidenceRefs])];
  const sections = input.row.sourceOccurrenceIds.map((id) => input.analysis.feeLedger.sourceOccurrences.find((item) => item.id === id)?.section?.toUpperCase() ?? "");
  const separateExplicitPricingRows = input.analysis.feeLedger.rows.some((row) => row.id !== input.row.id && /ASSESSMENT|ACCESS FEE|AUTH FEE|SALES DISC(?:OUNT)?/.test(row.selectedLabel.toUpperCase()));
  if (nonFee) return supported("F13", refs, "Canonical contribution structure identifies this as a control, subtotal, informational, duplicate, supporting, or zero-dollar row rather than a fee.", "CONFIRMED");
  if (input.commercialAdjudication.applicable && input.commercialAdjudication.openWorldFamily) {
    return supported(input.commercialAdjudication.openWorldFamily, refs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence);
  }
  if (input.pricing.exactFeeIdentity === "amex_program_cost" && input.pricing.broaderEconomicCategory === "network_program_cost") {
    return supported("F2", refs, "Statement-local reconciliation and governed Amex pricing knowledge support an Amex network/program-cost family; interchange is not inferred from the section role.", "STRONG");
  }
  if (input.pricing.broaderEconomicCategory === "amex_program_or_network_cost" && /AMEXCT\d+.*PROGRAM FEES?/.test(label)) {
    return unresolved("The Amex Program Fees label and interchange-detail placement are insufficient without statement-local program-cost reconciliation; ordinary issuer interchange is not inferred.");
  }
  if (input.row.role === "interchange_detail_row" || /\bINTERCHANGE\b/.test(label)) return supported("F1", refs, "Statement role or explicit label supports interchange family classification.");
  const transactionProgramFingerprint = sections.some((section) => section === "TRANSACTION FEES") &&
    /^(MASTERCARD|VISA|DISCOVER|AMEX ACQ|SIGNATURE DEBIT)\s*-/.test(label) &&
    /MERIT|WORLD|REGULATED|RESTAURANT|T\s*&\s*E|SMALL TICKET|\bCPS\b|PURCH|PREPAID BASE|PREMIUM BASE|NON-PREMIUM BASE|REWARDS|RETAIL|CORP|COMMERCIAL|FRAUD ADJ|INCENTIVE/.test(label) &&
    separateExplicitPricingRows &&
    !/\bFEE\b|ACCESS|AUTH|ASSESSMENT|DISCOUNT|TIMES \$|TRANSACTIONS AT/.test(label);
  if (transactionProgramFingerprint) return category("F1", refs, "Brand-qualified program wording, Transaction Fees placement, and separate explicit assessment/access/auth rows support an interchange/qualification family; exact program identity and assessed population remain unresolved.");
  if (input.datedNetwork.applicable || input.usNetwork.applicable) {
    const perEvent = input.perItem.unit.state === "supported" || /AUTH|ACCESS|INTEGRITY|MISUSE|BASE II|DATA USAGE|KILOBYTE|TRANSACTION/.test(label);
    const fixed = /MONTH|ANNUAL|LOCATION|TERMINAL|FIXED/.test(label);
    return supported(fixed ? "F4" : perEvent ? "F3" : "F2", refs, "Existing admitted network evidence supports the network family; collection and merchant-facing price control remain separate.", "STRONG");
  }
  if (input.pricing.broaderEconomicCategory === "merchant_facing_acquiring_side_commercial_pricing") {
    return supported(input.pricing.assessmentBasis.value === "printed_line_population" && /ITEM|TRANS|AUTH/.test(label) ? "F6" : "F5", refs, "Admitted pricing-layer procedure affirmatively supports merchant-facing acquiring-side commercial pricing.", "STRONG");
  }
  if (input.pricing.broaderEconomicCategory === "bundled_merchant_facing_pricing") return supported("F5", refs, "Admitted pricing knowledge supports a bundled merchant-facing acquiring price; component identity remains unresolved.", "CATEGORY_ONLY");
  if (input.perItem.applicable && input.perItem.economicLayer && input.perItem.economicLayer !== "PER_ITEM_LAYER_UNRESOLVED") {
    const layer = input.perItem.economicLayer;
    if (layer.startsWith("network_")) return supported("F3", refs, "Admitted per-item knowledge supports a network event/access family.", input.perItem.confidence);
    if (layer === "acquiring_side_gateway_commercial") return supported("F9", refs, "Cross-brand statement structure and admitted knowledge support a technology/gateway commercial family while provider identity remains unresolved.", input.perItem.confidence);
    if (layer === "dispute_or_exception_processing" || layer === "refund_or_return_processing") return supported("F8", refs, "Admitted per-item knowledge supports an acquiring/service exception-event family.", input.perItem.confidence);
    return supported("F6", refs, "Admitted per-item knowledge affirmatively supports acquiring-side per-item economics.", input.perItem.confidence);
  }
  if (/\bPCI\b|COMPLIANCE|SECURITY|NON[- ]?COMPLIANCE|RISK PROGRAM/.test(label)) return category("F10", refs, "Explicit statement terminology supports the broad security/compliance/risk family, not exact identity or contract status.");
  if (/EQUIP|LEASE|TERMINAL RENT|TERMINAL LEASE|CLOVER.*PLAN|POS.*RENT/.test(label)) return category("F11", refs, "Explicit equipment, terminal, lease, or physical-product wording supports the broad family.");
  if (/GATEWAY|GTWY|SOFTWARE|ONLINE ACCESS|VIRTUAL TERMINAL|HOSTED/.test(label)) return category("F9", refs, "Explicit technology/service wording supports the broad family; provider and price controller remain independently unresolved.");
  if (/CHARGEBACK|CHARGE BACK|RETRIEVAL|ACH REJECT|RETURN FEE|DISPUTE/.test(label)) return category("F8", refs, "Explicit exception/event terminology supports an acquiring/service exception family; exact provider and trigger remain unresolved.");
  const accountFeeSection = sections.some((section) => section === "ACCOUNT FEES");
  if (/MONTHLY SERVICE|MTHLY SERVICE|STATEMENT FEE|PAPER STATEM|ACCOUNT FEE|ADMIN(?:ISTRATIVE)? FEE/.test(label) ||
      (accountFeeSection && /(?:APPLICATION|SETUP|ACTIVATION|ACCESS|SERVICE|PROGRAM|ACCOUNT|ADMIN(?:ISTRATIVE)?)\s+FEE/.test(label))) {
    return category("F7", refs, "Explicit account/administrative wording or placement in the statement's Account Fees section supports an acquiring administrative family; recurrence and contractual authorization remain unresolved.");
  }
  if (/\bTAX\b|GOVERNMENT|REGULATORY|SALES TAX/.test(label)) return category("F12", refs, "Explicit tax, government, or regulatory wording supports a non-processing pass-through family.");
  return unresolved<OpenWorldFeeFamilyCode>("No affirmative statement structure or admitted knowledge supports a fee family; unfamiliarity does not imply acquiring-side ownership.");
}

function layerFor(family: OpenWorldClaim<OpenWorldFeeFamilyCode>, input: RowInput): OpenWorldClaim<OpenWorldEconomicLayer> {
  const refs = family.evidenceRefs;
  if (input.commercialAdjudication.applicable) {
    return input.commercialAdjudication.economicLayer
      ? supported(input.commercialAdjudication.economicLayer, refs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence)
      : unresolvedLayer(input.commercialAdjudication.explanation);
  }
  if (!family.value) return unresolvedLayer("Economic layer remains unresolved; collection and catalog failure are insufficient.");
  if (family.value === "F1") return supported("issuer_interchange", refs, "Interchange is an issuer/network-governed economic layer.");
  if (["F2", "F3", "F4"].includes(family.value)) return supported("card_network", refs, "Admitted evidence supports the underlying network economic layer.");
  if (["F5", "F6", "F7", "F8"].includes(family.value)) return supported("acquiring_commercial", refs, "Affirmative pricing, per-item, or explicit statement evidence supports an acquiring/service commercial layer.", family.confidence);
  if (family.value === "F9") return supported("technology_or_service", refs, "The broad technology/service layer is supported without asserting the provider or price controller.", family.confidence);
  if (family.value === "F10") return supported("security_compliance_or_risk", refs, "The broad security/compliance/risk layer is supported without asserting merchant compliance.", family.confidence);
  if (family.value === "F11") return supported("equipment_or_physical", refs, "The broad equipment/physical layer is supported.", family.confidence);
  if (family.value === "F12") return supported("government_or_nonprocessing_pass_through", refs, "The broad tax/government/non-processing layer is supported.", family.confidence);
  if (family.value === "F13") return supported("not_a_fee", refs, "Canonical structure identifies a non-fee row.", "CONFIRMED");
  return unresolvedLayer("Economic layer remains unresolved.");
}

function determineMechanic(input: RowInput, family: OpenWorldClaim<OpenWorldFeeFamilyCode>): OpenWorldClaim<string> {
  const refs = [...new Set([...input.semantic.feeRowEvidenceRefs, ...input.perItem.unit.evidenceRefs, ...input.pricing.assessmentBasis.evidenceRefs, ...input.usNetwork.mechanic.evidenceRefs, ...input.commercialAdjudication.evidenceRefs])];
  if (family.value === "F13") return notApplicable("No fee assessment mechanic applies.");
  if (input.commercialAdjudication.applicable && input.commercialAdjudication.mechanic) return supported(input.commercialAdjudication.mechanic, refs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence);
  if (input.pricing.amexProgramCostReconciliation?.state === "reconciles_within_rounding") return supported("reconciled_program_cost_total", [...new Set([...refs, ...input.pricing.amexProgramCostReconciliation.evidenceRefs])], "The billed Program Fees amount reconciles within one cent to the separately printed Amex program-cost total; no component allocation is inferred.", "STRONG");
  if (input.usNetwork.mechanic.state === "supported") return supported(input.usNetwork.mechanic.value!, refs, "Existing dated governed evidence supports this mechanic.");
  if (input.perItem.applicable && input.perItem.unit.state === "supported") return supported(unitLabel(input.perItem.unit.value!), refs, input.perItem.unit.explanation);
  if (input.pricing.assessmentBasis.state === "supported") return supported(input.pricing.assessmentBasis.value!, refs, input.pricing.assessmentBasis.explanation);
  const arithmetic = canonicalArithmetic(input);
  if (arithmetic?.formulaBasis === "rate_times_volume") return supported("rate_times_volume", [...new Set([...refs, ...arithmetic.fieldEvidenceRefs.rate, ...arithmetic.fieldEvidenceRefs.volumeBasis])], "Canonical statement operands support a printed rate-times-money-volume mechanic.", "CONFIRMED");
  if (arithmetic?.formulaBasis === "per_item") return supported("per_item", [...new Set([...refs, ...arithmetic.fieldEvidenceRefs.count, ...arithmetic.fieldEvidenceRefs.chargedAmount])], "Canonical statement operands support a printed per-item mechanic.", "CONFIRMED");
  if (arithmetic?.formulaBasis === "source_units_times_per_unit") return supported(arithmetic.sourceUnit ?? "source_units_times_per_unit", [...new Set([...refs, ...arithmetic.fieldEvidenceRefs.sourceUnitBasis, ...arithmetic.fieldEvidenceRefs.chargedAmount])], "Canonical statement operands support a printed source-unit mechanic.", "CONFIRMED");
  const sourceText = sourceTextFor(input);
  if (arithmetic?.status === "partial" && arithmetic.volumeBasis && /\b\d+(?:\.\d+)?\s+TIMES\s+\$\s*[\d,]+(?:\.\d+)?\b/.test(sourceText)) {
    return category("rate_times_volume", [...new Set([...refs, ...arithmetic.fieldEvidenceRefs.volumeBasis])], "The printed source exposes a rate-times-money-volume formula, while canonical arithmetic remains unresolved because a complete normalized operand pair is unavailable.");
  }
  const label = input.row.selectedLabel.toUpperCase();
  if (/MONTHLY|MTHLY|PER MONTH|STATEMENT FEE|ACCOUNT FEE/.test(label)) return category("fixed_periodic_charge", refs, "Explicit periodic/account wording supports a fixed-periodic mechanic; recurrence beyond this period is not inferred.");
  if (/ANNUAL|YEARLY/.test(label)) return category("fixed_annual_charge", refs, "Explicit annual wording supports a fixed-annual mechanic.");
  if (["F7", "F10", "F11", "F12"].includes(family.value ?? "") && input.row.selectedAmount) return category("fixed_or_printed_charge", refs, "The statement supports a current-period printed charge but not a recurring cadence or more specific assessed population.");
  return unresolved("The billed unit or population is not reliably exposed.");
}

function determinePopulation(input: RowInput, mechanic: OpenWorldClaim<string>): OpenWorldClaim<string> {
  if (mechanic.state === "not_applicable") return notApplicable("No assessed population applies.");
  if (input.commercialAdjudication.applicable && input.commercialAdjudication.population) return supported(input.commercialAdjudication.population, input.commercialAdjudication.evidenceRefs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence);
  if (input.pricing.amexProgramCostReconciliation?.state === "reconciles_within_rounding") return supported("statement_printed_amex_program_cost_total", input.pricing.amexProgramCostReconciliation.evidenceRefs, "The applicable population is the statement's separately printed Amex program-cost total; underlying program components remain unallocated.", "STRONG");
  if (input.usNetwork.population.state === "supported") return supported(input.usNetwork.population.value!, input.usNetwork.population.evidenceRefs, "Existing dated governed evidence supports this population.");
  if (input.perItem.applicable && input.perItem.population.state !== "unresolved" && input.perItem.population.value) return supported(input.perItem.population.value, input.perItem.population.evidenceRefs, input.perItem.population.explanation);
  if (input.pricing.assessmentBasis.state === "supported") return supported(input.pricing.assessmentBasis.value!, input.pricing.assessmentBasis.evidenceRefs, input.pricing.assessmentBasis.explanation);
  const arithmetic = canonicalArithmetic(input);
  if (arithmetic?.formulaBasis === "rate_times_volume" && arithmetic.volumeBasis) return supported("printed_money_volume", arithmetic.fieldEvidenceRefs.volumeBasis, "The canonical statement row preserves the printed money-volume base.", "CONFIRMED");
  if (arithmetic?.formulaBasis === "per_item" && arithmetic.itemCount !== null) return supported("printed_item_count", arithmetic.fieldEvidenceRefs.count, "The canonical statement row preserves the printed item count without equating it to another statement population.", "CONFIRMED");
  if (arithmetic?.formulaBasis === "source_units_times_per_unit" && arithmetic.sourceUnitBasis !== null) return supported(`printed_${arithmetic.sourceUnit ?? "source_units"}`, arithmetic.fieldEvidenceRefs.sourceUnitBasis, "The canonical statement row preserves the printed source-unit population.", "CONFIRMED");
  if (mechanic.value === "rate_times_volume" && arithmetic?.volumeBasis) return category("printed_money_volume", arithmetic.fieldEvidenceRefs.volumeBasis, "The printed money-volume base is preserved, while exact arithmetic remains unresolved.");
  if (mechanic.value === "fixed_or_printed_charge") return category("current_statement_period_occurrence", mechanic.evidenceRefs, "Only the current statement occurrence is established; recurrence is not inferred.");
  if (mechanic.value?.startsWith("fixed_")) return category("statement_period", mechanic.evidenceRefs, "The current-period charge is known; recurring cadence is not inferred beyond explicit wording.");
  return unresolved("Relevant population is not established.");
}

function canonicalArithmetic(input: RowInput) {
  return input.analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === input.row.id) ?? null;
}

function sourceTextFor(input: RowInput): string {
  const occurrences = new Map(input.analysis.feeLedger.sourceOccurrences.map((item) => [item.id, item]));
  return input.row.sourceOccurrenceIds.map((id) => occurrences.get(id)?.normalizedSourceText ?? "").join(" ").toUpperCase();
}

function determineController(family: OpenWorldClaim<OpenWorldFeeFamilyCode>, input: RowInput, refs: string[]): OpenWorldClaim<"card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party"> {
  if (input.commercialAdjudication.applicable) {
    return input.commercialAdjudication.merchantFacingPriceController
      ? supported(input.commercialAdjudication.merchantFacingPriceController, input.commercialAdjudication.evidenceRefs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence)
      : unresolved("The Product adjudication intentionally leaves the merchant-facing billed-price controller or any spread unresolved.");
  }
  if (input.pricing.merchantFacingPriceController || input.perItem.merchantFacingPriceController) return supported("acquiring_side_program", refs, "Admitted knowledge affirmatively supports acquiring-side control of the merchant-facing price; retention remains unresolved.");
  if (family.value === "F1" || family.value === "F2" || family.value === "F3" || family.value === "F4") return unresolved("The underlying schedule may be network-set, but the merchant-facing billed amount or spread controller is not established.");
  if (family.value === "F12") return category("government_or_third_party", refs, "The external rule setter may control the underlying amount; statement presentation does not prove pass-through at par.");
  if (family.value === "F7" || family.value === "F8") return category("acquiring_side_program", refs, "The processor statement context supports ordinary acquiring-side reviewability, not exact price-control allocation or retention.");
  return unresolved("Price controller remains unresolved.");
}

function determineBeneficiary(family: OpenWorldClaim<OpenWorldFeeFamilyCode>, input: RowInput, refs: string[]): OpenWorldClaim<"issuer" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party"> {
  if (input.commercialAdjudication.applicable) {
    return input.commercialAdjudication.economicBeneficiary
      ? supported(input.commercialAdjudication.economicBeneficiary, input.commercialAdjudication.evidenceRefs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence)
      : unresolved("The Product adjudication intentionally leaves economic beneficiary and ultimate retention unresolved.");
  }
  if (input.pricing.economicBeneficiary === "card_network") return supported("card_network", refs, "Statement-local reconciliation and governed Amex knowledge support the program/network beneficiary at this scope; ultimate downstream retention is not inferred.", input.pricing.confidence);
  if (family.value === "F1") return supported("issuer", refs, "Interchange economics primarily benefit issuing-side participants; exact allocation is not inferred.");
  if (["F2", "F3", "F4"].includes(family.value ?? "") && (input.datedNetwork.applicable || input.usNetwork.applicable)) return supported("card_network", refs, "Admitted evidence supports an underlying card-network beneficiary.");
  if (family.value === "F9") return category("technology_or_service_provider", refs, "A technology/service provider is the likely broad beneficiary; exact provider and revenue sharing remain unresolved.");
  if (family.value === "F12") return category("government_or_third_party", refs, "The broad beneficiary is external; exact recipient and pass-through correctness remain unresolved.");
  return unresolved("Economic beneficiary and ultimate retention are not inferred from collection or price control.");
}

function determineRuleSetter(family: OpenWorldClaim<OpenWorldFeeFamilyCode>, input: RowInput, refs: string[]): OpenWorldClaim<"issuer_or_network" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party"> {
  if (input.commercialAdjudication.applicable) {
    return input.commercialAdjudication.ruleSetter
      ? supported(input.commercialAdjudication.ruleSetter, input.commercialAdjudication.evidenceRefs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence)
      : unresolved("The Product adjudication intentionally leaves the rule setter unresolved.");
  }
  if (input.pricing.ruleSetter === "card_network") return supported("card_network", refs, "Governed Amex program evidence supports card-network/program rule setting, separate from collection and merchant-facing price control.", input.pricing.confidence);
  if (family.value === "F1") return supported("issuer_or_network", refs, "Interchange rule setting belongs to the issuing/network system, separate from statement collection.");
  if (["F2", "F3", "F4"].includes(family.value ?? "") && (input.datedNetwork.applicable || input.usNetwork.applicable)) return supported("card_network", refs, "Admitted evidence supports card-network rule setting.");
  if (["F5", "F6", "F7", "F8"].includes(family.value ?? "") && input.pricing.priceSetter) return supported("acquiring_side_program", refs, "Admitted pricing-layer evidence supports acquiring-side price setting.");
  if (family.value === "F12") return category("government_or_third_party", refs, "Explicit external-charge terminology supports an external rule-setter family.");
  return unresolved("Rule setter is not established by the printed label alone.");
}

function determinePriceSetter(family: OpenWorldClaim<OpenWorldFeeFamilyCode>, input: RowInput, refs: string[]): OpenWorldClaim<"issuer_or_network" | "card_network" | "acquiring_side_program" | "technology_or_service_provider" | "government_or_third_party"> {
  if (input.commercialAdjudication.applicable) {
    return input.commercialAdjudication.priceSetter
      ? supported(input.commercialAdjudication.priceSetter, input.commercialAdjudication.evidenceRefs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence)
      : unresolved("The Product adjudication intentionally leaves the price setter unresolved.");
  }
  if (input.pricing.priceSetter === "card_network") return supported("card_network", refs, "Governed Amex program evidence supports the underlying wholesale-cost price setter; the acquiring side separately controls the merchant-facing presentation.", input.pricing.confidence);
  if (family.value === "F1") return supported("issuer_or_network", refs, "The interchange schedule is set within the issuing/network system; qualification incidence remains separate.");
  if (["F2", "F3", "F4"].includes(family.value ?? "") && (input.datedNetwork.applicable || input.usNetwork.applicable)) return supported("card_network", refs, "Admitted evidence supports the underlying network price setter; merchant-facing spread control remains separate.");
  if (input.pricing.priceSetter || input.perItem.priceSetter === "acquiring_side_program") return supported("acquiring_side_program", refs, "Admitted pricing/per-item evidence supports acquiring-side price setting without establishing ultimate retention.");
  if (family.value === "F12") return category("government_or_third_party", refs, "The broad external price-setting lane is supported; billed pass-through correctness is not.");
  return unresolved("Price setter is not established by collection, catalog failure, or a broad family alone.");
}

function determineAction(family: OpenWorldClaim<OpenWorldFeeFamilyCode>, layer: OpenWorldEconomicLayer | null, controller: string | null, input: RowInput, label: string): OpenWorldFeeDeterminant["d4Actionability"] {
  const base = { merchantAgreementRequiredForAction: false as const, merchantAgreementRequiredForContractConclusion: true };
  if (input.commercialAdjudication.applicable && input.commercialAdjudication.actionClass) {
    const actions: Record<"N1" | "N2" | "N3" | "N5" | "N7", { action: string; explanation: string }> = {
      N1: { action: "Verify the assessed population and ask whether the merchant-facing amount is passed through or includes spread; do not negotiate the underlying network schedule as processor-set.", explanation: "The scoped network identity is supported while official par and any acquiring uplift remain separate claims." },
      N2: { action: "Request event detail and review operational incidence; separately ask the processor to explain any merchant-facing spread.", explanation: "A network-related underlying price can coexist with behaviorally influenceable incidence without proving merchant fault or full avoidability." },
      N3: { action: "Ask the processor/acquirer/ISO to itemize and commercially review the merchant-facing price without asserting provider retention or a contractual right.", explanation: "Acquiring-side merchant-facing price control is supported; allocation, retention, and contract compliance remain separate." },
      N5: { action: "Request the source authority, recipient, and computation and verify that the billed amount is properly characterized.", explanation: "The broad external/non-processing lane is supported while exact recipient remains unresolved." },
      N7: { action: "Request provider or merchant documentation to identify component composition, beneficiary, and merchant-facing price control before attributing dollars.", explanation: "The event and broad family may be known while economic composition remains unresolved." },
    };
    return { ...base, actionClass: input.commercialAdjudication.actionClass, ...actions[input.commercialAdjudication.actionClass] };
  }
  if (family.value === "F13") return { ...base, actionClass: "NOT_APPLICABLE", action: "No merchant fee action; treat this row as a control or supporting representation.", explanation: "Canonical contribution structure identifies a non-fee row." };
  if (family.value === "F1") return { ...base, actionClass: "N2", action: "Request the interchange category, transaction population, and qualification detail, then review avoidable downgrade or data-quality drivers where supported. Do not describe the underlying interchange schedule as processor-negotiable.", explanation: "Interchange price setting and qualification incidence are separate; exact program identity is not required to request supporting detail." };
  if (["F2", "F3", "F4"].includes(family.value ?? "")) {
    const influence = input.perItem.incidenceActionability === "behaviorally_influenceable_where_applicable" || /MISUSE|INTEGRITY|REVERSAL|FALLBACK|ZERO FLOOR/.test(label);
    return influence
      ? { ...base, actionClass: "N2", action: "Request event-level detail and review the operational incidence; separately ask the processor to explain any merchant-facing spread. No agreement is required for that review.", explanation: "A network-set underlying price can coexist with behaviorally influenceable incidence." }
      : { ...base, actionClass: "N1", action: "Verify the assessed population and ask whether the merchant-facing amount is passed through or includes spread. Do not negotiate the underlying network schedule as though the processor set it.", explanation: "The underlying network price and merchant-facing presentation remain separate." };
  }
  if (family.value === "F7" && /STATEMENT|ONLINE ACCESS|PAPER|APPLICATION|SETUP|ACTIVATION|ACCOUNT|ADMIN/.test(label)) return { ...base, actionClass: "N4", action: "Ask to explain, remove, waive, or reduce this administrative/account charge; the request itself does not require the merchant agreement. Use merchant documents only for contractual authorization, rights, or remedies.", explanation: "The supported administrative/account family permits a commercial waiver or reduction request without implying recurrence, a guaranteed outcome, or contractual noncompliance." };
  if (family.value === "F5" || family.value === "F6" || (family.value === "F7" && controller === "acquiring_side_program")) return { ...base, actionClass: "N3", action: "Ask the processor/acquirer/ISO to itemize and review this merchant-facing price; requesting explanation or reduction does not require the merchant agreement.", explanation: "Affirmative evidence supports acquiring-side commercial reviewability without asserting retention or a contractual right." };
  if (family.value === "F8") return { ...base, actionClass: "N3", action: "Request event detail, validate the triggering population, and ask for a pricing review or exception. The review does not require the agreement; contractual entitlement does.", explanation: "Exception incidence and merchant-facing price are separate review paths." };
  if (family.value === "F9" || family.value === "F10") return { ...base, actionClass: "N5", action: "Identify the service/provider, validate usage or compliance status, and ask the processor or vendor to explain, reduce, or remove the charge. No agreement is needed to ask for review.", explanation: "The broad service layer supports a useful verification path while exact identity and controller may remain unresolved." };
  if (family.value === "F11") return { ...base, actionClass: "N6", action: "Inventory the equipment/service and request removal or buyout terms; exact term, cancellation right, or remedy requires the governing agreement.", explanation: "Equipment/lease economics are actionable, while contract conclusions are document-dependent." };
  if (family.value === "F12") return { ...base, actionClass: "N5", action: "Request the source authority and computation, and verify that the billed amount is properly passed through. Contract documents are needed only for merchant-specific rights or remedies.", explanation: "An external charge can be verified without assuming pass-through correctness." };
  if (layer === "acquiring_commercial") return { ...base, actionClass: "N3", action: "Ask for an itemization and commercial review without asserting who retains the charge.", explanation: "Acquiring-side economics are supported, but exact allocation remains unresolved." };
  return { ...base, actionClass: "N7", action: "Ask the processor to identify the charge, billed unit, population, beneficiary, and merchant-facing price controller before making a negotiation or operational recommendation.", explanation: "Economic layer or price control is unresolved, so the safe action is targeted verification." };
}

function determineAttributes(input: RowInput, label: string, family: OpenWorldClaim<OpenWorldFeeFamilyCode>, layer: OpenWorldClaim<OpenWorldEconomicLayer>, exactIdentity: string | null): OpenWorldAttribute[] {
  const genericBundlingSignal = /BUNDLE|PACKAGE|COMPOSITE|PROGRAM/.test(label) &&
    input.commercialAdjudication.commercialDollarPolicy !== "EXACT_PROVIDER_CONTROLLED_MERCHANT_FACING_PRICE";
  return compactStrings([
    input.commercialAdjudication.cardinality === "multiple_components" || genericBundlingSignal || input.pricing.broaderEconomicCategory === "bundled_merchant_facing_pricing" ? "bundled_or_composite" : null,
    input.usNetwork.reference.candidateValues.length > 1 ? "component_of_bounded_fee" : null,
    /\*\*|ADDITIONAL FEES|OTHER FEES|MISC/.test(label) ? "undescribed" : null,
    family.value === "F9" || family.value === "F11" ? "third_party_possible" : null,
    family.value === "F11" ? "contract_locked_possible" : null,
    family.value === "F8" || /MINIMUM|NON[- ]?COMPLIANCE/.test(label) ? "conditional" : null,
    layer.value === "LAYER_UNRESOLVED" ? "layer_unresolved" : null,
    !exactIdentity ? "identity_unresolved" : null,
    !input.pricing.merchantFacingPriceController && !input.perItem.merchantFacingPriceController ? "price_controller_unresolved" : null,
  ]) as OpenWorldAttribute[];
}

function determineCardinality(input: RowInput, nonFee: boolean, label: string, refs: string[]): OpenWorldFeeDeterminant["cardinality"] {
  if (nonFee) return supported("not_a_fee", refs, "Canonical structure identifies a non-fee row.", "CONFIRMED");
  if (input.commercialAdjudication.applicable && input.commercialAdjudication.cardinality) return supported(input.commercialAdjudication.cardinality, input.commercialAdjudication.evidenceRefs, input.commercialAdjudication.explanation, input.commercialAdjudication.confidence);
  if (/BUNDLE|PACKAGE|COMPOSITE|ADDITIONAL FEES|OTHER FEES/.test(label) || input.pricing.broaderEconomicCategory === "bundled_merchant_facing_pricing") return category("multiple_components", refs, "The printed row can contain multiple economic components; one line is not assumed to be one fee.");
  if (input.datedNetwork.applicable && input.usNetwork.reference.candidateValues.length > 1) return category("bounded_component", refs, "Governed evidence bounds a component or product variant without proving one-to-one line cardinality.");
  return category("single_fee", refs, "The statement presents one charge row; hidden economic allocation is not inferred.");
}

function determinantQuestion(input: RowInput, family: OpenWorldClaim<OpenWorldFeeFamilyCode>, layer: OpenWorldEconomicLayer | null, exactIdentity: string | null): string {
  return `For printed label ${JSON.stringify(input.row.selectedLabel)}, resolve only the material gaps: ${compactStrings([!exactIdentity ? "exact identity if necessary" : null, !family.value ? "economic family" : null, layer === "LAYER_UNRESOLVED" ? "economic layer" : null, "assessment unit/population", "merchant-facing price controller"]).join(", ")}. Preserve competing interpretations; absence from a network catalog does not prove acquiring-side ownership, and AI/fuzzy candidates are not facts.`;
}

function volumeSensitivity(family: OpenWorldClaim<OpenWorldFeeFamilyCode>, mechanic: string | null): OpenWorldFeeDeterminant["d3Materiality"]["volumeSensitivity"] {
  if (family.value === "F13") return "not_applicable";
  if (family.value === "F5" || mechanic?.includes("volume") || mechanic?.includes("sales")) return "proportional";
  if (["F3", "F6", "F8"].includes(family.value ?? "") || mechanic?.includes("event") || mechanic?.includes("item")) return family.value === "F8" ? "conditional_or_exception" : "per_event";
  if (["F4", "F7", "F10", "F11"].includes(family.value ?? "") || mechanic?.startsWith("fixed_")) return "fixed_or_periodic";
  return "unresolved";
}

function unitLabel(unit: GovernedPerItemUnit): string {
  return unit;
}

function isMaterial(row: CanonicalFeeRow, analysis: CanonicalStatementAnalysis): boolean {
  if (!row.contributesToUniqueTotal || !row.selectedAmount || row.selectedAmount.amountMinor <= 0) return false;
  const sales = analysis.financialFacts.processedSales.value?.amountMinor ?? 0;
  return row.selectedAmount.amountMinor >= 100 || (sales > 0 && row.selectedAmount.amountMinor / sales * 10_000 >= 0.25);
}

function supported<T>(value: T, evidenceRefs: string[], explanation: string, confidence: OpenWorldClaim<T>["confidence"] = "STRONG"): OpenWorldClaim<T> {
  return { state: "supported", value, confidence, evidenceRefs, explanation };
}

function category<T>(value: T, evidenceRefs: string[], explanation: string): OpenWorldClaim<T> {
  return { state: "category_only", value, confidence: "CATEGORY_ONLY", evidenceRefs, explanation };
}

function unresolved<T>(explanation: string): OpenWorldClaim<T> {
  return { state: "unresolved", value: null, confidence: "UNRESOLVED", evidenceRefs: [], explanation };
}

function unresolvedLayer(explanation: string): OpenWorldClaim<OpenWorldEconomicLayer> {
  return { state: "unresolved", value: "LAYER_UNRESOLVED", confidence: "UNRESOLVED", evidenceRefs: [], explanation };
}

function notApplicable<T>(explanation: string): OpenWorldClaim<T> {
  return { state: "not_applicable", value: null, confidence: "CONFIRMED", evidenceRefs: [], explanation };
}

function compactStrings<T extends string>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => Boolean(item));
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export type OpenWorldRenderingAssertion = {
  assertsExactIdentity?: boolean;
  assertsAcquiringSide?: boolean;
  assertsNetworkOwnership?: boolean;
  recommendsNegotiation?: boolean;
  assertsContractCompliance?: boolean;
  rendersCandidateAsFact?: boolean;
};

export function validateOpenWorldRenderingV1(row: OpenWorldFeeDeterminant, assertion: OpenWorldRenderingAssertion): { allowed: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (assertion.assertsExactIdentity && !row.renderingPermissions.exactIdentityAllowed) reasonCodes.push("exact_identity_exceeds_evidence");
  if (assertion.assertsAcquiringSide && !row.renderingPermissions.acquiringSideLanguageAllowed) reasonCodes.push("acquiring_side_not_affirmatively_supported");
  if (assertion.assertsNetworkOwnership && !row.renderingPermissions.networkOwnershipLanguageAllowed) reasonCodes.push("network_ownership_not_supported");
  if (assertion.recommendsNegotiation && !row.renderingPermissions.negotiationLanguageAllowed) reasonCodes.push("negotiation_exceeds_price_control_evidence");
  if (assertion.assertsContractCompliance) reasonCodes.push("merchant_document_required_for_contract_conclusion");
  if (assertion.rendersCandidateAsFact) reasonCodes.push("candidate_cannot_render_as_fact");
  return { allowed: reasonCodes.length === 0, reasonCodes };
}

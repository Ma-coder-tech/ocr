import { assessCanonicalExactFeeRowArithmetic } from "./exactSourceArithmeticBridge.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";

export const GOVERNED_PRICING_LAYER_KNOWLEDGE_V1 =
  "governed_pricing_layer_knowledge_batch1_2026_09_06_v1" as const;

export type GovernedPricingLayerRule = {
  ruleId: string;
  priority: number;
  title: string;
  scope:
    | "processor_agnostic"
    | "fiserv_family_statement_analysis"
    | "statement_case_fact";
  lifecycle: "active";
  admittedClaim: string;
  prohibitedClaims: string[];
  dependencies: string[];
  confidence: "CONFIRMED" | "STRONG" | "LIKELY";
  admissionStatus: "admitted";
  evidenceClass: "G1_product_domain_adjudication";
  sourceRefs: string[];
  sourceFingerprints: string[];
  reviewedAt: "2026-09-06";
  limitations: string[];
};

export type GovernedPricingModelResolution = {
  state: "confirmed" | "supported" | "unresolved";
  model: "flat_rate" | "tiered_pricing" | "interchange_plus" | "unknown";
  confidence: "high" | "medium" | "low";
  evidenceRefs: string[];
  ruleRefs: string[];
  relevantPopulation: string | null;
  observedRate: string | null;
  interchangeDisclosure: "complete" | "present_not_proven_complete" | "absent";
  assessmentSeparation: "present" | "absent";
  limitations: string[];
};

export type GovernedAssessmentBasis = {
  state: "supported" | "not_determinable" | "unresolved" | "not_applicable";
  value:
    | "gross_sales_before_refunds"
    | "net_sales_after_refunds"
    | "printed_line_population"
    | null;
  printedBaseMinor: number | null;
  evidenceRefs: string[];
  ruleRefs: string[];
  explanation: string;
};

export type GovernedPricingLayerRowResolution = {
  feeRowId: string;
  matchedRuleRefs: string[];
  exactFeeIdentity: string | null;
  broaderEconomicCategory:
    | "qualification_pricing_population"
    | "merchant_facing_acquiring_side_commercial_pricing"
    | "bundled_merchant_facing_pricing"
    | "amex_program_or_network_cost"
    | null;
  confidence: "CONFIRMED" | "STRONG" | "LIKELY" | "CATEGORY_ONLY" | "UNRESOLVED";
  assessmentBasis: GovernedAssessmentBasis;
  collector: "processor_or_acquirer" | null;
  economicBeneficiary: "card_network" | "acquiring_side_program" | null;
  ruleSetter: "card_network" | "acquiring_side_program" | null;
  priceSetter: "card_network" | "acquiring_side_program" | null;
  merchantFacingPriceController: "acquiring_side_program" | null;
  negotiability: "sometimes_negotiable" | null;
  tierRateMechanic: "absolute" | "incremental_surcharge" | "unresolved" | null;
  minimumDiscount: {
    billedAmountIsShortfall: true;
    contractualMinimum: "merchant_document_required";
    qualifyingBasis: "merchant_document_required";
    waiverTerms: "merchant_document_required";
  } | null;
  amexInterpretation:
    | "likely_acquiring_side_commercial_charge"
    | "likely_underlying_program_cost"
    | "bundled_not_separable"
    | "unresolved"
    | null;
  competingInterpretations: string[];
  evidenceRefs: string[];
  limitations: string[];
};

export type GovernedUnrecoveredRefundCostResolution = {
  feeRowId: string;
  state: "supported" | "withheld" | "not_applicable";
  amountMinor: number | null;
  ruleRefs: string[];
  evidenceRefs: string[];
  reasonCodes: string[];
  explanation: string;
};

export type GovernedPricingLayerResolution = {
  catalogVersion: typeof GOVERNED_PRICING_LAYER_KNOWLEDGE_V1;
  rules: GovernedPricingLayerRule[];
  pricingModel: GovernedPricingModelResolution;
  rowsByFeeRowId: Readonly<Record<string, GovernedPricingLayerRowResolution>>;
  minimumDiscount: {
    billedShortfallFeeRowIds: string[];
    noShortfallBilledThisPeriod: boolean;
    monthlyMinimumExistence: "not_determinable_from_absence";
    ruleRefs: string[];
  };
  unrecoveredRefundCostByFeeRowId: Readonly<Record<string, GovernedUnrecoveredRefundCostResolution>>;
  rateCardIntelligenceFeeRowIds: string[];
  canonicalMutationAllowed: false;
  limitations: string[];
};

export type GovernedPricingObservationInput = {
  model: "flat_discount_pricing" | "tiered_pricing" | "interchange_plus" | "flat_rate" | "unknown";
  confidence: "high" | "medium" | "low";
  evidenceRefs: string[];
  relevantPopulation: string | null;
};

const PRODUCT_ADJUDICATION_REF = "RateReveal_Product_Batch1_Fiserv_Pricing_Semantics_Adjudication_2026_09_06";
const PRODUCT_ADJUDICATION_SHA256 = "41c7d92566be6648c8a93509abef68040f9b54b3b129cff77cb846474eef3c8f";
const INDEPENDENT_REVIEW_REF = "CLAUDE_RateReveal_Batch1_Fiserv_Pricing_Semantics_Review.md";
const INDEPENDENT_REVIEW_SHA256 = "c68f757a29576a9710155da7c8e166ea4f73e4f422b1246e2f3d2101cda6867b";

const COMMON = {
  lifecycle: "active" as const,
  admissionStatus: "admitted" as const,
  evidenceClass: "G1_product_domain_adjudication" as const,
  sourceRefs: [PRODUCT_ADJUDICATION_REF, INDEPENDENT_REVIEW_REF],
  sourceFingerprints: [PRODUCT_ADJUDICATION_SHA256, INDEPENDENT_REVIEW_SHA256],
  reviewedAt: "2026-09-06" as const,
};

const RULES: GovernedPricingLayerRule[] = [
  {
    ...COMMON,
    ruleId: "RR-B1-00",
    priority: 0,
    title: "Template identity never determines pricing economics",
    scope: "processor_agnostic",
    admittedClaim: "Template/family identity may guide parsing and aliases, while pricing structure is re-detected from each statement/account context.",
    prohibitedClaims: ["pricing_model_from_template", "markup_from_template", "assessment_basis_from_template", "negotiability_from_template", "reasonableness_from_template", "economic_ownership_from_template"],
    dependencies: [],
    confidence: "STRONG",
    limitations: ["A prior period for the same merchant is supporting context, not authority for the current statement's pricing."],
  },
  {
    ...COMMON,
    ruleId: "RR-B1-01",
    priority: 1,
    title: "QUAL/MQUAL/NQUAL are qualification/pricing populations",
    scope: "processor_agnostic",
    admittedClaim: "Qualification labels identify billed pricing populations; pricing-model classification requires surrounding structure, distinct applied rates, interchange disclosure/completeness, and assessment separation.",
    prohibitedClaims: ["tiered_pricing_from_label_alone", "processor_markup_from_label_alone", "economic_beneficiary_from_label_alone", "avoidable_network_downgrade_from_label_alone", "merchant_error_from_label_alone"],
    dependencies: ["RR-B1-00"],
    confidence: "STRONG",
    limitations: ["Qualification labels may participate in flat, tiered, hybrid, or otherwise bundled programs."],
  },
  {
    ...COMMON,
    ruleId: "RR-B1-02",
    priority: 2,
    title: "Sales Discount conditional commercial-layer procedure",
    scope: "processor_agnostic",
    admittedClaim: "When interchange and applicable network costs are demonstrably accounted for separately, a remaining ad-valorem Sales Discount is merchant-facing acquiring-side commercial pricing.",
    prohibitedClaims: ["sales_discount_equals_processor_profit", "sole_processor_retention", "beneficiary_from_collection"],
    dependencies: ["RR-B1-00", "RR-B1-01"],
    confidence: "STRONG",
    limitations: ["Ultimate retention and revenue sharing require rare direct evidence; a bundled discount remains economically unseparated."],
  },
  {
    ...COMMON,
    ruleId: "RR-B1-03",
    priority: 3,
    title: "Amex commercial-charge decision procedure",
    scope: "fiserv_family_statement_analysis",
    admittedClaim: "Amex-specific charges are resolved from separate program-cost itemization, dated network values, surrounding commercial layers, and assessment structure rather than from the printed label alone.",
    prohibitedClaims: ["fixed_program_cost_fee_ax_meaning", "amex_charge_confirmed_from_label", "acquiring_side_retention_confirmed_without_evidence"],
    dependencies: ["RR-B1-00", "RR-B1-02"],
    confidence: "STRONG",
    limitations: ["An acquiring-side commercial-charge outcome is ordinarily capped at LIKELY; dated Amex value tables remain necessary for network-value matching."],
  },
  {
    ...COMMON,
    ruleId: "RR-B1-04",
    priority: 4,
    title: "Monthly minimum billed amount is a shortfall",
    scope: "processor_agnostic",
    admittedClaim: "A billed minimum-discount amount is normally the current-period shortfall; absence proves only that no shortfall was billed this period.",
    prohibitedClaims: ["billed_shortfall_equals_contractual_minimum", "absence_proves_no_monthly_minimum"],
    dependencies: ["RR-B1-00"],
    confidence: "STRONG",
    limitations: ["The contracted minimum, qualifying basis, waiver conditions, rights, and remedies require merchant-specific documents."],
  },
  {
    ...COMMON,
    ruleId: "RR-B1-05",
    priority: 5,
    title: "Gross/net assessment basis is line-specific",
    scope: "processor_agnostic",
    admittedClaim: "Gross-versus-net basis is determined per fee line/population using source evidence and exact recomputation; equal gross/net populations remain not determinable unless explicitly printed.",
    prohibitedClaims: ["processor_wide_gross_basis", "statement_wide_gross_basis", "default_net_when_refunds_zero", "basis_from_template"],
    dependencies: ["RR-B1-00"],
    confidence: "STRONG",
    limitations: ["A printed base can be confirmed without proving that it represents gross or net for an unresolved population."],
  },
  {
    ...COMMON,
    ruleId: "RR-B1-06",
    priority: 6,
    title: "Unrecovered cost on refunded volume requires absence proof",
    scope: "processor_agnostic",
    admittedClaim: "Cost attributable to refunded volume is calculated only after proving the fee uses gross, refunds are not already netted, no fee credit exists, no offset appears elsewhere, and relevant sections are complete.",
    prohibitedClaims: ["refund_penalty_terminology", "all_original_transaction_costs_unrecovered", "refund_cost_without_credit_offset_check", "per_event_refund_economics_combined_without_proof"],
    dependencies: ["RR-B1-05"],
    confidence: "STRONG",
    limitations: ["Materiality depends on refund rate and merchant economics, not merely on the existence of gross-basis billing."],
  },
  {
    ...COMMON,
    ruleId: "RR-B1-07-PRIORITY-G8",
    priority: 7,
    title: "Priority G8 statement case fact",
    scope: "statement_case_fact",
    admittedClaim: "The reviewed December 2024 G8 statement has a flat 3.80% bundled merchant price on the deterministically established gross-before-refunds population.",
    prohibitedClaims: ["priority_usual_rate_3_80", "priority_always_gross", "priority_template_implies_flat_rate", "flat_rate_equals_processor_margin"],
    dependencies: ["RR-B1-00", "RR-B1-01", "RR-B1-05"],
    confidence: "CONFIRMED",
    limitations: ["This is scoped to source document doc_6cfedc3ab7b9192b and period ending 2024-12-31; it is not reusable processor pricing knowledge."],
  },
];

const PRIORITY_G8 = {
  sourceDocumentRef: "doc_6cfedc3ab7b9192b",
  periodEnd: "2024-12-31",
  rate: "0.038",
  grossPopulationMinor: 8_060_144,
};

export function governedPricingLayerRulesV1(): GovernedPricingLayerRule[] {
  return structuredClone(RULES);
}

export function resolveGovernedPricingLayerKnowledgeV1(input: {
  analysis: CanonicalStatementAnalysis;
  suppliedPricingObservation?: GovernedPricingObservationInput | null;
}): GovernedPricingLayerResolution {
  const rows = input.analysis.feeLedger.rows;
  const pricingModel = resolvePricingModel(input.analysis, input.suppliedPricingObservation ?? null);
  const rowsByFeeRowId = Object.fromEntries(rows.map((row) => {
    const resolution = resolveRow(input.analysis, row, pricingModel);
    return [row.id, resolution];
  }));
  const minimumRows = rows.filter((row) => isMinimumDiscount(row.selectedLabel) && row.contributesToUniqueTotal && (row.selectedAmount?.amountMinor ?? 0) > 0);
  const refundCost = Object.fromEntries(Object.values(rowsByFeeRowId).map((row) => [
    row.feeRowId,
    unrecoveredRefundCost(input.analysis, row),
  ]));
  return deepFreeze({
    catalogVersion: GOVERNED_PRICING_LAYER_KNOWLEDGE_V1,
    rules: governedPricingLayerRulesV1(),
    pricingModel,
    rowsByFeeRowId,
    minimumDiscount: {
      billedShortfallFeeRowIds: minimumRows.map((row) => row.id).sort(),
      noShortfallBilledThisPeriod: minimumRows.length === 0,
      monthlyMinimumExistence: "not_determinable_from_absence",
      ruleRefs: ["RR-B1-04"],
    },
    unrecoveredRefundCostByFeeRowId: refundCost,
    rateCardIntelligenceFeeRowIds: rows
      .filter((row) => isZeroAmountRateCardRow(row))
      .map((row) => row.id)
      .sort(),
    canonicalMutationAllowed: false,
    limitations: [
      "Pricing-layer knowledge interprets deterministic statement evidence but cannot mutate canonical amounts, fee membership, or arithmetic.",
      "No numeric market benchmark, reasonableness range, or savings estimate is admitted in Batch 1.",
      "Economic beneficiary and ultimate retention remain unresolved unless independent evidence directly decomposes them.",
      "A merchant agreement is required for contracted rates, terms, compliance, rights, breach, or remedies—not for ordinary structural interpretation or a request for commercial review.",
    ],
  });
}

function resolvePricingModel(
  analysis: CanonicalStatementAnalysis,
  supplied: GovernedPricingObservationInput | null,
): GovernedPricingModelResolution {
  const activeQualificationRows = analysis.feeLedger.rows.filter((row) =>
    row.contributesToUniqueTotal && (row.selectedAmount?.amountMinor ?? 0) > 0 && isQualificationLabel(row.selectedLabel),
  );
  const rated = activeQualificationRows.map((row) => rowRate(analysis, row)).filter((value): value is string => value !== null);
  const rates = [...new Set(rated)];
  const hasMidOrNonQualified = activeQualificationRows.some((row) => isMidOrNonQualified(row.selectedLabel));
  const interchange = interchangeDisclosure(analysis);
  const assessmentSeparation = hasSeparateNetworkAssessment(analysis) ? "present" as const : "absent" as const;
  const evidenceRefs = unique([
    ...activeQualificationRows.flatMap((row) => row.contributionDecision.evidenceRefs),
    ...(supplied?.evidenceRefs ?? []),
  ]);

  if (isPriorityG8Case(analysis) && priorityCaseRecomputes(analysis)) {
    return {
      state: "confirmed",
      model: "flat_rate",
      confidence: "high",
      evidenceRefs,
      ruleRefs: ["RR-B1-00", "RR-B1-01", "RR-B1-05", "RR-B1-07-PRIORITY-G8"],
      relevantPopulation: "gross_sales_before_refunds:priority_g8_statement_case",
      observedRate: PRIORITY_G8.rate,
      interchangeDisclosure: "absent",
      assessmentSeparation,
      limitations: ["The rate, basis, and model are facts about this reviewed statement only; no Priority-wide convention is inferred."],
    };
  }

  if (interchange !== "absent" && assessmentSeparation === "present") {
    return {
      state: interchange === "complete" ? "confirmed" : "supported",
      model: "interchange_plus",
      confidence: interchange === "complete" ? "high" : "medium",
      evidenceRefs,
      ruleRefs: ["RR-B1-00", "RR-B1-01", "RR-B1-02"],
      relevantPopulation: supplied?.relevantPopulation ?? "statement_population_with_separately_itemized_interchange_and_network_costs",
      observedRate: rates.length === 1 ? rates[0]! : null,
      interchangeDisclosure: interchange,
      assessmentSeparation,
      limitations: interchange === "complete" ? [] : ["The canonical v1 statement evidence exposes itemized interchange but does not prove both volume and count completeness; the model is supported, not promoted to confirmed by Batch 1."],
    };
  }

  if (hasMidOrNonQualified && rates.length >= 2 && interchange === "absent") {
    return {
      state: "confirmed",
      model: "tiered_pricing",
      confidence: "high",
      evidenceRefs,
      ruleRefs: ["RR-B1-00", "RR-B1-01"],
      relevantPopulation: "qualification_labeled_bundled_pricing_populations",
      observedRate: null,
      interchangeDisclosure: interchange,
      assessmentSeparation,
      limitations: ["Tier rates may be absolute or incremental; each line must be recomputed before the mechanic is stated."],
    };
  }

  if (activeQualificationRows.length >= 1 && rates.length === 1 && interchange === "absent") {
    return {
      state: "confirmed",
      model: "flat_rate",
      confidence: "high",
      evidenceRefs,
      ruleRefs: ["RR-B1-00", "RR-B1-01"],
      relevantPopulation: "uniform_qualification_labeled_bundled_pricing_populations",
      observedRate: rates[0]!,
      interchangeDisclosure: interchange,
      assessmentSeparation,
      limitations: ["The qualification label does not establish markup or beneficiary; the uniform applied rate plus surrounding absence of separately itemized interchange establishes the flat bundled structure."],
    };
  }

  if (supplied && supplied.model !== "unknown") {
    return {
      state: "supported",
      model: supplied.model === "flat_discount_pricing" ? "flat_rate" : supplied.model,
      confidence: supplied.confidence === "high" ? "medium" : supplied.confidence,
      evidenceRefs: supplied.evidenceRefs,
      ruleRefs: ["RR-B1-00"],
      relevantPopulation: supplied.relevantPopulation,
      observedRate: null,
      interchangeDisclosure: interchange,
      assessmentSeparation,
      limitations: ["The supplied deterministic model is preserved as supported context, but Batch 1 did not independently reproduce all structural preconditions from canonical v1 operands."],
    };
  }

  return {
    state: "unresolved",
    model: "unknown",
    confidence: "low",
    evidenceRefs,
    ruleRefs: ["RR-B1-00", "RR-B1-01"],
    relevantPopulation: null,
    observedRate: null,
    interchangeDisclosure: interchange,
    assessmentSeparation,
    limitations: ["The current statement evidence does not establish a pricing model without relying on a label or template assumption."],
  };
}

function resolveRow(
  analysis: CanonicalStatementAnalysis,
  row: CanonicalFeeRow,
  pricingModel: GovernedPricingModelResolution,
): GovernedPricingLayerRowResolution {
  const evidenceRefs = unique(row.contributionDecision.evidenceRefs);
  const base = rowAssessmentBasis(analysis, row);
  const empty: GovernedPricingLayerRowResolution = {
    feeRowId: row.id,
    matchedRuleRefs: base.ruleRefs,
    exactFeeIdentity: null,
    broaderEconomicCategory: null,
    confidence: "UNRESOLVED",
    assessmentBasis: base,
    collector: null,
    economicBeneficiary: null,
    ruleSetter: null,
    priceSetter: null,
    merchantFacingPriceController: null,
    negotiability: null,
    tierRateMechanic: null,
    minimumDiscount: null,
    amexInterpretation: null,
    competingInterpretations: [],
    evidenceRefs,
    limitations: [],
  };

  if (isMinimumDiscount(row.selectedLabel)) {
    return {
      ...empty,
      matchedRuleRefs: unique([...empty.matchedRuleRefs, "RR-B1-04"]),
      exactFeeIdentity: "monthly_minimum_shortfall",
      broaderEconomicCategory: "merchant_facing_acquiring_side_commercial_pricing",
      confidence: "STRONG",
      collector: "processor_or_acquirer",
      ruleSetter: "acquiring_side_program",
      priceSetter: "acquiring_side_program",
      merchantFacingPriceController: "acquiring_side_program",
      minimumDiscount: {
        billedAmountIsShortfall: true,
        contractualMinimum: "merchant_document_required",
        qualifyingBasis: "merchant_document_required",
        waiverTerms: "merchant_document_required",
      },
      limitations: ["The billed amount is the period shortfall, not proof of the contractual minimum. Contract value, qualifying basis, waiver conditions, and rights require merchant documents."],
    };
  }

  if (isQualificationLabel(row.selectedLabel)) {
    const commercialLayer = pricingModel.model === "interchange_plus";
    return {
      ...empty,
      matchedRuleRefs: unique([...empty.matchedRuleRefs, "RR-B1-00", "RR-B1-01", ...(commercialLayer ? ["RR-B1-02"] : [])]),
      broaderEconomicCategory: commercialLayer
        ? "merchant_facing_acquiring_side_commercial_pricing"
        : pricingModel.model === "tiered_pricing" || pricingModel.model === "flat_rate"
          ? "bundled_merchant_facing_pricing"
          : "qualification_pricing_population",
      confidence: pricingModel.state === "confirmed" ? "STRONG" : "CATEGORY_ONLY",
      collector: "processor_or_acquirer",
      merchantFacingPriceController: pricingModel.model === "unknown" ? null : "acquiring_side_program",
      priceSetter: pricingModel.model === "unknown" ? null : "acquiring_side_program",
      negotiability: pricingModel.model === "unknown" ? null : "sometimes_negotiable",
      tierRateMechanic: isMidOrNonQualified(row.selectedLabel) ? tierRateMechanic(analysis, row) : null,
      limitations: [
        "QUAL/MQUAL/NQUAL does not by itself prove tiered pricing, processor markup, economic beneficiary, avoidable network downgrade, or merchant error.",
        commercialLayer
          ? "The acquiring-side commercial-layer classification follows the separately exposed pricing structure; ultimate retention remains unresolved."
          : "Bundled merchant-facing price is not decomposed into interchange, network cost, processor/acquirer/ISO economics, or retention.",
      ],
    };
  }

  if (isSalesDiscount(row.selectedLabel)) {
    const separatelyAccounted = pricingModel.model === "interchange_plus" && pricingModel.assessmentSeparation === "present";
    return {
      ...empty,
      matchedRuleRefs: unique([...empty.matchedRuleRefs, "RR-B1-00", "RR-B1-02"]),
      exactFeeIdentity: separatelyAccounted ? "sales_discount_acquiring_side_commercial_pricing_line" : null,
      broaderEconomicCategory: separatelyAccounted
        ? "merchant_facing_acquiring_side_commercial_pricing"
        : "bundled_merchant_facing_pricing",
      confidence: separatelyAccounted ? "STRONG" : "CATEGORY_ONLY",
      collector: "processor_or_acquirer",
      priceSetter: separatelyAccounted ? "acquiring_side_program" : null,
      merchantFacingPriceController: separatelyAccounted ? "acquiring_side_program" : null,
      negotiability: separatelyAccounted ? "sometimes_negotiable" : null,
      limitations: [
        "Sales Discount is not equated with processor profit or sole processor retention.",
        separatelyAccounted
          ? "The remaining ad-valorem line is acquiring-side commercial pricing because underlying cost layers are separately visible; beneficiary and revenue sharing remain unresolved."
          : "Interchange/network cost completeness is not established, so the discount remains bundled and its markup is not computable.",
      ],
    };
  }

  if (isAmexProgramCostCandidate(row.selectedLabel)) {
    return resolveAmexRow(analysis, row, empty);
  }

  return empty;
}

function resolveAmexRow(
  analysis: CanonicalStatementAnalysis,
  row: CanonicalFeeRow,
  empty: GovernedPricingLayerRowResolution,
): GovernedPricingLayerRowResolution {
  const label = normalized(row.selectedLabel);
  const separateProgramRows = analysis.feeLedger.rows.filter((candidate) =>
    candidate.id !== row.id && /\b(?:AXP|B2B)\b/.test(normalized(candidate.selectedLabel)) && !/\bFEE\b/.test(normalized(candidate.selectedLabel)),
  );
  const separateNetwork = analysis.feeLedger.rows.some((candidate) =>
    candidate.id !== row.id && /AMEX.*(?:ASSESSMENT|NETWORK|ACQUIRER TRANSACTION)/.test(normalized(candidate.selectedLabel)),
  );
  const separateCommercial = analysis.feeLedger.rows.some((candidate) =>
    candidate.id !== row.id && /AMEX.*SALES DISCOUNT/.test(normalized(candidate.selectedLabel)),
  );
  const rowIsInterchangeRepresentation = row.role === "interchange_detail_row" || selectedCanonicalCategory(analysis, row.id) === "interchange";

  if (separateProgramRows.length > 0 && separateNetwork && !rowIsInterchangeRepresentation) {
    return {
      ...empty,
      matchedRuleRefs: unique([...empty.matchedRuleRefs, "RR-B1-00", "RR-B1-02", "RR-B1-03"]),
      exactFeeIdentity: "amex_specific_acquiring_side_commercial_charge",
      broaderEconomicCategory: "merchant_facing_acquiring_side_commercial_pricing",
      confidence: "LIKELY",
      collector: "processor_or_acquirer",
      priceSetter: "acquiring_side_program",
      merchantFacingPriceController: "acquiring_side_program",
      negotiability: "sometimes_negotiable",
      amexInterpretation: "likely_acquiring_side_commercial_charge",
      competingInterpretations: ["amex_program_level_pass_through_not_excluded_without_dated_value_or_contract_evidence"],
      limitations: [
        "The conclusion is LIKELY, not confirmed: separately itemized Amex program and network costs leave an additional Amex-specific charge, but ultimate retention is unresolved.",
        ...(separateCommercial ? ["A separate brand-agnostic Sales Discount is also present as corroborating structure, not proof of retention."] : []),
      ],
    };
  }

  if (rowIsInterchangeRepresentation && /PROGRAM FEES?/.test(label)) {
    return {
      ...empty,
      matchedRuleRefs: unique([...empty.matchedRuleRefs, "RR-B1-00", "RR-B1-03"]),
      exactFeeIdentity: "amex_program_cost_representation",
      broaderEconomicCategory: "amex_program_or_network_cost",
      confidence: "LIKELY",
      collector: "processor_or_acquirer",
      economicBeneficiary: "card_network",
      ruleSetter: "card_network",
      priceSetter: "card_network",
      amexInterpretation: "likely_underlying_program_cost",
      competingInterpretations: ["bundled_amex_program_cost_and_commercial_uplift_not_excluded"],
      limitations: ["A near-identical label can denote an acquiring-side commercial charge on another statement; the statement-local representation controls."],
    };
  }

  return {
    ...empty,
    matchedRuleRefs: unique([...empty.matchedRuleRefs, "RR-B1-00", "RR-B1-03"]),
    broaderEconomicCategory: "amex_program_or_network_cost",
    confidence: "CATEGORY_ONLY",
    amexInterpretation: "unresolved",
    competingInterpretations: ["underlying_amex_program_or_network_cost", "acquiring_side_amex_specific_commercial_charge", "bundled_combination"],
    limitations: ["The label is not a fixed meaning; dated Amex values and surrounding itemization are insufficient to distinguish the live interpretations."],
  };
}

function rowAssessmentBasis(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow): GovernedAssessmentBasis {
  const arithmetic = arithmeticFor(analysis, row.id);
  const printedBaseMinor = arithmetic?.volumeBasis?.amountMinor ?? null;
  const evidenceRefs = arithmetic ? unique(Object.values(arithmetic.fieldEvidenceRefs).flat()) : [];
  if (!arithmetic || arithmetic.formulaBasis !== "rate_times_volume" || printedBaseMinor === null) {
    return { state: "not_applicable", value: null, printedBaseMinor, evidenceRefs, ruleRefs: [], explanation: "No reliable ad-valorem printed base is available for this fee line." };
  }
  if (isPriorityG8Case(analysis) && isQualificationLabel(row.selectedLabel) && priorityCaseRecomputes(analysis)) {
    return { state: "supported", value: "gross_sales_before_refunds", printedBaseMinor, evidenceRefs, ruleRefs: ["RR-B1-05", "RR-B1-07-PRIORITY-G8"], explanation: "The reviewed case establishes that this line belongs to the statement's gross-before-refunds flat-rate population." };
  }
  const net = analysis.financialFacts.processedSales.value?.amountMinor ?? null;
  const refunds = analysis.financialFacts.refunds.value?.amountMinor ?? null;
  if (net === null || refunds === null) {
    return { state: "unresolved", value: "printed_line_population", printedBaseMinor, evidenceRefs, ruleRefs: ["RR-B1-05"], explanation: "The printed line base is preserved, but the canonical statement does not expose both gross and refund populations needed to label it gross or net." };
  }
  const gross = net + Math.abs(refunds);
  if (refunds === 0 && printedBaseMinor === net) {
    return { state: "not_determinable", value: null, printedBaseMinor, evidenceRefs, ruleRefs: ["RR-B1-05"], explanation: "Gross and net are identical because refunds are zero; the basis is not determinable unless explicitly printed." };
  }
  if (refunds !== 0 && printedBaseMinor === gross) {
    return { state: "supported", value: "gross_sales_before_refunds", printedBaseMinor, evidenceRefs, ruleRefs: ["RR-B1-05"], explanation: "This fee line's exact printed base matches gross sales before refunds." };
  }
  if (refunds !== 0 && printedBaseMinor === net) {
    return { state: "supported", value: "net_sales_after_refunds", printedBaseMinor, evidenceRefs, ruleRefs: ["RR-B1-05"], explanation: "This fee line's exact printed base matches net sales after refunds." };
  }
  return { state: "supported", value: "printed_line_population", printedBaseMinor, evidenceRefs, ruleRefs: ["RR-B1-05"], explanation: "The statement prints a line-specific base that does not equal the statement-wide gross or net population; no wider basis is inferred." };
}

function unrecoveredRefundCost(
  analysis: CanonicalStatementAnalysis,
  row: GovernedPricingLayerRowResolution,
): GovernedUnrecoveredRefundCostResolution {
  if (row.assessmentBasis.value !== "gross_sales_before_refunds") {
    return { feeRowId: row.feeRowId, state: "not_applicable", amountMinor: null, ruleRefs: ["RR-B1-06"], evidenceRefs: row.evidenceRefs, reasonCodes: ["gross_basis_not_established"], explanation: "No unrecovered refunded-volume cost is calculated because gross-basis assessment is not established for this line." };
  }
  const refunds = analysis.financialFacts.refunds.value?.amountMinor ?? null;
  const creditOrOffsetRows = analysis.feeLedger.rows.filter((candidate) =>
    candidate.id !== row.feeRowId && /REFUND|RETURN|CREDIT|ADJUSTMENT|TRUE.?UP|RECONCIL/.test(normalized(candidate.selectedLabel)),
  );
  const reasonCodes = [
    ...(refunds === null ? ["refund_population_unavailable"] : []),
    ...(creditOrOffsetRows.length > 0 ? ["possible_credit_or_offset_present"] : ["absence_of_credit_or_offset_not_proven"]),
    "relevant_section_completeness_not_proven_for_offset_absence",
  ];
  return {
    feeRowId: row.feeRowId,
    state: "withheld",
    amountMinor: null,
    ruleRefs: ["RR-B1-06"],
    evidenceRefs: unique([...row.evidenceRefs, ...creditOrOffsetRows.flatMap((candidate) => candidate.contributionDecision.evidenceRefs)]),
    reasonCodes,
    explanation: "The line uses a gross basis, but RateReveal has not excluded fee credits, adjustments, or month-end offsets across sufficiently complete statement sections; unrecovered cost on refunded volume is withheld.",
  };
}

function interchangeDisclosure(analysis: CanonicalStatementAnalysis): GovernedPricingModelResolution["interchangeDisclosure"] {
  const rows = analysis.feeLedger.rows.filter((row) => isInterchangeRepresentation(analysis, row));
  if (rows.length === 0) return "absent";
  const totalVolume = analysis.financialFacts.processedSales.value?.amountMinor ?? null;
  const totalCount = selectedTransactionCount(analysis);
  const volumes = rows.map((row) => arithmeticFor(analysis, row.id)?.volumeBasis?.amountMinor ?? null);
  const counts = rows.map((row) => arithmeticFor(analysis, row.id)?.itemCount ?? null);
  const volumeComplete = totalVolume !== null && volumes.every((value) => value !== null) && volumes.reduce((sum, value) => sum + (value ?? 0), 0) === totalVolume;
  const countComplete = totalCount !== null && counts.every((value) => value !== null) && counts.reduce((sum, value) => sum + (value ?? 0), 0) === totalCount;
  return volumeComplete && countComplete ? "complete" : "present_not_proven_complete";
}

function isInterchangeRepresentation(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow): boolean {
  if (row.role === "interchange_detail_row") return true;
  const category = selectedCanonicalCategory(analysis, row.id);
  const label = normalized(row.selectedLabel);
  if (category !== "interchange") return false;
  if (/ASSESS|DUES|NABU|NETWORK|ACQUIRER|ACQR|LICENSE|SALES DISCOUNT|PROGRAM COST FEE/.test(label)) return false;
  return /\bINTERCHANGE\b|\b(?:MC-|VI-|DSCVR|AXP|B2B)/.test(label);
}

function hasSeparateNetworkAssessment(analysis: CanonicalStatementAnalysis): boolean {
  return analysis.feeLedger.rows.some((row) =>
    /ASSESS|DUES|NABU|NETWORK (?:FEE|ACCESS)|ACQUIRER PROCESS|ACQR PROCESS|LICENSE VOLUME/.test(normalized(row.selectedLabel)),
  );
}

function selectedCanonicalCategory(analysis: CanonicalStatementAnalysis, feeRowId: string): string | null {
  return analysis.feeOwnershipActionability.rowClassifications.find((item) => item.feeRowId === feeRowId)?.selected.category ?? null;
}

function tierRateMechanic(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow): GovernedPricingLayerRowResolution["tierRateMechanic"] {
  const arithmetic = arithmeticFor(analysis, row.id);
  const exact = assessCanonicalExactFeeRowArithmetic(arithmetic ?? null);
  if (exact.status === "reproduces") return "absolute";
  const rate = arithmetic?.printedRate?.normalizedFractionalRate ? Number(arithmetic.printedRate.normalizedFractionalRate) : null;
  const volume = arithmetic?.volumeBasis?.amountMinor ?? null;
  const amount = row.selectedAmount?.amountMinor ?? null;
  if (rate === null || volume === null || amount === null) return "unresolved";
  const qualifiedRates = analysis.feeLedger.rows
    .filter((candidate) => isQualifiedOnly(candidate.selectedLabel))
    .map((candidate) => rowRate(analysis, candidate))
    .filter((value): value is string => value !== null)
    .map(Number);
  return qualifiedRates.some((qualifiedRate) => Math.abs(Math.round(volume * (rate - qualifiedRate)) - amount) <= 1)
    ? "incremental_surcharge"
    : "unresolved";
}

function isPriorityG8Case(analysis: CanonicalStatementAnalysis): boolean {
  return analysis.identity.sourceDocumentRef === PRIORITY_G8.sourceDocumentRef &&
    analysis.identity.statementPeriod.value?.end === PRIORITY_G8.periodEnd;
}

function priorityCaseRecomputes(analysis: CanonicalStatementAnalysis): boolean {
  const rows = analysis.feeLedger.rows.filter((row) => row.contributesToUniqueTotal && (row.selectedAmount?.amountMinor ?? 0) > 0 && isQualificationLabel(row.selectedLabel));
  if (rows.length !== 6) return false;
  const rates = rows.map((row) => rowRate(analysis, row));
  const bases = rows.map((row) => arithmeticFor(analysis, row.id)?.volumeBasis?.amountMinor ?? null);
  return rates.every((rate) => rate === PRIORITY_G8.rate) &&
    bases.every((base) => base !== null) &&
    bases.reduce((sum, base) => sum + (base ?? 0), 0) === PRIORITY_G8.grossPopulationMinor;
}

function arithmeticFor(analysis: CanonicalStatementAnalysis, feeRowId: string) {
  return analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === feeRowId);
}

function rowRate(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow): string | null {
  return arithmeticFor(analysis, row.id)?.printedRate?.normalizedFractionalRate ?? null;
}

function selectedTransactionCount(analysis: CanonicalStatementAnalysis): number | null {
  return analysis.financialFacts.transactionCounts.submittedTransactions.value ??
    analysis.financialFacts.transactionCounts.settledTransactions.value ?? null;
}

function isQualificationLabel(label: string): boolean { return /(?:^|\s-\s)(?:QUAL|MQUAL|NQUAL)\s+DISC(?:\s|$)/.test(normalized(label)); }
function isQualifiedOnly(label: string): boolean { return /(?:^|\s-\s)QUAL\s+DISC(?:\s|$)/.test(normalized(label)); }
function isMidOrNonQualified(label: string): boolean { return /(?:^|\s-\s)(?:MQUAL|NQUAL)\s+DISC(?:\s|$)/.test(normalized(label)); }
function isSalesDiscount(label: string): boolean { return /\bSALES DISCOUNT\b/.test(normalized(label)); }
function isMinimumDiscount(label: string): boolean { return /\bMIN(?:IMUM)?\s+DISCOUNT(?:\s+FEE)?\b/.test(normalized(label)); }
function isAmexProgramCostCandidate(label: string): boolean { return /\bPROGRAM COST FEE\s*-?\s*AX\b|\bAMEX(?:CT\d+)?\b.*\bPROGRAM FEES?\b/.test(normalized(label)); }
function isZeroAmountRateCardRow(row: CanonicalFeeRow): boolean { return row.role === "zero_dollar_reference_row" && /(?:^|\s-\s)DISC\s+\d+\b/.test(normalized(row.selectedLabel)); }
function normalized(value: string): string { return value.toUpperCase().replace(/\s+/g, " ").trim(); }
function unique(values: string[]): string[] { return [...new Set(values)].sort(); }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

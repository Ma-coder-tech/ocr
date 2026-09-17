import type { FeeSemanticsShadowRowResult } from "./feeSemanticsShadowStatementIntegration.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";

export const GOVERNED_PER_ITEM_KNOWLEDGE_V1 =
  "governed_per_item_knowledge_batch2_2026_09_07_v1" as const;

export type GovernedPerItemRule = {
  ruleId: string;
  priority: number;
  title: string;
  scope: "processor_agnostic" | "fiserv_family_statement_analysis";
  lifecycle: "active";
  admittedClaim: string;
  prohibitedClaims: string[];
  dependencies: string[];
  confidence: "CONFIRMED" | "STRONG" | "LIKELY";
  admissionStatus: "admitted";
  evidenceClass: "G1_product_domain_adjudication";
  sourceRefs: string[];
  sourceFingerprints: string[];
  reviewedAt: "2026-09-07";
  limitations: string[];
};

export type GovernedPerItemUnit =
  | "authorization_events"
  | "network_authorization_events"
  | "clearing_or_data_records"
  | "settled_transactions"
  | "avs_requests"
  | "settlement_batches"
  | "refund_records"
  | "dispute_or_exception_events"
  | "kilobytes"
  | "dollar_units"
  | "minimum_applied_count"
  | "other_printed_units"
  | "unresolved";

export type GovernedPerItemEconomicLayer =
  | "acquiring_side_authorization_or_access"
  | "acquiring_side_gateway_commercial"
  | "network_authorization_or_access"
  | "acquiring_side_avs"
  | "network_avs"
  | "bundled_avs"
  | "network_exception_or_integrity"
  | "clearing_or_data_record"
  | "acquiring_side_batch"
  | "refund_or_return_processing"
  | "dispute_or_exception_processing"
  | "PER_ITEM_LAYER_UNRESOLVED";

export type GovernedPerItemRowResolution = {
  feeRowId: string;
  applicable: boolean;
  matchedRuleRefs: string[];
  unit: {
    state: "supported" | "unresolved" | "not_applicable";
    value: GovernedPerItemUnit | null;
    quantity: number | null;
    evidenceRefs: string[];
    explanation: string;
  };
  population: {
    state: "supported" | "diagnostic_only" | "unresolved" | "not_applicable";
    value: string | null;
    comparisonToSettledTransactions: "equal" | "greater" | "less" | "not_comparable";
    errorEstablished: false;
    declinesEstablished: false;
    evidenceRefs: string[];
    explanation: string;
  };
  exactIdentityDisposition: "preserve_qualified_semantics" | "suppress_as_unresolved";
  exactIdentityReason: string;
  economicLayer: GovernedPerItemEconomicLayer | null;
  confidence: "CONFIRMED" | "STRONG" | "LIKELY" | "CATEGORY_ONLY" | "UNRESOLVED";
  collector: "processor_or_acquirer" | null;
  economicBeneficiary: "card_network" | "acquiring_side_program" | null;
  ruleSetter: "card_network" | "acquiring_side_program" | null;
  priceSetter: "card_network" | "acquiring_side_program" | null;
  merchantFacingPriceController: "acquiring_side_program" | null;
  negotiability: "frequently_negotiable" | "sometimes_negotiable" | "rarely_negotiable" | null;
  incidenceActionability:
    | "commercial_review_allowed"
    | "behaviorally_influenceable_where_applicable"
    | "configuration_investigation_only"
    | "verification_only"
    | "not_established";
  commercialActionPermitted: boolean;
  contractRateConclusion: "merchant_document_required";
  networkPriceMatch: "matched_dated_period_geography_product" | "not_evaluated_no_admitted_value" | "not_applicable";
  causationEstablished: false;
  retentionOrProfitEstablished: false;
  competingInterpretations: string[];
  burden: {
    monthlyChargeMinor: number | null;
    shareOfProcessedSalesBasisPoints: number | null;
    oneCentUnitSensitivityMinor: number | null;
    averageTicketUsd: number | null;
    oneCentAsBasisPointsOfAverageTicket: number | null;
    approximateAnnualRunRateMinor: number | null;
    approximateAnnualRunRateText: string | null;
    shareOfAcquiringSidePerItemPricingPercent: number | null;
    limitations: string[];
  };
  renderingPermissions: {
    mode: "declarative" | "evidence_attributed" | "hedged" | "category_only" | "unresolved";
    exactIdentityAllowed: boolean;
    benchmarkLanguageAllowed: false;
    causationLanguageAllowed: false;
    retentionOrProfitLanguageAllowed: false;
    contractComplianceLanguageAllowed: false;
    negotiationRecommendationAllowed: boolean;
    prohibitedTerms: string[];
  };
  evidenceRefs: string[];
  limitations: string[];
};

export type GovernedPerItemResolution = {
  catalogVersion: typeof GOVERNED_PER_ITEM_KNOWLEDGE_V1;
  rules: GovernedPerItemRule[];
  rowsByFeeRowId: Readonly<Record<string, GovernedPerItemRowResolution>>;
  statementDiagnostics: {
    supportedPerItemRows: number;
    unresolvedUnitRows: number;
    unresolvedEconomicLayerRows: number;
    acquiringSideRows: number;
    networkRows: number;
    populationMismatchRows: number;
    populationErrorsAsserted: 0;
    declinesInferred: 0;
  };
  canonicalMutationAllowed: false;
  limitations: string[];
};

const PRODUCT_ADJUDICATION_REF = "RateReveal_Product_Batch2_Authorization_PerItem_Semantics_Adjudication_2026_09_07";
const PRODUCT_ADJUDICATION_SHA256 = "f5f4ca5b3d4e5eb1a98c7342f58accca8f17eda54755cff5ff43a834cdd3e78d";
const INDEPENDENT_REVIEW_REF = "CLAUDE_RateReveal_Batch2_Authorization_PerItem_Semantics.md";
const INDEPENDENT_REVIEW_SHA256 = "416351b83b3b45cecd07983e014fa5a5c27e73c226d84b5daa4f061979265197";

const COMMON = {
  lifecycle: "active" as const,
  admissionStatus: "admitted" as const,
  evidenceClass: "G1_product_domain_adjudication" as const,
  sourceRefs: [PRODUCT_ADJUDICATION_REF, INDEPENDENT_REVIEW_REF],
  sourceFingerprints: [PRODUCT_ADJUDICATION_SHA256, INDEPENDENT_REVIEW_SHA256],
  reviewedAt: "2026-09-07" as const,
};

const RULES: GovernedPerItemRule[] = [
  rule("RR-B2-00", 0, "Quantity and unit are determined, never assumed", "processor_agnostic",
    "A printed quantity is assigned to an authorization, network, clearing, settlement, AVS, batch, refund, dispute, kilobyte, dollar, minimum-applied, other, or unresolved unit only from affirmative statement evidence.",
    ["quantity_equals_transaction_count", "integer_quantity_is_transaction_count", "unresolved_quantity_in_per_transaction_analysis"], [],
    ["Printed count placement can recover a quantity without identifying what the quantity counts."]),
  rule("RR-B2-01", 1, "Distinct populations remain distinct", "processor_agnostic",
    "Authorization, network, clearing, settlement, AVS, refund, batch, and exception populations are separately evidenced; count ordering and mismatches are diagnostic only.",
    ["universal_population_monotonicity", "authorization_minus_settled_equals_declines", "population_mismatch_is_error"], ["RR-B2-00"],
    ["Some workflows legitimately create multiple authorization or settlement-side events per transaction."]),
  rule("RR-B2-02", 2, "Population evidence is not economic-character evidence", "processor_agnostic",
    "A count match can support a population interpretation but cannot establish network ownership, processor ownership, pass-through status, or price control.",
    ["count_match_proves_network_fee", "count_match_proves_processor_fee", "population_proves_economic_character"], ["RR-B2-00", "RR-B2-01"], []),
  rule("RR-B2-03", 3, "Per-item identity is multi-dimensional", "processor_agnostic",
    "Exact identity requires compatible label, section, brand, unit, population, product, period, geography, and scoped evidence; rate magnitude alone never establishes identity.",
    ["identity_from_rate_alone", "corpus_rate_as_network_threshold", "undated_network_value_match"], ["RR-B2-00", "RR-B2-02"],
    ["Published network values require applicable date, geography, and product/version scope."]),
  rule("RR-B2-04", 4, "WATS, ECR, and CPU access-token family", "fiserv_family_statement_analysis",
    "Repeated brand-qualified WATS/ECR/CPU-style labels can support an acquiring-side authorization/access category when statement structure supplies affirmative evidence; access tokens do not establish transport or exact architecture.",
    ["wats_transport_expansion", "ecr_transport_expansion", "cpu_transport_expansion", "eci_means_electronic_commerce_indicator", "access_token_proves_network_fee"], ["RR-B2-03"],
    ["ECI in ECI CPU-G remains unresolved without processor-specific applicable evidence."]),
  rule("RR-B2-05", 5, "CPU GTWY is a bounded acquiring-side commercial category", "fiserv_family_statement_analysis",
    "When cross-brand statement structure and admitted knowledge agree, CPU GTWY is an acquiring-side authorization/gateway commercial category with ordinary commercial-review potential; exact gateway, provider, architecture, and retention remain unresolved.",
    ["cpu_gtwy_is_network_fee", "cpu_gtwy_exact_provider", "cpu_gtwy_processor_retention", "cpu_gtwy_architecture"], ["RR-B2-04"],
    ["Contract-specific negotiability, entitlements, and remedies require merchant documents."]),
  rule("RR-B2-06", 6, "Network per-event authorization and access charges require scoped evidence", "processor_agnostic",
    "Network per-event identity and price setting require brand-qualified, dated, geography/product-applicable evidence; network price and merchant-incidence actionability remain separate.",
    ["network_identity_from_rate", "network_price_from_current_corpus", "network_fee_not_actionable", "absence_proves_not_charged"], ["RR-B2-03"],
    ["An absent explicit row may be bundled and does not prove absence of the underlying economics."]),
  rule("RR-B2-07", 7, "AVS has four governed economic states", "processor_agnostic",
    "AVS is resolved separately as acquiring-side, network-side, bundled, or unresolved; a low AVS ratio is neither an error nor proof of a downgrade cause.",
    ["avs_is_always_network", "avs_is_always_processor", "low_avs_ratio_is_error", "avs_ratio_proves_downgrade"], ["RR-B2-02", "RR-B2-03"], []),
  rule("RR-B2-08", 8, "MIN and pre-authorization quantities are not event counts by default", "fiserv_family_statement_analysis",
    "MIN quantities may represent minimum-applied counts and remain outside authorization-event analysis unless a trigger and population are affirmatively evidenced.",
    ["min_quantity_is_transaction_count", "min_exact_mastercard_trigger_without_evidence", "min_in_authorization_settlement_subtraction"], ["RR-B2-00"], []),
  rule("RR-B2-09", 9, "Network exception and integrity claims stay separated", "processor_agnostic",
    "Identity, ownership, trigger, population, and actionability for exception/integrity fees are separate; incidence may be behaviorally influenceable where applicable but is never represented as fully avoidable or merchant fault.",
    ["exception_fee_fully_reducible", "exception_fee_proves_merchant_fault", "trigger_from_near_count", "exception_incidence_fully_avoidable"], ["RR-B2-03"],
    ["Exact triggers require qualified applicable network documentation."]),
  rule("RR-B2-10", 10, "Clearing and data-record populations are distinct", "processor_agnostic",
    "Clearing, file, data-record, and kilobyte populations remain distinct from authorization and settlement transaction counts; a generic Data Usage count match cannot establish network or clearing economics.",
    ["data_usage_count_match_proves_network", "clearing_records_equal_settled_transactions", "kilobytes_are_transactions"], ["RR-B2-00", "RR-B2-02"], []),
  rule("RR-B2-11", 11, "Acquiring-side classification requires affirmative evidence", "processor_agnostic",
    "Catalog failure or unfamiliar terminology does not make a fee processor-owned; unresolved per-item economic layers use PER_ITEM_LAYER_UNRESOLVED and permit verification, not negotiation advice.",
    ["unknown_fee_defaults_to_processor", "unknown_fee_defaults_to_negotiable", "catalog_failure_proves_acquiring_side", "collection_proves_retention"], ["RR-B2-02"], []),
  rule("RR-B2-12", 12, "Batch and header fees require actual batch evidence", "fiserv_family_statement_analysis",
    "A batch/header charge is per settlement batch only when statement evidence supports that unit; funding rows, month-end summaries, and less-discount rows are not counted as batches.",
    ["funding_rows_equal_batches", "month_end_rows_equal_batches", "less_discount_rows_equal_batches", "recommend_fewer_batches_without_context"], ["RR-B2-00"],
    ["Fewer batches can worsen funding timing, controls, or operations; batching changes require operational review."]),
  rule("RR-B2-13", 13, "Per-item burden is statement-period economics", "processor_agnostic",
    "Supported per-item burden may show the period charge, volume share, average-ticket sensitivity, population diagnostics, acquiring-side share, a one-cent unit sensitivity, and an explicitly approximate current-month annual run rate without creating a target price.",
    ["annual_savings_from_one_month", "should_pay_target_without_norm", "per_item_high_without_norm", "run_rate_presented_as_forecast"], ["RR-B2-00", "RR-B2-02"],
    ["Run rate is not a forecast and assumes the statement month repeats for twelve months."]),
  rule("RR-B2-14", 14, "Network price and merchant incidence are separate", "processor_agnostic",
    "A fixed network schedule can coexist with operationally influenceable incidence; duplicate authorization, reversal, force-post, and data investigations are permitted only as supported diagnostics and not all events are avoidable.",
    ["network_price_is_merchant_negotiable", "all_network_events_avoidable", "incidence_review_proves_configuration_error"], ["RR-B2-06", "RR-B2-09"], []),
  rule("RR-B2-15", 15, "Confidence controls internal rendering permission", "processor_agnostic",
    "CONFIRMED claims may be declarative, STRONG claims must be evidence-attributed, LIKELY claims hedged, CATEGORY_ONLY claims cannot assert exact identity, and UNRESOLVED claims cannot guess.",
    ["copy_stronger_than_evidence", "benchmark_language_without_benchmark", "causal_language_without_causation", "profit_language_without_retention_evidence", "contract_language_without_contract"], ["RR-B2-03", "RR-B2-11"],
    ["These are internal semantic permissions and do not create customer-report authority."]),
];

export function governedPerItemRulesV1(): GovernedPerItemRule[] {
  return structuredClone(RULES);
}

export type GovernedPerItemRenderingAssertion = {
  assertsExactIdentity?: boolean;
  assertsMarketBenchmark?: boolean;
  assertsCausation?: boolean;
  assertsRetentionOrProfit?: boolean;
  assertsContractCompliance?: boolean;
  recommendsNegotiation?: boolean;
};

export function validateGovernedPerItemRenderingV1(
  resolution: GovernedPerItemRowResolution,
  assertion: GovernedPerItemRenderingAssertion,
): { allowed: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (assertion.assertsExactIdentity && !resolution.renderingPermissions.exactIdentityAllowed) reasonCodes.push("exact_identity_exceeds_evidence");
  if (assertion.assertsMarketBenchmark && !resolution.renderingPermissions.benchmarkLanguageAllowed) reasonCodes.push("benchmark_not_admitted");
  if (assertion.assertsCausation && !resolution.renderingPermissions.causationLanguageAllowed) reasonCodes.push("causation_not_established");
  if (assertion.assertsRetentionOrProfit && !resolution.renderingPermissions.retentionOrProfitLanguageAllowed) reasonCodes.push("retention_or_profit_not_established");
  if (assertion.assertsContractCompliance && !resolution.renderingPermissions.contractComplianceLanguageAllowed) reasonCodes.push("contract_document_required");
  if (assertion.recommendsNegotiation && !resolution.renderingPermissions.negotiationRecommendationAllowed) reasonCodes.push("economic_layer_does_not_support_negotiation");
  return { allowed: reasonCodes.length === 0, reasonCodes };
}

export function resolveGovernedPerItemKnowledgeV1(input: {
  analysis: CanonicalStatementAnalysis;
  semanticRows: FeeSemanticsShadowRowResult[];
}): GovernedPerItemResolution {
  const semanticById = new Map(input.semanticRows.map((row) => [row.feeRowId, row]));
  const patterns = statementPatterns(input.analysis);
  const provisional = input.analysis.feeLedger.rows.map((row) => resolveRow({
    analysis: input.analysis,
    row,
    semantic: semanticById.get(row.id) ?? null,
    patterns,
  }));
  const acquiringTotal = provisional
    .filter((row) => row.economicLayer?.startsWith("acquiring_side_"))
    .reduce((sum, row) => sum + (row.burden.monthlyChargeMinor ?? 0), 0);
  const rows = provisional.map((row) => ({
    ...row,
    burden: {
      ...row.burden,
      shareOfAcquiringSidePerItemPricingPercent: row.economicLayer?.startsWith("acquiring_side_") && acquiringTotal > 0 && row.burden.monthlyChargeMinor !== null
        ? round(row.burden.monthlyChargeMinor / acquiringTotal * 100, 2)
        : null,
    },
  }));
  return deepFreeze({
    catalogVersion: GOVERNED_PER_ITEM_KNOWLEDGE_V1,
    rules: governedPerItemRulesV1(),
    rowsByFeeRowId: Object.fromEntries(rows.map((row) => [row.feeRowId, row])),
    statementDiagnostics: {
      supportedPerItemRows: rows.filter((row) => row.applicable && row.unit.state === "supported").length,
      unresolvedUnitRows: rows.filter((row) => row.applicable && row.unit.state === "unresolved").length,
      unresolvedEconomicLayerRows: rows.filter((row) => row.applicable && row.economicLayer === "PER_ITEM_LAYER_UNRESOLVED").length,
      acquiringSideRows: rows.filter((row) => row.economicLayer?.startsWith("acquiring_side_")).length,
      networkRows: rows.filter((row) => row.economicLayer?.startsWith("network_")).length,
      populationMismatchRows: rows.filter((row) => row.population.comparisonToSettledTransactions === "greater" || row.population.comparisonToSettledTransactions === "less").length,
      populationErrorsAsserted: 0,
      declinesInferred: 0,
    },
    canonicalMutationAllowed: false,
    limitations: [
      "This governed interpretation layer cannot mutate printed facts, canonical fee membership, amounts, or arithmetic.",
      "Population comparisons are diagnostic observations, not a universal ordering law, error finding, or decline calculation.",
      "No new network value, market range, target price, retention claim, or merchant-specific contract conclusion is admitted by Batch 2.",
      "Fiserv-specific label structure is isolated in scoped rules; the unit, participant, confidence, and rendering models remain processor-independent.",
    ],
  });
}

function resolveRow(input: {
  analysis: CanonicalStatementAnalysis;
  row: CanonicalFeeRow;
  semantic: FeeSemanticsShadowRowResult | null;
  patterns: ReturnType<typeof statementPatterns>;
}): GovernedPerItemRowResolution {
  const text = normalize(input.row.selectedLabel);
  const arithmetic = input.analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === input.row.id) ?? null;
  const printedQuantity = arithmetic?.sourceUnitBasis !== null && arithmetic?.sourceUnitBasis !== undefined
    ? finiteNumber(arithmetic.sourceUnitBasis)
    : arithmetic?.itemCount ?? null;
  const looksPerItem = Boolean(
    arithmetic && (arithmetic.formulaBasis === "per_item" || arithmetic.formulaBasis === "source_units_times_per_unit") ||
    /\b(?:AUTH|AUTHORIZATION|WATS|ECR|CPU|GTWY|GATEWAY|AVS|ADDRESS VER|NABU|APF|ACCESS FEE|BASE ?II|DATA USAGE|KILOBYTE|BATCH|HEADER|MIN\b|CHARGEBACK|DISPUTE|RETRIEVAL|REFUND|RETURN|INTEGRITY|MISUSE|ZERO FLOOR|UNMATCHED)/.test(text)
  );
  if (!looksPerItem) return notApplicable(input.row.id);

  const unit = resolveUnit(text, arithmetic?.sourceUnit ?? null, printedQuantity);
  const layer = resolveEconomicLayer(text, input.semantic, input.patterns);
  const network = layer === "network_authorization_or_access" || layer === "network_avs" || layer === "network_exception_or_integrity" || (layer === "clearing_or_data_record" && qualifiedNetworkMeaning(input.semantic));
  const acquiring = layer === "acquiring_side_authorization_or_access" || layer === "acquiring_side_gateway_commercial" || layer === "acquiring_side_avs" || layer === "acquiring_side_batch";
  const exactIdentityDisposition = shouldSuppressExactIdentity(text, input.semantic, layer) ? "suppress_as_unresolved" : "preserve_qualified_semantics";
  const identityReason = exactIdentityDisposition === "suppress_as_unresolved"
    ? "Batch 2 evidence supports at most a broader category; the existing exact candidate is too broad, structurally contradicted, or depends on an unresolved access token."
    : "Any exact identity remains subject to the qualified semantic catalog's scope, period, geography, and evidence gates.";
  const settled = input.analysis.financialFacts.transactionCounts.settledTransactions.value;
  const comparison = unit.state === "supported" && printedQuantity !== null && settled !== null && comparableToSettled(unit.value)
    ? printedQuantity === settled ? "equal" : printedQuantity > settled ? "greater" : "less"
    : "not_comparable";
  const refs = unique([
    ...(arithmetic ? Object.values(arithmetic.fieldEvidenceRefs).flat() : []),
    ...(input.semantic?.feeRowEvidenceRefs ?? []),
  ]);
  const populationState = unit.state === "supported"
    ? comparison === "not_comparable" ? "supported" : "diagnostic_only"
    : "unresolved";
  const layerConfidence = layer === "PER_ITEM_LAYER_UNRESOLVED" ? "UNRESOLVED" : exactIdentityDisposition === "suppress_as_unresolved" ? "CATEGORY_ONLY" : network ? "STRONG" : "LIKELY";
  const monthly = input.row.selectedAmount?.amountMinor ?? null;
  const sales = input.analysis.financialFacts.processedSales.value?.amountMinor ?? null;
  const annual = monthly === null ? null : monthly * 12;
  const commercialActionPermitted = acquiring;
  const incidenceActionability = acquiring
    ? layer === "acquiring_side_batch" ? "configuration_investigation_only" : "commercial_review_allowed"
    : network
      ? "behaviorally_influenceable_where_applicable"
      : layer === "PER_ITEM_LAYER_UNRESOLVED" ? "verification_only" : "not_established";
  const negotiationRecommendationAllowed = commercialActionPermitted;
  return {
    feeRowId: input.row.id,
    applicable: true,
    matchedRuleRefs: matchedRules(text, layer, unit.value),
    unit: { ...unit, evidenceRefs: refs },
    population: {
      state: populationState,
      value: unit.state === "supported" ? populationFor(unit.value) : null,
      comparisonToSettledTransactions: comparison,
      errorEstablished: false,
      declinesEstablished: false,
      evidenceRefs: refs,
      explanation: comparison === "not_comparable"
        ? "The supported unit is retained as its own population and is not forced into a settlement-count comparison."
        : `The printed quantity is ${comparison} to the settled-transaction count; this is diagnostic only and establishes neither an error nor declines.`,
    },
    exactIdentityDisposition,
    exactIdentityReason: identityReason,
    economicLayer: layer,
    confidence: layerConfidence,
    collector: input.analysis.identity.processorFamily.evidenceRefs.length > 0 ? "processor_or_acquirer" : null,
    economicBeneficiary: network ? "card_network" : null,
    ruleSetter: network ? "card_network" : acquiring ? "acquiring_side_program" : null,
    priceSetter: network ? "card_network" : acquiring ? "acquiring_side_program" : null,
    merchantFacingPriceController: acquiring ? "acquiring_side_program" : null,
    negotiability: acquiring ? "sometimes_negotiable" : network ? "rarely_negotiable" : null,
    incidenceActionability,
    commercialActionPermitted,
    contractRateConclusion: "merchant_document_required",
    networkPriceMatch: network ? "not_evaluated_no_admitted_value" : "not_applicable",
    causationEstablished: false,
    retentionOrProfitEstablished: false,
    competingInterpretations: competing(text, layer, exactIdentityDisposition),
    burden: {
      monthlyChargeMinor: monthly,
      shareOfProcessedSalesBasisPoints: monthly !== null && sales !== null && sales > 0 ? round(monthly / sales * 10_000, 2) : null,
      oneCentUnitSensitivityMinor: unit.state === "supported" && printedQuantity !== null ? Math.round(printedQuantity) : null,
      averageTicketUsd: input.analysis.financialFacts.averageTicket.value ? input.analysis.financialFacts.averageTicket.value.amountMinor / 100 : null,
      oneCentAsBasisPointsOfAverageTicket: input.analysis.financialFacts.averageTicket.value?.amountMinor
        ? round(1 / input.analysis.financialFacts.averageTicket.value.amountMinor * 10_000, 2)
        : null,
      approximateAnnualRunRateMinor: annual,
      approximateAnnualRunRateText: annual === null ? null : `Approximately $${(annual / 100).toFixed(2)} per year at this month's run rate.`,
      shareOfAcquiringSidePerItemPricingPercent: null,
      limitations: [
        "The one-cent sensitivity changes only the unit price and is not a recommended target.",
        "The annual run rate is not a forecast; it assumes this statement month repeats for twelve months.",
      ],
    },
    renderingPermissions: {
      mode: renderingMode(layerConfidence),
      exactIdentityAllowed: exactIdentityDisposition === "preserve_qualified_semantics" && input.semantic?.status === "resolved_exact_trusted",
      benchmarkLanguageAllowed: false,
      causationLanguageAllowed: false,
      retentionOrProfitLanguageAllowed: false,
      contractComplianceLanguageAllowed: false,
      negotiationRecommendationAllowed,
      prohibitedTerms: ["processor profit", "processor keeps", "merchant fault", "fully avoidable", "should pay", "overpriced", "fair price"],
    },
    evidenceRefs: refs,
    limitations: [
      "The collector is not presumed to be the economic beneficiary.",
      "A broader acquiring-side category does not establish the exact provider, system architecture, or ultimate retention.",
      "Merchant-specific rate compliance, entitlement, breach, and remedy remain contract-dependent.",
    ],
  };
}

function resolveUnit(text: string, sourceUnit: string | null, quantity: number | null): GovernedPerItemRowResolution["unit"] {
  const evidenceRefs: string[] = [];
  if (/\bMIN\b/.test(text)) return unit("minimum_applied_count", quantity, "MIN is treated as a minimum-applied quantity unless a separately evidenced trigger establishes an event population.", evidenceRefs);
  if (/KILOBYTE|\bKB\b/.test(text) || sourceUnit === "kilobytes") return unit("kilobytes", quantity, "The printed label or canonical source unit identifies kilobytes, not transactions.", evidenceRefs);
  if (/\bBATCH|HEADER/.test(text) || sourceUnit === "batches") return { state: "unresolved", value: "unresolved", quantity, evidenceRefs, explanation: "The row is batch/header-like, but its printed quantity is not admitted as a settlement-batch population until it is checked against the actual batch table; funding, month-end, and less-discount rows are not substitutes." };
  if (/AVS|ADDRESS VER/.test(text) || sourceUnit === "verification_events") return unit("avs_requests", quantity, "The printed label supports an address-verification request population.", evidenceRefs);
  if (/REFUND|RETURN|CREDIT VOUCHER|CR VOUCHER/.test(text)) return unit("refund_records", quantity, "The printed label supports a refund/return record population.", evidenceRefs);
  if (/CHARGEBACK|CHARGE BACK|DISPUTE|RETRIEVAL|INTEGRITY|MISUSE|ZERO FLOOR|UNMATCHED/.test(text) || sourceUnit === "rejection_events") return unit("dispute_or_exception_events", quantity, "The printed label supports a dispute/exception population without asserting merchant fault or a precise trigger.", evidenceRefs);
  if (/BASE ?II|DATA USAGE|CLEARING|SYSTEM FILE|DATA RECORD/.test(text)) return unit("clearing_or_data_records", quantity, "The label supports a clearing/data-record family; count matching alone does not establish economic ownership.", evidenceRefs);
  if (/NETWORK AUTH|NABU|APF|ACCESS FEE/.test(text)) return unit("network_authorization_events", quantity, "The brand-qualified label supports a network authorization/access event population subject to scoped semantic evidence.", evidenceRefs);
  if (/AUTH|AUTHORIZATION|WATS|ECR|CPU|GTWY|GATEWAY/.test(text) || sourceUnit === "authorization_events") return unit("authorization_events", quantity, "The label/source unit supports an authorization/access event population without equating it to settled transactions.", evidenceRefs);
  if (quantity !== null) return { state: "unresolved", value: "unresolved", quantity, evidenceRefs, explanation: "A printed quantity exists, but affirmative evidence does not establish what it counts; it is excluded from per-transaction comparison." };
  return { state: "unresolved", value: "unresolved", quantity: null, evidenceRefs, explanation: "The statement does not expose a reliable quantity and unit for this charge." };
}

function resolveEconomicLayer(
  text: string,
  semantic: FeeSemanticsShadowRowResult | null,
  patterns: ReturnType<typeof statementPatterns>,
): GovernedPerItemEconomicLayer {
  if (/CHARGEBACK|CHARGE BACK|DISPUTE|RETRIEVAL/.test(text)) return "dispute_or_exception_processing";
  if (/REFUND|RETURN|CREDIT VOUCHER|CR VOUCHER/.test(text)) return "refund_or_return_processing";
  if (/INTEGRITY|MISUSE|ZERO FLOOR|UNMATCHED/.test(text)) return qualifiedNetworkMeaning(semantic) ? "network_exception_or_integrity" : "PER_ITEM_LAYER_UNRESOLVED";
  if (/\bBATCH|HEADER/.test(text)) return "acquiring_side_batch";
  if (/AVS|ADDRESS VER/.test(text)) {
    if (/WATS|ECR|CPU|GTWY|GATEWAY/.test(text) || patterns.crossBrandAvsAccess) return "acquiring_side_avs";
    if (qualifiedNetworkMeaning(semantic)) return "network_avs";
    return "PER_ITEM_LAYER_UNRESOLVED";
  }
  if (/BASE ?II|DATA USAGE|CLEARING|SYSTEM FILE|DATA RECORD|KILOBYTE/.test(text)) return "clearing_or_data_record";
  if (/CPU[- ]?G|CPU GTWY|CPU GATEWAY/.test(text)) return patterns.cpuGatewayAffirmative ? "acquiring_side_gateway_commercial" : "PER_ITEM_LAYER_UNRESOLVED";
  if (/NETWORK AUTH|NABU|APF|ACCESS FEE/.test(text) && qualifiedNetworkMeaning(semantic)) return "network_authorization_or_access";
  if (/WATS|\bECR\b|AUTH FEE|AUTHORIZATION FEE/.test(text)) {
    if (patterns.acquiringAuthorizationAffirmative && !/NETWORK AUTH/.test(text)) return "acquiring_side_authorization_or_access";
    if (qualifiedNetworkMeaning(semantic)) return "network_authorization_or_access";
  }
  return "PER_ITEM_LAYER_UNRESOLVED";
}

function statementPatterns(analysis: CanonicalStatementAnalysis) {
  const labels = analysis.feeLedger.rows.map((row) => normalize(row.selectedLabel));
  const cpuBrands = new Set(labels.filter((label) => /CPU[- ]?G|CPU GTWY|CPU GATEWAY/.test(label)).map(printedBrand).filter(Boolean));
  const authBrands = new Set(labels.filter((label) => /WATS|\bECR\b|(?:^| )AUTH FEE/.test(label) && !/NETWORK AUTH/.test(label)).map(printedBrand).filter(Boolean));
  const avsAccessBrands = new Set(labels.filter((label) => /AVS|ADDRESS VER/.test(label) && /WATS|ECR|CPU|GTWY/.test(label)).map(printedBrand).filter(Boolean));
  const explicitNetworkAuth = labels.some((label) => /NETWORK AUTH|NABU|APF|ACCESS FEE/.test(label));
  const cpuGatewayAffirmative = cpuBrands.size >= 2 || (cpuBrands.size >= 1 && explicitNetworkAuth);
  const acquiringAuthorizationAffirmative = authBrands.size >= 2 || (authBrands.size >= 1 && explicitNetworkAuth);
  return { cpuGatewayAffirmative, acquiringAuthorizationAffirmative, crossBrandAvsAccess: avsAccessBrands.size >= 2 };
}

function shouldSuppressExactIdentity(text: string, semantic: FeeSemanticsShadowRowResult | null, layer: GovernedPerItemEconomicLayer): boolean {
  if (/\bECI\b/.test(text)) return true;
  if (layer === "acquiring_side_gateway_commercial") return true;
  if ((layer === "acquiring_side_authorization_or_access" || layer === "acquiring_side_avs") && semantic?.semanticAxes?.ownership.value?.includes("network")) return true;
  if (layer === "PER_ITEM_LAYER_UNRESOLVED") return true;
  return false;
}

function qualifiedNetworkMeaning(semantic: FeeSemanticsShadowRowResult | null): boolean {
  return Boolean(semantic?.status === "resolved_exact_trusted" && semantic.semanticAxes?.ownership.status === "resolved" && semantic.semanticAxes.ownership.value?.includes("network"));
}

function matchedRules(text: string, layer: GovernedPerItemEconomicLayer, unitValue: GovernedPerItemUnit | null): string[] {
  const refs = ["RR-B2-00", "RR-B2-01", "RR-B2-02", "RR-B2-03", "RR-B2-11", "RR-B2-13", "RR-B2-15"];
  if (/WATS|ECR|CPU|GTWY/.test(text)) refs.push("RR-B2-04");
  if (layer === "acquiring_side_gateway_commercial") refs.push("RR-B2-05");
  if (layer === "network_authorization_or_access") refs.push("RR-B2-06", "RR-B2-14");
  if (/AVS|ADDRESS VER/.test(text)) refs.push("RR-B2-07");
  if (unitValue === "minimum_applied_count") refs.push("RR-B2-08");
  if (layer === "network_exception_or_integrity") refs.push("RR-B2-09", "RR-B2-14");
  if (unitValue === "clearing_or_data_records" || unitValue === "kilobytes") refs.push("RR-B2-10");
  if (unitValue === "settlement_batches" || /\bBATCH|HEADER/.test(text)) refs.push("RR-B2-12");
  return unique(refs);
}

function competing(text: string, layer: GovernedPerItemEconomicLayer, disposition: GovernedPerItemRowResolution["exactIdentityDisposition"]): string[] {
  const values: string[] = [];
  if (/\bECI\b/.test(text)) values.push("ECI is an unresolved processor-specific access token; Electronic Commerce Indicator is not admitted for this statement usage.");
  if (layer === "acquiring_side_gateway_commercial") values.push("The broader acquiring-side authorization/gateway category is supported, while the exact gateway, provider, and architecture remain unresolved.");
  if (layer === "PER_ITEM_LAYER_UNRESOLVED") values.push("The charge may belong to an acquiring, network, gateway, or other service layer; present evidence does not select among them.");
  if (disposition === "suppress_as_unresolved" && values.length === 0) values.push("Existing exact semantics are withheld because Batch 2 statement structure supports only a broader category.");
  return values;
}

function unit(value: GovernedPerItemUnit, quantity: number | null, explanation: string, evidenceRefs: string[]): GovernedPerItemRowResolution["unit"] {
  return { state: "supported", value, quantity, evidenceRefs, explanation: quantity === null ? `${explanation} The unit is supported, while the statement quantity is unavailable.` : explanation };
}

function populationFor(unitValue: GovernedPerItemUnit | null): string | null {
  const map: Record<GovernedPerItemUnit, string> = {
    authorization_events: "printed_authorization_or_access_events",
    network_authorization_events: "printed_network_authorization_or_access_events",
    clearing_or_data_records: "printed_clearing_or_data_records",
    settled_transactions: "settled_transactions",
    avs_requests: "printed_avs_requests",
    settlement_batches: "printed_settlement_batches",
    refund_records: "printed_refund_or_return_records",
    dispute_or_exception_events: "printed_dispute_or_exception_events",
    kilobytes: "printed_kilobytes",
    dollar_units: "printed_dollar_units",
    minimum_applied_count: "printed_minimum_applied_count",
    other_printed_units: "other_printed_units",
    unresolved: "unresolved",
  };
  return unitValue ? map[unitValue] : null;
}

function comparableToSettled(unitValue: GovernedPerItemUnit | null): boolean {
  return unitValue === "authorization_events" || unitValue === "network_authorization_events" || unitValue === "clearing_or_data_records";
}

function renderingMode(confidence: GovernedPerItemRowResolution["confidence"]): GovernedPerItemRowResolution["renderingPermissions"]["mode"] {
  if (confidence === "CONFIRMED") return "declarative";
  if (confidence === "STRONG") return "evidence_attributed";
  if (confidence === "LIKELY") return "hedged";
  if (confidence === "CATEGORY_ONLY") return "category_only";
  return "unresolved";
}

function printedBrand(text: string): string | null {
  if (/AMERICAN EXPRESS|\bAMEX\b/.test(text)) return "amex";
  if (/MASTERCARD|MASTER CARD/.test(text)) return "mastercard";
  if (/DISCOVER|DISC \//.test(text)) return "discover";
  if (/\bVISA\b/.test(text)) return "visa";
  return null;
}

function notApplicable(feeRowId: string): GovernedPerItemRowResolution {
  return {
    feeRowId,
    applicable: false,
    matchedRuleRefs: [],
    unit: { state: "not_applicable", value: null, quantity: null, evidenceRefs: [], explanation: "This row is not a supported per-item candidate." },
    population: { state: "not_applicable", value: null, comparisonToSettledTransactions: "not_comparable", errorEstablished: false, declinesEstablished: false, evidenceRefs: [], explanation: "No per-item population analysis applies." },
    exactIdentityDisposition: "preserve_qualified_semantics",
    exactIdentityReason: "Batch 2 does not alter non-per-item semantic resolution.",
    economicLayer: null,
    confidence: "UNRESOLVED",
    collector: null,
    economicBeneficiary: null,
    ruleSetter: null,
    priceSetter: null,
    merchantFacingPriceController: null,
    negotiability: null,
    incidenceActionability: "not_established",
    commercialActionPermitted: false,
    contractRateConclusion: "merchant_document_required",
    networkPriceMatch: "not_applicable",
    causationEstablished: false,
    retentionOrProfitEstablished: false,
    competingInterpretations: [],
    burden: { monthlyChargeMinor: null, shareOfProcessedSalesBasisPoints: null, oneCentUnitSensitivityMinor: null, averageTicketUsd: null, oneCentAsBasisPointsOfAverageTicket: null, approximateAnnualRunRateMinor: null, approximateAnnualRunRateText: null, shareOfAcquiringSidePerItemPricingPercent: null, limitations: [] },
    renderingPermissions: { mode: "unresolved", exactIdentityAllowed: false, benchmarkLanguageAllowed: false, causationLanguageAllowed: false, retentionOrProfitLanguageAllowed: false, contractComplianceLanguageAllowed: false, negotiationRecommendationAllowed: false, prohibitedTerms: [] },
    evidenceRefs: [],
    limitations: [],
  };
}

function rule(
  ruleId: string,
  priority: number,
  title: string,
  scope: GovernedPerItemRule["scope"],
  admittedClaim: string,
  prohibitedClaims: string[],
  dependencies: string[],
  limitations: string[],
): GovernedPerItemRule {
  return { ...COMMON, ruleId, priority, title, scope, admittedClaim, prohibitedClaims, dependencies, confidence: "STRONG", limitations };
}

function finiteNumber(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalize(value: string): string { return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(); }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
function round(value: number, digits: number): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

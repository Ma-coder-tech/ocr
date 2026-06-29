// @ts-nocheck
// Runtime schema for parser output fixtures. Zod's deep inferred types can make
// the current TypeScript build stall, so this file intentionally relies on
// runtime validation and exports a lightweight output type below.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { z } = require("zod/v3");

const finiteNumber = z.number().finite();

export const parserConfidenceSchema = z.enum(["high", "medium", "low", "needs_review"]);
export const parserDecisionStatusSchema = z.enum(["accepted", "accepted_with_warnings", "needs_review", "unsupported", "failed"]);
export const reconciliationStatusSchema = z.enum(["pass", "warning", "fail", "not_applicable"]);
export const reconStatusSchema = z.enum([
  "RECON_OK",
  "RECON_ROUNDING",
  "RECON_MINOR_BREAK",
  "RECON_MATERIAL_BREAK",
  "RECON_UNREFERENCED_VALUE",
  "RECON_MISSING_INPUT",
]);
export const warningSeveritySchema = z.enum(["low", "medium", "high"]);

export const statementIdentitySchema = z
  .object({
    processorFamily: z.string().min(1),
    visibleBrand: z.string().min(1),
    statementFamily: z.string().min(1),
    merchantName: z.string().min(1),
    merchantNumber: z.string().min(1).nullable(),
    statementPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statementPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceFileName: z.string().min(1),
    pageCount: z.number().int().positive(),
  })
  .strict();

export const supportingTransactionCountSchema = z
  .object({
    role: z.string().min(1),
    value: z.number().int().nonnegative(),
    reason: z.string().min(1),
  })
  .strict();

export const selectedFinancialsSchema = z
  .object({
    totalVolume: finiteNumber.nonnegative(),
    totalFees: finiteNumber.nonnegative(),
    effectiveRate: finiteNumber.nonnegative(),
    amountFunded: finiteNumber,
    grossSales: finiteNumber.nonnegative().nullable(),
    refunds: finiteNumber.nonnegative().nullable(),
    adjustmentsChargebacks: finiteNumber.nullable(),
    thirdPartyTransactions: finiteNumber.nonnegative().nullable(),
    transactionCount: z
      .object({
        primaryTransactionCount: z.number().int().nonnegative().nullable(),
        supportingTransactionCounts: z.array(supportingTransactionCountSchema),
      })
      .strict(),
  })
  .strict();

export const feeBucketSchema = z
  .object({
    key: z.enum([
      "cardBrandOrPassThrough",
      "serviceCharges",
      "processorOrAccountFees",
      "miscellaneousFees",
      "equipmentFees",
      "unknownOrUnclassified",
    ]),
    label: z.string().min(1),
    amount: finiteNumber.nonnegative(),
    sourceSection: z.string().min(1),
    evidenceLine: z.string().min(1),
    confidence: parserConfidenceSchema,
  })
  .strict();

export const feeBreakdownSchema = z
  .object({
    layout: z.string().min(1),
    buckets: z.array(feeBucketSchema),
    total: finiteNumber.nonnegative(),
    evidenceLine: z.string().min(1),
  })
  .strict();

export const feeLedgerStatusSchema = z.enum(["not_mapped", "reconciled", "reconciled_with_rounding_delta", "unreconciled"]);
export const feeLedgerBucketSchema = z.enum(["cardFees", "miscellaneousFees", "unknown"]);
export const feeEconomicBucketSchema = z.enum([
  "card_brand_pass_through",
  "processor_controlled_tiered_fee",
  "processor_controlled_flat_discount_fee",
  "processor_transaction_or_auth",
  "miscellaneous_or_statement_fee",
  "unknown_needs_review",
  "zero_amount_no_charge",
]);
export const feeAtCostStatusSchema = z.enum([
  "proven_at_cost",
  "not_at_cost",
  "not_applicable",
  "unprovable_by_model",
  "unprovable_by_line",
  "indeterminate",
]);
export const feeAtCostReasonCodeSchema = z.enum([
  "NOT_PASS_THROUGH_CATEGORY",
  "ZERO_AMOUNT_NO_CHARGE",
  "BLENDED_TIERED_BUCKET",
  "FLAT_RATE_PROGRAM",
  "PROGRAM_DOES_NOT_EXPOSE_COST",
  "LUMP_LINE_NOT_DECOMPOSABLE",
  "NO_REFERENCE_FOR_PERIOD",
  "BASE_UNKNOWN",
  "RATE_VARIABLE",
  "REFERENCE_NOT_PROOF_ELIGIBLE",
  "RATE_EXCEEDS_REFERENCE",
  "RATE_BELOW_REFERENCE",
  "RATE_MATCHES_REFERENCE",
  "DURBIN_REGULATED_DEBIT_CAP_MATCH",
  "DURBIN_REGULATED_DEBIT_CAP_NOT_EXCEEDED",
]);
export const feeCostExposureSchema = z.enum(["itemized", "blended", "flat", "mixed", "hidden", "not_applicable"]);
export const feeComparedBasisSchema = z.enum(["stated_rate", "derived_from_volume", "derived_from_count", "not_compared"]);
export const feeClassificationSummaryStatusSchema = z.enum([
  "not_mapped",
  "validated",
  "validated_with_rounding_delta",
  "validated_with_unresolved_rows",
  "unreconciled",
]);

export const feeLedgerRowClassificationSchema = z
  .object({
    economicBucket: feeEconomicBucketSchema,
    confidence: z.enum(["high", "medium", "low"]),
    rule: z.string().min(1),
    reason: z.string().min(1),
    needsUnbundling: z.boolean(),
    atCostStatus: feeAtCostStatusSchema,
    atCostReasonCode: feeAtCostReasonCodeSchema,
    passedThroughAtCostKnown: z.boolean(),
    costExposure: feeCostExposureSchema,
    comparedValue: finiteNumber.nullable(),
    comparedBasis: feeComparedBasisSchema,
    catalogFeeCode: z.string().min(1).nullable(),
    catalogRate: finiteNumber.nullable(),
    marginAmountKnown: z.boolean(),
    effectiveRatePct: finiteNumber.nonnegative().nullable(),
  })
  .strict();

export const pricingModelSchema = z
  .object({
    pricingModel: z.enum(["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"]),
    confidence: parserConfidenceSchema,
    cashDiscountStatus: z.enum(["confirmed", "not_confirmed", "not_applicable", "unknown"]),
    flatDiscountRate: finiteNumber.nonnegative().nullable(),
    evidenceType: z.enum(["fee_math_inferred", "explicit_statement_label", "merchant_confirmed", "not_detected"]),
    evidence: z.array(
      z
        .object({
          description: z.string().min(1),
          network: z.string().min(1).nullable(),
          volume: finiteNumber.nonnegative(),
          rate: finiteNumber.nonnegative(),
          statedFee: finiteNumber.nonnegative(),
          computedFee: finiteNumber.nonnegative(),
          delta: finiteNumber,
          evidenceLine: z.string().min(1),
        })
        .strict(),
    ),
    notes: z.array(z.string().min(1)),
  })
  .strict();

export const fiservFeeAnalysisV2Schema = z
  .object({
    version: z.literal("2.0"),
    normalization: z
      .object({
        rowCount: z.number().int().nonnegative(),
        exactMatchCount: z.number().int().nonnegative(),
        fuzzyMatchCount: z.number().int().nonnegative(),
        aiCandidateCount: z.number().int().nonnegative(),
        aiClassifiedCount: z.number().int().nonnegative().optional(),
        unmatchedCount: z.number().int().nonnegative(),
      })
      .strict(),
    notices: z.array(
      z
        .object({
          kind: z.enum(["fee_increase", "new_fee", "rate_increase"]),
          feeLabel: z.string().min(1).nullable(),
          oldValue: z
            .object({
              value: finiteNumber,
              valueType: z.enum(["money", "percentage", "basis_points"]),
              cadence: z.enum(["monthly", "annual", "per_item", "one_time", "unknown"]),
              source: z.enum(["explicit", "inferred"]),
            })
            .strict()
            .nullable(),
          newValue: z
            .object({
              value: finiteNumber,
              valueType: z.enum(["money", "percentage", "basis_points"]),
              cadence: z.enum(["monthly", "annual", "per_item", "one_time", "unknown"]),
              source: z.enum(["explicit", "inferred"]),
            })
            .strict()
            .nullable(),
          deltaValue: z
            .object({
              value: finiteNumber,
              valueType: z.enum(["money", "percentage", "basis_points"]),
              cadence: z.enum(["monthly", "annual", "per_item", "one_time", "unknown"]),
              source: z.enum(["explicit", "inferred"]),
            })
            .strict()
            .nullable(),
          effectiveDate: z.string().min(1).nullable(),
          disclosureStyle: z.enum(["explicit_on_statement", "online_only", "acceptance_by_use", "ambiguous"]),
          sourceSection: z.string().min(1),
          evidenceLine: z.string().min(1),
          evidenceLines: z.array(z.string().min(1)),
          rowStartIndex: z.number().int(),
          rowEndIndex: z.number().int(),
          confidence: finiteNumber.nonnegative(),
        })
        .strict(),
    ),
    pricingModel: z
      .object({
        pricingModel: z.string().min(1),
        confidence: z.enum(["high", "medium", "low"]),
        analysisStatus: z.enum(["ic_plus_ready", "universal_only_pending_model_rules", "not_enough_detail"]),
        evidence: z.array(z.string().min(1)),
      })
      .strict(),
    buckets: z.array(
      z
        .object({
          feeType: z.enum([
            "interchange",
            "card_brand_network",
            "processor_pct_markup",
            "processor_per_item",
            "processor_fixed",
            "pin_debit_network",
            "pin_debit_interchange",
            "pin_debit_network_annual",
            "compliance_penalty",
            "third_party_service",
            "suspicious_pass_through_like_fee",
            "unknown",
            "zero_amount",
          ]),
          amount: finiteNumber.nonnegative(),
          rows: z.number().int().nonnegative(),
          pctOfFees: finiteNumber.nonnegative().nullable(),
        })
        .strict(),
    ),
    rows: z.array(
      z
        .object({
          rowIndex: z.number().int().nonnegative(),
          cardTypeSection: z.string().min(1).nullable(),
          description: z.string().min(1),
          normalizedDescription: z.string(),
          canonicalName: z.string().min(1).nullable(),
          amount: finiteNumber,
          volumeBasis: finiteNumber.nonnegative().nullable(),
          count: z.number().int().nonnegative().nullable(),
          rate: finiteNumber.nonnegative().nullable(),
          feeType: z.enum([
            "interchange",
            "card_brand_network",
            "processor_pct_markup",
            "processor_per_item",
            "processor_fixed",
            "pin_debit_network",
            "pin_debit_interchange",
            "pin_debit_network_annual",
            "compliance_penalty",
            "third_party_service",
            "suspicious_pass_through_like_fee",
            "unknown",
            "zero_amount",
          ]),
          sourceFeeType: z.string().min(1).nullable(),
          sourceSection: z.string().min(1).nullable(),
          matchMethod: z.enum(["exact", "fuzzy", "ai_candidate", "ai_classified", "none"]),
          matchConfidence: z.enum(["high", "medium", "low"]),
          referenceId: z.string().min(1).nullable(),
          proofStatus: z.enum(["proven", "likely", "processor_controlled", "indeterminate", "not_enough_detail"]),
          rateComparison: z.enum(["matches_reference", "close_to_reference", "above_reference", "below_reference", "not_compared"]),
          expectedAmount: finiteNumber.nullable(),
          delta: finiteNumber.nullable(),
          deltaPct: finiteNumber.nonnegative().nullable(),
          comparedBasis: z.enum(["count", "volume", "stated_rate", "flat", "not_compared"]),
          referenceRate: finiteNumber.nonnegative().nullable(),
          tolerancePct: finiteNumber.nonnegative().nullable(),
          reason: z.string().min(1),
          evidenceLine: z.string().min(1),
        })
        .strict(),
    ),
    rateVerification: z
      .object({
        proven: z.number().int().nonnegative(),
        likely: z.number().int().nonnegative(),
        processorControlled: z.number().int().nonnegative(),
        indeterminate: z.number().int().nonnegative(),
        notEnoughDetail: z.number().int().nonnegative(),
      })
      .strict(),
    processorMarkupAnalysis: z
      .object({
        status: z.enum(["ready", "pending_pricing_model_rules", "not_applicable"]),
        processorControlledTotal: finiteNumber.nonnegative().nullable(),
        processorMarkupRate: finiteNumber.nonnegative().nullable(),
        processorPctMarkupTotal: finiteNumber.nonnegative().nullable(),
        processorPerItemTotal: finiteNumber.nonnegative().nullable(),
        processorFixedTotal: finiteNumber.nonnegative().nullable(),
        junkFeeTotal: finiteNumber.nonnegative().nullable(),
        message: z.string().min(1),
        perItemStacking: z
          .object({
            detected: z.boolean(),
            fees: z.array(z.string().min(1)),
            totalPerItem: finiteNumber.nonnegative().nullable(),
            perItemAsPctOfAverageTicket: finiteNumber.nonnegative().nullable(),
          })
          .strict(),
        hiddenPctMarkupRows: z.array(
          z
            .object({
              description: z.string().min(1),
              rate: finiteNumber.nonnegative(),
              amount: finiteNumber.nonnegative(),
              volumeBasis: finiteNumber.nonnegative().nullable(),
            })
            .strict(),
        ),
        nonAmexSalesDiscountRate: finiteNumber.nonnegative().nullable(),
        amexSalesDiscountRate: finiteNumber.nonnegative().nullable(),
      })
      .strict(),
    merchantChannelAnalysis: z
      .object({
        status: z.enum(["detected", "defaulted"]),
        merchantChannel: z.enum(["card_present", "card_not_present", "mixed"]),
        confidence: z.enum(["high", "medium", "low"]),
        signals: z.array(
          z
            .object({
              type: z.enum(["card_not_present", "card_present"]),
              description: z.string().min(1),
              evidenceLine: z.string().min(1),
              rowIndex: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        benchmarkAdjustments: z
          .object({
            effectiveRateBenchmark: z.object({ low: finiteNumber.nonnegative(), high: finiteNumber.nonnegative() }).strict().nullable(),
            interchangeRangeAdjustment: z.object({ low: finiteNumber.nonnegative(), high: finiteNumber.nonnegative() }).strict().nullable(),
            competitiveSpread: z.object({ low: finiteNumber.nonnegative(), high: finiteNumber.nonnegative() }).strict().nullable(),
            competitivePerAuth: z.object({ low: finiteNumber.nonnegative(), high: finiteNumber.nonnegative() }).strict().nullable(),
          })
          .strict(),
        notes: z.array(z.string().min(1)),
      })
      .strict(),
    tieredDowngradeAnalysis: z
      .object({
        status: z.enum(["ready", "not_applicable", "not_enough_detail"]),
        baselineRate: finiteNumber.nonnegative().nullable(),
        baselineSource: z.enum(["lowest_visible_qual", "lowest_visible_tier", "not_available"]),
        totalTieredVolume: finiteNumber.nonnegative().nullable(),
        qualifiedVolume: finiteNumber.nonnegative(),
        midQualifiedVolume: finiteNumber.nonnegative(),
        nonQualifiedVolume: finiteNumber.nonnegative(),
        qualifiedPct: finiteNumber.nonnegative().nullable(),
        midQualifiedPct: finiteNumber.nonnegative().nullable(),
        nonQualifiedPct: finiteNumber.nonnegative().nullable(),
        notBestTierPct: finiteNumber.nonnegative().nullable(),
        totalDowngradeCost: finiteNumber.nonnegative().nullable(),
        totalDowngradeCostPctOfFees: finiteNumber.nonnegative().nullable(),
        largestDowngradeImpact: z
          .object({
            cardTypeSection: z.string().min(1).nullable(),
            description: z.string().min(1),
            tier: z.enum(["qualified", "mid_qualified", "non_qualified"]),
            volume: finiteNumber.nonnegative(),
            rate: finiteNumber.nonnegative(),
            amount: finiteNumber.nonnegative(),
            downgradeCost: finiteNumber.nonnegative(),
            amountPctOfFees: finiteNumber.nonnegative().nullable(),
            downgradeCostPctOfFees: finiteNumber.nonnegative().nullable(),
            evidenceLine: z.string().min(1),
          })
          .strict()
          .nullable(),
        rows: z.array(
          z
            .object({
              cardTypeSection: z.string().min(1).nullable(),
              description: z.string().min(1),
              tier: z.enum(["qualified", "mid_qualified", "non_qualified"]),
              volume: finiteNumber.nonnegative(),
              rate: finiteNumber.nonnegative(),
              amount: finiteNumber.nonnegative(),
              baselineRate: finiteNumber.nonnegative().nullable(),
              downgradeCost: finiteNumber.nonnegative().nullable(),
              evidenceLine: z.string().min(1),
            })
            .strict(),
        ),
        flags: z.array(
          z
            .object({
              kind: z.enum(["high_non_qualified", "majority_downgraded", "minimal_downgrade"]),
              severity: z.enum(["info", "warning", "high"]),
              message: z.string().min(1),
            })
            .strict(),
        ),
        cause: z.string().min(1),
      })
      .strict(),
    authorizationAnalysis: z
      .object({
        status: z.enum(["ready", "not_applicable", "not_enough_detail"]),
        transactionCount: z.number().int().nonnegative().nullable(),
        authorizationCount: z.number().int().nonnegative().nullable(),
        authRatio: finiteNumber.nonnegative().nullable(),
        excessAuthorizationCount: z.number().int().nonnegative().nullable(),
        estimatedExcessAuthCost: finiteNumber.nonnegative().nullable(),
        primaryAuthRate: finiteNumber.nonnegative().nullable(),
        primaryAuthRows: z.array(
          z
            .object({
              description: z.string().min(1),
              cardTypeSection: z.string().min(1).nullable(),
              count: z.number().int().nonnegative(),
              rate: finiteNumber.nonnegative().nullable(),
              amount: finiteNumber.nonnegative(),
              evidenceLine: z.string().min(1),
            })
            .strict(),
        ),
        flags: z.array(
          z
            .object({
              kind: z.enum(["auths_exceed_settled_transactions", "unusually_high_auth_ratio"]),
              severity: z.enum(["warning", "high"]),
              message: z.string().min(1),
            })
            .strict(),
        ),
      })
      .strict(),
    newAccountAnalysis: z
      .object({
        status: z.enum(["confirmed", "likely", "not_detected", "not_enough_detail"]),
        currentMonthVolume: finiteNumber.nonnegative(),
        ytdGrossSales: finiteNumber.nonnegative().nullable(),
        ytdToCurrentMonthRatio: finiteNumber.nonnegative().nullable(),
        message: z.string().min(1),
        recommendation: z.string().min(1).nullable(),
      })
      .strict(),
    bundledPricingBenchmark: z
      .object({
        status: z.enum(["not_applicable", "ready", "not_enough_detail"]),
        pricingModel: z.string().min(1),
        benchmarkMode: z.enum(["fee_level_proof", "bundled_estimate"]),
        businessCategory: z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            source: z.enum(["merchant_name_inference", "default_unknown", "not_applicable"]),
            confidence: z.enum(["high", "medium", "low"]),
          })
          .strict(),
        volumeTier: z.string().min(1).nullable(),
        effectiveRate: finiteNumber.nonnegative().nullable(),
        adjustedBenchmarkRate: z
          .object({
            low: finiteNumber.nonnegative(),
            high: finiteNumber.nonnegative(),
          })
          .strict()
          .nullable(),
        estimatedPassThroughCost: z
          .object({
            low: finiteNumber.nonnegative(),
            high: finiteNumber.nonnegative(),
          })
          .strict()
          .nullable(),
        estimatedProcessorMargin: z
          .object({
            low: finiteNumber.nonnegative(),
            high: finiteNumber.nonnegative(),
          })
          .strict()
          .nullable(),
        estimatedCompetitiveCost: z
          .object({
            low: finiteNumber.nonnegative(),
            high: finiteNumber.nonnegative(),
          })
          .strict()
          .nullable(),
        estimatedMonthlySavings: z
          .object({
            low: finiteNumber.nonnegative(),
            high: finiteNumber.nonnegative(),
          })
          .strict()
          .nullable(),
        estimatedAnnualSavings: z
          .object({
            low: finiteNumber.nonnegative(),
            high: finiteNumber.nonnegative(),
          })
          .strict()
          .nullable(),
        confidence: z.enum(["medium", "low"]),
        cardMix: z.array(
          z
            .object({
              cardType: z.string().min(1),
              volume: finiteNumber.nonnegative(),
              pctOfVolume: finiteNumber.nonnegative().nullable(),
              estimatedInterchangeCost: z
                .object({
                  low: finiteNumber.nonnegative(),
                  high: finiteNumber.nonnegative(),
                })
                .strict(),
              sourceRows: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        unusedTierRows: z.number().int().nonnegative(),
        billbackRisk: z.boolean(),
        assumptions: z.array(z.string().min(1)),
        warnings: z.array(z.string().min(1)),
        sources: z.array(z.string().min(1)),
      })
      .strict(),
    interchangeReconciliation: z
      .object({
        summaryTotal: finiteNumber.nonnegative().nullable(),
        detailTableTotal: finiteNumber.nonnegative().nullable(),
        gap: finiteNumber.nullable(),
        explainedGapTotal: finiteNumber.nonnegative().nullable(),
        unexplainedGap: finiteNumber.nonnegative().nullable(),
        status: z.enum(["not_available", "matches", "explained_structural_difference", "unexplained_difference"]),
        components: z.array(
          z
            .object({
              kind: z.enum([
                "detail_table",
                "card_brand_network_inside_summary_bucket",
                "suspicious_access_inside_summary_bucket",
                "pin_debit_interchange_inside_summary_bucket",
                "unexplained",
              ]),
              amount: finiteNumber.nonnegative(),
              rows: z.number().int().nonnegative(),
              evidence: z.array(z.string().min(1)),
            })
            .strict(),
        ),
        notes: z.array(z.string().min(1)),
      })
      .strict(),
    savingsSummary: z
      .object({
        annualLow: finiteNumber.nonnegative(),
        annualHigh: finiteNumber.nonnegative(),
        opportunities: z.number().int().nonnegative(),
      })
      .strict(),
    reconciliation: z
      .object({
        basisTotal: finiteNumber.nonnegative(),
        rowTotal: finiteNumber.nonnegative(),
        residual: finiteNumber.nonnegative(),
        status: z.enum(["pass", "warning"]),
      })
      .strict(),
    findings: z.array(
      z
        .object({
          kind: z.enum([
            "rate_exceeds_reference",
            "processor_per_item_stacking",
            "junk_fee",
            "pricing_model_pending_rules",
            "normalization_ai_candidates",
            "suspicious_uniform_rate",
            "avoidable_compliance_fee",
            "third_party_service_fee",
            "hidden_percentage_markup",
            "penalty_or_configuration_fee",
            "bundled_effective_rate_above_benchmark",
            "bundled_pricing_savings_opportunity",
            "single_tier_qualified_structure",
            "card_not_present_detected",
            "tiered_downgrade_high_nqual",
            "tiered_downgrade_majority_not_qualified",
            "tiered_downgrade_cost",
            "authorization_ratio_high",
            "new_account_pricing_context",
          ]),
          severity: z.enum(["info", "warning", "high"]),
          title: z.string().min(1),
          amount: finiteNumber.nullable(),
          evidence: z.array(z.string().min(1)),
          action: z.enum([
            "none",
            "complete_pci_validation",
            "negotiate_processor_rate",
            "request_pass_through_documentation",
            "verify_third_party_service",
            "fix_terminal_or_gateway_configuration",
            "request_interchange_plus_quote",
          ]),
          monthlyCost: finiteNumber.nullable(),
          annualEstimate: finiteNumber.nullable(),
          savingsEstimate: z
            .object({
              low: finiteNumber.nonnegative(),
              high: finiteNumber.nonnegative(),
              basis: z.string().min(1),
            })
            .strict()
            .nullable(),
        })
        .strict(),
    ),
    ai: z
      .object({
        status: z.enum(["disabled", "not_needed", "applied", "no_usable_suggestions", "failed"]),
        provider: z.enum(["anthropic", "openai"]).nullable(),
        model: z.string().min(1).nullable(),
        unresolvedInputRowCount: z.number().int().nonnegative(),
        suggestionCount: z.number().int().nonnegative(),
        appliedSuggestionCount: z.number().int().nonnegative(),
        skippedSuggestionCount: z.number().int().nonnegative(),
        notes: z.array(z.string().min(1)),
      })
      .strict()
      .optional(),
  })
  .strict();

export const feeLedgerRowSchema = z
  .object({
    date: z.string().min(1).nullable(),
    type: z.string().min(1).nullable(),
    network: z.string().min(1).nullable(),
    description: z.string().min(1),
    volumeBasis: finiteNumber.nonnegative().nullable(),
    count: z.number().int().nonnegative().nullable(),
    rate: finiteNumber.nonnegative().nullable(),
    amount: finiteNumber,
    bucket: feeLedgerBucketSchema,
    sourceSection: z.string().min(1),
    evidenceLine: z.string().min(1),
    pageNumber: z.number().int().positive().nullable(),
    confidence: parserConfidenceSchema,
    classification: feeLedgerRowClassificationSchema,
  })
  .strict();

export const feeLedgerControlSchema = z
  .object({
    label: z.string().min(1),
    bucket: feeLedgerBucketSchema,
    rowSum: finiteNumber.nonnegative(),
    printedTotal: finiteNumber.nonnegative().nullable(),
    delta: finiteNumber,
    tolerance: finiteNumber.nonnegative(),
    status: feeLedgerStatusSchema,
    evidenceLine: z.string().min(1).nullable(),
  })
  .strict();

export const feeClassificationBucketTotalSchema = z
  .object({
    economicBucket: feeEconomicBucketSchema,
    amount: finiteNumber.nonnegative(),
    rowCount: z.number().int().nonnegative(),
  })
  .strict();

export const feeClassificationResidualAnalysisSchema = z
  .object({
    basis: z.enum(["printed_total", "row_sum"]),
    basisTotal: finiteNumber.nonnegative(),
    identifiedCardBrandPassThroughAmount: finiteNumber.nonnegative(),
    knownProcessorFeeAmount: finiteNumber.nonnegative(),
    unbundledProcessorControlledAmount: finiteNumber.nonnegative(),
    unresolvedAmount: finiteNumber.nonnegative(),
    zeroAmount: finiteNumber.nonnegative(),
    markupOrUnknownPoolAmount: finiteNumber,
    residualUnclassifiedAmount: finiteNumber,
    rowSumDeltaToBasis: finiteNumber,
    formula: z.string().min(1),
  })
  .strict();

export const feeClassificationSummarySchema = z
  .object({
    status: feeClassificationSummaryStatusSchema,
    rowCount: z.number().int().nonnegative(),
    classifiedRowCount: z.number().int().nonnegative(),
    unresolvedRowCount: z.number().int().nonnegative(),
    needsUnbundlingRowCount: z.number().int().nonnegative(),
    totalClassifiedAmount: finiteNumber.nonnegative(),
    printedTotal: finiteNumber.nonnegative().nullable(),
    delta: finiteNumber,
    tolerance: finiteNumber.nonnegative(),
    bucketTotals: z.array(feeClassificationBucketTotalSchema),
    residualAnalysis: feeClassificationResidualAnalysisSchema,
    notes: z.array(z.string().min(1)),
  })
  .strict();

export const feeLedgerSchema = z
  .object({
    status: feeLedgerStatusSchema,
    rows: z.array(feeLedgerRowSchema),
    controls: z.array(feeLedgerControlSchema),
    totalRowSum: finiteNumber.nonnegative(),
    printedTotal: finiteNumber.nonnegative().nullable(),
    delta: finiteNumber,
    tolerance: finiteNumber.nonnegative(),
    evidenceLine: z.string().min(1).nullable(),
    feeClassificationSummary: feeClassificationSummarySchema,
    notes: z.array(z.string().min(1)),
  })
  .strict();

export const fundingBatchLedgerStatusSchema = z.enum(["not_mapped", "reconciled", "reconciled_with_warnings", "unreconciled"]);

export const fundingBatchRowSchema = z
  .object({
    dateSubmitted: z.string().min(1),
    batchNumber: z.string().min(1).nullable(),
    amountSubmitted: finiteNumber.nonnegative(),
    thirdPartyTransactions: finiteNumber.nonnegative(),
    adjustments: finiteNumber,
    chargebacks: finiteNumber,
    feesCharged: finiteNumber,
    amountFunded: finiteNumber,
    formulaResult: finiteNumber,
    delta: finiteNumber,
    tolerance: finiteNumber.nonnegative(),
    status: reconciliationStatusSchema,
    evidenceLine: z.string().min(1),
    pageNumber: z.number().int().positive().nullable(),
    notes: z.array(z.string().min(1)),
  })
  .strict();

export const fundingBatchLedgerSchema = z
  .object({
    status: fundingBatchLedgerStatusSchema,
    formula: z.string().min(1),
    rows: z.array(fundingBatchRowSchema),
    rowCount: z.number().int().nonnegative(),
    anomalyCount: z.number().int().nonnegative(),
    submittedTotal: finiteNumber.nonnegative().nullable(),
    fundedTotal: finiteNumber.nullable(),
    feesChargedTotal: finiteNumber.nonnegative().nullable(),
    controlSubmittedTotal: finiteNumber.nonnegative().nullable(),
    controlFundedTotal: finiteNumber.nullable(),
    controlFeesChargedTotal: finiteNumber.nonnegative().nullable(),
    submittedDelta: finiteNumber.nullable(),
    fundedDelta: finiteNumber.nullable(),
    feesChargedDelta: finiteNumber.nullable(),
    evidenceLine: z.string().min(1).nullable(),
    notes: z.array(z.string().min(1)),
  })
  .strict();

export const interchangeDetailRowSchema = z
  .object({
    brandOrNetwork: z.string().min(1).nullable(),
    description: z.string().min(1),
    volume: finiteNumber.nonnegative().nullable(),
    transactionCount: z.number().int().nonnegative().nullable(),
    rate: finiteNumber.nonnegative().nullable(),
    perItem: finiteNumber.nonnegative().nullable(),
    amount: finiteNumber.nonnegative().nullable(),
    evidenceLine: z.string().min(1),
  })
  .strict();

export const interchangeDetailSchema = z
  .object({
    available: z.boolean(),
    detailTotal: finiteNumber.nonnegative().nullable(),
    detailTransactionCount: z.number().int().nonnegative().nullable(),
    detailVolume: finiteNumber.nonnegative().nullable(),
    rows: z.array(interchangeDetailRowSchema),
    rowsStatus: z.string().min(1),
    evidenceLine: z.string().min(1).nullable(),
  })
  .strict();

export const totalRoleCandidateSchema = z.enum([
  "total_volume",
  "gross_sales",
  "amount_funded",
  "total_fees",
  "interchange_detail_total",
  "fee_bucket_total",
  "reportable_sales",
  "ytd_sales",
  "conflicting_total",
]);

export const candidateTotalSchema = z
  .object({
    roleCandidate: totalRoleCandidateSchema,
    label: z.string().min(1),
    amount: finiteNumber,
    sourceSection: z.string().min(1),
    pageNumber: z.number().int().positive().nullable(),
    evidenceLine: z.string().min(1),
    selected: z.boolean(),
    selectionReason: z.string().min(1).nullable(),
    rejectionReason: z.string().min(1).nullable(),
    confidence: parserConfidenceSchema,
  })
  .strict()
  .superRefine((candidate, ctx) => {
    if (candidate.selected && !candidate.selectionReason) {
      ctx.addIssue({
        code: "custom",
        message: "Selected candidate totals must include a selectionReason.",
        path: ["selectionReason"],
      });
    }
    if (!candidate.selected && !candidate.rejectionReason) {
      ctx.addIssue({
        code: "custom",
        message: "Rejected candidate totals must include a rejectionReason.",
        path: ["rejectionReason"],
      });
    }
  });

export const excludedTotalSchema = z
  .object({
    amount: finiteNumber,
    label: z.string().min(1),
    sourceSection: z.string().min(1),
    evidenceLine: z.string().min(1),
    excludedFrom: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const reconciliationCheckSchema = z
  .object({
    status: reconciliationStatusSchema,
    expected: finiteNumber.nullable(),
    actual: finiteNumber.nullable(),
    delta: finiteNumber.nullable(),
    tolerance: finiteNumber.nonnegative().nullable(),
    explanation: z.string().min(1),
  })
  .strict();

export const reconciliationSchema = z
  .object({
    fundingFormula: reconciliationCheckSchema,
    feeBucketFormula: reconciliationCheckSchema,
    effectiveRateFormula: reconciliationCheckSchema,
    supportingVolumeAgreement: reconciliationCheckSchema,
    supportingFeeAgreement: reconciliationCheckSchema,
  })
  .strict();

export const reconciliationEvidenceSchema = z
  .object({
    section: z.string().min(1),
    pageNumber: z.number().int().positive().nullable().optional(),
    rowLabel: z.string().min(1).nullable().optional(),
    rowIndex: z.number().int().nonnegative().nullable().optional(),
    sourceText: z.string().min(1).nullable().optional(),
  })
  .strict();

export const reconciliationResultSchema = z
  .object({
    identity: z.string().min(1),
    status: reconStatusSchema,
    stated: finiteNumber.nullable(),
    computed: finiteNumber.nullable(),
    delta: finiteNumber.nullable(),
    impliedCorrect: finiteNumber.optional(),
    toleranceBand: finiteNumber.nonnegative(),
    note: z.string().min(1).optional(),
    evidence: reconciliationEvidenceSchema.optional(),
  })
  .strict();

export const confidenceSchema = z
  .object({
    overall: parserConfidenceSchema,
    totalVolume: parserConfidenceSchema,
    totalFees: parserConfidenceSchema,
    amountFunded: parserConfidenceSchema,
    feeBreakdown: parserConfidenceSchema,
    statementIdentity: parserConfidenceSchema,
  })
  .strict();

export const parserDecisionSchema = z
  .object({
    status: parserDecisionStatusSchema,
    reason: z.string().min(1),
    confidence: parserConfidenceSchema,
    reportable: z.boolean(),
    validationState: z
      .object({
        topLevelTotals: z.enum(["validated", "validated_with_rounding", "warning", "failed", "missing", "not_evaluated"]),
        feeLedger: z.enum(["validated", "validated_with_rounding", "warning", "failed", "missing", "not_evaluated"]),
        batchLedger: z.enum(["validated", "validated_with_rounding", "warning", "failed", "missing", "not_evaluated"]),
        feeClassification: z.enum(["validated", "validated_with_rounding", "warning", "failed", "missing", "not_evaluated"]),
        orphanTotals: z.enum(["none", "present", "not_evaluated"]),
        customerFacingTotalsAllowed: z.boolean(),
        feeLedgerAllowed: z.boolean(),
        batchDetailAllowed: z.boolean(),
        feeClassificationAllowed: z.boolean(),
        blockingReasons: z.array(z.string().min(1)),
        warningReasons: z.array(z.string().min(1)),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((decision, ctx) => {
    if ((decision.status === "needs_review" || decision.status === "unsupported" || decision.status === "failed") && decision.reportable) {
      ctx.addIssue({
        code: "custom",
        message: "Non-accepted parser decisions cannot be reportable.",
        path: ["reportable"],
      });
    }
  });

export const warningSchema = z
  .object({
    code: z.string().min(1),
    severity: warningSeveritySchema,
    message: z.string().min(1),
    evidenceLine: z.string().min(1).nullable(),
  })
  .strict();

export const evidenceValueSchema = z.union([z.string(), finiteNumber, z.boolean(), z.null()]);

export const evidenceSchema = z
  .object({
    field: z.string().min(1),
    sourceSection: z.string().min(1),
    pageNumber: z.number().int().positive().nullable(),
    lineIndex: z.number().int().nonnegative().nullable(),
    evidenceLine: z.string().min(1),
    value: evidenceValueSchema,
  })
  .strict();

export const fiservParserOutputSchema = z
  .object({
    statementIdentity: statementIdentitySchema,
    selectedFinancials: selectedFinancialsSchema,
    feeBreakdown: feeBreakdownSchema,
    pricingModel: pricingModelSchema,
    feeLedger: feeLedgerSchema,
    fundingBatchLedger: fundingBatchLedgerSchema,
    interchangeDetail: interchangeDetailSchema,
    candidateTotals: z.array(candidateTotalSchema),
    excludedTotals: z.array(excludedTotalSchema),
    reconciliation: reconciliationSchema,
    reconciliationResults: z.array(reconciliationResultSchema).optional(),
    decision: parserDecisionSchema,
    confidence: confidenceSchema,
    fiservFeeAnalysisV2: fiservFeeAnalysisV2Schema.optional(),
    warnings: z.array(warningSchema),
    evidence: z.array(evidenceSchema),
  })
  .strict();

export type FiservParserOutput = unknown;

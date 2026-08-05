import type {
  CanonicalCustomerActionType,
  CanonicalCustomerAxisProjection,
  CanonicalCustomerPermissionKey,
  CanonicalCustomerPrimaryState,
  CurrencyCode,
} from "./types.js";

export const CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION = "canonical_customer_report_projection_v1" as const;
export const CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS = "non_production_not_merchant_ready" as const;
export const CANONICAL_CUSTOMER_REPORT_PROTECTED_CONTRACTS = [CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION] as const;

export type CanonicalCustomerReportProjectionBuildOptions = {
  purpose: "synthetic_fixture_validation_only";
  limitationRecords?: readonly CanonicalProjectionLimitationRecord[];
};

export type CustomerProjectionAffectedSection =
  | "projection"
  | "identity"
  | "headline"
  | "core_metrics"
  | "effective_rate"
  | "benchmark"
  | "fee_inventory"
  | "opportunities"
  | "actions"
  | "explanation";

export type CanonicalProjectionLimitationCode =
  | "narrative_content_unsafe"
  | "opportunity_support_unavailable"
  | "fee_reconciliation_incomplete"
  | "fee_section_content_unsafe"
  | "benchmark_unavailable"
  | "core_facts_unsafe"
  | "identity_unsafe"
  | "core_reconciliation_missing"
  | "internal_runtime_detail";

export type CanonicalProjectionLimitationParameters = {
  unresolvedRowCount?: number;
};

export type CanonicalProjectionLimitationRecord = {
  code: CanonicalProjectionLimitationCode;
  parameters: CanonicalProjectionLimitationParameters;
  audience: "customer" | "internal";
  severity: "info" | "review" | "blocked";
  affectedSections: CustomerProjectionAffectedSection[];
  customerVisibility: "visible" | "hidden";
};

export type CustomerVisibleLimitationCode =
  | "opportunity_support_unavailable"
  | "fee_reconciliation_incomplete"
  | "fee_section_content_unsafe"
  | "benchmark_unavailable";

export type CustomerSectionLimitationCode =
  | CustomerVisibleLimitationCode
  | "rate_basis_limited"
  | "fee_requires_review"
  | "documentation_needed";

export type CustomerMoney = {
  amountMinor: number;
  currency: CurrencyCode;
};

export type CustomerPercent = {
  basisPoints: number;
  displayBasis: "calculated_effective_rate" | "processor_stated_rate";
};

export type CustomerCount = {
  value: number;
  population: "submitted_transactions" | "settled_transactions" | "authorizations" | "unknown";
};

export type CustomerEvidenceStatus = "verified" | "supported_by_synthetic_source" | "needs_verification" | "unavailable";

export type CustomerRemovabilityLevel =
  | "confirmed_opportunity"
  | "conditionally_removable"
  | "potentially_negotiable"
  | "needs_verification"
  | "not_applicable";

export type CustomerSyntheticSource = {
  synthetic: true;
  title: string;
  effectiveDate: string;
  safeUrl: string | null;
};

export type CustomerProjectionPermission = {
  permitted: boolean;
  reasonCodes: string[];
};

export type CustomerPermissionProjection = Record<CanonicalCustomerPermissionKey, CustomerProjectionPermission>;

export type CustomerSectionVisibility = {
  coreMetrics: "shown" | "hidden";
  effectiveRate: "shown" | "hidden" | "unavailable";
  benchmark: "shown" | "hidden" | "unavailable";
  feeInventory: "shown" | "limited" | "hidden";
  opportunities: "shown" | "none" | "hidden";
  verificationItems: "shown" | "none" | "hidden";
  actions: "shown" | "hidden";
  explanation: "shown" | "hidden" | "unavailable";
};

export type CustomerSafeHeadline = {
  title: string;
  body: string;
  tone: "neutral" | "positive" | "review" | "limited" | "blocked";
  reasonCodes: string[];
};

export type CustomerStatementSummary = {
  processor: string;
  statementPeriod: string;
  businessType: string;
};

export type CoreMetricsProjection =
  | {
      status: "hidden";
      reasonCode: string;
    }
  | {
      status: "shown";
      processedVolume: CustomerMoney;
      totalFees: CustomerMoney;
      transactionCount:
        | {
            status: "shown";
            count: CustomerCount;
          }
        | {
            status: "unavailable";
            reasonCode: string;
          };
      averageTicket:
        | {
            status: "shown";
            amount: CustomerMoney;
          }
        | {
            status: "unavailable";
            reasonCode: string;
          };
    };

export type EffectiveRateProjection =
  | {
      status: "hidden";
      reasonCode: string;
    }
  | {
      status: "unavailable";
      reasonCode: string;
    }
  | {
      status: "shown";
      rate: CustomerPercent;
      basisLabel: string;
      limitationCodes: CustomerSectionLimitationCode[];
    };

export type BenchmarkProjection =
  | {
      status: "hidden";
      reasonCode: string;
    }
  | {
      status: "unavailable";
      reasonCode: string;
      customerMessage: string;
    }
  | {
      status: "shown";
      position: "below_reference" | "within_reference" | "above_reference";
      rangeLabel: string;
      methodologyLabel: string;
      limitationCodes: CustomerSectionLimitationCode[];
    };

export type FeeInventoryProjection =
  | {
      status: "hidden";
      reasonCode: string;
    }
  | {
      status: "limited" | "shown";
      totalVisibleAmount: CustomerMoney | null;
      rows: CustomerFeeRowProjection[];
      omittedRowCount: number;
      limitationCodes: CustomerSectionLimitationCode[];
    };

export type CustomerFeeRowProjection = {
  displayId: string;
  label: string;
  amount: CustomerMoney | null;
  role: "charge" | "pass_through" | "credit" | "excluded" | "unresolved";
  feeOwner: "processor" | "card_network" | "issuer_or_interchange" | "third_party" | "tax_authority" | "needs_review";
  customerCategory: "processor" | "network_or_interchange" | "service" | "third_party" | "tax" | "needs_review";
  actionability: "may_be_actionable" | "verify_only" | "not_actionable" | "needs_review";
  removabilityLevel: CustomerRemovabilityLevel;
  evidenceStatus: CustomerEvidenceStatus;
  source: CustomerSyntheticSource | null;
  conditions: string[];
  status: "included" | "verification_only" | "excluded" | "unresolved";
  limitationCodes: CustomerSectionLimitationCode[];
};

export type OpportunityProjection =
  | {
      status: "hidden";
      reasonCode: string;
    }
  | {
      status: "none";
      reasonCode: string;
    }
  | {
      status: "shown";
      deterministicAmount: CustomerMoney | null;
      estimatedAmount: CustomerMoney | null;
      items: CustomerOpportunityItem[];
      limitationCodes: CustomerSectionLimitationCode[];
    };

export type CustomerOpportunityItem = {
  displayId: string;
  title: string;
  amount: CustomerMoney;
  certainty: "verified" | "estimated";
  removabilityLevel: Extract<CustomerRemovabilityLevel, "confirmed_opportunity" | "conditionally_removable" | "potentially_negotiable">;
  evidenceStatus: CustomerEvidenceStatus;
  source: CustomerSyntheticSource;
  conditions: string[];
  cadence: "annual" | "monthly" | "statement_frequency";
  supportedAction: Extract<CanonicalCustomerActionType, "request_removal" | "request_repricing">;
  reasonCodes: string[];
};

export type VerificationProjection =
  | {
      status: "hidden";
      reasonCode: string;
    }
  | {
      status: "none";
      reasonCode: string;
    }
  | {
      status: "shown";
      observedAmount: CustomerMoney;
      label: "Amount to verify";
      items: CustomerVerificationItem[];
      notSavingsCopy: string;
      limitationCodes: CustomerSectionLimitationCode[];
    };

export type CustomerVerificationItem = {
  displayId: string;
  title: string;
  observedAmount: CustomerMoney;
  evidenceStatus: CustomerEvidenceStatus;
  source: CustomerSyntheticSource | null;
  conditions: string[];
  reasonCodes: string[];
};

export type CustomerLimitationProjection = {
  code: CustomerVisibleLimitationCode;
  title: string;
  body: string;
  severity: "info" | "review";
  affectedSections: CustomerProjectionAffectedSection[];
};

export type CustomerActionProjection = {
  displayId: string;
  type: CanonicalCustomerActionType;
  label: string;
  body: string;
  targetDisplayIds: string[];
  reasonCodes: string[];
};

export type CustomerExplanationProjection = {
  status: "shown" | "hidden" | "unavailable";
  source: "ai_enhanced" | "deterministic_fallback" | "unavailable";
  sections: Array<{
    title: string;
    body: string;
  }>;
  fallbackReasonCodes: string[];
};

export type CustomerMethodologyProjection = {
  dataQuality: "verified" | "limited" | "withheld" | "unavailable";
  guidance: string[];
  docsToGather: string[];
};

export type CanonicalCustomerReportProjectionV1 = {
  reportVersion: typeof CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION;
  projectionReadiness: typeof CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS;
  source: "synthetic_fixture";
  displayId: string;
  primaryState: CanonicalCustomerPrimaryState;
  axes: CanonicalCustomerAxisProjection;
  permissions: CustomerPermissionProjection;
  visibility: CustomerSectionVisibility;
  headline: CustomerSafeHeadline;
  statementSummary: CustomerStatementSummary;
  coreMetrics: CoreMetricsProjection;
  effectiveRate: EffectiveRateProjection;
  benchmark: BenchmarkProjection;
  feeInventory: FeeInventoryProjection;
  opportunities: OpportunityProjection;
  verificationItems: VerificationProjection;
  limitations: CustomerLimitationProjection[];
  actions: CustomerActionProjection[];
  explanation: CustomerExplanationProjection;
  methodology: CustomerMethodologyProjection;
};

export type CanonicalCustomerReportProjectionValidation = {
  status: "valid" | "invalid";
  errors: string[];
};

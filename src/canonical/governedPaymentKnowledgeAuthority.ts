import { createHash } from "node:crypto";
import {
  QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1,
} from "./feeSemanticsFiservAliasPack.js";
import {
  buildFeeSemanticsShadowStatementReport,
  type FeeSemanticsShadowStatementContext,
  type FeeSemanticsShadowStatementReport,
} from "./feeSemanticsShadowStatementIntegration.js";
import type { CanonicalStatementAnalysis } from "./types.js";
import type { FeeSemanticSourceAuthority } from "./feeSemanticsEvidenceModel.js";
import {
  GOVERNED_PRICING_LAYER_KNOWLEDGE_V1,
  governedPricingLayerRulesV1,
  resolveGovernedPricingLayerKnowledgeV1,
  type GovernedPricingLayerResolution,
  type GovernedPricingObservationInput,
} from "./governedPricingLayerKnowledgeV1.js";
import {
  GOVERNED_PER_ITEM_KNOWLEDGE_V1,
  governedPerItemRulesV1,
  resolveGovernedPerItemKnowledgeV1,
  type GovernedPerItemResolution,
} from "./governedPerItemKnowledgeV1.js";
import {
  GOVERNED_DATED_NETWORK_FEE_EVIDENCE_V1,
  governedDatedNetworkRulesV1,
  governedNetworkNoticeEventsV1,
  resolveGovernedDatedNetworkFeeEvidenceV1,
  type GovernedDatedNetworkFeeEvidenceResolution,
} from "./governedDatedNetworkFeeEvidenceV1.js";
import {
  GOVERNED_US_NETWORK_FEE_EVIDENCE_2020_2026_V1,
  governedUsNetworkReferenceRecords2020_2026V1,
  governedUsNetworkRules2020_2026V1,
  governedUsNetworkSources2020_2026V1,
  resolveGovernedUsNetworkFeeEvidence2020_2026V1,
  type GovernedUsNetworkFeeEvidenceResolution,
} from "./governedUsNetworkFeeEvidence2020_2026V1.js";
import {
  GOVERNED_MASTERCARD_FOCUSED_EVIDENCE_2024_2026_V1,
  governedMastercardFocusedRecords2024_2026V1,
  governedMastercardFocusedRules2024_2026V1,
  governedMastercardFocusedSources2024_2026V1,
  resolveGovernedMastercardFocusedEvidence2024_2026V1,
  type GovernedMastercardFocusedEvidenceResolution,
} from "./governedMastercardFocusedEvidence2024_2026V1.js";
import {
  GOVERNED_CURRENT_2026_US_CORE_NETWORK_REFERENCE_V1,
  governedCurrent2026ReferenceRecordsV1,
  governedCurrent2026RulesV1,
  governedCurrent2026SourcesV1,
  resolveGovernedCurrent2026UsCoreNetworkReferenceV1,
  type GovernedCurrent2026UsCoreNetworkResolution,
} from "./governedCurrent2026UsCoreNetworkReferenceV1.js";
import {
  GOVERNED_OPEN_WORLD_DETERMINANT_V1,
  governedOpenWorldActionClassesV1,
  governedOpenWorldFeeFamiliesV1,
  governedOpenWorldRulesV1,
  resolveGovernedOpenWorldDeterminantV1,
  type GovernedOpenWorldDeterminantResolution,
} from "./governedOpenWorldDeterminantV1.js";
import {
  GOVERNED_COMMERCIAL_CLASSIFICATION_ADJUDICATION_V1,
  governedCommercialClassificationAdjudicationRulesV1,
  resolveGovernedCommercialClassificationAdjudicationV1,
  type GovernedCommercialClassificationAdjudicationResolutionV1,
} from "./governedCommercialClassificationAdjudicationV1.js";

export const GOVERNED_PAYMENT_KNOWLEDGE_AUTHORITY_VERSION =
  "governed_payment_knowledge_authority_2026_09_10_commercial_classification_adjudication_v1" as const;

export type GovernedNormUnit =
  | "usd_per_event"
  | "usd_per_month"
  | "decimal_rate"
  | "ratio";

export type GovernedIndustryNorm = {
  normId: string;
  label: string;
  economicCategory: string;
  matchConceptIds: string[];
  matchLabelPatterns: string[];
  unit: GovernedNormUnit;
  typicalLow: number | null;
  typicalHigh: number | null;
  elevatedAbove: number | null;
  market: "US";
  segment: "SMB";
  applicableVerticals: string[];
  applicableRiskClasses: Array<"standard" | "high_risk">;
  applicableChannels: Array<"card_present" | "card_not_present" | "mixed">;
  owner: string;
  version: string;
  effectiveFrom: string;
  reviewedAt: string;
  reviewDueAt: string;
  evidenceClass: "E5_professional_industry_norm";
  sourceRef: string;
  sourceFingerprint: string;
  sourceNote: string;
  limitations: string[];
  negotiabilityNorm: "frequently_negotiable" | "sometimes_negotiable" | "rarely_negotiable";
  waivabilityNorm: "frequently_waivable" | "sometimes_waivable" | "rarely_waivable";
};

export type GovernedKnowledgeResolution = {
  semantics: FeeSemanticsShadowStatementReport;
  normsByFeeRowId: Readonly<Record<string, GovernedIndustryNorm[]>>;
  semanticSourceAuthorityByEvidenceRef: Readonly<Record<string, FeeSemanticSourceAuthority>>;
  pricingLayers: GovernedPricingLayerResolution;
  perItem: GovernedPerItemResolution;
  datedNetworkFeeEvidence: GovernedDatedNetworkFeeEvidenceResolution;
  usNetworkFeeEvidence: GovernedUsNetworkFeeEvidenceResolution;
  mastercardFocusedEvidence: GovernedMastercardFocusedEvidenceResolution;
  current2026UsCoreNetworkReference: GovernedCurrent2026UsCoreNetworkResolution;
  commercialClassificationAdjudication: GovernedCommercialClassificationAdjudicationResolutionV1;
  openWorldDeterminants: GovernedOpenWorldDeterminantResolution;
  authorityVersion: typeof GOVERNED_PAYMENT_KNOWLEDGE_AUTHORITY_VERSION;
  semanticCatalogVersion: string;
  normCatalogVersion: string;
  legacyAuthorities: {
    legacyFeeCatalog: "retrieval_only_not_governing";
    feeKnowledgeResearchSystem: "research_transport_not_governing";
    newerFeeSemanticsCatalog: "governing_semantic_source";
  };
};

const PRODUCT_GUIDANCE_SHA256 =
  "74579d2165ce83d0457a975c50df7c80fa61ddfecb01a0a5e9d270704effc414";
const NORM_VERSION = "ratereveal_us_smb_professional_norms_2026_09_06_v1";
const COMMON = {
  market: "US" as const,
  segment: "SMB" as const,
  owner: "RateReveal Product payments-domain governance",
  version: NORM_VERSION,
  effectiveFrom: "2026-09-06",
  reviewedAt: "2026-09-06",
  reviewDueAt: "2027-09-06",
  evidenceClass: "E5_professional_industry_norm" as const,
  sourceRef: "CLAUDE_RateReveal_Fee_Analysis_Framework_v1.md#appendix-b",
  sourceFingerprint: PRODUCT_GUIDANCE_SHA256,
  sourceNote: "Product-approved directional U.S. SMB professional payment-processing norms; not an official network rule or fact about a merchant account.",
};

const NORMS: GovernedIndustryNorm[] = [
  {
    ...COMMON,
    normId: "norm_authorization_fee_us_smb_v1",
    label: "Authorization fee",
    economicCategory: "authorization_gateway_technology",
    matchConceptIds: ["authorization_service_fee", "electronic_payments_cpu_gateway_authorization"],
    matchLabelPatterns: ["AUTH", "CPU GTWY", "CPU-G"],
    unit: "usd_per_event",
    typicalLow: 0.03,
    typicalHigh: 0.12,
    elevatedAbove: 0.15,
    applicableVerticals: ["retail", "restaurant_food_beverage", "ecommerce", "professional_services", "other"],
    applicableRiskClasses: ["standard", "high_risk"],
    applicableChannels: ["card_present", "card_not_present", "mixed"],
    limitations: [
      "Confirm whether the billed population is authorizations or settled items.",
      "Per-event cost is disproportionately material for low-ticket merchants.",
    ],
    negotiabilityNorm: "frequently_negotiable",
    waivabilityNorm: "sometimes_waivable",
  },
  {
    ...COMMON,
    normId: "norm_chargeback_fee_us_smb_v1",
    label: "Chargeback fee",
    economicCategory: "exception_and_dispute",
    matchConceptIds: [],
    matchLabelPatterns: ["CHARGEBACK", "CHARGE BACK"],
    unit: "usd_per_event",
    typicalLow: 15,
    typicalHigh: 35,
    elevatedAbove: 40,
    applicableVerticals: ["retail", "restaurant_food_beverage", "ecommerce", "professional_services", "other"],
    applicableRiskClasses: ["standard", "high_risk"],
    applicableChannels: ["card_present", "card_not_present", "mixed"],
    limitations: ["Higher pricing can be commercially normal for high-risk or dispute-heavy accounts; leverage must be considered."],
    negotiabilityNorm: "sometimes_negotiable",
    waivabilityNorm: "rarely_waivable",
  },
  {
    ...COMMON,
    normId: "norm_pci_program_fee_us_smb_v1",
    label: "PCI program fee",
    economicCategory: "compliance_and_security",
    matchConceptIds: [],
    matchLabelPatterns: ["PCI"],
    unit: "usd_per_month",
    typicalLow: 5,
    typicalHigh: 25,
    elevatedAbove: 30,
    applicableVerticals: ["retail", "restaurant_food_beverage", "ecommerce", "professional_services", "other"],
    applicableRiskClasses: ["standard", "high_risk"],
    applicableChannels: ["card_present", "card_not_present", "mixed"],
    limitations: ["A fee label does not establish the merchant's PCI compliance state."],
    negotiabilityNorm: "frequently_negotiable",
    waivabilityNorm: "frequently_waivable",
  },
  {
    ...COMMON,
    normId: "norm_statement_access_fee_us_smb_v1",
    label: "Statement or online-access fee",
    economicCategory: "administrative_and_account",
    matchConceptIds: [],
    matchLabelPatterns: ["STATEMENT FEE", "PAPER STATEM", "ONLINE ACCESS"],
    unit: "usd_per_month",
    typicalLow: 0,
    typicalHigh: 15,
    elevatedAbove: 20,
    applicableVerticals: ["retail", "restaurant_food_beverage", "ecommerce", "professional_services", "other"],
    applicableRiskClasses: ["standard", "high_risk"],
    applicableChannels: ["card_present", "card_not_present", "mixed"],
    limitations: ["Single-period presence does not prove recurring cadence."],
    negotiabilityNorm: "frequently_negotiable",
    waivabilityNorm: "frequently_waivable",
  },
  {
    ...COMMON,
    normId: "norm_monthly_service_fee_us_smb_v1",
    label: "Monthly service or account fee",
    economicCategory: "administrative_and_account",
    matchConceptIds: [],
    matchLabelPatterns: ["MONTHLY SERVICE", "MTHLY SERVICE", "MONTHLY ACCOUNT"],
    unit: "usd_per_month",
    typicalLow: 5,
    typicalHigh: 25,
    elevatedAbove: 35,
    applicableVerticals: ["retail", "restaurant_food_beverage", "ecommerce", "professional_services", "other"],
    applicableRiskClasses: ["standard", "high_risk"],
    applicableChannels: ["card_present", "card_not_present", "mixed"],
    limitations: ["Single-period presence does not prove recurring cadence."],
    negotiabilityNorm: "frequently_negotiable",
    waivabilityNorm: "sometimes_waivable",
  },
  {
    ...COMMON,
    normId: "norm_gateway_fee_us_smb_v1",
    label: "Gateway fee",
    economicCategory: "authorization_gateway_technology",
    matchConceptIds: ["gateway_service_fee", "electronic_payments_cpu_gateway_authorization"],
    matchLabelPatterns: ["GATEWAY", "GTWY"],
    unit: "usd_per_month",
    typicalLow: 10,
    typicalHigh: 30,
    elevatedAbove: 30,
    applicableVerticals: ["retail", "restaurant_food_beverage", "ecommerce", "professional_services", "other"],
    applicableRiskClasses: ["standard", "high_risk"],
    applicableChannels: ["card_present", "card_not_present", "mixed"],
    limitations: ["Gateway services are ordinarily more expected for card-not-present commerce than for a purely card-present merchant."],
    negotiabilityNorm: "frequently_negotiable",
    waivabilityNorm: "sometimes_waivable",
  },
];

/**
 * The single read authority for Internal Analyst Finding v1. Legacy catalogs can
 * supply retrieval leads to governed research, but callers cannot query them as
 * parallel truth sources through this interface.
 */
export class GovernedPaymentKnowledgeAuthority {
  readonly authorityVersion = GOVERNED_PAYMENT_KNOWLEDGE_AUTHORITY_VERSION;
  readonly normCatalogVersion = NORM_VERSION;

  resolveStatement(input: {
    analysis: CanonicalStatementAnalysis;
    context: FeeSemanticsShadowStatementContext;
    asOf?: string;
    suppliedPricingObservation?: GovernedPricingObservationInput | null;
  }): GovernedKnowledgeResolution {
    const semantics = buildFeeSemanticsShadowStatementReport({
      analysis: input.analysis,
      catalog: QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1,
      context: input.context,
    });
    const asOf = input.asOf ?? semantics.statementPeriod?.end ?? "0001-01-01";
    const normsByFeeRowId = Object.fromEntries(semantics.rows.map((row) => [
      row.feeRowId,
      this.findNorms({ label: row.printedLabel, conceptId: row.conceptId, asOf }),
    ]));
    const semanticSourceAuthorityByEvidenceRef = Object.fromEntries(
      QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1.catalog.evidence.map((item) => [item.evidenceId, item.sourceAuthority]),
    );
    const pricingLayers = resolveGovernedPricingLayerKnowledgeV1({
      analysis: input.analysis,
      suppliedPricingObservation: input.suppliedPricingObservation,
    });
    const perItem = resolveGovernedPerItemKnowledgeV1({
      analysis: input.analysis,
      semanticRows: semantics.rows,
    });
    const datedNetworkFeeEvidence = resolveGovernedDatedNetworkFeeEvidenceV1({
      analysis: input.analysis,
      semanticRows: semantics.rows,
      perItemRowsByFeeRowId: perItem.rowsByFeeRowId,
    });
    const usNetworkFeeEvidence = resolveGovernedUsNetworkFeeEvidence2020_2026V1({
      analysis: input.analysis,
      datedNetworkEvidence: datedNetworkFeeEvidence,
    });
    const mastercardFocusedEvidence = resolveGovernedMastercardFocusedEvidence2024_2026V1({
      analysis: input.analysis,
      usNetworkFeeEvidence,
    });
    const current2026UsCoreNetworkReference = resolveGovernedCurrent2026UsCoreNetworkReferenceV1({
      analysis: input.analysis,
      usNetworkRowsByFeeRowId: Object.fromEntries(
        Object.entries(mastercardFocusedEvidence.rowsByFeeRowId).map(([feeRowId, row]) => [feeRowId, row.effectiveUsNetworkEvidence]),
      ),
      mastercardFocusedRowsByFeeRowId: mastercardFocusedEvidence.rowsByFeeRowId,
      asOf,
    });
    const commercialClassificationAdjudication = resolveGovernedCommercialClassificationAdjudicationV1({
      analysis: input.analysis,
      geography: input.context.geography.value,
    });
    const openWorldDeterminants = resolveGovernedOpenWorldDeterminantV1({
      analysis: input.analysis,
      semanticRows: semantics.rows,
      pricingLayers,
      perItem,
      datedNetworkFeeEvidence,
      usNetworkFeeEvidence: {
        ...usNetworkFeeEvidence,
        rowsByFeeRowId: Object.fromEntries(
          Object.entries(mastercardFocusedEvidence.rowsByFeeRowId).map(([feeRowId, row]) => [feeRowId, row.effectiveUsNetworkEvidence]),
        ),
      },
      current2026UsCoreNetworkReference,
      commercialClassificationAdjudication,
    });
    return deepFreeze({
      semantics,
      normsByFeeRowId,
      semanticSourceAuthorityByEvidenceRef,
      pricingLayers,
      perItem,
      datedNetworkFeeEvidence,
      usNetworkFeeEvidence,
      mastercardFocusedEvidence,
      current2026UsCoreNetworkReference,
      commercialClassificationAdjudication,
      openWorldDeterminants,
      authorityVersion: this.authorityVersion,
      semanticCatalogVersion: semantics.catalogVersion,
      normCatalogVersion: this.normCatalogVersion,
      legacyAuthorities: {
        legacyFeeCatalog: "retrieval_only_not_governing",
        feeKnowledgeResearchSystem: "research_transport_not_governing",
        newerFeeSemanticsCatalog: "governing_semantic_source",
      },
    });
  }

  findNorms(input: { label: string; conceptId: string | null; asOf: string }): GovernedIndustryNorm[] {
    return NORMS.filter((norm) => {
      if (input.asOf < norm.effectiveFrom || input.asOf > norm.reviewDueAt) return false;
      if (input.conceptId && norm.matchConceptIds.includes(input.conceptId)) return true;
      const normalized = input.label.toUpperCase();
      return norm.matchLabelPatterns.some((pattern) => normalized.includes(pattern));
    }).map((norm) => structuredClone(norm));
  }

  fingerprint(): string {
    return createHash("sha256").update(JSON.stringify({
      authorityVersion: this.authorityVersion,
      semanticCatalogVersion: QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1.catalog.catalogVersion,
      normCatalogVersion: this.normCatalogVersion,
      pricingLayerCatalogVersion: GOVERNED_PRICING_LAYER_KNOWLEDGE_V1,
      pricingLayerRules: governedPricingLayerRulesV1(),
      perItemCatalogVersion: GOVERNED_PER_ITEM_KNOWLEDGE_V1,
      perItemRules: governedPerItemRulesV1(),
      datedNetworkFeeEvidenceCatalogVersion: GOVERNED_DATED_NETWORK_FEE_EVIDENCE_V1,
      datedNetworkFeeEvidenceRules: governedDatedNetworkRulesV1(),
      datedNetworkNoticeEvents: governedNetworkNoticeEventsV1(),
      usNetworkFeeEvidenceCatalogVersion: GOVERNED_US_NETWORK_FEE_EVIDENCE_2020_2026_V1,
      usNetworkFeeEvidenceSources: governedUsNetworkSources2020_2026V1(),
      usNetworkFeeEvidenceRecords: governedUsNetworkReferenceRecords2020_2026V1(),
      usNetworkFeeEvidenceRules: governedUsNetworkRules2020_2026V1(),
      mastercardFocusedEvidenceCatalogVersion: GOVERNED_MASTERCARD_FOCUSED_EVIDENCE_2024_2026_V1,
      mastercardFocusedEvidenceSources: governedMastercardFocusedSources2024_2026V1(),
      mastercardFocusedEvidenceRecords: governedMastercardFocusedRecords2024_2026V1(),
      mastercardFocusedEvidenceRules: governedMastercardFocusedRules2024_2026V1(),
      current2026UsCoreNetworkReferenceCatalogVersion: GOVERNED_CURRENT_2026_US_CORE_NETWORK_REFERENCE_V1,
      current2026UsCoreNetworkReferenceSources: governedCurrent2026SourcesV1(),
      current2026UsCoreNetworkReferenceRecords: governedCurrent2026ReferenceRecordsV1(),
      current2026UsCoreNetworkReferenceRules: governedCurrent2026RulesV1(),
      commercialClassificationAdjudicationCatalogVersion: GOVERNED_COMMERCIAL_CLASSIFICATION_ADJUDICATION_V1,
      commercialClassificationAdjudicationRules: governedCommercialClassificationAdjudicationRulesV1(),
      openWorldDeterminantCatalogVersion: GOVERNED_OPEN_WORLD_DETERMINANT_V1,
      openWorldDeterminantFamilies: governedOpenWorldFeeFamiliesV1(),
      openWorldDeterminantActionClasses: governedOpenWorldActionClassesV1(),
      openWorldDeterminantRules: governedOpenWorldRulesV1(),
      norms: NORMS,
    })).digest("hex");
  }
}

export function governedIndustryNormsV1(): GovernedIndustryNorm[] {
  return structuredClone(NORMS);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

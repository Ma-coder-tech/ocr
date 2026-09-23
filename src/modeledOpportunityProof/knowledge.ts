import type { ReviewedContextualKnowledgeV1 } from "./contracts.js";

/** Narrow rule approved by Product for the offline proof in the 2026-09-23 request. */
export const VISIBLE_FISERV_PRICING_REVIEW_V1: ReviewedContextualKnowledgeV1 = {
  knowledgeId: "product_visible_fiserv_pricing_review",
  version: "1.0.0-proof",
  reviewAuthority: "Product",
  provenance: "Product's 2026-09-23 offline proof instruction and explicit contextual-rule clarification",
  reviewedOn: "2026-09-23",
  effectiveFrom: "2026-09-23",
  effectiveTo: null,
  scope: {
    processorFamily: "Fiserv / First Data",
    statementCount: 1,
    pricingModels: "any_including_unknown",
    businessCategories: "any_selected_category",
    monthlyVolume: "positive_selected_volume",
    channelAndCardMix: "not_required",
    basisCompatibility: "compatible_all_in_rate",
  },
  uncertainty: "The rule identifies visible fee activity for review; it does not evaluate pricing competitiveness, ownership, actionability, or savings.",
};

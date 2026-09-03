import type {
  Claim,
  DeterministicControl,
  EvidenceNeed,
  Hypothesis,
  Observation,
  ObservationKind,
  ReconstructionInput,
  ScalarValue,
} from "../../../src/reconstructionKernel/index.js";

function observation(
  documentId: string,
  id: string,
  kind: ObservationKind,
  value: ScalarValue,
  section: string,
  relatedObservationRefs?: string[],
): Observation {
  return { id, kind, value, authority: "source_printed", locator: { documentId, section, label: id }, relatedObservationRefs };
}

function sourceClaim(key: string, value: ScalarValue, ...observationRefs: string[]): Claim {
  return { key, value, support: "source_observation", observationRefs };
}

function derivedClaim(key: string, value: ScalarValue, controlRefs: string[], ...observationRefs: string[]): Claim {
  return { key, value, support: "deterministic_derivation", observationRefs, controlRefs };
}

function hypothesis(
  id: string,
  groupId: string,
  description: string,
  observationRefs: string[],
  claims: Claim[],
  requiredControlIds: string[],
  contradictedByControlIds: string[] = [],
  events: Hypothesis["events"] = [],
  populations: Hypothesis["populations"] = [],
): Hypothesis {
  return {
    id,
    groupId,
    origin: "deterministic",
    ownership: { kind: "deterministic_system", immutable: true },
    evidenceClass: requiredControlIds.length > 0 ? "claim_proof" : "compatibility_only",
    alternativeCoverage: requiredControlIds.length > 0 ? "exhaustive_for_claim" : "non_exhaustive",
    description,
    observationRefs,
    events,
    populations,
    claims,
    requiredControlIds,
    contradictedByControlIds,
  };
}

function evidenceNeed(
  id: string,
  hypothesisGroupId: string,
  description: string,
  availableScopes: EvidenceNeed["availableScopes"],
  exhaustedScopes: EvidenceNeed["exhaustedScopes"] = [],
): EvidenceNeed {
  return { id, hypothesisGroupId, description, material: true, availableScopes, exhaustedScopes };
}

const basysDocument = "basys-march-2020";
const basysObservations: Observation[] = [
  observation(basysDocument, "basys.sales.amount", "amount", 17_128_393, "sales summary"),
  observation(basysDocument, "basys.cards.amount", "amount", 17_128_393, "card summary"),
  observation(basysDocument, "basys.batch.amount", "amount", 17_128_393, "batch summary"),
  observation(basysDocument, "basys.interchange.volume", "amount", 17_128_393, "interchange summary"),
  observation(basysDocument, "basys.sales.count", "count", 3_310, "sales summary"),
  observation(basysDocument, "basys.cards.count", "count", 3_310, "card summary"),
  observation(basysDocument, "basys.fee.total", "amount", 355_245, "fee summary"),
  observation(basysDocument, "basys.interchange.detail", "amount", 285_023, "interchange detail"),
  observation(basysDocument, "basys.assessments", "amount", 22_763, "assessment detail"),
  observation(basysDocument, "basys.processed.labelled", "amount", 16_773_148, "amount processed"),
  observation(
    basysDocument,
    "basys.population.relation",
    "relation",
    "same_economic_population",
    "summary labels",
    ["basys.sales.amount", "basys.cards.amount", "basys.sales.count", "basys.cards.count"],
  ),
  observation(
    basysDocument,
    "basys.interchange.inclusion",
    "relation",
    "included_in_fee_total",
    "fee summary note",
    ["basys.interchange.detail", "basys.fee.total"],
  ),
];
const basysControls: DeterministicControl[] = [
  { id: "basys.amount.match", kind: "equal", description: "Sales and card amounts match.", leftObservationRef: "basys.sales.amount", rightObservationRef: "basys.cards.amount" },
  { id: "basys.count.match", kind: "equal", description: "Sales and card counts match.", leftObservationRef: "basys.sales.count", rightObservationRef: "basys.cards.count" },
  { id: "basys.population.explicit", kind: "relation", description: "Statement identifies repeated population views.", relationObservationRef: "basys.population.relation", expectedRelation: "same_economic_population", subjectObservationRefs: ["basys.sales.amount", "basys.cards.amount", "basys.sales.count", "basys.cards.count"] },
  { id: "basys.interchange.included", kind: "relation", description: "Statement says detailed interchange is included.", relationObservationRef: "basys.interchange.inclusion", expectedRelation: "included_in_fee_total", subjectObservationRefs: ["basys.interchange.detail", "basys.fee.total"] },
];

export const basysMarch2020: ReconstructionInput = {
  statementId: basysDocument,
  observations: basysObservations,
  baseClaims: [
    sourceClaim("submitted.net_amount_minor", 17_128_393, "basys.sales.amount"),
    sourceClaim("fees.total_minor", 355_245, "basys.fee.total"),
    sourceClaim("processor.amount_processed_label_minor", 16_773_148, "basys.processed.labelled"),
  ],
  controls: basysControls,
  hypotheses: [
    hypothesis("basys.repeated-representation", "basys.submission-population", "Summary sections repeat one economic population.", ["basys.sales.amount", "basys.cards.amount", "basys.sales.count", "basys.cards.count"], [derivedClaim("submission.population.represented_once", true, ["basys.amount.match", "basys.count.match", "basys.population.explicit"], "basys.population.relation")], ["basys.amount.match", "basys.count.match", "basys.population.explicit"], [], [], [{ id: "basys.one-population", observationRefs: ["basys.sales.amount", "basys.cards.amount", "basys.sales.count", "basys.cards.count"], dimensions: { interpretation: "repeated_representation" } }]),
    hypothesis("basys.separate-populations", "basys.submission-population", "Summary sections are additive populations.", ["basys.sales.amount", "basys.cards.amount"], [derivedClaim("submission.population.represented_once", false, ["basys.population.explicit"], "basys.sales.amount", "basys.cards.amount")], [], ["basys.population.explicit"], [], [{ id: "basys.sales-population", observationRefs: ["basys.sales.amount"], dimensions: { section: "sales" } }, { id: "basys.cards-population", observationRefs: ["basys.cards.amount"], dimensions: { section: "cards" } }]),
    hypothesis("basys.interchange-is-included", "basys.fee-presentation", "Detailed interchange is a representation within total fees.", ["basys.interchange.detail", "basys.fee.total"], [derivedClaim("fees.interchange.included_in_total", true, ["basys.interchange.included"], "basys.interchange.inclusion")], ["basys.interchange.included"]),
    hypothesis("basys.interchange-is-additive", "basys.fee-presentation", "Detailed interchange is additive to total fees.", ["basys.interchange.detail", "basys.fee.total"], [derivedClaim("fees.interchange.included_in_total", false, ["basys.interchange.included"], "basys.interchange.detail", "basys.fee.total")], [], ["basys.interchange.included"]),
  ],
  evidenceNeeds: [],
};

const vortaxDocument = "vortax-september-2022";
export const vortaxSeptember2022: ReconstructionInput = {
  statementId: vortaxDocument,
  observations: [
    observation(vortaxDocument, "vortax.adjustments.positive", "amount", 311_166, "adjustments"),
    observation(vortaxDocument, "vortax.adjustments.negative", "amount", -289_990, "adjustments"),
    observation(vortaxDocument, "vortax.adjustments.net", "amount", 21_176, "adjustments"),
    observation(vortaxDocument, "vortax.adjustments.gross", "amount", 601_156, "adjustments"),
    observation(vortaxDocument, "vortax.negative.count", "count", 11, "adjustments"),
    observation(vortaxDocument, "vortax.chargeback-fee.count", "count", 11, "fees"),
    observation(vortaxDocument, "vortax.adjustment.reference", "identifier", null, "adjustments"),
    observation(vortaxDocument, "vortax.chargeback.reference", "identifier", null, "chargebacks"),
    observation(vortaxDocument, "vortax.missing-page-count", "count", 1, "document integrity"),
    observation(vortaxDocument, "vortax.fee-delta", "amount", 2, "reconciliation"),
    observation(vortaxDocument, "vortax.interchange-delta", "amount", 9, "reconciliation"),
  ],
  baseClaims: [
    sourceClaim("adjustments.net_minor", 21_176, "vortax.adjustments.net"),
    derivedClaim("adjustments.gross_movement_minor", 601_156, ["vortax.gross.reconciles"], "vortax.adjustments.positive", "vortax.adjustments.negative", "vortax.adjustments.gross"),
    derivedClaim("adjustments.chargeback_counts_align", true, ["vortax.counts.match"], "vortax.negative.count", "vortax.chargeback-fee.count"),
    sourceClaim("document.missing_page_count", 1, "vortax.missing-page-count"),
  ],
  controls: [
    { id: "vortax.net.reconciles", kind: "arithmetic", description: "Positive and negative adjustments reconcile to net.", terms: [{ observationRef: "vortax.adjustments.positive", coefficient: 1 }, { observationRef: "vortax.adjustments.negative", coefficient: 1 }], expectedObservationRef: "vortax.adjustments.net" },
    { id: "vortax.gross.reconciles", kind: "arithmetic", description: "Absolute movements reconcile to gross movement.", terms: [{ observationRef: "vortax.adjustments.positive", coefficient: 1, absolute: true }, { observationRef: "vortax.adjustments.negative", coefficient: 1, absolute: true }], expectedObservationRef: "vortax.adjustments.gross" },
    { id: "vortax.counts.match", kind: "equal", description: "Negative adjustments and chargeback fee counts match.", leftObservationRef: "vortax.negative.count", rightObservationRef: "vortax.chargeback-fee.count" },
    { id: "vortax.references.match", kind: "equal", description: "Row references prove a link.", leftObservationRef: "vortax.adjustment.reference", rightObservationRef: "vortax.chargeback.reference" },
  ],
  hypotheses: [
    hypothesis("vortax.rows-linked", "vortax.adjustment-chargeback-link", "Each negative adjustment links to one chargeback fee row.", ["vortax.negative.count", "vortax.chargeback-fee.count", "vortax.adjustment.reference", "vortax.chargeback.reference"], [derivedClaim("adjustments.chargebacks.row_linked", true, ["vortax.counts.match", "vortax.references.match"], "vortax.adjustment.reference", "vortax.chargeback.reference")], ["vortax.counts.match", "vortax.references.match"]),
    hypothesis("vortax.count-correlation-only", "vortax.adjustment-chargeback-link", "The equal counts are correlation without row identity.", ["vortax.negative.count", "vortax.chargeback-fee.count"], [{ key: "adjustments.chargebacks.row_linked", value: false, support: "structural_hypothesis", observationRefs: ["vortax.negative.count", "vortax.chargeback-fee.count"] }], []),
  ],
  evidenceNeeds: [evidenceNeed("vortax.obtain-missing-page", "vortax.adjustment-chargeback-link", "Obtain the missing statement page before public research.", ["statement_local", "private_authorized"], ["statement_local"])],
};

const paysafeDocument = "paysafe-october-2025";
export const paysafeOctober2025: ReconstructionInput = {
  statementId: paysafeDocument,
  observations: [
    observation(paysafeDocument, "paysafe.submitted", "amount", 801_070, "summary"),
    observation(paysafeDocument, "paysafe.fees", "amount", 37_855, "fees"),
    observation(paysafeDocument, "paysafe.sales.count", "count", 15, "submitted sales"),
    observation(paysafeDocument, "paysafe.gateway.count", "count", 49, "gateway events"),
    observation(paysafeDocument, "paysafe.visa.credit-sales", "count", 0, "card sales"),
    observation(paysafeDocument, "paysafe.visa.fee", "amount", 400, "fees"),
    observation(paysafeDocument, "paysafe.visible-fee-subtotal", "amount", 37_854, "visible fee rows"),
    observation(paysafeDocument, "paysafe.one-cent-gap", "amount", 1, "reconciliation"),
  ],
  baseClaims: [sourceClaim("submitted.net_amount_minor", 801_070, "paysafe.submitted"), sourceClaim("fees.total_minor", 37_855, "paysafe.fees")],
  controls: [
    { id: "paysafe.counts.differ", kind: "not_equal", description: "Gateway events are not submitted sales.", leftObservationRef: "paysafe.sales.count", rightObservationRef: "paysafe.gateway.count" },
    { id: "paysafe.counts.equal", kind: "equal", description: "Gateway events equal submitted sales.", leftObservationRef: "paysafe.sales.count", rightObservationRef: "paysafe.gateway.count" },
    { id: "paysafe.visa.zero", kind: "compare", description: "No Visa credit sales are printed.", observationRef: "paysafe.visa.credit-sales", operator: "eq", expected: 0 },
    { id: "paysafe.fee.delta", kind: "arithmetic", description: "Visible subtotal plus one cent equals total fees.", terms: [{ observationRef: "paysafe.visible-fee-subtotal", coefficient: 1 }, { observationRef: "paysafe.one-cent-gap", coefficient: 1 }], expectedObservationRef: "paysafe.fees" },
  ],
  hypotheses: [
    hypothesis("paysafe.gateway-distinct", "paysafe.event-population", "Gateway events are a distinct presentation population.", ["paysafe.sales.count", "paysafe.gateway.count"], [derivedClaim("events.gateway_same_as_submitted_sales", false, ["paysafe.counts.differ"], "paysafe.sales.count", "paysafe.gateway.count")], ["paysafe.counts.differ"], [], [], [{ id: "paysafe.sales-population", observationRefs: ["paysafe.sales.count"], dimensions: { stage: "submitted" } }, { id: "paysafe.gateway-population", observationRefs: ["paysafe.gateway.count"], dimensions: { presentation: "gateway_events" } }]),
    hypothesis("paysafe.gateway-same", "paysafe.event-population", "Gateway events are submitted sales.", ["paysafe.sales.count", "paysafe.gateway.count"], [derivedClaim("events.gateway_same_as_submitted_sales", true, ["paysafe.counts.equal"], "paysafe.sales.count", "paysafe.gateway.count")], ["paysafe.counts.equal"], [], [], [{ id: "paysafe.one-event-population", observationRefs: ["paysafe.sales.count", "paysafe.gateway.count"], dimensions: { interpretation: "same_population" } }]),
    hypothesis("paysafe.visa-fee-without-sales", "paysafe.visa-fee-meaning", "A Visa-labelled fee does not prove Visa credit-sale volume.", ["paysafe.visa.credit-sales", "paysafe.visa.fee"], [derivedClaim("fees.visa_implies_credit_sales", false, ["paysafe.visa.zero"], "paysafe.visa.credit-sales", "paysafe.visa.fee")], ["paysafe.visa.zero"]),
    hypothesis("paysafe.visa-fee-proves-sales", "paysafe.visa-fee-meaning", "Visa fee proves Visa credit-sale volume.", ["paysafe.visa.credit-sales", "paysafe.visa.fee"], [derivedClaim("fees.visa_implies_credit_sales", true, ["paysafe.visa.zero"], "paysafe.visa.credit-sales", "paysafe.visa.fee")], [], ["paysafe.visa.zero"]),
  ],
  evidenceNeeds: [evidenceNeed("paysafe.fee-cent-gap", "paysafe.fee-completeness", "Resolve the one-cent visible fee gap from statement-local rows.", ["statement_local", "public_rg"])],
};

const wellsDocument = "wells-fargo-september-2024";
export const wellsFargoSeptember2024: ReconstructionInput = {
  statementId: wellsDocument,
  observations: [
    observation(wellsDocument, "wells.gross", "amount", 17_741_744, "volume summary"),
    observation(wellsDocument, "wells.refunds", "amount", 1_672, "volume summary"),
    observation(wellsDocument, "wells.net", "amount", 17_740_072, "volume summary"),
    observation(wellsDocument, "wells.fees", "amount", 295_438, "fee summary"),
    observation(wellsDocument, "wells.interchange", "amount", 211_147, "interchange detail"),
    observation(wellsDocument, "wells.wats", "count", 4_244, "WATS"),
    observation(wellsDocument, "wells.submitted.count", "count", 4_138, "submitted"),
    observation(wellsDocument, "wells.shipping.ref", "identifier", "100000026767543", "shipping"),
    observation(wellsDocument, "wells.tax.ref", "identifier", "100000026767543", "tax"),
    observation(wellsDocument, "wells.shipping", "amount", 1_595, "shipping"),
    observation(wellsDocument, "wells.tax", "amount", -108, "tax"),
    observation(wellsDocument, "wells.processed", "amount", 17_444_526, "amount processed"),
    observation(wellsDocument, "wells.amendment.earlier", "date", null, "shipping"),
    observation(wellsDocument, "wells.amendment.later", "date", null, "tax"),
    observation(wellsDocument, "wells.interchange.inclusion", "relation", "included_in_fee_total", "fee note", ["wells.interchange", "wells.fees"]),
  ],
  baseClaims: [
    sourceClaim("submitted.gross_amount_minor", 17_741_744, "wells.gross"),
    sourceClaim("submitted.refund_amount_minor", 1_672, "wells.refunds"),
    sourceClaim("submitted.net_amount_minor", 17_740_072, "wells.net"),
    sourceClaim("fees.total_minor", 295_438, "wells.fees"),
    sourceClaim("processor.amount_processed_label_minor", 17_444_526, "wells.processed"),
    derivedClaim("shipping_tax.reference_reused", true, ["wells.refs.match"], "wells.shipping.ref", "wells.tax.ref"),
  ],
  controls: [
    { id: "wells.net.reconciles", kind: "arithmetic", description: "Gross less refunds equals net.", terms: [{ observationRef: "wells.gross", coefficient: 1 }, { observationRef: "wells.refunds", coefficient: -1 }], expectedObservationRef: "wells.net" },
    { id: "wells.interchange.included", kind: "relation", description: "Detailed interchange is included in fees.", relationObservationRef: "wells.interchange.inclusion", expectedRelation: "included_in_fee_total", subjectObservationRefs: ["wells.interchange", "wells.fees"] },
    { id: "wells.counts.differ", kind: "not_equal", description: "WATS and submitted counts differ.", leftObservationRef: "wells.wats", rightObservationRef: "wells.submitted.count" },
    { id: "wells.refs.match", kind: "equal", description: "Shipping and tax references match.", leftObservationRef: "wells.shipping.ref", rightObservationRef: "wells.tax.ref" },
    { id: "wells.amendment.order", kind: "temporal_order", description: "Tax row follows shipping row.", earlierObservationRef: "wells.amendment.earlier", laterObservationRef: "wells.amendment.later" },
  ],
  hypotheses: [
    hypothesis("wells.interchange-included", "wells.fee-presentation", "Interchange detail is included in total fees.", ["wells.interchange", "wells.fees"], [derivedClaim("fees.interchange.included_in_total", true, ["wells.interchange.included"], "wells.interchange.inclusion")], ["wells.interchange.included"]),
    hypothesis("wells.wats-distinct", "wells.event-population", "WATS is not the submitted transaction count.", ["wells.wats", "wells.submitted.count"], [derivedClaim("events.wats_same_as_submitted", false, ["wells.counts.differ"], "wells.wats", "wells.submitted.count")], ["wells.counts.differ"]),
    hypothesis("wells.reference-amendment", "wells.shipping-tax-lifecycle", "Same reference reflects a later tax amendment.", ["wells.shipping.ref", "wells.tax.ref", "wells.amendment.earlier", "wells.amendment.later"], [derivedClaim("shipping_tax.same_lifecycle", true, ["wells.refs.match", "wells.amendment.order"], "wells.shipping.ref", "wells.tax.ref")], ["wells.refs.match", "wells.amendment.order"]),
    hypothesis("wells.reference-reuse-only", "wells.shipping-tax-lifecycle", "Reference reuse does not establish lifecycle identity.", ["wells.shipping.ref", "wells.tax.ref"], [{ key: "shipping_tax.same_lifecycle", value: false, support: "structural_hypothesis", observationRefs: ["wells.shipping.ref", "wells.tax.ref"] }], []),
  ],
  evidenceNeeds: [evidenceNeed("wells.shipping-tax-order", "wells.shipping-tax-lifecycle", "Find row-level temporal evidence in the statement before any external lookup.", ["statement_local", "public_rg"])],
};

const cloverDocument = "clover-duplicate-resubmission";
export const cloverDuplicateResubmission: ReconstructionInput = {
  statementId: cloverDocument,
  observations: [
    observation(cloverDocument, "clover.rejected.amount", "amount", 70_000, "06/12 electronic deposit reject"),
    observation(cloverDocument, "clover.resubmitted.amount", "amount", 70_000, "06/24 submitted batch 000000157890"),
    observation(cloverDocument, "clover.rejected.count", "count", 2, "06/12 submitted batch"),
    observation(cloverDocument, "clover.resubmitted.count", "count", 2, "06/24 submitted batch 000000157890"),
    observation(cloverDocument, "clover.rejected.date", "date", "2024-06-12", "electronic deposit rejects"),
    observation(cloverDocument, "clover.resubmitted.date", "date", "2024-06-24", "summary by batch"),
    observation(cloverDocument, "clover.rejected.id", "identifier", null, "rejected batches"),
    observation(cloverDocument, "clover.resubmitted.id", "identifier", "000000157890", "submitted batches"),
    observation(cloverDocument, "clover.second.rejected.amount", "amount", 50_000, "06/14 electronic deposit reject"),
    observation(cloverDocument, "clover.second.resubmitted.amount", "amount", 50_000, "06/24 submitted batch 000000217890"),
    observation(cloverDocument, "clover.second.rejected.count", "count", 1, "06/14 submitted batch"),
    observation(cloverDocument, "clover.second.resubmitted.count", "count", 1, "06/24 submitted batch 000000217890"),
    observation(cloverDocument, "clover.second.rejected.date", "date", "2024-06-14", "electronic deposit rejects"),
    observation(cloverDocument, "clover.second.resubmitted.date", "date", "2024-06-24", "summary by batch"),
    observation(cloverDocument, "clover.second.rejected.id", "identifier", null, "rejected batches"),
    observation(cloverDocument, "clover.second.resubmitted.id", "identifier", "000000217890", "submitted batches"),
  ],
  baseClaims: [
    sourceClaim("batches.rejected.amount_minor", 70_000, "clover.rejected.amount"),
    sourceClaim("batches.resubmitted.amount_minor", 70_000, "clover.resubmitted.amount"),
    sourceClaim("batches.rejected.second_amount_minor", 50_000, "clover.second.rejected.amount"),
    sourceClaim("batches.resubmitted.second_amount_minor", 50_000, "clover.second.resubmitted.amount"),
  ],
  controls: [
    { id: "clover.amounts.match", kind: "equal", description: "Rejected and submitted amounts match.", leftObservationRef: "clover.rejected.amount", rightObservationRef: "clover.resubmitted.amount" },
    { id: "clover.counts.match", kind: "equal", description: "Rejected and submitted counts match.", leftObservationRef: "clover.rejected.count", rightObservationRef: "clover.resubmitted.count" },
    { id: "clover.time.ordered", kind: "temporal_order", description: "Resubmission follows rejection.", earlierObservationRef: "clover.rejected.date", laterObservationRef: "clover.resubmitted.date" },
    { id: "clover.lifecycle.valid", kind: "lifecycle_transition", description: "Rejected to resubmitted is a valid ordered lifecycle transition.", fromStage: "rejected", toStage: "resubmitted", earlierObservationRef: "clover.rejected.date", laterObservationRef: "clover.resubmitted.date" },
    { id: "clover.ids.match", kind: "equal", description: "Batch identifiers establish lifecycle identity.", leftObservationRef: "clover.rejected.id", rightObservationRef: "clover.resubmitted.id" },
    { id: "clover.second.amounts.match", kind: "equal", description: "Second rejected and submitted amounts match.", leftObservationRef: "clover.second.rejected.amount", rightObservationRef: "clover.second.resubmitted.amount" },
    { id: "clover.second.counts.match", kind: "equal", description: "Second rejected and submitted counts match.", leftObservationRef: "clover.second.rejected.count", rightObservationRef: "clover.second.resubmitted.count" },
    { id: "clover.second.time.ordered", kind: "temporal_order", description: "Second resubmission follows rejection.", earlierObservationRef: "clover.second.rejected.date", laterObservationRef: "clover.second.resubmitted.date" },
    { id: "clover.second.lifecycle.valid", kind: "lifecycle_transition", description: "Second rejected to resubmitted transition is valid and ordered.", fromStage: "rejected", toStage: "resubmitted", earlierObservationRef: "clover.second.rejected.date", laterObservationRef: "clover.second.resubmitted.date" },
    { id: "clover.second.ids.match", kind: "equal", description: "Second pair identifiers establish lifecycle identity.", leftObservationRef: "clover.second.rejected.id", rightObservationRef: "clover.second.resubmitted.id" },
  ],
  hypotheses: [
    hypothesis("clover.same-lifecycle", "clover.duplicate-resubmission", "Both rejected/submitted pairs are lifecycle resubmissions.", ["clover.rejected.amount", "clover.resubmitted.amount", "clover.rejected.count", "clover.resubmitted.count", "clover.rejected.date", "clover.resubmitted.date", "clover.rejected.id", "clover.resubmitted.id", "clover.second.rejected.amount", "clover.second.resubmitted.amount", "clover.second.rejected.count", "clover.second.resubmitted.count", "clover.second.rejected.date", "clover.second.resubmitted.date", "clover.second.rejected.id", "clover.second.resubmitted.id"], [derivedClaim("batches.same_lifecycle", true, ["clover.amounts.match", "clover.counts.match", "clover.time.ordered", "clover.lifecycle.valid", "clover.ids.match", "clover.second.amounts.match", "clover.second.counts.match", "clover.second.time.ordered", "clover.second.lifecycle.valid", "clover.second.ids.match"], "clover.rejected.id", "clover.resubmitted.id", "clover.second.rejected.id", "clover.second.resubmitted.id")], ["clover.amounts.match", "clover.counts.match", "clover.time.ordered", "clover.lifecycle.valid", "clover.ids.match", "clover.second.amounts.match", "clover.second.counts.match", "clover.second.time.ordered", "clover.second.lifecycle.valid", "clover.second.ids.match"], [], [{ id: "clover.rejected-event", stage: "rejected", observationRefs: ["clover.rejected.amount", "clover.rejected.count", "clover.rejected.date"] }, { id: "clover.resubmitted-event", stage: "resubmitted", observationRefs: ["clover.resubmitted.amount", "clover.resubmitted.count", "clover.resubmitted.date"] }, { id: "clover.second-rejected-event", stage: "rejected", observationRefs: ["clover.second.rejected.amount", "clover.second.rejected.count", "clover.second.rejected.date"] }, { id: "clover.second-resubmitted-event", stage: "resubmitted", observationRefs: ["clover.second.resubmitted.amount", "clover.second.resubmitted.count", "clover.second.resubmitted.date"] }]),
    hypothesis("clover-coincidental-duplicate", "clover.duplicate-resubmission", "Matching rows are separate batches without proven identity.", ["clover.rejected.amount", "clover.resubmitted.amount"], [{ key: "batches.same_lifecycle", value: false, support: "structural_hypothesis", observationRefs: ["clover.rejected.amount", "clover.resubmitted.amount"] }], []),
  ],
  evidenceNeeds: [evidenceNeed("clover.batch-identity", "clover.duplicate-resubmission", "Search statement-local batch references for a stable identity.", ["statement_local", "private_authorized", "public_rg"])],
};

export const rescueCorpus = [
  { id: basysDocument, input: basysMarch2020, canonicalKeys: ["fees.interchange.included_in_total", "fees.total_minor", "processor.amount_processed_label_minor", "submission.population.represented_once", "submitted.net_amount_minor"], unresolvedGroups: [] },
  { id: vortaxDocument, input: vortaxSeptember2022, canonicalKeys: ["adjustments.chargeback_counts_align", "adjustments.gross_movement_minor", "adjustments.net_minor", "document.missing_page_count"], unresolvedGroups: ["vortax.adjustment-chargeback-link"] },
  { id: paysafeDocument, input: paysafeOctober2025, canonicalKeys: ["events.gateway_same_as_submitted_sales", "fees.total_minor", "fees.visa_implies_credit_sales", "submitted.net_amount_minor"], unresolvedGroups: [] },
  { id: wellsDocument, input: wellsFargoSeptember2024, canonicalKeys: ["events.wats_same_as_submitted", "fees.interchange.included_in_total", "fees.total_minor", "processor.amount_processed_label_minor", "shipping_tax.reference_reused", "submitted.gross_amount_minor", "submitted.net_amount_minor", "submitted.refund_amount_minor"], unresolvedGroups: ["wells.shipping-tax-lifecycle"] },
  { id: cloverDocument, input: cloverDuplicateResubmission, canonicalKeys: ["batches.rejected.amount_minor", "batches.rejected.second_amount_minor", "batches.resubmitted.amount_minor", "batches.resubmitted.second_amount_minor"], unresolvedGroups: ["clover.duplicate-resubmission"] },
] as const;

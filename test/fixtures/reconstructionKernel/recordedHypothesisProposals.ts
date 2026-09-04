import type {
  HypothesisProposalRequest,
  HypothesisProposalResponse,
  ProviderHypothesisProposal,
  InferenceTopic,
  RecordedProposalReviewRule,
  StatementHypothesisProposer,
} from "../../../src/reconstructionKernel/index.js";

type RecordedFactory = (request: HypothesisProposalRequest) => ProviderHypothesisProposal[];

function candidateRelationship(
  id: string,
  description: string,
  rejectedPrefix: string,
  submittedPrefix: string,
  independenceGroupId: string,
): InferenceTopic["verificationRecipes"][number]["candidates"][number] {
  return {
    id,
    description,
    roleBindings: [
      { role: "left_amount", observationRef: `${rejectedPrefix}.amount` },
      { role: "right_amount", observationRef: `${submittedPrefix}.amount` },
      { role: "left_count", observationRef: `${rejectedPrefix}.count` },
      { role: "right_count", observationRef: `${submittedPrefix}.count` },
      { role: "earlier_date", observationRef: `${rejectedPrefix}.date` },
      { role: "later_date", observationRef: `${submittedPrefix}.date` },
    ],
    alternativeImpacts: [
      {
        alternativeId: "clover.same-lifecycle",
        pass: "supporting",
        fail: "contradicting",
        diagnosticity: "material",
        independenceGroupId,
      },
      {
        alternativeId: "clover.separate-batches",
        pass: "irrelevant",
        fail: "irrelevant",
        diagnosticity: "contextual",
        independenceGroupId,
      },
    ],
  };
}

function wellsIdentifierCandidate(
  id: string,
  description: string,
  rightObservationRef: string,
  independenceGroupId: string,
): InferenceTopic["verificationRecipes"][number]["candidates"][number] {
  return {
    id,
    description,
    roleBindings: [
      { role: "left_identifier", observationRef: "wells.shipping.ref" },
      { role: "right_identifier", observationRef: rightObservationRef },
    ],
    alternativeImpacts: [
      {
        alternativeId: "wells.same-lifecycle",
        pass: "supporting",
        fail: "contradicting",
        diagnosticity: "material",
        independenceGroupId,
      },
      {
        alternativeId: "wells.reference-reuse-only",
        pass: "supporting",
        fail: "irrelevant",
        diagnosticity: "contextual",
        independenceGroupId,
      },
    ],
  };
}

export class RecordedFixtureProposer implements StatementHypothesisProposer {
  constructor(
    readonly providerId: string,
    private readonly factory: RecordedFactory,
    private readonly unavailable = false,
  ) {}

  async propose(request: HypothesisProposalRequest): Promise<HypothesisProposalResponse> {
    if (this.unavailable) throw new Error("recorded provider failure");
    const hypotheses = structuredClone(this.factory(request));
    return {
      providerId: this.providerId,
      hypotheses,
      alternativeCoverage: request.inferenceTopics.flatMap((topic) => topic.materialAlternatives.map((alternative) => {
        const proposed = hypotheses.find((hypothesis) => hypothesis.alternativeRef === alternative.alternativeRef);
        return {
          topicRef: topic.topicRef,
          alternativeRef: alternative.alternativeRef,
          disposition: proposed ? "proposed" as const : "not_supported" as const,
          reasonCode: proposed ? "proposal_supplied" as const : "insufficient_source_evidence" as const,
          rationale: proposed?.inference.rationale
            ?? "The available source observations do not support this permitted alternative strongly enough to propose it.",
          observationRefs: proposed?.observationRefs ?? topic.observationRefs,
          acknowledgedEvidenceNeedRefs: topic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef),
        };
      })),
    };
  }
}

function topicRefs(request: HypothesisProposalRequest): string[] {
  return request.inferenceTopics[0]!.observationRefs;
}

function proposal(
  request: HypothesisProposalRequest,
  id: string,
  description: string,
  observationRefs: string[],
  claim: { key: string; value: boolean | string },
  confidence: "low" | "medium" | "high",
  rationale: string,
  missingProof: string[],
): ProviderHypothesisProposal {
  const topic = request.inferenceTopics.find((candidate) =>
    candidate.allowedClaims.some((allowed) => allowed.key === claim.key))!;
  const alternative = topic.materialAlternatives.find((candidate) => candidate.claim.key === claim.key
    && JSON.stringify(candidate.claim.value) === JSON.stringify(claim.value))!;
  return {
    id,
    topicRef: topic.topicRef,
    alternativeRef: alternative.alternativeRef,
    description,
    observationRefs,
    events: [],
    populations: [],
    claims: [{ ...claim, observationRefs }],
    inference: {
      confidence,
      rationale,
      missingProof,
      acknowledgedEvidenceNeedRefs: topic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef),
      proofObligationBindings: proofObligationBindingsForAlternative(request, alternative.alternativeRef),
      verificationRequests: [],
    },
  };
}

export function proofObligationBindingsForAlternative(
  request: HypothesisProposalRequest,
  alternativeRef: string,
): ProviderHypothesisProposal["inference"]["proofObligationBindings"] {
  const topic = request.inferenceTopics.find((candidate) =>
    candidate.materialAlternatives.some((alternative) => alternative.alternativeRef === alternativeRef))!;
  const alternative = topic.materialAlternatives.find((candidate) => candidate.alternativeRef === alternativeRef)!;
  const observations = request.observations.filter((observation) => topic.observationRefs.includes(observation.observationRef));
  const refs = (predicate: (observation: HypothesisProposalRequest["observations"][number]) => boolean): string[] =>
    observations.filter(predicate).map((observation) => observation.observationRef);

  return alternative.requiredProofObligationRefs.map((proofObligationRef) => {
    const obligation = topic.proofObligations.find((candidate) => candidate.proofObligationRef === proofObligationRef)!;
    const observationBindings = request.sourceDocument.documentId === "clover-duplicate-resubmission"
      ? [
          { role: "subject" as const, observationRefs: refs((item) => item.kind === "identifier" && item.value === null) },
          { role: "counterpart" as const, observationRefs: refs((item) => item.kind === "identifier" && item.value !== null) },
        ]
      : request.sourceDocument.documentId === "paysafe-october-2025"
        ? [
            { role: "reported_total" as const, observationRefs: refs((item) => item.kind === "amount" && item.value === 37_855) },
            { role: "visible_subtotal" as const, observationRefs: refs((item) => item.kind === "amount" && item.value === 37_854) },
            { role: "discrepancy" as const, observationRefs: refs((item) => item.kind === "amount" && item.value === 1) },
          ]
        : request.sourceDocument.documentId === "wells-fargo-september-2024"
          ? [
              { role: "subject" as const, observationRefs: refs((item) => item.kind === "amount" && item.value === 1_595) },
              { role: "counterpart" as const, observationRefs: refs((item) => item.kind === "amount" && item.value === -108) },
              { role: "missing_subject_attribute" as const, observationRefs: refs((item) => item.kind === "date" && item.value === null && item.sourceLocation.section?.includes("shipping") === true) },
              { role: "missing_counterpart_attribute" as const, observationRefs: refs((item) => item.kind === "date" && item.value === null && item.sourceLocation.section?.includes("tax") === true) },
            ]
          : obligation.gapKind === "source_completeness"
            ? [
                { role: "document_completeness_gap" as const, observationRefs: refs((item) => item.kind === "count" && item.value === 1 && item.sourceLocation.section?.includes("document integrity") === true) },
              ]
            : [
                { role: "subject" as const, observationRefs: refs((item) => item.kind === "count" && item.value === 11 && item.sourceLocation.section?.includes("negative adjustment") === true) },
                { role: "counterpart" as const, observationRefs: refs((item) => item.kind === "count" && item.value === 11 && item.sourceLocation.section?.includes("chargeback fee") === true) },
                { role: "missing_subject_attribute" as const, observationRefs: refs((item) => item.kind === "identifier" && item.value === null && item.sourceLocation.section?.includes("adjustment rows") === true) },
                { role: "missing_counterpart_attribute" as const, observationRefs: refs((item) => item.kind === "identifier" && item.value === null && item.sourceLocation.section?.includes("chargeback fee") === true) },
              ];
    return {
      proofObligationRef,
      gapKind: obligation.gapKind,
      observationBindings,
      missingProperty: obligation.missingProperty,
      resolutionEvidenceKinds: structuredClone(obligation.permittedResolutionEvidenceKinds),
    };
  });
}

export const cloverInferenceTopics: InferenceTopic[] = [{
  id: "clover.duplicate-resubmission",
  hypothesisGroupId: "clover.duplicate-resubmission",
  question: "Do the printed rejected and later submitted rows represent the same lifecycle, or separate batches?",
  observationRefs: [
    "clover.rejected.amount", "clover.resubmitted.amount", "clover.rejected.count", "clover.resubmitted.count",
    "clover.rejected.date", "clover.resubmitted.date", "clover.rejected.id", "clover.resubmitted.id",
    "clover.second.rejected.amount", "clover.second.resubmitted.amount", "clover.second.rejected.count",
    "clover.second.resubmitted.count", "clover.second.rejected.date", "clover.second.resubmitted.date",
    "clover.second.rejected.id", "clover.second.resubmitted.id",
  ],
  allowedClaims: [{ key: "batches.same_lifecycle", allowedValues: [true, false] }],
  materialAlternatives: [
    {
      id: "clover.same-lifecycle",
      description: "The rejected rows and later submitted rows belong to the same lifecycle.",
      claim: { key: "batches.same_lifecycle", value: true },
      requiredProofObligationIds: ["stable-row-identity-linkage"],
    },
    {
      id: "clover.separate-batches",
      description: "The matching rejected and submitted rows are separate batches.",
      claim: { key: "batches.same_lifecycle", value: false },
      requiredProofObligationIds: ["stable-row-identity-linkage"],
    },
  ],
  proofObligations: [{
    id: "stable-row-identity-linkage",
    description: "A stable source identity must link or distinguish the rejected rows and later submitted batches.",
    evidenceNeedIds: ["clover.batch-identity"],
    gapKind: "identity_linkage",
    observationRequirements: [
      { role: "subject", description: "Identifier fields on the rejected rows whose lifecycle identity is unresolved.", observationRefs: ["clover.rejected.id", "clover.second.rejected.id"], allowedKinds: ["identifier"], valueState: "missing" },
      { role: "counterpart", description: "Printed identifiers on the later submitted rows that may or may not correspond to the rejected rows.", observationRefs: ["clover.resubmitted.id", "clover.second.resubmitted.id"], allowedKinds: ["identifier"], valueState: "present" },
    ],
    missingProperty: "stable_identity_link",
    resolutionEvidenceKinds: ["stable_source_identifier", "explicit_source_relation"],
  }],
  verificationRecipes: [{
    id: "clover.verify-reject-resubmission-candidate",
    description: "Check one RateReveal-approved rejected/submitted row pairing for matching amount, matching count, and temporal order.",
    checkType: "row_pair_match",
    roles: [
      { role: "left_amount", description: "Candidate rejected-row amount.", allowedObservationRefs: ["clover.rejected.amount", "clover.second.rejected.amount"], allowedKinds: ["amount"] },
      { role: "right_amount", description: "Candidate later submitted-row amount.", allowedObservationRefs: ["clover.resubmitted.amount", "clover.second.resubmitted.amount"], allowedKinds: ["amount"] },
      { role: "left_count", description: "Candidate rejected-row transaction count.", allowedObservationRefs: ["clover.rejected.count", "clover.second.rejected.count"], allowedKinds: ["count"] },
      { role: "right_count", description: "Candidate later submitted-row transaction count.", allowedObservationRefs: ["clover.resubmitted.count", "clover.second.resubmitted.count"], allowedKinds: ["count"] },
      { role: "earlier_date", description: "Candidate rejected-row date.", allowedObservationRefs: ["clover.rejected.date", "clover.second.rejected.date"], allowedKinds: ["date"] },
      { role: "later_date", description: "Candidate later submitted-row date.", allowedObservationRefs: ["clover.resubmitted.date", "clover.second.resubmitted.date"], allowedKinds: ["date"] },
    ],
    candidates: [
      candidateRelationship("clover.first-reject-to-first-submission", "The first rejected row paired with the first later submitted row.", "clover.rejected", "clover.resubmitted", "clover.first-reject-resubmission-pattern"),
      candidateRelationship("clover.second-reject-to-second-submission", "The second rejected row paired with the second later submitted row.", "clover.second.rejected", "clover.second.resubmitted", "clover.second-reject-resubmission-pattern"),
      candidateRelationship("clover.first-reject-to-second-submission", "The first rejected row paired with the second later submitted row.", "clover.rejected", "clover.second.resubmitted", "clover.cross-pair-first-to-second"),
      candidateRelationship("clover.second-reject-to-first-submission", "The second rejected row paired with the first later submitted row.", "clover.second.rejected", "clover.resubmitted", "clover.cross-pair-second-to-first"),
    ],
  }],
  qualification: {
    maximumStrength: "strong",
    compatibilityControlIds: [
      "clover.amounts.match", "clover.counts.match", "clover.time.ordered", "clover.lifecycle.valid",
    ],
    evidenceFactors: [
      {
        id: "clover.first-reject-resubmission-pattern",
        description: "The first rejected and later submitted rows match in amount and count and occur in a valid reject-to-submit order.",
        alternativeIds: ["clover.same-lifecycle"],
        effect: "supports",
        diagnosticity: "material",
        independenceGroupId: "clover.first-reject-resubmission-pattern",
        controlIds: ["clover.amounts.match", "clover.counts.match", "clover.time.ordered", "clover.lifecycle.valid"],
        activation: "all_pass",
      },
    ],
    materialEvidenceNeedIds: ["clover.batch-identity"],
    sourceCompleteness: "unproven",
    completenessRequirement: "observed_rows_sufficient",
  },
}];

export const paysafeInferenceTopics: InferenceTopic[] = [{
  id: "paysafe.fee-completeness",
  hypothesisGroupId: "paysafe.fee-completeness",
  question: "What source-compatible explanations remain for the printed one-cent fee reconciliation gap?",
  observationRefs: ["paysafe.fees", "paysafe.visible-fee-subtotal", "paysafe.one-cent-gap"],
  allowedClaims: [{
    key: "fees.visible_gap_explanation",
    allowedValues: ["aggregate_display_rounding", "unobserved_fee_component"],
  }],
  materialAlternatives: [
    {
      id: "paysafe.aggregate-display-rounding",
      description: "The visible one-cent gap is aggregate display rounding.",
      claim: { key: "fees.visible_gap_explanation", value: "aggregate_display_rounding" },
      requiredProofObligationIds: ["underlying-fee-precision-and-rounding-method"],
    },
    {
      id: "paysafe.unobserved-fee-component",
      description: "The visible one-cent gap is an unobserved fee component.",
      claim: { key: "fees.visible_gap_explanation", value: "unobserved_fee_component" },
      requiredProofObligationIds: ["complete-fee-detail-for-omitted-component"],
    },
  ],
  proofObligations: [
    {
      id: "underlying-fee-precision-and-rounding-method",
      description: "Underlying fee precision or the processor rounding method is required to prove rounding.",
      evidenceNeedIds: ["paysafe.fee-cent-gap"],
      gapKind: "calculation_basis",
      observationRequirements: [
        { role: "reported_total", description: "The processor-printed aggregate fee total.", observationRefs: ["paysafe.fees"], allowedKinds: ["amount"], valueState: "present" },
        { role: "visible_subtotal", description: "The deterministic subtotal of visible fee detail.", observationRefs: ["paysafe.visible-fee-subtotal"], allowedKinds: ["amount"], valueState: "present" },
        { role: "discrepancy", description: "The deterministic difference between the reported total and visible subtotal.", observationRefs: ["paysafe.one-cent-gap"], allowedKinds: ["amount"], valueState: "present" },
      ],
      missingProperty: "underlying_calculation_basis",
      resolutionEvidenceKinds: ["unrounded_source_amounts", "processor_rounding_method"],
    },
    {
      id: "complete-fee-detail-for-omitted-component",
      description: "Line-level fee detail must identify or rule out an omitted component.",
      evidenceNeedIds: ["paysafe.fee-cent-gap"],
      gapKind: "component_reconciliation",
      observationRequirements: [
        { role: "reported_total", description: "The processor-printed aggregate fee total.", observationRefs: ["paysafe.fees"], allowedKinds: ["amount"], valueState: "present" },
        { role: "visible_subtotal", description: "The deterministic subtotal of visible fee detail.", observationRefs: ["paysafe.visible-fee-subtotal"], allowedKinds: ["amount"], valueState: "present" },
        { role: "discrepancy", description: "The deterministic difference between the reported total and visible subtotal.", observationRefs: ["paysafe.one-cent-gap"], allowedKinds: ["amount"], valueState: "present" },
      ],
      missingProperty: "complete_component_membership",
      resolutionEvidenceKinds: ["complete_fee_detail", "reconciliation_mapping"],
    },
  ],
  verificationRecipes: [],
  qualification: {
    maximumStrength: "moderate",
    compatibilityControlIds: ["paysafe.fee.delta"],
    evidenceFactors: [{
      id: "paysafe.printed-fee-gap",
      description: "The printed aggregate and visible detail have a deterministic one-cent gap compatible with either permitted explanation.",
      alternativeIds: ["paysafe.aggregate-display-rounding", "paysafe.unobserved-fee-component"],
      effect: "supports",
      diagnosticity: "contextual",
      independenceGroupId: "paysafe.printed-fee-gap",
      controlIds: ["paysafe.fee.delta"],
      activation: "all_pass",
    }],
    materialEvidenceNeedIds: ["paysafe.fee-cent-gap"],
    sourceCompleteness: "unproven",
    completenessRequirement: "observed_rows_sufficient",
  },
}];

export const wellsInferenceTopics: InferenceTopic[] = [{
  id: "wells.shipping-tax-lifecycle",
  hypothesisGroupId: "wells.shipping-tax-lifecycle",
  question: "Does the repeated source reference prove one shipping/tax lifecycle, or only reference reuse?",
  observationRefs: [
    "wells.shipping.ref", "wells.tax.ref", "wells.shipping", "wells.tax",
    "wells.amendment.earlier", "wells.amendment.later",
    "wells.batch.0923.ref", "wells.batch.0924.ref",
  ],
  allowedClaims: [{ key: "shipping_tax.same_lifecycle", allowedValues: [true, false] }],
  materialAlternatives: [
    {
      id: "wells.same-lifecycle",
      description: "The shipping and tax rows are part of the same lifecycle.",
      claim: { key: "shipping_tax.same_lifecycle", value: true },
      requiredProofObligationIds: ["shipping-tax-temporal-linkage"],
    },
    {
      id: "wells.reference-reuse-only",
      description: "The shared reference is reuse and does not establish one lifecycle.",
      claim: { key: "shipping_tax.same_lifecycle", value: false },
      requiredProofObligationIds: ["shipping-tax-temporal-linkage"],
    },
  ],
  proofObligations: [{
    id: "shipping-tax-temporal-linkage",
    description: "Row-level temporal evidence must link or separate the shipping and tax rows.",
    evidenceNeedIds: ["wells.shipping-tax-order"],
    gapKind: "temporal_linkage",
    observationRequirements: [
      { role: "subject", description: "The shipping charge whose lifecycle relationship is unresolved.", observationRefs: ["wells.shipping"], allowedKinds: ["amount"], valueState: "present" },
      { role: "counterpart", description: "The tax entry sharing a source reference with the shipping charge.", observationRefs: ["wells.tax"], allowedKinds: ["amount"], valueState: "present" },
      { role: "missing_subject_attribute", description: "Missing row-level date evidence for the shipping charge.", observationRefs: ["wells.amendment.earlier"], allowedKinds: ["date"], valueState: "missing" },
      { role: "missing_counterpart_attribute", description: "Missing row-level date evidence for the tax entry in the bounded reconstruction packet.", observationRefs: ["wells.amendment.later"], allowedKinds: ["date"], valueState: "missing" },
    ],
    missingProperty: "row_level_temporal_link",
    resolutionEvidenceKinds: ["row_level_date", "explicit_temporal_relation"],
  }],
  verificationRecipes: [{
    id: "wells.verify-shipping-reference-candidate",
    description: "Compare the printed shipping reference with one RateReveal-approved candidate source reference.",
    checkType: "identifier_pair_match",
    roles: [
      {
        role: "left_identifier",
        description: "The printed supply shipping and handling reference.",
        allowedObservationRefs: ["wells.shipping.ref"],
        allowedKinds: ["identifier"],
      },
      {
        role: "right_identifier",
        description: "A candidate printed reference from another source row.",
        allowedObservationRefs: ["wells.tax.ref", "wells.batch.0923.ref", "wells.batch.0924.ref"],
        allowedKinds: ["identifier"],
      },
    ],
    candidates: [
      wellsIdentifierCandidate("wells.shipping-to-tax-reference", "The shipping reference paired with the sales-tax adjustment reference.", "wells.tax.ref", "wells.shared-source-reference"),
      wellsIdentifierCandidate("wells.shipping-to-prior-batch-reference", "The shipping reference paired with the September 23 submitted-batch reference.", "wells.batch.0923.ref", "wells.shipping-prior-batch-reference"),
      wellsIdentifierCandidate("wells.shipping-to-same-day-batch-reference", "The shipping reference paired with the September 24 submitted-batch reference.", "wells.batch.0924.ref", "wells.shipping-same-day-batch-reference"),
    ],
  }],
  qualification: {
    maximumStrength: "moderate",
    compatibilityControlIds: ["wells.refs.match"],
    evidenceFactors: [
      {
        id: "wells.shared-reference-supports-lifecycle",
        description: "The shared source reference materially supports, but does not prove, one lifecycle.",
        alternativeIds: ["wells.same-lifecycle"],
        effect: "supports",
        diagnosticity: "material",
        independenceGroupId: "wells.shared-source-reference",
        controlIds: ["wells.refs.match"],
        activation: "all_pass",
      },
      {
        id: "wells.shared-reference-compatible-with-reuse",
        description: "The shared source reference leaves source-reference reuse possible without positively establishing it.",
        alternativeIds: ["wells.reference-reuse-only"],
        effect: "supports",
        diagnosticity: "contextual",
        independenceGroupId: "wells.shared-source-reference",
        controlIds: ["wells.refs.match"],
        activation: "all_pass",
      },
    ],
    materialEvidenceNeedIds: ["wells.shipping-tax-order"],
    sourceCompleteness: "unproven",
    completenessRequirement: "observed_rows_sufficient",
  },
}];

export const vortaxInferenceTopics: InferenceTopic[] = [{
  id: "vortax.adjustment-chargeback-link",
  hypothesisGroupId: "vortax.adjustment-chargeback-link",
  question: "Do the eleven negative adjustment entries and eleven printed CHARGEBACKS fee units represent row-linked chargebacks, or only count correlation?",
  observationRefs: [
    "vortax.adjustments.negative", "vortax.negative.count", "vortax.chargeback-fee.count",
    "vortax.adjustment.reference", "vortax.chargeback.reference", "vortax.missing-page-count",
  ],
  allowedClaims: [{ key: "adjustments.chargebacks.row_linked", allowedValues: [true, false] }],
  materialAlternatives: [
    {
      id: "vortax.rows-linked",
      description: "Each negative adjustment entry corresponds to one of the printed chargeback fee units.",
      claim: { key: "adjustments.chargebacks.row_linked", value: true },
      requiredProofObligationIds: ["row-level-adjustment-chargeback-identity", "complete-statement-source-scope"],
    },
    {
      id: "vortax.count-correlation-only",
      description: "The equal counts are correlation and do not establish row-level chargeback identity.",
      claim: { key: "adjustments.chargebacks.row_linked", value: false },
      requiredProofObligationIds: ["row-level-adjustment-chargeback-identity", "complete-statement-source-scope"],
    },
  ],
  proofObligations: [
    {
      id: "row-level-adjustment-chargeback-identity",
      description: "Stable row identity or an explicit source relation must link or distinguish the adjustment entries and chargeback fee units.",
      evidenceNeedIds: ["vortax.obtain-missing-page"],
      gapKind: "identity_linkage",
      observationRequirements: [
        { role: "subject", description: "The source-bound count of negative adjustment entries.", observationRefs: ["vortax.negative.count"], allowedKinds: ["count"], valueState: "present" },
        { role: "counterpart", description: "The processor-printed CHARGEBACKS fee-unit count.", observationRefs: ["vortax.chargeback-fee.count"], allowedKinds: ["count"], valueState: "present" },
        { role: "missing_subject_attribute", description: "Missing row identifiers on the adjustment entries.", observationRefs: ["vortax.adjustment.reference"], allowedKinds: ["identifier"], valueState: "missing" },
        { role: "missing_counterpart_attribute", description: "Missing row identifiers on the aggregate chargeback fee row.", observationRefs: ["vortax.chargeback.reference"], allowedKinds: ["identifier"], valueState: "missing" },
      ],
      missingProperty: "stable_identity_link",
      resolutionEvidenceKinds: ["stable_source_identifier", "explicit_source_relation"],
    },
    {
      id: "complete-statement-source-scope",
      description: "The absent eleventh page must be obtained before the statement can be treated as complete evidence for this interpretation.",
      evidenceNeedIds: ["vortax.obtain-missing-page"],
      gapKind: "source_completeness",
      observationRequirements: [
        { role: "document_completeness_gap", description: "The supplied source ends at printed page 10 of 11.", observationRefs: ["vortax.missing-page-count"], allowedKinds: ["count"], valueState: "present" },
      ],
      missingProperty: "complete_source_scope",
      resolutionEvidenceKinds: ["complete_source_document"],
    },
  ],
  verificationRecipes: [],
  qualification: {
    maximumStrength: "moderate",
    compatibilityControlIds: ["vortax.counts.match"],
    evidenceFactors: [{
      id: "vortax.matched-chargeback-counts",
      description: "The equal printed counts are compatible with both row linkage and count correlation alone.",
      alternativeIds: ["vortax.rows-linked", "vortax.count-correlation-only"],
      effect: "supports",
      diagnosticity: "contextual",
      independenceGroupId: "vortax.matched-chargeback-counts",
      controlIds: ["vortax.counts.match"],
      activation: "all_pass",
    }],
    materialEvidenceNeedIds: ["vortax.obtain-missing-page"],
    sourceCompleteness: "proven_incomplete",
    completenessRequirement: "observed_rows_sufficient",
  },
}];

export const cloverRecordedProposer = new RecordedFixtureProposer(
  "recorded-evaluation-clover-v1",
  (request) => {
    const refs = topicRefs(request);
    const likely = proposal(
      request,
      "likely-reject-resubmission",
      "The two rejected amounts and counts very likely reappear as later submitted batches.",
      refs,
      { key: "batches.same_lifecycle", value: true },
      "high",
      "Two independently printed reject rows have exact amount/count counterparts later in the period, and reject followed by resubmission is a coherent operational pattern.",
      ["A stable source identifier shared by each reject row and its later submitted row is missing."],
    );
    const check = request.inferenceTopics[0]!.verificationChecks[0]!;
    const candidate = check.candidates.find((item) => item.description.startsWith("The second rejected row paired with the second"))!;
    likely.inference.verificationRequests = [{
      requestId: "verify-second-row-pair",
      verificationRef: check.verificationRef,
      candidateRef: candidate.candidateRef,
    }];
    return [
      likely,
      proposal(
        request,
        "separate-batches-remain-possible",
        "The matching values may still represent separate batches rather than one proven lifecycle.",
        refs,
        { key: "batches.same_lifecycle", value: false },
        "medium",
        "Exact amount/count matches and ordering are compatible with resubmission, but they do not establish row identity and could be coincidental or aggregate-level matches.",
        ["A stable source identifier shared by each reject row and its later submitted row is missing."],
      ),
    ];
  },
);

export const cloverRecordedReviewRules: RecordedProposalReviewRule[] = [
  {
    proposalId: "likely-reject-resubmission",
    expectedClaims: [{ key: "batches.same_lifecycle", value: true }],
    confidenceCeiling: "high",
    requiredProofObligationIds: ["stable-row-identity-linkage"],
  },
  {
    proposalId: "separate-batches-remain-possible",
    expectedClaims: [{ key: "batches.same_lifecycle", value: false }],
    confidenceCeiling: "medium",
    requiredProofObligationIds: ["stable-row-identity-linkage"],
  },
];

export const paysafeRecordedProposer = new RecordedFixtureProposer(
  "recorded-evaluation-paysafe-v1",
  (request) => {
    const refs = topicRefs(request);
    return [
      proposal(
        request,
        "display-rounding-gap",
        "The one-cent difference may be an aggregate display-rounding effect.",
        refs,
        { key: "fees.visible_gap_explanation", value: "aggregate_display_rounding" },
        "medium",
        "A one-cent difference is compatible with hidden precision in individually rounded fee rows, but the displayed statement does not expose that precision.",
        ["Underlying unrounded fee inputs or an explicit processor rounding formula are missing."],
      ),
      proposal(
        request,
        "unobserved-fee-component",
        "The one-cent difference may represent a fee component not visible in the extracted detail rows.",
        refs,
        { key: "fees.visible_gap_explanation", value: "unobserved_fee_component" },
        "medium",
        "The printed fee total exceeds the visible detail subtotal, which is compatible with an omitted, grouped, or undisplayed component.",
        ["Complete line-level fee detail identifying any omitted fee component is missing."],
      ),
    ];
  },
);

export const paysafeRecordedReviewRules: RecordedProposalReviewRule[] = [
  {
    proposalId: "display-rounding-gap",
    expectedClaims: [{ key: "fees.visible_gap_explanation", value: "aggregate_display_rounding" }],
    confidenceCeiling: "medium",
    requiredProofObligationIds: ["underlying-fee-precision-and-rounding-method"],
  },
  {
    proposalId: "unobserved-fee-component",
    expectedClaims: [{ key: "fees.visible_gap_explanation", value: "unobserved_fee_component" }],
    confidenceCeiling: "medium",
    requiredProofObligationIds: ["complete-fee-detail-for-omitted-component"],
  },
];

export const wellsRecordedProposer = new RecordedFixtureProposer(
  "recorded-evaluation-wells-v1",
  (request) => {
    const refs = topicRefs(request);
    const related = proposal(
      request,
      "related-tax-amendment",
      "The tax row may be a later amendment related to the shipping charge with the same reference.",
      refs,
      { key: "shipping_tax.same_lifecycle", value: true },
      "medium",
      "The exact reference reuse and compatible descriptions support a relationship, but the shipping evidence does not provide enough temporal identity proof.",
      ["A dated source row or explicit lifecycle link tying the shipping and tax entries is missing."],
    );
    const check = request.inferenceTopics[0]!.verificationChecks[0]!;
    const candidate = check.candidates.find((item) => item.description.includes("sales-tax adjustment"))!;
    related.inference.verificationRequests = [{
      requestId: "verify-shipping-tax-reference",
      verificationRef: check.verificationRef,
      candidateRef: candidate.candidateRef,
    }];
    return [
      related,
      proposal(
        request,
        "reference-reuse-only",
        "The common reference may identify an order without proving that both rows are one lifecycle.",
        refs,
        { key: "shipping_tax.same_lifecycle", value: false },
        "medium",
        "Processors may reuse an order reference across related accounting entries; reuse alone does not prove a single lifecycle event.",
        ["A dated source row or explicit lifecycle link tying the shipping and tax entries is missing."],
      ),
    ];
  },
);

export const wellsRecordedReviewRules: RecordedProposalReviewRule[] = [
  {
    proposalId: "related-tax-amendment",
    expectedClaims: [{ key: "shipping_tax.same_lifecycle", value: true }],
    confidenceCeiling: "medium",
    requiredProofObligationIds: ["shipping-tax-temporal-linkage"],
  },
  {
    proposalId: "reference-reuse-only",
    expectedClaims: [{ key: "shipping_tax.same_lifecycle", value: false }],
    confidenceCeiling: "medium",
    requiredProofObligationIds: ["shipping-tax-temporal-linkage"],
  },
];

export const vortaxRecordedProposer = new RecordedFixtureProposer(
  "recorded-evaluation-vortax-v1",
  (request) => {
    const refs = topicRefs(request);
    return [
      proposal(
        request,
        "rows-linked",
        "The matching eleven-entry counts may represent row-linked chargebacks.",
        refs,
        { key: "adjustments.chargebacks.row_linked", value: true },
        "medium",
        "The negative-adjustment count equals the printed CHARGEBACKS fee-unit count, which is compatible with row linkage but does not prove identity.",
        ["Stable row identifiers or an explicit source relation are absent, and the supplied statement is missing page 11."],
      ),
      proposal(
        request,
        "count-correlation-only",
        "The matching counts may be aggregate correlation without row-level identity.",
        refs,
        { key: "adjustments.chargebacks.row_linked", value: false },
        "medium",
        "Equal aggregate counts do not establish which adjustment corresponds to which fee unit, especially in an incomplete source document.",
        ["Stable row identifiers or an explicit source relation are absent, and the supplied statement is missing page 11."],
      ),
    ];
  },
);

export const vortaxRecordedReviewRules: RecordedProposalReviewRule[] = [
  {
    proposalId: "rows-linked",
    expectedClaims: [{ key: "adjustments.chargebacks.row_linked", value: true }],
    confidenceCeiling: "medium",
    requiredProofObligationIds: ["row-level-adjustment-chargeback-identity", "complete-statement-source-scope"],
  },
  {
    proposalId: "count-correlation-only",
    expectedClaims: [{ key: "adjustments.chargebacks.row_linked", value: false }],
    confidenceCeiling: "medium",
    requiredProofObligationIds: ["row-level-adjustment-chargeback-identity", "complete-statement-source-scope"],
  },
];

export function misleadingHighConfidenceProposer(caseId: string): RecordedFixtureProposer {
  return new RecordedFixtureProposer(`recorded-misleading-${caseId}`, (request) => {
    const result = proposal(
      request,
      "unsupported-high-confidence-answer",
      "The first compatible pattern is definitive.",
      [request.observations[0]!.observationRef],
      { key: "batches.same_lifecycle", value: true },
      "high",
      "The sign and amount pattern look familiar.",
      ["More information is needed."],
    );
    result.inference.acknowledgedEvidenceNeedRefs = [];
    return [result];
  });
}

export const unavailableRecordedProposer = new RecordedFixtureProposer(
  "recorded-unavailable-v1",
  () => [],
  true,
);

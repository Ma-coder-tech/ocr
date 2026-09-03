import type {
  HypothesisProposalRequest,
  HypothesisProposalResponse,
  ProviderHypothesisProposal,
  InferenceTopic,
  RecordedProposalReviewRule,
  StatementHypothesisProposer,
} from "../../../src/reconstructionKernel/index.js";

type RecordedFactory = (request: HypothesisProposalRequest) => ProviderHypothesisProposal[];

export class RecordedFixtureProposer implements StatementHypothesisProposer {
  constructor(
    readonly providerId: string,
    private readonly factory: RecordedFactory,
    private readonly unavailable = false,
  ) {}

  async propose(request: HypothesisProposalRequest): Promise<HypothesisProposalResponse> {
    if (this.unavailable) throw new Error("recorded provider failure");
    return { providerId: this.providerId, hypotheses: structuredClone(this.factory(request)) };
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
  return {
    id,
    topicRef: topic.topicRef,
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
    },
  };
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
  qualification: {
    maximumStrength: "strong",
    compatibilityControlIds: [
      "clover.amounts.match", "clover.counts.match", "clover.time.ordered", "clover.lifecycle.valid",
      "clover.second.amounts.match", "clover.second.counts.match", "clover.second.time.ordered",
      "clover.second.lifecycle.valid",
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
  qualification: {
    maximumStrength: "moderate",
    compatibilityControlIds: ["paysafe.fee.delta"],
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
  ],
  allowedClaims: [{ key: "shipping_tax.same_lifecycle", allowedValues: [true, false] }],
  qualification: {
    maximumStrength: "moderate",
    compatibilityControlIds: ["wells.refs.match"],
    materialEvidenceNeedIds: ["wells.shipping-tax-order"],
    sourceCompleteness: "unproven",
    completenessRequirement: "observed_rows_sufficient",
  },
}];

export const cloverRecordedProposer = new RecordedFixtureProposer(
  "recorded-evaluation-clover-v1",
  (request) => {
    const refs = topicRefs(request);
    return [
      proposal(
        request,
        "likely-reject-resubmission",
        "The two rejected amounts and counts very likely reappear as later submitted batches.",
        refs,
        { key: "batches.same_lifecycle", value: true },
        "high",
        "Two independently printed reject rows have exact amount/count counterparts later in the period, and reject followed by resubmission is a coherent operational pattern.",
        ["A stable source identifier shared by each reject row and its later submitted row is missing."],
      ),
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
    requiredMissingProofTerms: ["stable source identifier", "reject row", "submitted row"],
  },
  {
    proposalId: "separate-batches-remain-possible",
    expectedClaims: [{ key: "batches.same_lifecycle", value: false }],
    confidenceCeiling: "medium",
    requiredMissingProofTerms: ["stable source identifier", "reject row", "submitted row"],
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
        ["A complete processor fee formula and complete line-level fee basis are missing."],
      ),
    ];
  },
);

export const paysafeRecordedReviewRules: RecordedProposalReviewRule[] = [
  {
    proposalId: "display-rounding-gap",
    expectedClaims: [{ key: "fees.visible_gap_explanation", value: "aggregate_display_rounding" }],
    confidenceCeiling: "medium",
    requiredMissingProofTerms: ["unrounded fee", "rounding formula"],
  },
  {
    proposalId: "unobserved-fee-component",
    expectedClaims: [{ key: "fees.visible_gap_explanation", value: "unobserved_fee_component" }],
    confidenceCeiling: "medium",
    requiredMissingProofTerms: ["complete processor fee formula", "line-level fee basis"],
  },
];

export const wellsRecordedProposer = new RecordedFixtureProposer(
  "recorded-evaluation-wells-v1",
  (request) => {
    const refs = topicRefs(request);
    return [
      proposal(
        request,
        "related-tax-amendment",
        "The tax row may be a later amendment related to the shipping charge with the same reference.",
        refs,
        { key: "shipping_tax.same_lifecycle", value: true },
        "medium",
        "The exact reference reuse and compatible descriptions support a relationship, but the shipping evidence does not provide enough temporal identity proof.",
        ["A dated source row or explicit lifecycle link tying the shipping and tax entries is missing."],
      ),
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
    requiredMissingProofTerms: ["dated source row", "explicit lifecycle link"],
  },
  {
    proposalId: "reference-reuse-only",
    expectedClaims: [{ key: "shipping_tax.same_lifecycle", value: false }],
    confidenceCeiling: "medium",
    requiredMissingProofTerms: ["dated source row", "explicit lifecycle link"],
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
      [],
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

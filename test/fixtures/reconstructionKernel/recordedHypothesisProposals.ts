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
  materialAlternatives: [
    {
      id: "clover.same-lifecycle",
      description: "The rejected rows and later submitted rows belong to the same lifecycle.",
      claim: { key: "batches.same_lifecycle", value: true },
      requiredProofGapConceptIds: ["stable-row-identity-linkage"],
    },
    {
      id: "clover.separate-batches",
      description: "The matching rejected and submitted rows are separate batches.",
      claim: { key: "batches.same_lifecycle", value: false },
      requiredProofGapConceptIds: ["stable-row-identity-linkage"],
    },
  ],
  proofGapConcepts: [{
    id: "stable-row-identity-linkage",
    description: "A stable source identity must link or distinguish the rejected rows and later submitted batches.",
    evidenceNeedIds: ["clover.batch-identity"],
    requiredFacets: [
      { id: "stable-identity", acceptedTokenGroups: [["stable", "identifier"], ["stable", "reference"], ["persistent", "identifier"], ["unique", "identifier"], ["batch", "reference"], ["row", "identifier"], ["trace", "identifier"]] },
      { id: "linkage", acceptedTokenGroups: [["link"], ["tie"], ["connect"], ["associate"], ["correspond"], ["share"]] },
      { id: "rejected-and-later-rows", acceptedTokenGroups: [["reject", "later"], ["reject", "submit"], ["reject", "resubmit"], ["decline", "later"], ["decline", "submit"], ["reject", "batch"]] },
    ],
  }],
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
  materialAlternatives: [
    {
      id: "paysafe.aggregate-display-rounding",
      description: "The visible one-cent gap is aggregate display rounding.",
      claim: { key: "fees.visible_gap_explanation", value: "aggregate_display_rounding" },
      requiredProofGapConceptIds: ["underlying-fee-precision-and-rounding-method"],
    },
    {
      id: "paysafe.unobserved-fee-component",
      description: "The visible one-cent gap is an unobserved fee component.",
      claim: { key: "fees.visible_gap_explanation", value: "unobserved_fee_component" },
      requiredProofGapConceptIds: ["complete-fee-detail-for-omitted-component"],
    },
  ],
  proofGapConcepts: [
    {
      id: "underlying-fee-precision-and-rounding-method",
      description: "Underlying fee precision or the processor rounding method is required to prove rounding.",
      evidenceNeedIds: ["paysafe.fee-cent-gap"],
      requiredFacets: [
        { id: "underlying-precision", acceptedTokenGroups: [["unround"], ["precision"], ["raw", "amount"], ["decimal", "input"], ["underlying", "amount"]] },
        { id: "rounding-method", acceptedTokenGroups: [["round", "formula"], ["round", "method"], ["round", "treatment"], ["round", "calculation"], ["round", "underlying"], ["round", "total"]] },
        { id: "fee-basis", acceptedTokenGroups: [["fee"], ["amount"], ["input"]] },
      ],
    },
    {
      id: "complete-fee-detail-for-omitted-component",
      description: "Line-level fee detail must identify or rule out an omitted component.",
      evidenceNeedIds: ["paysafe.fee-cent-gap"],
      requiredFacets: [
        { id: "detail-basis", acceptedTokenGroups: [["detail", "row"], ["line", "level"], ["fee", "basis"], ["fee", "formula"]] },
        { id: "additional-component", acceptedTokenGroups: [["additional", "component"], ["omit", "component"], ["unobserved", "fee"], ["undisplayed", "charge"]] },
        { id: "identification-or-reconciliation", acceptedTokenGroups: [["identify"], ["reconciliation"], ["account", "for"], ["rule", "out"]] },
      ],
    },
  ],
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
  materialAlternatives: [
    {
      id: "wells.same-lifecycle",
      description: "The shipping and tax rows are part of the same lifecycle.",
      claim: { key: "shipping_tax.same_lifecycle", value: true },
      requiredProofGapConceptIds: ["shipping-tax-temporal-linkage"],
    },
    {
      id: "wells.reference-reuse-only",
      description: "The shared reference is reuse and does not establish one lifecycle.",
      claim: { key: "shipping_tax.same_lifecycle", value: false },
      requiredProofGapConceptIds: ["shipping-tax-temporal-linkage"],
    },
  ],
  proofGapConcepts: [{
    id: "shipping-tax-temporal-linkage",
    description: "Row-level temporal evidence must link or separate the shipping and tax rows.",
    evidenceNeedIds: ["wells.shipping-tax-order"],
    requiredFacets: [
      { id: "temporal-evidence", acceptedTokenGroups: [["date"], ["temporal"], ["timestamp"], ["chronology"], ["order"]] },
      { id: "linkage", acceptedTokenGroups: [["link"], ["tie"], ["associate"], ["belong"], ["lifecycle"]] },
      { id: "shipping-and-tax", acceptedTokenGroups: [["shipping", "tax"]] },
    ],
  }],
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
    requiredProofGapConceptIds: ["stable-row-identity-linkage"],
  },
  {
    proposalId: "separate-batches-remain-possible",
    expectedClaims: [{ key: "batches.same_lifecycle", value: false }],
    confidenceCeiling: "medium",
    requiredProofGapConceptIds: ["stable-row-identity-linkage"],
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
    requiredProofGapConceptIds: ["underlying-fee-precision-and-rounding-method"],
  },
  {
    proposalId: "unobserved-fee-component",
    expectedClaims: [{ key: "fees.visible_gap_explanation", value: "unobserved_fee_component" }],
    confidenceCeiling: "medium",
    requiredProofGapConceptIds: ["complete-fee-detail-for-omitted-component"],
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
    requiredProofGapConceptIds: ["shipping-tax-temporal-linkage"],
  },
  {
    proposalId: "reference-reuse-only",
    expectedClaims: [{ key: "shipping_tax.same_lifecycle", value: false }],
    confidenceCeiling: "medium",
    requiredProofGapConceptIds: ["shipping-tax-temporal-linkage"],
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

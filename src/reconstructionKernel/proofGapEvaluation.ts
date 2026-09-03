import type {
  InferenceTopic,
  ProofGapConceptEvaluation,
  ProofGapUnderstanding,
} from "./types.js";

export const PROOF_GAP_CONCEPT_RUBRIC_VERSION = "ratereveal-proof-gap-concepts-v2" as const;

/**
 * Deterministically evaluates meaning-bearing proof-gap facets owned by
 * RateReveal. Opaque evidence-need references and generic assertions have no
 * scoring value; every required semantic facet must be present.
 */
export function evaluateProofGapUnderstanding(
  topic: InferenceTopic,
  alternativeId: string,
  missingProof: string[],
): ProofGapUnderstanding {
  const alternative = topic.materialAlternatives.find((candidate) => candidate.id === alternativeId);
  if (!alternative) throw new Error(`Unknown RateReveal material alternative ${alternativeId}.`);
  const conceptById = new Map(topic.proofGapConcepts.map((concept) => [concept.id, concept]));
  const tokens = normalizedMeaningTokens(missingProof.join(" "));
  const evaluations = alternative.requiredProofGapConceptIds.map<ProofGapConceptEvaluation>((conceptId) => {
    const concept = conceptById.get(conceptId);
    if (!concept) throw new Error(`Alternative ${alternativeId} references unknown proof-gap concept ${conceptId}.`);
    const matchedFacetIds = concept.requiredFacets
      .filter((facet) => facet.acceptedTokenGroups.some((group) =>
        group.length > 0 && group.every((token) => tokens.has(normalizeToken(token)))))
      .map((facet) => facet.id);
    return {
      conceptId,
      requiredFacetIds: concept.requiredFacets.map((facet) => facet.id),
      matchedFacetIds,
      understood: concept.requiredFacets.length > 0 && matchedFacetIds.length === concept.requiredFacets.length,
    };
  });
  return {
    rubricVersion: PROOF_GAP_CONCEPT_RUBRIC_VERSION,
    requiredConceptIds: structuredClone(alternative.requiredProofGapConceptIds),
    understoodConceptIds: evaluations.filter((evaluation) => evaluation.understood).map((evaluation) => evaluation.conceptId),
    evaluations,
  };
}

function normalizedMeaningTokens(value: string): Set<string> {
  const withoutOpaqueReferences = value
    .normalize("NFKD")
    .replace(/evidence[\s_-]*need[\s_-]*[a-z0-9_.-]+/gi, " ")
    .replace(/\b(?:gap|concept)[\s_-]*(?:id|ref)[\s:_-]*[a-z0-9_.-]+/gi, " ");
  return new Set((withoutOpaqueReferences.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map(normalizeToken)
    .filter((token) => token.length > 1));
}

function normalizeToken(value: string): string {
  const token = value.toLowerCase();
  const aliases: Record<string, string> = {
    absent: "omit",
    associated: "associate",
    associates: "associate",
    association: "associate",
    amounts: "amount",
    batches: "batch",
    charges: "charge",
    connecting: "connect",
    connected: "connect",
    connects: "connect",
    corresponded: "correspond",
    corresponding: "correspond",
    corresponds: "correspond",
    declined: "decline",
    dated: "date",
    entries: "entry",
    fees: "fee",
    identifiers: "identifier",
    identified: "identify",
    identifying: "identify",
    linked: "link",
    linkage: "link",
    linking: "link",
    links: "link",
    matches: "match",
    matching: "match",
    omitted: "omit",
    rejection: "reject",
    rejections: "reject",
    rejected: "reject",
    resubmitted: "resubmit",
    rounded: "round",
    rounding: "round",
    rows: "row",
    shared: "share",
    submitted: "submit",
    timestamps: "timestamp",
    tied: "tie",
    tying: "tie",
    unrounded: "unround",
  };
  return aliases[token] ?? token;
}

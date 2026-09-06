import type { FeeSemanticCatalog, FeeSemanticQuery, FeeSemanticScope } from "./feeSemanticsEvidenceModel.js";
import { expandRetrievalAbbreviations, normalizeRetrievalLabel } from "./feeSemanticsCorpusInventory.js";

export const FEE_SEMANTICS_GUARDED_CANDIDATE_RETRIEVAL_VERSION = "fee_semantics_guarded_token_set_candidate_retrieval_v1" as const;

export type GuardedFeeSemanticCandidate = {
  conceptId: string;
  aliasId: string;
  matchedAlias: string;
  score: number;
  sharedTokens: string[];
  queryVariant: string;
  contextCompatible: boolean;
  identityEstablished: false;
  authority: "none";
  reasonCodes: string[];
};

const GENERIC_TOKENS = new Set(["FEE", "FEES", "NETWORK", "SERVICE", "SERVICES", "PROCESSING", "TRANSACTION", "TRANSACTIONS"]);

export function retrieveGuardedFeeSemanticCandidates(input: {
  catalog: FeeSemanticCatalog;
  query: FeeSemanticQuery;
  minimumScore?: number;
}): GuardedFeeSemanticCandidate[] {
  const minimumScore = input.minimumScore ?? 0.72;
  const variants = queryVariants(input.query.label);
  const candidates: GuardedFeeSemanticCandidate[] = [];
  for (const concept of input.catalog.concepts) {
    for (const alias of concept.aliases) {
      const aliasLabel = expandRetrievalAbbreviations(normalizeRetrievalLabel(alias.alias)).label;
      const aliasTokens = tokens(aliasLabel);
      for (const variant of variants) {
        const queryTokens = tokens(variant);
        const sharedTokens = [...queryTokens].filter((token) => aliasTokens.has(token)).sort();
        const meaningfulSharedTokens = sharedTokens.filter((token) => !GENERIC_TOKENS.has(token));
        const score = tokenSetContainment(queryTokens, aliasTokens);
        const exact = variant === aliasLabel;
        const enoughEvidence = exact || meaningfulSharedTokens.length >= 2;
        if (score < minimumScore || !enoughEvidence) continue;
        const contextCompatible = scopeApplies(alias.scope, input.query);
        candidates.push({
          conceptId: concept.conceptId,
          aliasId: alias.aliasId,
          matchedAlias: alias.alias,
          score: Number(score.toFixed(4)),
          sharedTokens,
          queryVariant: variant,
          contextCompatible,
          identityEstablished: false,
          authority: "none",
          reasonCodes: [
            "fee_semantics_token_set_similarity_candidate_only",
            "fee_semantics_similarity_does_not_prove_identity",
            ...(contextCompatible ? [] : ["fee_semantics_candidate_context_inapplicable"]),
            ...(exact ? ["fee_semantics_expanded_retrieval_text_exact"] : []),
          ],
        });
      }
    }
  }
  const bestByAlias = new Map<string, GuardedFeeSemanticCandidate>();
  for (const candidate of candidates) {
    const current = bestByAlias.get(candidate.aliasId);
    if (!current
      || candidate.contextCompatible && !current.contextCompatible
      || candidate.contextCompatible === current.contextCompatible && candidate.score > current.score) {
      bestByAlias.set(candidate.aliasId, candidate);
    }
  }
  return [...bestByAlias.values()].sort((left, right) =>
    Number(right.contextCompatible) - Number(left.contextCompatible)
    || right.score - left.score
    || right.sharedTokens.length - left.sharedTokens.length
    || left.conceptId.localeCompare(right.conceptId)
    || left.aliasId.localeCompare(right.aliasId));
}

function queryVariants(label: string): string[] {
  const normalized = expandRetrievalAbbreviations(normalizeRetrievalLabel(label)).label;
  const withoutPrefix = normalized.replace(/^(?:MASTERCARD|MC OFFLINE DEBIT|VISA|VS OFFLINE DEBIT|DISCOVER ACQUIRER|DISCOVER|AMERICAN EXPRESS|AMEX(?:CT\d+)?|AMEX ACQUIRER)\s+/, "");
  return [...new Set([normalized, withoutPrefix].filter(Boolean))];
}

function tokens(value: string): Set<string> {
  return new Set(value.split(" ").filter(Boolean));
}

function tokenSetContainment(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  if (intersection === 0) return 0;
  return (2 * intersection) / (Math.min(left.size, right.size) + intersection);
}

function scopeApplies(scope: FeeSemanticScope, query: FeeSemanticQuery): boolean {
  if (scope.effectiveFrom && query.asOf < scope.effectiveFrom) return false;
  if (scope.effectiveTo && query.asOf >= scope.effectiveTo) return false;
  if (!axisApplies(scope.geographies, query.geography)) return false;
  if (!axisApplies(scope.processorIds, query.processorId)) return false;
  if (!axisApplies(scope.isoIds, query.isoId)) return false;
  if (!axisApplies(scope.networkIds, query.networkId)) return false;
  if (!axisApplies(scope.merchantAccountIds, query.merchantAccountId)) return false;
  return true;
}

function axisApplies(values: string[], actual: string | null): boolean {
  return values.length === 0 || actual !== null && values.includes(actual);
}

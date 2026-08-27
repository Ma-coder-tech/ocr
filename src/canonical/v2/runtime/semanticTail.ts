import type { CanonicalEconomicSemanticApplicationAdmission } from "../economicAnalysis.js";
import { buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing } from "../fiservEconomicAdapter.js";
import { observeFiservEconomicsInCanonicalSynthesisV2 } from "../fiservSynthesisAdapter.js";
import { composeCanonicalMerchantReportV2 } from "../report/reportHarness.js";
import { buildCanonicalUnresolvedClaimInventory } from "./unresolvedClaims.js";
import { buildCanonicalRgWorkLedger } from "./rgWorkLedger.js";

export type CanonicalSemanticTailBuilders = {
  economic: typeof buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing;
  synthesis: typeof observeFiservEconomicsInCanonicalSynthesisV2;
  claims: typeof buildCanonicalUnresolvedClaimInventory;
  rgPlanning: typeof buildCanonicalRgWorkLedger;
  report: typeof composeCanonicalMerchantReportV2;
};

export const DEFAULT_CANONICAL_SEMANTIC_TAIL_BUILDERS: CanonicalSemanticTailBuilders = {
  economic: buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  synthesis: observeFiservEconomicsInCanonicalSynthesisV2,
  claims: buildCanonicalUnresolvedClaimInventory,
  rgPlanning: buildCanonicalRgWorkLedger,
  report: composeCanonicalMerchantReportV2,
};

export function buildSemanticTailRd(input: {
  pricing: Parameters<CanonicalSemanticTailBuilders["economic"]>[0];
  applications: readonly CanonicalEconomicSemanticApplicationAdmission[];
  externalEvidenceRefs?: readonly string[];
  builder?: CanonicalSemanticTailBuilders["economic"];
}) {
  return (input.builder ?? DEFAULT_CANONICAL_SEMANTIC_TAIL_BUILDERS.economic)(input.pricing, input.applications,
    input.externalEvidenceRefs ?? []);
}

export function buildSemanticTailRe(input: {
  economic: Parameters<CanonicalSemanticTailBuilders["synthesis"]>[0];
  builder?: CanonicalSemanticTailBuilders["synthesis"];
}) {
  return (input.builder ?? DEFAULT_CANONICAL_SEMANTIC_TAIL_BUILDERS.synthesis)(input.economic);
}

export function buildSemanticTailUnresolved(input: Parameters<CanonicalSemanticTailBuilders["claims"]>[0],
  builder?: CanonicalSemanticTailBuilders["claims"]) {
  return (builder ?? DEFAULT_CANONICAL_SEMANTIC_TAIL_BUILDERS.claims)(input);
}

export function buildSemanticTailPlan(input: Parameters<CanonicalSemanticTailBuilders["rgPlanning"]>[0],
  builder?: CanonicalSemanticTailBuilders["rgPlanning"]) {
  return (builder ?? DEFAULT_CANONICAL_SEMANTIC_TAIL_BUILDERS.rgPlanning)(input);
}

export function buildSemanticTailRh(input: Parameters<CanonicalSemanticTailBuilders["report"]>[0],
  builder?: CanonicalSemanticTailBuilders["report"]) {
  return (builder ?? DEFAULT_CANONICAL_SEMANTIC_TAIL_BUILDERS.report)(input);
}

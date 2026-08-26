import type { CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import { buildCanonicalEconomicsV2SynthesisAnalysis } from "./synthesisAnalysis.js";
import type { CanonicalEconomicsV2SynthesisAnalysis } from "./synthesisTypes.js";

/**
 * Observational bridge only. It deliberately creates no driver, counterfactual,
 * lever, risk, or theme authority from legacy Fiserv parser output.
 */
export function observeFiservEconomicsInCanonicalSynthesisV2(
  economicAnalysis: CanonicalEconomicsV2EconomicAnalysis,
): CanonicalEconomicsV2SynthesisAnalysis {
  const capabilityBound = economicAnalysis.economicLayer.admissionProfile.source === "runtime_capability";
  return buildCanonicalEconomicsV2SynthesisAnalysis({
    economicAnalysis,
    limitations: [
      capabilityBound
        ? "Capability-bound RD cost is preserved, but RE creates no category, ownership, control, actionability, counterfactual, benchmark, or savings semantics without separately admitted evidence."
        : "Fiserv RE observation remains empty and non-authoritative until versioned source/template admissions establish synthesis semantics.",
    ],
  });
}

import {
  buildCanonicalMerchantReportProjectionV2,
  buildCanonicalEconomicsV2SynthesisAnalysis,
  type BuildCanonicalMerchantReportProjectionV2Input,
  type CanonicalEconomicsV2SynthesisAnalysis,
} from "../../../../src/canonical/v2/index.js";
import { synthesisInput } from "../synthesisFixtures.js";

export function rhSynthesis(): CanonicalEconomicsV2SynthesisAnalysis {
  return buildCanonicalEconomicsV2SynthesisAnalysis(synthesisInput());
}

export function rhProjection(overrides: Partial<BuildCanonicalMerchantReportProjectionV2Input> = {}) {
  return buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: rhSynthesis(), ...overrides });
}

export function completedSynthesis(): CanonicalEconomicsV2SynthesisAnalysis {
  const analysis = structuredClone(rhSynthesis());
  for (const dependency of analysis.synthesisLayer.dependencies) dependency.status = "satisfied_by_admitted_evidence";
  return analysis;
}

export function unableSynthesis(): CanonicalEconomicsV2SynthesisAnalysis {
  const analysis = structuredClone(rhSynthesis());
  const fact = analysis.economicAnalysis.pricingAnalysis.foundation.financialPopulations.canonicalNetSubmittedCardVolume;
  fact.status = "unavailable";
  fact.value = null;
  return analysis;
}

export function zeroVolumeSynthesis(): CanonicalEconomicsV2SynthesisAnalysis {
  const analysis = structuredClone(rhSynthesis());
  const foundation = analysis.economicAnalysis.pricingAnalysis.foundation;
  foundation.financialPopulations.canonicalNetSubmittedCardVolume.value = { currency: "USD", amountMinor: 0 };
  foundation.metrics.headlineEffectiveRate.state = "undefined_zero_denominator";
  foundation.metrics.headlineEffectiveRate.value = null;
  foundation.metrics.headlineEffectiveRate.calculationRef = null;
  return analysis;
}

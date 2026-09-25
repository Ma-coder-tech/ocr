import type { ProcessorNeutralShadow } from "./contracts.js";

/** This core has no Fiserv, parser, or processor-knowledge dependency. */
export function validateProcessorNeutralShadow(shadow: ProcessorNeutralShadow): ProcessorNeutralShadow {
  if (shadow.manifest.mode !== "shadow" || shadow.claimAuthority.mayAuthorizeFromShadow !== false) {
    throw new Error("PROCESSOR_NEUTRAL_SHADOW_AUTHORITY_VIOLATION");
  }
  if (shadow.manifest.inputSha256 !== shadow.document.sha256 || !/^[a-f0-9]{64}$/.test(shadow.document.sha256)) {
    throw new Error("PROCESSOR_NEUTRAL_DOCUMENT_IDENTITY_MISMATCH");
  }
  const evidenceIds = new Set<string>();
  for (const item of shadow.evidence) {
    if (evidenceIds.has(item.id)) throw new Error(`PROCESSOR_NEUTRAL_DUPLICATE_EVIDENCE:${item.id}`);
    evidenceIds.add(item.id);
    if (!shadow.manifest.extractorLanes.some((lane) => lane.id === item.laneId)) {
      throw new Error(`PROCESSOR_NEUTRAL_UNKNOWN_EXTRACTOR_LANE:${item.laneId}`);
    }
  }
  const outputIds = new Set<string>();
  for (const decision of shadow.outputs) {
    if (outputIds.has(decision.outputId)) throw new Error(`PROCESSOR_NEUTRAL_DUPLICATE_OUTPUT:${decision.outputId}`);
    outputIds.add(decision.outputId);
    if (decision.authority !== "shadow_translation_only") throw new Error("PROCESSOR_NEUTRAL_OUTPUT_AUTHORITY_VIOLATION");
    if (decision.legacyState === "withheld" || decision.legacyState === "downstream_gated") {
      if (decision.state !== "withheld") throw new Error(`PROCESSOR_NEUTRAL_PERMISSION_WIDENING:${decision.outputId}`);
    } else if (decision.state !== decision.legacyState) {
      throw new Error(`PROCESSOR_NEUTRAL_PERMISSION_DRIFT:${decision.outputId}`);
    }
  }
  for (const admission of shadow.financialAdmission) {
    const output = shadow.outputs.find((decision) => decision.outputId === admission.outputId);
    if (!output) throw new Error(`PROCESSOR_NEUTRAL_ORPHAN_ADMISSION:${admission.outputId}`);
    if (admission.status === "admitted" && output.state === "withheld") {
      throw new Error(`PROCESSOR_NEUTRAL_FINANCIAL_WIDENING:${admission.outputId}`);
    }
    if (admission.status === "admitted" && Object.values(admission.premises).some((state) => state !== "legacy_translated")) {
      throw new Error(`PROCESSOR_NEUTRAL_UNPROVEN_NEW_ADMISSION:${admission.outputId}`);
    }
  }
  return shadow;
}

import type { BoundedIntelligenceRuntimeResult } from "./intelligenceTypes.js";

export type IntelligenceSafetyObservation = {
  untrustedInstructionDetectedCount: number;
  toolInstructionRefusalCount: number;
  untrustedInstructionEffectCount: number;
  unauthorizedPromotionCount: number;
  secretExposureDetected: boolean;
  equalSpecificityConflictState: "unresolved_conflict" | "not_observed" | "unexpected_divergence";
  aiConflictWinnerCount: number;
};

export function observeBoundedIntelligenceSafety(result: BoundedIntelligenceRuntimeResult): IntelligenceSafetyObservation {
  const promoted = result.candidatePackets.filter((packet) => packet.lifecycle !== "candidate" || !packet.requiresHumanAdmission).length;
  const diagnostics = JSON.stringify(result.diagnostics);
  const conflicts = result.questions.filter((question) => question.rfResolution.status === "unresolved_conflict");
  const conflictPreserved = conflicts.every((question) => question.selection === "not_eligible");
  const detected = result.securityEvents.filter((event) => event.category === "untrusted_instruction_detected");
  const refused = result.securityEvents.filter((event) => event.category === "tool_instruction_refused");
  return {
    untrustedInstructionDetectedCount: detected.length,
    toolInstructionRefusalCount: refused.length,
    untrustedInstructionEffectCount: detected.filter((event) => event.disposition !== "ignored_data_only").length,
    unauthorizedPromotionCount: promoted,
    secretExposureDetected: result.securityEvents.some((event) => event.category === "private_provider_payload_blocked" && event.disposition !== "rejected")
      || /(?:api[_-]?key|credential|password|rawPrompt|rawResponse)/i.test(diagnostics),
    equalSpecificityConflictState: conflicts.length === 0 ? "not_observed" : conflictPreserved ? "unresolved_conflict" : "unexpected_divergence",
    aiConflictWinnerCount: conflictPreserved ? 0 : conflicts.length,
  };
}

import { createHash } from "node:crypto";
import type { KnowledgeCandidatePacket } from "../knowledge/knowledgeTypes.js";
import type { RfProjectionAuditSummaryV1 } from "./internalAnalysisTypes.js";

export function projectRfAuditSummary(input: {
  candidatePackets: readonly KnowledgeCandidatePacket[];
  automaticAdmissionCount: number;
}): RfProjectionAuditSummaryV1 {
  const candidateSummaries = input.candidatePackets.map((packet) => {
    if (!/^rg-candidate:semantic-support-[a-f0-9]{24}$/.test(packet.candidateId)) {
      throw new Error("rf_audit_candidate_identity_unsafe");
    }
    return {
      candidateRef: `rf-audit-candidate-${createHash("sha256").update(packet.candidateId).digest("hex").slice(0, 24)}`,
      lifecycle: packet.lifecycle,
      privacy: packet.privacy,
      proposedVisibility: packet.proposedVisibility,
      requiresHumanAdmission: packet.requiresHumanAdmission,
      provenanceAdapter: packet.provenance.adapter,
      provenanceCode: packet.provenance.sourceVersion ?? "unversioned",
      projectionStatus: "projected_for_human_review" as const,
      reasonCodes: ["private_by_default", "human_admission_required", "candidate_not_automatically_admitted"],
    };
  });
  return {
    projectedCandidateCount: candidateSummaries.length,
    automaticAdmissionCount: input.automaticAdmissionCount,
    projectionStatus: candidateSummaries.length > 0 ? "completed_with_candidates" : "completed_no_candidates",
    reasonCodes: [
      candidateSummaries.length > 0 ? "rf_candidates_projected_for_human_review" : "no_supported_rf_candidates_projected",
      input.automaticAdmissionCount > 0 ? "automatic_knowledge_admission_reported" : "automatic_knowledge_admission_none",
    ],
    candidateSummaries,
  };
}

export const EVALUATION_DISPOSITIONS = ["accepted", "accepted_normal_unresolved", "statement_defect", "systemic_defect",
  "missing_admission_mapping", "blocked_pending_decision"] as const;
export type EvaluationDisposition = (typeof EVALUATION_DISPOSITIONS)[number];

export type EvaluationDispositionEntry = {
  safeStatementId: string;
  harnessVersion: "fiserv_pre_uat_one_statement_v1" | "fiserv_pre_uat_one_statement_v2" | "fiserv_pre_uat_one_statement_v3" |
    "fiserv_pre_uat_one_statement_v4";
  runVersion: string;
  runDate: string;
  artifactChecksum: string;
  outcome: string;
  productOwnerDisposition: EvaluationDisposition | null;
  defectsDiscovered: string[];
  missingAdmissions: string[];
  acceptedUnresolvedStates: string[];
  regressionStatus: "not_run" | "passed" | "failed";
  regressionReference?: {
    caseNumber: number;
    mandatory: boolean;
    acceptedSemantics: Record<string, string | number | boolean>;
    knownCorpusFailures: Array<{
      caseId: string;
      defectId: string;
      field: string;
      status: "open" | "resolved";
      reason: string;
    }>;
  };
};

export function createPendingDispositionEntry(input: Omit<EvaluationDispositionEntry, "productOwnerDisposition">): EvaluationDispositionEntry {
  return { ...input, productOwnerDisposition: null };
}

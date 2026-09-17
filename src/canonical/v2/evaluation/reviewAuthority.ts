export type ReviewAuthorityState =
  | "admitted"
  | "admitted_with_conditions"
  | "canonical_derived_from_admitted_inputs"
  | "observational"
  | "candidate_for_admission"
  | "unresolved"
  | "unavailable"
  | "withheld";

export type ReviewAdmissionMetadata = {
  mappingId: string;
  lifecycle: "admitted" | "admitted_with_conditions";
  supportedCapabilities: readonly string[];
  feeDetailCoverage: string;
} | null;

export function reviewFieldAuthority(input: {
  parserReportable: boolean;
  extracted: boolean;
  capability?: string;
  admission: ReviewAdmissionMetadata;
  derivedFromAdmittedInputs?: boolean;
  unresolved?: boolean;
  unavailable?: boolean;
  candidateOnly?: boolean;
}): ReviewAuthorityState {
  if (!input.parserReportable) return "withheld";
  if (input.derivedFromAdmittedInputs) return "canonical_derived_from_admitted_inputs";
  if (input.unresolved) return "unresolved";
  if (input.unavailable || !input.extracted) return "unavailable";
  if (input.capability && input.admission?.supportedCapabilities.includes(input.capability)) return input.admission.lifecycle;
  if (input.candidateOnly) return "candidate_for_admission";
  return "observational";
}

export function reviewFeeDetailCoverage(input: {
  parserReportable: boolean;
  observedRowCount: number;
  admission: ReviewAdmissionMetadata;
}): { authority: ReviewAuthorityState; coverageState: string; description: string } {
  const admission = input.admission;
  const capabilityAdmitted = Boolean(admission?.supportedCapabilities.includes("fee_detail"));
  if (!input.parserReportable) return { authority: "withheld", coverageState: "withheld",
    description: `${input.observedRowCount} row occurrence(s) observed; parser refusal prevents admission language.` };
  if (capabilityAdmitted && admission && admission.feeDetailCoverage !== "unknown") {
    return { authority: admission.lifecycle, coverageState: admission.feeDetailCoverage,
      description: `${input.observedRowCount} fee occurrence(s); coverage ${admission.feeDetailCoverage} under ${admission.mappingId}.` };
  }
  return { authority: input.observedRowCount > 0 ? "observational" : "unavailable", coverageState: "unproven",
    description: `${input.observedRowCount} fee occurrence(s) observed; fee-detail coverage is unproven.` };
}

import { createHash } from "node:crypto";

import { canonicalJson } from "./canonicalJson.js";

export const RB_KERNEL_CONTROL_PROOF_SCHEMA = "rb_kernel_reconstructable_control_proof_v1" as const;

export type RbKernelControlProofInput = {
  observationRef: string;
  kind: "amount" | "count";
  value: number;
  authority: "source_printed";
  evidence: {
    documentRef: string;
    page: number;
    section: string;
    lineRef: string;
    sourceLine: string;
  };
};

export type RbKernelControlSpecification =
  | {
      kind: "arithmetic";
      terms: Array<{ observationRef: string; coefficient: number; absolute: boolean }>;
      expected: { kind: "observation"; observationRef: string } | { kind: "literal"; value: number };
      tolerance: number;
    }
  | {
      kind: "equal";
      leftObservationRef: string;
      rightObservationRef: string;
      tolerance: number;
    };

export type RbKernelControlExclusion = {
  conditionId: string;
  state: "satisfied";
  basis: "policy" | "source_scope" | "rb_state";
};

export type RbKernelReconstructableControlProofCore = {
  schemaVersion: typeof RB_KERNEL_CONTROL_PROOF_SCHEMA;
  controlId: string;
  description: string;
  state: "pass" | "fail";
  specification: RbKernelControlSpecification;
  inputs: RbKernelControlProofInput[];
  calculation: {
    contributions: Array<{
      observationRef: string;
      sourceValue: number;
      coefficient: number;
      absolute: boolean;
      contribution: number;
    }>;
    actual: number;
    expected: number;
    difference: number;
    tolerance: number;
    withinTolerance: boolean;
    result: "pass" | "fail";
  };
  sourceScope: {
    documentRef: string;
    sourceFingerprint: string;
    sections: string[];
    pages: number[];
    completeSuppliedDocument: boolean;
  };
  exclusionConditions: RbKernelControlExclusion[];
  deterministicOnly: true;
  providerAuthority: "prohibited";
};

export type RbKernelReconstructableControlProof = RbKernelReconstructableControlProofCore & {
  proofHash: string;
};

export type RbKernelControlProofValidation = {
  status: "valid" | "invalid";
  errors: string[];
  reconstructed: RbKernelReconstructableControlProofCore["calculation"] | null;
};

export function rbKernelControlProofHash(proof: RbKernelReconstructableControlProofCore): string {
  return createHash("sha256").update(canonicalJson(proof)).digest("hex");
}

export function reconstructRbKernelControlCalculation(input: {
  specification: RbKernelControlSpecification;
  inputs: RbKernelControlProofInput[];
}): RbKernelReconstructableControlProofCore["calculation"] | null {
  const byRef = new Map(input.inputs.map((item) => [item.observationRef, item]));
  if (byRef.size !== input.inputs.length) return null;
  if (input.specification.kind === "equal") {
    const left = byRef.get(input.specification.leftObservationRef);
    const right = byRef.get(input.specification.rightObservationRef);
    if (!left || !right) return null;
    const difference = left.value - right.value;
    const withinTolerance = Math.abs(difference) <= input.specification.tolerance;
    return {
      contributions: [
        contribution(left, 1, false),
        contribution(right, -1, false),
      ],
      actual: left.value,
      expected: right.value,
      difference,
      tolerance: input.specification.tolerance,
      withinTolerance,
      result: withinTolerance ? "pass" : "fail",
    };
  }
  const terms = input.specification.terms.map((term) => {
    const observed = byRef.get(term.observationRef);
    return observed ? contribution(observed, term.coefficient, term.absolute) : null;
  });
  if (terms.some((item) => item === null)) return null;
  const expected = input.specification.expected.kind === "literal"
    ? input.specification.expected.value
    : byRef.get(input.specification.expected.observationRef)?.value;
  if (expected === undefined) return null;
  const contributions = terms.filter((item): item is NonNullable<typeof item> => item !== null);
  const actual = contributions.reduce((sum, item) => sum + item.contribution, 0);
  const difference = actual - expected;
  const withinTolerance = Math.abs(difference) <= input.specification.tolerance;
  return {
    contributions,
    actual,
    expected,
    difference,
    tolerance: input.specification.tolerance,
    withinTolerance,
    result: withinTolerance ? "pass" : "fail",
  };
}

export function validateRbKernelReconstructableControlProof(
  proof: RbKernelReconstructableControlProof,
): RbKernelControlProofValidation {
  const errors: string[] = [];
  if (proof.schemaVersion !== RB_KERNEL_CONTROL_PROOF_SCHEMA) errors.push("unsupported_control_proof_schema");
  if (!proof.controlId || !proof.description) errors.push("control_identity_or_description_missing");
  if (!/^[a-f0-9]{64}$/.test(proof.sourceScope.sourceFingerprint)) errors.push("source_fingerprint_invalid");
  if (!proof.sourceScope.documentRef || proof.sourceScope.completeSuppliedDocument !== true) {
    errors.push("source_scope_is_not_complete_and_bound");
  }
  if (proof.deterministicOnly !== true || proof.providerAuthority !== "prohibited") {
    errors.push("control_proof_is_not_deterministic_only");
  }
  if (proof.inputs.length === 0) errors.push("control_proof_has_no_inputs");
  for (const observed of proof.inputs) {
    if (!observed.observationRef || !Number.isSafeInteger(observed.value)) errors.push("control_input_is_not_exact_numeric_observation");
    if (observed.authority !== "source_printed") errors.push("control_input_is_not_source_printed");
    if (observed.evidence.documentRef !== proof.sourceScope.documentRef
        || !Number.isSafeInteger(observed.evidence.page) || observed.evidence.page <= 0
        || !observed.evidence.section || !observed.evidence.lineRef || !observed.evidence.sourceLine) {
      errors.push(`control_input_has_incomplete_source_evidence:${observed.observationRef}`);
    }
  }
  const expectedRefs = specificationObservationRefs(proof.specification);
  if (!sameStringSet(expectedRefs, proof.inputs.map((item) => item.observationRef))) {
    errors.push("control_specification_and_input_observations_do_not_match");
  }
  const expectedPages = uniqueNumbers(proof.inputs.map((item) => item.evidence.page));
  const expectedSections = uniqueStrings(proof.inputs.map((item) => item.evidence.section));
  if (!sameNumberSet(proof.sourceScope.pages, expectedPages)
      || !sameStringSet(proof.sourceScope.sections, expectedSections)) {
    errors.push("control_source_scope_does_not_match_input_evidence");
  }
  if (!Number.isFinite(proof.specification.tolerance) || proof.specification.tolerance < 0) {
    errors.push("control_tolerance_is_invalid");
  }
  if (proof.exclusionConditions.length === 0
      || new Set(proof.exclusionConditions.map((item) => item.conditionId)).size !== proof.exclusionConditions.length
      || proof.exclusionConditions.some((item) => !item.conditionId || item.state !== "satisfied")) {
    errors.push("control_exclusion_conditions_are_missing_or_unsatisfied");
  }
  const reconstructed = reconstructRbKernelControlCalculation({
    specification: proof.specification,
    inputs: proof.inputs,
  });
  if (!reconstructed) {
    errors.push("control_calculation_could_not_be_reconstructed");
  } else {
    if (canonicalJson(reconstructed) !== canonicalJson(proof.calculation)) {
      errors.push("control_calculation_does_not_reconstruct");
    }
    if (proof.state !== reconstructed.result || proof.calculation.result !== reconstructed.result) {
      errors.push("control_state_does_not_match_reconstructed_result");
    }
  }
  const { proofHash: _proofHash, ...core } = proof;
  if (proof.proofHash !== rbKernelControlProofHash(core)) errors.push("control_proof_hash_does_not_reconstruct");
  return { status: errors.length === 0 ? "valid" : "invalid", errors: uniqueStrings(errors), reconstructed };
}

function contribution(input: RbKernelControlProofInput, coefficient: number, absolute: boolean) {
  return {
    observationRef: input.observationRef,
    sourceValue: input.value,
    coefficient,
    absolute,
    contribution: (absolute ? Math.abs(input.value) : input.value) * coefficient,
  };
}

function specificationObservationRefs(specification: RbKernelControlSpecification): string[] {
  return specification.kind === "equal"
    ? [specification.leftObservationRef, specification.rightObservationRef]
    : [...specification.terms.map((item) => item.observationRef),
      ...(specification.expected.kind === "observation" ? [specification.expected.observationRef] : [])];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return uniqueStrings(left).join("\n") === uniqueStrings(right).join("\n");
}

function sameNumberSet(left: readonly number[], right: readonly number[]): boolean {
  return uniqueNumbers(left).join("\n") === uniqueNumbers(right).join("\n");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

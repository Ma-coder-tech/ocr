import {
  RB_KERNEL_CONTROL_PROOF_SCHEMA,
  rbKernelControlProofHash,
  reconstructRbKernelControlCalculation,
  validateRbKernelReconstructableControlProof,
  type RbKernelControlExclusion,
  type RbKernelControlProofInput,
  type RbKernelControlSpecification,
  type RbKernelReconstructableControlProof,
  type RbKernelReconstructableControlProofCore,
} from "../canonical/v2/kernelControlProof.js";
import type { DeterministicControl, Observation } from "./types.js";

export type KernelControlProofBuildResult = {
  proof: RbKernelReconstructableControlProof | null;
  errors: string[];
};

export function buildRbKernelReconstructableControlProof(input: {
  control: DeterministicControl | undefined;
  observations: Observation[];
  sourceDocumentRef: string;
  sourceFingerprint: string;
  completeSuppliedDocument: boolean;
  exclusionConditions: RbKernelControlExclusion[];
}): KernelControlProofBuildResult {
  if (!input.control) return { proof: null, errors: ["required_control_definition_missing"] };
  if (input.control.kind !== "arithmetic" && input.control.kind !== "equal") {
    return { proof: null, errors: [`unsupported_reconstructable_control_kind:${input.control.kind}`] };
  }
  const specification = controlSpecification(input.control);
  const byRef = new Map(input.observations.map((item) => [item.id, item]));
  const observationRefs = specification.kind === "equal"
    ? [specification.leftObservationRef, specification.rightObservationRef]
    : [...specification.terms.map((item) => item.observationRef),
      ...(specification.expected.kind === "observation" ? [specification.expected.observationRef] : [])];
  const errors: string[] = [];
  const proofInputs = observationRefs.flatMap((observationRef): RbKernelControlProofInput[] => {
    const observed = byRef.get(observationRef);
    if (!observed) {
      errors.push(`control_observation_missing:${observationRef}`);
      return [];
    }
    if ((observed.kind !== "amount" && observed.kind !== "count") || !Number.isSafeInteger(observed.value)) {
      errors.push(`control_observation_is_not_exact_numeric_value:${observationRef}`);
      return [];
    }
    if (observed.authority !== "source_printed") {
      errors.push(`control_observation_is_not_source_printed:${observationRef}`);
      return [];
    }
    if (observed.locator.documentId !== input.sourceDocumentRef || observed.locator.page === undefined
        || !observed.locator.section || !observed.locator.row || !observed.locator.label) {
      errors.push(`control_observation_source_locator_incomplete:${observationRef}`);
      return [];
    }
    const numericValue = observed.value as number;
    return [{
      observationRef,
      kind: observed.kind,
      value: numericValue,
      authority: "source_printed",
      evidence: {
        documentRef: observed.locator.documentId,
        page: observed.locator.page,
        section: observed.locator.section,
        lineRef: observed.locator.row,
        sourceLine: observed.locator.label,
      },
    }];
  });
  if (errors.length > 0) return { proof: null, errors: unique(errors) };
  const calculation = reconstructRbKernelControlCalculation({ specification, inputs: proofInputs });
  if (!calculation) return { proof: null, errors: ["control_calculation_could_not_be_reconstructed"] };
  const core: RbKernelReconstructableControlProofCore = {
    schemaVersion: RB_KERNEL_CONTROL_PROOF_SCHEMA,
    controlId: input.control.id,
    description: input.control.description,
    state: calculation.result,
    specification,
    inputs: proofInputs,
    calculation,
    sourceScope: {
      documentRef: input.sourceDocumentRef,
      sourceFingerprint: input.sourceFingerprint,
      sections: unique(proofInputs.map((item) => item.evidence.section)),
      pages: [...new Set(proofInputs.map((item) => item.evidence.page))].sort((left, right) => left - right),
      completeSuppliedDocument: input.completeSuppliedDocument,
    },
    exclusionConditions: input.exclusionConditions,
    deterministicOnly: true,
    providerAuthority: "prohibited",
  };
  const proof = { ...core, proofHash: rbKernelControlProofHash(core) };
  const validation = validateRbKernelReconstructableControlProof(proof);
  return validation.status === "valid" ? { proof, errors: [] } : { proof: null, errors: validation.errors };
}

function controlSpecification(control: DeterministicControl): RbKernelControlSpecification {
  if (control.kind === "arithmetic") {
    return {
        kind: "arithmetic",
        terms: control.terms.map((item) => ({
          observationRef: item.observationRef,
          coefficient: item.coefficient,
          absolute: item.absolute ?? false,
        })),
        expected: control.expectedObservationRef
          ? { kind: "observation", observationRef: control.expectedObservationRef }
          : { kind: "literal", value: control.expectedLiteral! },
        tolerance: control.tolerance ?? 0,
      };
  }
  if (control.kind === "equal") {
    return {
      kind: "equal",
      leftObservationRef: control.leftObservationRef,
      rightObservationRef: control.rightObservationRef,
      tolerance: control.tolerance ?? 0,
    };
  }
  throw new Error(`Unsupported reconstructable control kind ${control.kind}.`);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

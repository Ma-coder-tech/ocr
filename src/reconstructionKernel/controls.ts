import type { ControlResult, DeterministicControl, Observation, ScalarValue } from "./types.js";

function references(control: DeterministicControl): string[] {
  switch (control.kind) {
    case "equal":
    case "not_equal":
      return [control.leftObservationRef, control.rightObservationRef];
    case "compare":
      return [control.observationRef];
    case "arithmetic":
      return [...control.terms.map((term) => term.observationRef), ...(control.expectedObservationRef ? [control.expectedObservationRef] : [])];
    case "relation":
      return [control.relationObservationRef, ...control.subjectObservationRefs];
    case "temporal_order":
      return [control.earlierObservationRef, control.laterObservationRef];
    case "lifecycle_transition":
      return [control.earlierObservationRef, control.laterObservationRef].filter((value): value is string => value !== undefined);
  }
}

function numericEqual(left: number, right: number, tolerance = 0): boolean {
  return Math.abs(left - right) <= tolerance;
}

function valuesEqual(left: ScalarValue, right: ScalarValue, tolerance = 0): boolean {
  if (typeof left === "number" && typeof right === "number") return numericEqual(left, right, tolerance);
  return left === right;
}

function unresolved(control: DeterministicControl, reason: string): ControlResult {
  return { controlId: control.id, state: "unresolved", reason, observationRefs: references(control) };
}

export function evaluateControl(control: DeterministicControl, byId: Map<string, Observation>): ControlResult {
  const referenced = references(control).map((id) => byId.get(id));
  if (referenced.some((observation) => !observation)) return unresolved(control, "A referenced observation is unavailable.");

  if (control.kind === "equal" || control.kind === "not_equal") {
    const left = byId.get(control.leftObservationRef)!;
    const right = byId.get(control.rightObservationRef)!;
    if (left.value === null || right.value === null) return unresolved(control, "At least one compared value is unknown.");
    const equal = valuesEqual(left.value, right.value, control.tolerance);
    const passed = control.kind === "equal" ? equal : !equal;
    return {
      controlId: control.id,
      state: passed ? "pass" : "fail",
      reason: passed ? `${control.kind} comparison passed.` : `${control.kind} comparison failed.`,
      observationRefs: references(control),
    };
  }

  if (control.kind === "compare") {
    const actual = byId.get(control.observationRef)!.value;
    if (actual === null || typeof actual !== typeof control.expected) return unresolved(control, "Comparison values are unknown or type-incompatible.");
    let passed = false;
    if (typeof actual === "number" && typeof control.expected === "number") {
      const tolerance = control.tolerance ?? 0;
      passed =
        control.operator === "gt" ? actual > control.expected :
        control.operator === "gte" ? actual >= control.expected - tolerance :
        control.operator === "lt" ? actual < control.expected :
        control.operator === "lte" ? actual <= control.expected + tolerance :
        control.operator === "eq" ? numericEqual(actual, control.expected, tolerance) :
        !numericEqual(actual, control.expected, tolerance);
    } else {
      passed = control.operator === "eq" ? actual === control.expected : control.operator === "neq" ? actual !== control.expected : false;
    }
    return { controlId: control.id, state: passed ? "pass" : "fail", reason: `Comparison ${passed ? "passed" : "failed"}.`, observationRefs: references(control) };
  }

  if (control.kind === "arithmetic") {
    const values = control.terms.map((term) => ({ term, value: byId.get(term.observationRef)!.value }));
    if (values.some(({ value }) => typeof value !== "number")) return unresolved(control, "Arithmetic input is not a known number.");
    const actual = values.reduce((sum, { term, value }) => sum + (term.absolute ? Math.abs(value as number) : (value as number)) * term.coefficient, 0);
    const expected = control.expectedObservationRef ? byId.get(control.expectedObservationRef)!.value : control.expectedLiteral;
    if (typeof expected !== "number") return unresolved(control, "Arithmetic expected value is not a known number.");
    const passed = numericEqual(actual, expected, control.tolerance ?? 0);
    return { controlId: control.id, state: passed ? "pass" : "fail", reason: `Arithmetic ${passed ? "reconciled" : "did not reconcile"}: ${actual} vs ${expected}.`, observationRefs: references(control) };
  }

  if (control.kind === "relation") {
    const relation = byId.get(control.relationObservationRef)!;
    if (relation.kind !== "relation" || typeof relation.value !== "string") return unresolved(control, "Relation observation is not a known relation.");
    const actualSubjects = new Set(relation.relatedObservationRefs ?? []);
    const expectedSubjects = new Set(control.subjectObservationRefs);
    const sameSubjects = actualSubjects.size === expectedSubjects.size && [...actualSubjects].every((id) => expectedSubjects.has(id));
    const passed = relation.value === control.expectedRelation && sameSubjects;
    return { controlId: control.id, state: passed ? "pass" : "fail", reason: `Explicit relation ${passed ? "matched" : "did not match"}.`, observationRefs: references(control) };
  }

  if (control.kind === "lifecycle_transition") {
    const allowed = new Set([
      "authorized>submitted",
      "submitted>rejected",
      "submitted>settled",
      "rejected>resubmitted",
      "resubmitted>settled",
      "settled>funded",
      "funded>returned",
      "returned>adjusted",
    ]);
    const transitionAllowed = allowed.has(`${control.fromStage}>${control.toStage}`);
    if (!transitionAllowed) {
      return { controlId: control.id, state: "fail", reason: `Lifecycle transition ${control.fromStage}>${control.toStage} is invalid.`, observationRefs: references(control) };
    }
    if (control.earlierObservationRef && control.laterObservationRef) {
      const earlier = byId.get(control.earlierObservationRef)!.value;
      const later = byId.get(control.laterObservationRef)!.value;
      if (typeof earlier !== "string" || typeof later !== "string") return unresolved(control, "Lifecycle timing is unavailable.");
      if (earlier >= later) return { controlId: control.id, state: "fail", reason: "Lifecycle timing contradicts the proposed transition.", observationRefs: references(control) };
    }
    return { controlId: control.id, state: "pass", reason: `Lifecycle transition ${control.fromStage}>${control.toStage} is valid.`, observationRefs: references(control) };
  }

  if (control.kind !== "temporal_order") return unresolved(control, "Unsupported control kind.");
  const earlier = byId.get(control.earlierObservationRef)!.value;
  const later = byId.get(control.laterObservationRef)!.value;
  if (typeof earlier !== "string" || typeof later !== "string") return unresolved(control, "Temporal values are unavailable.");
  const passed = control.allowEqual ? earlier <= later : earlier < later;
  return { controlId: control.id, state: passed ? "pass" : "fail", reason: `Temporal order ${passed ? "passed" : "failed"}.`, observationRefs: references(control) };
}

export function evaluateControls(controls: DeterministicControl[], observations: Observation[]): ControlResult[] {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  return [...controls]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((control) => evaluateControl(control, byId));
}

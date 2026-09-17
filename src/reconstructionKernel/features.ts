import type { DeterministicFeature, Observation } from "./types.js";

function pairId(kind: DeterministicFeature["kind"], left: string, right: string): string {
  return `${kind}:${[left, right].sort().join(":")}`;
}

function comparableValue(observation: Observation): string | number | boolean | null {
  return typeof observation.value === "string" ? observation.value.trim() : observation.value;
}

export function generateDeterministicFeatures(observations: Observation[]): DeterministicFeature[] {
  const ordered = [...observations].sort((left, right) => left.id.localeCompare(right.id));
  const features: DeterministicFeature[] = [];

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex]!;
      const leftValue = comparableValue(left);
      const rightValue = comparableValue(right);
      if (leftValue === null || rightValue === null || leftValue === "" || rightValue === "") continue;
      if (left.kind !== right.kind || leftValue !== rightValue) continue;

      const kind =
        left.kind === "amount"
          ? "exact_amount_match"
          : left.kind === "count"
            ? "exact_count_match"
            : left.kind === "identifier"
              ? "exact_identifier_match"
              : left.kind === "date"
                ? "same_date"
                : undefined;
      if (!kind) continue;
      features.push({ id: pairId(kind, left.id, right.id), kind, observationRefs: [left.id, right.id] });
    }
  }

  const dates = ordered.filter((observation) => observation.kind === "date" && typeof observation.value === "string");
  for (const left of dates) {
    for (const right of dates) {
      if (left.id === right.id || String(left.value) >= String(right.value)) continue;
      features.push({
        id: `temporal_order:${left.id}:${right.id}`,
        kind: "temporal_order",
        observationRefs: [left.id, right.id],
      });
    }
  }

  for (const observation of ordered) {
    if (observation.kind !== "relation" || typeof observation.value !== "string") continue;
    features.push({
      id: `explicit_relation:${observation.id}`,
      kind: "explicit_relation",
      observationRefs: [observation.id, ...(observation.relatedObservationRefs ?? [])],
      value: observation.value,
    });
  }

  return features.sort((left, right) => left.id.localeCompare(right.id));
}

import type { BenchmarkPresentation, ComponentVisibility, ComponentVisibilityMap, OmissionReasonCode, ReconciliationSummary, ReportComponentId, ReportState } from "./types.js";

const COMPONENTS: ReportComponentId[] = [
  "verdict",
  "core_metrics",
  "benchmark",
  "pricing_model",
  "fee_composition",
  "fee_inventory",
  "opportunity_summary",
  "findings",
  "positive_findings",
  "action_toolkit",
  "evidence",
  "methodology",
];

export function buildComponentVisibility(params: {
  state: ReportState;
  reconciliation: ReconciliationSummary;
  benchmark: BenchmarkPresentation;
  hasFindings: boolean;
  hasPositiveFindings: boolean;
  unavailableReason?: OmissionReasonCode;
}): ComponentVisibilityMap {
  const map = Object.fromEntries(COMPONENTS.map((component) => [component, show()])) as ComponentVisibilityMap;

  if (params.state.code === "unable_to_analyze") {
    const reason = params.unavailableReason ?? "insufficient_evidence";
    hide(map, ["core_metrics", "benchmark", "pricing_model", "fee_composition", "fee_inventory", "opportunity_summary", "findings", "positive_findings"], reason);
    limit(map, "action_toolkit", unableActionMessage(reason));
    return map;
  }

  if (params.state.code === "reconciliation_failure") {
    limit(map, "core_metrics", "Verified top-line metrics may be shown, but affected financial conclusions are withheld.");
    hide(map, ["benchmark", "fee_composition", "opportunity_summary"], "reconciliation_failed");
    limit(map, "fee_inventory", "Only observed fee rows with enough evidence may be shown.");
    limit(map, "findings", "Only observed facts and verification items may be shown.");
  }

  if (params.state.code === "low_confidence") {
    limit(map, "core_metrics", "Only independently verified values may be shown.");
    hide(map, ["opportunity_summary"], "low_confidence");
    limit(map, "findings", "Low-confidence findings are withheld from opportunity totals.");
  }

  if (!params.benchmark.eligible || params.benchmark.status === "unavailable") {
    hide(map, ["benchmark"], "benchmark_unavailable");
  }

  if (params.reconciliation.status === "fail") {
    hide(map, ["fee_composition"], "reconciliation_failed");
  } else if (params.reconciliation.status === "warning" || params.reconciliation.status === "not_available") {
    limit(map, "fee_composition", "Fee composition is limited because classification coverage or reconciliation is incomplete.");
  }

  if (!params.hasFindings) hide(map, ["findings"], "no_supported_findings");
  if (!params.hasPositiveFindings) hide(map, ["positive_findings"], "not_applicable");

  return map;
}

function show(): ComponentVisibility {
  return { status: "show" };
}

function limit(map: ComponentVisibilityMap, component: ReportComponentId, message: string): void {
  if (map[component].status === "hide") return;
  map[component] = { status: "limited", message };
}

function hide(map: ComponentVisibilityMap, components: ReportComponentId[], reason: NonNullable<ComponentVisibility["reason"]>): void {
  for (const component of components) {
    map[component] = { status: "hide", reason };
  }
}

function unableActionMessage(reason: OmissionReasonCode): string {
  if (reason === "parser_blocked") return "Only retry guidance is available because parser validation blocked financial reporting.";
  if (reason === "not_verified") return "Only retry guidance is available because core totals were not verified.";
  if (reason === "reconciliation_failed") return "Only retry guidance is available because statement totals conflicted.";
  if (reason === "low_confidence") return "Only retry guidance is available because extraction confidence was too low.";
  if (reason === "not_extracted") return "Only retry guidance is available because statement data could not be extracted.";
  if (reason === "unsupported_processor") return "Only retry guidance is available because this statement type is unsupported.";
  return "Only retry guidance is available for this report state.";
}

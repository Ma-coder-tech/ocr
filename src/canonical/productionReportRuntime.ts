import {
  buildCanonicalRuntimeAnalysisWithRuntimeAi,
  type CanonicalRuntimeDiagnostics,
  type CanonicalRuntimeAdapterInput,
} from "./runtimeAdapter.js";
import { buildProductionReportProjection } from "./productionReportProjection.js";
import type { ProductionReportProjection } from "./productionReportProjectionTypes.js";
import { emitRuntimeProgress, runtimeProgressFailureReason, runtimeProgressFailureStatus } from "../runtimeProgress.js";

export type ProductionReportRuntimeResult = {
  projection: ProductionReportProjection;
  merchantLanguageRuntime: {
    status: "disabled" | "not_needed" | "provider_unavailable" | "admitted" | "rejected" | "timed_out" | "failed";
    attempted: boolean;
    eligibleItemCount: number;
    admittedItemCount: number;
    reasonCodes: string[];
  } | null;
  runtimeDiagnostics: CanonicalRuntimeDiagnostics;
};

/**
 * Package 3's backend orchestration boundary. Canonical truth is completed first,
 * merchant language is attempted and deterministically admitted second, and only
 * then is the production report DTO projected.
 */
export async function buildProductionReportFromRuntime(
  input: CanonicalRuntimeAdapterInput,
): Promise<ProductionReportRuntimeResult> {
  const runtimeStartedAt = Date.now();
  const result = await buildCanonicalRuntimeAnalysisWithRuntimeAi(input);
  const projectionStartedAt = Date.now();
  await emitRuntimeProgress(input.progressReporter, { stage: "projection", status: "running" });
  let projection: ProductionReportProjection;
  try {
    projection = buildProductionReportProjection(result.analysis);
  } catch (error) {
    await emitRuntimeProgress(input.progressReporter, {
      stage: "projection",
      status: runtimeProgressFailureStatus(error),
      elapsedMs: Math.max(0, Date.now() - projectionStartedAt),
      reasonCodes: [runtimeProgressFailureReason(error, "projection")],
    });
    throw error;
  }
  const projectionElapsedMs = Math.max(0, Date.now() - projectionStartedAt);
  await emitRuntimeProgress(input.progressReporter, {
    stage: "projection",
    status: "completed",
    elapsedMs: projectionElapsedMs,
    counters: { projectionCount: 1 },
  });
  return {
    projection,
    merchantLanguageRuntime: result.merchantLanguageRuntime,
    runtimeDiagnostics: {
      ...result.runtimeDiagnostics!,
      stageElapsedMs: {
        ...result.runtimeDiagnostics!.stageElapsedMs,
        productionProjection: projectionElapsedMs,
        totalPackage3Runtime: Math.max(0, Date.now() - runtimeStartedAt),
      },
    },
  };
}

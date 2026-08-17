import {
  buildCanonicalRuntimeAnalysisWithRuntimeAi,
  type CanonicalRuntimeDiagnostics,
  type CanonicalRuntimeAdapterInput,
} from "./runtimeAdapter.js";
import { buildProductionReportProjection } from "./productionReportProjection.js";
import type { ProductionReportProjection } from "./productionReportProjectionTypes.js";

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
  const projection = buildProductionReportProjection(result.analysis);
  const projectionElapsedMs = Math.max(0, Date.now() - projectionStartedAt);
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

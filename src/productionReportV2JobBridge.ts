import type { BusinessTypeId } from "./businessTypes.js";
import type { ParsedDocument } from "./parser.js";
import type { AnalysisSummary } from "./types.js";
import type { ProductionReportProjection } from "./canonical/productionReportProjectionTypes.js";

export type ProductionReportV2RuntimeBuilder = (
  input: import("./canonical/runtimeAdapter.js").CanonicalRuntimeAdapterInput,
) => Promise<{ projection: ProductionReportProjection }>;

export function productionReportV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RATEREVEAL_REPORT_V2_ENABLED === "true";
}

export async function buildProductionReportV2ForJob(input: {
  jobId: string;
  document: ParsedDocument;
  businessType: BusinessTypeId;
  legacySummary: AnalysisSummary;
  env?: NodeJS.ProcessEnv;
  build?: ProductionReportV2RuntimeBuilder;
}): Promise<ProductionReportProjection | null> {
  if (!productionReportV2Enabled(input.env ?? process.env)) return null;
  try {
    const build = input.build ?? (await import("./canonical/productionReportRuntime.js")).buildProductionReportFromRuntime;
    const result = await build({
      document: input.document,
      businessType: input.businessType,
      runtimeDocumentRef: `job_${input.jobId}`,
      legacySummary: input.legacySummary,
      // The established job analysis has already completed its optional statement-level AI pass.
      // Package 4 must not trigger a second whole-statement review for transport projection.
      wholeStatementFeeIntelligence: { enabled: false },
    });
    return result.projection;
  } catch (error) {
    console.error(`[job:${input.jobId}] production-report-v2-unavailable`, error instanceof Error ? error.message : error);
    return null;
  }
}

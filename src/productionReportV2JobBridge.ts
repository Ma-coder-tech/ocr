import type { BusinessTypeId } from "./businessTypes.js";
import type { ParsedDocument } from "./parser.js";
import type { AnalysisSummary } from "./types.js";
import type { ProductionReportProjection } from "./canonical/productionReportProjectionTypes.js";
import type { CanonicalRuntimeDiagnostics } from "./canonical/runtimeAdapter.js";
import type { RuntimeProgressReporter } from "./runtimeProgress.js";

export type ProductionReportV2RuntimeBuilder = (
  input: import("./canonical/runtimeAdapter.js").CanonicalRuntimeAdapterInput,
) => Promise<{ projection: ProductionReportProjection; runtimeDiagnostics?: CanonicalRuntimeDiagnostics }>;

export function productionReportV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RATEREVEAL_REPORT_V2_ENABLED === "true";
}

export async function buildProductionReportV2ForJob(input: {
  jobId: string;
  document: ParsedDocument;
  businessType: BusinessTypeId;
  legacySummary?: AnalysisSummary | null;
  wholeStatementFeeIntelligence?: import("./canonical/wholeStatementFeeIntelligenceRuntime.js").WholeStatementFeeIntelligenceRuntimeOptions;
  merchantLanguageInterpretation?: import("./canonical/merchantAttentionAiRuntime.js").MerchantAttentionAiRuntimeOptions;
  progressReporter?: RuntimeProgressReporter;
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
      legacySummary: input.legacySummary ?? null,
      ...(input.wholeStatementFeeIntelligence
        ? { wholeStatementFeeIntelligence: input.wholeStatementFeeIntelligence }
        : {}),
      ...(input.merchantLanguageInterpretation
        ? { merchantLanguageInterpretation: input.merchantLanguageInterpretation }
        : {}),
      ...(input.progressReporter ? { progressReporter: input.progressReporter } : {}),
    });
    if (result.runtimeDiagnostics) {
      console.info(
        `[job:${input.jobId}] package-3-runtime-diagnostics`,
        JSON.stringify(result.runtimeDiagnostics),
      );
    }
    return result.projection;
  } catch (error) {
    console.error(`[job:${input.jobId}] production-report-v2-unavailable`, error instanceof Error ? error.message : error);
    return null;
  }
}

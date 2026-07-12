import { createHash } from "node:crypto";

import { parsePdf } from "./parser.js";
import { analyzeStatementDocumentWithOptionalAi } from "./statementParserOrchestrator.js";
import type { BusinessTypeId } from "./businessTypes.js";
import type { AnalysisSummary } from "./types.js";
import {
  buildComparisonStatementInput,
  type BuildComparisonStatementInputOptions,
  type ComparisonStatementInput,
} from "./multiStatementComparisonInput.js";
import {
  compareMultiStatementAnalyses,
  type MultiStatementAnalysis,
} from "./multiStatementComparisonEngine.js";
import {
  buildMultiStatementGlobalReport,
  renderMultiStatementGlobalReportMarkdown,
  type MultiStatementGlobalReport,
} from "./reporting/buildMultiStatement.js";
import { maybeRunMultiStatementNarrativeAiForGlobalReport } from "./multiStatementNarrativeAi.js";
import type { MultiStatementNarrativeStatus } from "./multiStatementNarrativeAi.js";
import * as multiStatementStore from "./multiStatementStore.js";
import type {
  MultiStatementJobFileRecord,
  MultiStatementJobStatus,
} from "./multiStatementStore.js";

const DEFAULT_PIPELINE_VERSION = "single-statement-pipeline";
const DEFAULT_ADAPTER_VERSION = "comparison-input-v1";
const DEFAULT_COMPARISON_ENGINE_VERSION = "comparison-engine-v1";
const DEFAULT_REPORT_VERSION = "global-report-v1";

type ParsedStatementDocument = Awaited<ReturnType<typeof parsePdf>>;

export type MultiStatementUploadFile = {
  originalFileName: string;
  filePath: string;
  fileSize: number;
  contentHash?: string | null;
};

export type RunMultiStatementAnalysisInput = {
  merchantId?: number | null;
  businessType: BusinessTypeId;
  files: MultiStatementUploadFile[];
  pipelineVersion?: string;
  adapterVersion?: string;
  comparisonEngineVersion?: string;
  reportVersion?: string;
  narrative?: {
    enabled?: boolean;
    provider?: "auto" | "openai" | "anthropic";
    timeoutMs?: number;
  };
};

export type MultiStatementFileResult = {
  fileId: string;
  originalFileName: string;
  status: MultiStatementJobFileRecord["status"];
  statementPeriod?: string | null;
  errorMessage?: string | null;
  exclusionReason?: string | null;
};

export type RunMultiStatementAnalysisResult = {
  jobId: string;
  status: MultiStatementJobStatus;
  includedPeriods: string[];
  missingPeriods: string[];
  failedFiles: MultiStatementFileResult[];
  excludedFiles: MultiStatementFileResult[];
  fileResults: MultiStatementFileResult[];
  analysisId: string | null;
  reportId: string | null;
  report: MultiStatementGlobalReport | null;
};

type AnalyzeStatementFn = (
  document: ParsedStatementDocument,
  businessType: BusinessTypeId,
  options: { sourceFileName: string },
) => Promise<AnalysisSummary>;

type AdaptStatementFn = (
  summary: AnalysisSummary,
  options: BuildComparisonStatementInputOptions,
) => ComparisonStatementInput;

type CompareStatementsFn = (
  statements: ComparisonStatementInput[],
  options?: Parameters<typeof compareMultiStatementAnalyses>[1],
) => MultiStatementAnalysis;

type BuildReportFn = (
  analysis: MultiStatementAnalysis,
) => MultiStatementGlobalReport;

type RunNarrativeFn = typeof maybeRunMultiStatementNarrativeAiForGlobalReport;

export type RunMultiStatementAnalysisDeps = {
  parsePdf?: (filePath: string) => Promise<ParsedStatementDocument>;
  analyzeStatement?: AnalyzeStatementFn;
  adaptStatement?: AdaptStatementFn;
  compareStatements?: CompareStatementsFn;
  buildReport?: BuildReportFn;
  renderReportMarkdown?: typeof renderMultiStatementGlobalReportMarkdown;
  runNarrative?: RunNarrativeFn;
};

type SuccessfulStatement = {
  file: MultiStatementJobFileRecord;
  inputIndex: number;
  summary: AnalysisSummary;
  comparisonInput: ComparisonStatementInput;
};

type GuardrailResult =
  | { status: "matched" }
  | { status: "failed"; reason: string; details: Record<string, unknown> };

export type ProcessMultiStatementAnalysisJobOptions = {
  narrative?: RunMultiStatementAnalysisInput["narrative"];
};

export async function runMultiStatementAnalysis(
  input: RunMultiStatementAnalysisInput,
  deps: RunMultiStatementAnalysisDeps = {},
): Promise<RunMultiStatementAnalysisResult> {
  const created = createMultiStatementAnalysisJob(input);
  return await processMultiStatementAnalysisJob(
    created.jobId,
    { narrative: input.narrative },
    deps,
  );
}

export function createMultiStatementAnalysisJob(
  input: RunMultiStatementAnalysisInput,
): RunMultiStatementAnalysisResult {
  if (input.files.length < 1 || input.files.length > 12) {
    throw new Error("Multi-statement analysis requires between 1 and 12 files.");
  }

  const pipelineVersion = input.pipelineVersion ?? DEFAULT_PIPELINE_VERSION;
  const adapterVersion = input.adapterVersion ?? DEFAULT_ADAPTER_VERSION;
  const comparisonEngineVersion =
    input.comparisonEngineVersion ?? DEFAULT_COMPARISON_ENGINE_VERSION;
  const reportVersion = input.reportVersion ?? DEFAULT_REPORT_VERSION;

  const job = multiStatementStore.createMultiStatementJob({
    merchantId: input.merchantId ?? null,
    businessType: input.businessType,
    requestedStatementCount: input.files.length,
    pipelineVersion,
    adapterVersion,
    comparisonEngineVersion,
    reportVersion,
  });

  appendEvent(job.id, "job_created", "Multi-statement job created.", {
    requestedStatementCount: input.files.length,
  });

  const registeredFiles = input.files.map((file) =>
    multiStatementStore.addMultiStatementJobFile({
      multiStatementJobId: job.id,
      originalFileName: file.originalFileName,
      filePath: file.filePath,
      fileSize: file.fileSize,
      contentHash: file.contentHash ?? null,
      status: "uploaded",
    }),
  );

  appendEvent(job.id, "files_registered", "Uploaded files registered.", {
    fileCount: registeredFiles.length,
  });

  return buildRunResult(job.id, null, null, null);
}

export async function processMultiStatementAnalysisJob(
  jobId: string,
  options: ProcessMultiStatementAnalysisJobOptions = {},
  deps: RunMultiStatementAnalysisDeps = {},
): Promise<RunMultiStatementAnalysisResult> {
  const job = multiStatementStore.getMultiStatementJob(jobId);
  if (!job) {
    throw new Error(`Multi-statement job ${jobId} was not found.`);
  }

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return buildRunResult(job.id, null, null, getLatestStoredReport(job.id));
  }

  const pipelineVersion = job.pipelineVersion ?? DEFAULT_PIPELINE_VERSION;
  const adapterVersion = job.adapterVersion ?? DEFAULT_ADAPTER_VERSION;
  const comparisonEngineVersion =
    job.comparisonEngineVersion ?? DEFAULT_COMPARISON_ENGINE_VERSION;
  const reportVersion = job.reportVersion ?? DEFAULT_REPORT_VERSION;

  const parse = deps.parsePdf ?? parsePdf;
  const analyze =
    deps.analyzeStatement ?? analyzeStatementDocumentWithOptionalAi;
  const adapt = deps.adaptStatement ?? buildComparisonStatementInput;
  const compare = deps.compareStatements ?? compareMultiStatementAnalyses;
  const buildReport = deps.buildReport ?? buildMultiStatementGlobalReport;
  const renderMarkdown =
    deps.renderReportMarkdown ?? renderMultiStatementGlobalReportMarkdown;
  const runNarrative =
    deps.runNarrative ?? maybeRunMultiStatementNarrativeAiForGlobalReport;

  const registeredFiles = multiStatementStore.listMultiStatementJobFiles(job.id);
  if (registeredFiles.length === 0) {
    multiStatementStore.updateMultiStatementJobStatus(
      job.id,
      {
        status: "failed",
        error: "No files were registered for this multi-statement job.",
      },
      "No files were registered for this multi-statement job.",
    );
    return buildRunResult(job.id, null, null, null);
  }

  multiStatementStore.updateMultiStatementJobStatus(job.id, {
    status: "validating_uploads",
  });

  multiStatementStore.updateMultiStatementJobStatus(job.id, {
    status: "processing_statements",
  });

  const successfulStatements: SuccessfulStatement[] = [];

  for (const [inputIndex, file] of registeredFiles.entries()) {
    try {
      multiStatementStore.updateMultiStatementJobFileStatus(file.id, {
        status: "parsing",
      });
      await appendEvent(job.id, "file_parsing", "Parsing statement PDF.", {
        fileId: file.id,
        originalFileName: file.originalFileName,
      });

      const document = await parse(file.filePath);

      multiStatementStore.updateMultiStatementJobFileStatus(file.id, {
        status: "analyzing",
      });
      await appendEvent(
        job.id,
        "file_analyzing",
        "Running single-statement analysis.",
        { fileId: file.id, originalFileName: file.originalFileName },
      );

      const summary = await analyze(document, job.businessType, {
        sourceFileName: file.originalFileName,
      });

      const comparisonInput = adapt(summary, {
        sourceAnalysisId: String(file.id),
        pipelineVersion,
      });

      const adaptedFile = multiStatementStore.updateMultiStatementJobFileStatus(
        file.id,
        {
          status: "adapted",
          detectedPeriod: comparisonInput.statementPeriod,
          detectedMerchantName: comparisonInput.merchant.merchantName,
          detectedMerchantNumber: comparisonInput.merchant.merchantNumber,
          detectedProcessor: comparisonInput.merchant.processorPlatform,
          detectedIso: comparisonInput.merchant.isoName,
        },
      );

      successfulStatements.push({
        file: adaptedFile,
        inputIndex,
        summary,
        comparisonInput,
      });

      await appendEvent(job.id, "file_adapted", "Statement adapted.", {
        fileId: file.id,
        statementPeriod: comparisonInput.statementPeriod,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      multiStatementStore.updateMultiStatementJobFileStatus(file.id, {
        status: "failed",
        error: message,
      });
      await appendEvent(job.id, "file_failed", "Statement processing failed.", {
        fileId: file.id,
        originalFileName: file.originalFileName,
        error: message,
      });
    }
  }

  if (successfulStatements.length === 0) {
    multiStatementStore.updateMultiStatementJobStatus(
      job.id,
      {
        status: "failed",
        failedStatementCount: registeredFiles.length,
        error: "No statements could be processed.",
      },
      "No statements could be processed.",
    );
    await appendEvent(job.id, "job_failed", "No statements could be processed.");
    return buildRunResult(job.id, null, null, null);
  }

  if (successfulStatements.length < registeredFiles.length) {
    multiStatementStore.updateMultiStatementJobStatus(job.id, {
      status: "partially_failed",
      failedStatementCount: registeredFiles.length - successfulStatements.length,
    });
  }

  const guardrail = validateSameMerchant(successfulStatements);
  if (guardrail.status === "failed") {
    multiStatementStore.updateMultiStatementJobStatus(
      job.id,
      {
        status: "failed",
        failedStatementCount: registeredFiles.length - successfulStatements.length,
        identityMatchStatus: "mismatch",
        error: guardrail.reason,
      },
      guardrail.reason,
    );
    await appendEvent(job.id, "merchant_guardrail_failed", guardrail.reason, {
      details: guardrail.details,
    });
    return buildRunResult(job.id, null, null, null);
  }

  await appendEvent(
    job.id,
    "merchant_guardrail_passed",
    "Successful statements appear to belong to the same merchant.",
  );

  const usableStatements = excludeDuplicatePeriods(job.id, successfulStatements);

  for (const statement of usableStatements) {
    multiStatementStore.saveComparisonInput({
      multiStatementJobId: job.id,
      statementId: null,
      statementPeriod: statement.comparisonInput.statementPeriod,
      comparisonInput: statement.comparisonInput,
      inputSchemaVersion: adapterVersion,
      sourceSummaryHash: hashJson(statement.summary),
    });

    multiStatementStore.updateMultiStatementJobFileStatus(statement.file.id, {
      status: "completed",
    });
  }

  multiStatementStore.updateMultiStatementJobStatus(job.id, {
    status: "comparing",
    completedStatementCount: usableStatements.length,
    failedStatementCount: registeredFiles.length - successfulStatements.length,
    identityMatchStatus: "matched",
    merchantNameDetected: usableStatements[0]?.comparisonInput.merchant.merchantName,
    processorFamily: usableStatements[0]?.comparisonInput.merchant.processorPlatform,
    isoName: usableStatements[0]?.comparisonInput.merchant.isoName,
  });
  await appendEvent(job.id, "comparison_started", "Running comparison engine.", {
    statementCount: usableStatements.length,
  });

  const analysis = compare(
    usableStatements.map((statement) => statement.comparisonInput),
    { pipelineVersion },
  );

  const savedAnalysis = multiStatementStore.saveMultiStatementAnalysis({
    multiStatementJobId: job.id,
    analysis,
    analysisSchemaVersion: "multi-statement-analysis-v1",
    engineVersion: comparisonEngineVersion,
  });

  multiStatementStore.updateMultiStatementJobStatus(job.id, {
    status: "generating_report",
  });
  await appendEvent(job.id, "report_started", "Building global report.");

  let report = buildReport(analysis);
  let narrativeStatus: MultiStatementNarrativeStatus = "disabled";
  let narrativeProvider: string | null = null;
  let narrativeModel: string | null = null;
  let narrative: unknown = null;

  if (options.narrative?.enabled === false) {
    await appendEvent(job.id, "narrative_disabled", "Narrative generation disabled.");
  } else {
    try {
      const narrativeResult = await runNarrative(report, {
        enabled: options.narrative?.enabled,
        provider: options.narrative?.provider,
        timeoutMs: options.narrative?.timeoutMs,
      });
      report = narrativeResult.report;
      narrative = narrativeResult.aiMultiStatementNarrative;
      narrativeStatus = narrativeResult.aiMultiStatementNarrative.status;
      narrativeProvider =
        narrativeResult.aiMultiStatementNarrative.provider ?? null;
      narrativeModel = narrativeResult.aiMultiStatementNarrative.model ?? null;
      await appendEvent(job.id, "narrative_completed", "Narrative step completed.", {
        status: narrativeStatus,
      });
    } catch (error) {
      narrativeStatus = "failed";
      narrative = { status: "failed", error: getErrorMessage(error) };
      await appendEvent(job.id, "narrative_failed", "Narrative generation failed.", {
        error: getErrorMessage(error),
      });
    }
  }

  const reportMarkdown = renderMarkdown(report);
  const savedReport = multiStatementStore.saveMultiStatementReport({
    multiStatementJobId: job.id,
    report,
    reportMarkdown,
    reportSchemaVersion: reportVersion,
    narrativeStatus,
    narrativeProvider,
    narrativeModel,
    narrative,
  });

  const missingPeriods = getMissingPeriods(analysis);
  const includedPeriods = analysis.metadata.includedPeriods;

  multiStatementStore.updateMultiStatementJobStatus(job.id, {
    status: "completed",
    completedStatementCount: usableStatements.length,
    failedStatementCount: registeredFiles.length - successfulStatements.length,
    dateRangeStart: includedPeriods[0],
    dateRangeEnd: includedPeriods[includedPeriods.length - 1],
    missingPeriods,
  });
  await appendEvent(job.id, "job_completed", "Multi-statement job completed.", {
    includedPeriods,
    missingPeriods,
  });

  return buildRunResult(job.id, savedAnalysis.id, savedReport.id, report);
}

function excludeDuplicatePeriods(
  jobId: string,
  statements: SuccessfulStatement[],
): SuccessfulStatement[] {
  const seenPeriods = new Set<string>();
  const usable: SuccessfulStatement[] = [];

  for (const statement of [...statements].sort((a, b) => a.inputIndex - b.inputIndex)) {
    const period = statement.comparisonInput.statementPeriod;
    if (seenPeriods.has(period)) {
      multiStatementStore.updateMultiStatementJobFileStatus(statement.file.id, {
        status: "excluded",
        error: "duplicate period",
      });
      appendEvent(jobId, "file_excluded", "Duplicate period excluded.", {
        fileId: statement.file.id,
        statementPeriod: period,
      });
      continue;
    }

    seenPeriods.add(period);
    usable.push(statement);
  }

  return usable;
}

function validateSameMerchant(statements: SuccessfulStatement[]): GuardrailResult {
  if (statements.length <= 1) {
    return { status: "matched" };
  }

  const identities = statements.map((statement) => ({
    fileId: statement.file.id,
    originalFileName: statement.file.originalFileName,
    merchantName: statement.comparisonInput.merchant.merchantName,
    merchantNumber: statement.comparisonInput.merchant.merchantNumber,
    processorPlatform: statement.comparisonInput.merchant.processorPlatform,
    isoName: statement.comparisonInput.merchant.isoName,
  }));

  const merchantNumbers = uniqueNormalized(
    identities.map((identity) => identity.merchantNumber),
  );
  if (merchantNumbers.length > 1) {
    return {
      status: "failed",
      reason: "Statements appear to be from different merchants.",
      details: { mismatchType: "merchant_number", identities },
    };
  }

  const merchantNames = uniqueNormalized(
    identities.map((identity) => identity.merchantName),
  );
  const processorKeys = uniqueNormalized(
    identities.map(
      (identity) => identity.isoName ?? identity.processorPlatform,
    ),
  );

  if (merchantNumbers.length === 1 && processorKeys.length <= 1) {
    return { status: "matched" };
  }

  if (merchantNames.length === 1 && processorKeys.length <= 1) {
    return { status: "matched" };
  }

  return {
    status: "failed",
    reason: "Statements appear to be from different merchants.",
    details: {
      mismatchType:
        merchantNames.length > 1 ? "merchant_name" : "processor_or_iso",
      identities,
    },
  };
}

function uniqueNormalized(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(normalizeIdentityPart).filter(Boolean))];
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMissingPeriods(analysis: MultiStatementAnalysis): string[] {
  return analysis.metadata?.missingPeriods ?? [];
}

function buildFileResult(
  file: MultiStatementJobFileRecord,
): MultiStatementFileResult {
  return {
    fileId: file.id,
    originalFileName: file.originalFileName,
    status: file.status,
    statementPeriod: file.detectedPeriod,
    errorMessage: file.status === "failed" ? file.error : null,
    exclusionReason: file.status === "excluded" ? file.error : null,
  };
}

function buildRunResult(
  jobId: string,
  analysisId: string | null,
  reportId: string | null,
  report: MultiStatementGlobalReport | null,
): RunMultiStatementAnalysisResult {
  const job = multiStatementStore.getMultiStatementJob(jobId);
  if (!job) {
    throw new Error(`Multi-statement job ${jobId} was not found.`);
  }

  const fileResults = multiStatementStore
    .listMultiStatementJobFiles(jobId)
    .map(buildFileResult);

  return {
    jobId,
    status: job.status,
    includedPeriods:
      report?.effectiveRateTrend.periods.map((period) => period.period) ?? [],
    missingPeriods: job.missingPeriods,
    failedFiles: fileResults.filter((file) => file.status === "failed"),
    excludedFiles: fileResults.filter((file) => file.status === "excluded"),
    fileResults,
    analysisId,
    reportId,
    report,
  };
}

function getLatestStoredReport(jobId: string): MultiStatementGlobalReport | null {
  return multiStatementStore.getLatestMultiStatementReportForJob(jobId)?.report ?? null;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendEvent(
  multiStatementJobId: string,
  stage: string,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  multiStatementStore.appendMultiStatementJobEvent({
    multiStatementJobId,
    stage,
    message,
    metadata: metadata ?? {},
  });
}

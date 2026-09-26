import type { StatementRecord } from "./accountStore.js";
import type { Job } from "./types.js";
import { getBusinessTypeReportLabel } from "./businessTypes.js";
import { toPeriodLabel } from "./periods.js";
import { customerFinancialsAuthorized, CUSTOMER_UNAVAILABLE_MESSAGE } from "./customerFinancialAuthority.js";
import { publicPhase2FeeFactForJob } from "./phase2FeeFact.js";

export function customerJobStatus(job: Job): Job["status"] {
  if (job.status === "fee_fact_available") {
    return publicPhase2FeeFactForJob(job) ? "fee_fact_available" : "failed";
  }
  return job.status === "completed" && !customerFinancialsAuthorized(job.summary)
    ? "failed" : job.status;
}

export function customerJobError(job: Job): string | undefined {
  if (job.status === "fee_fact_available") {
    return publicPhase2FeeFactForJob(job) ? undefined : CUSTOMER_UNAVAILABLE_MESSAGE;
  }
  return (job.status === "completed" || Boolean(job.summary)) && !customerFinancialsAuthorized(job.summary)
    ? CUSTOMER_UNAVAILABLE_MESSAGE : job.error;
}

/** Historical rows retain the internal observation, but expose no financial facts. */
export function customerStatementSummaryPayload(statement: StatementRecord): Record<string, unknown> {
  const period = toPeriodLabel(statement.statementPeriod) ?? statement.statementPeriod;
  const base = {
    kind: "statement", id: statement.id, jobId: statement.sourceJobId,
    slot: statement.slot, period, periodKey: statement.periodKey,
    businessType: getBusinessTypeReportLabel(statement.businessType),
    sourceJobId: statement.sourceJobId,
    createdAt: statement.createdAt, updatedAt: statement.updatedAt,
  };
  if (!customerFinancialsAuthorized(statement.analysisSummary)) {
    return { ...base, processorName: "Statement unavailable",
      totalVolume: null, totalFees: null, effectiveRate: null,
      analysisStatus: "failed", benchmarkVerdict: null,
      processorMarkup: null, processorMarkupBps: null, cardNetworkFees: null,
      error: CUSTOMER_UNAVAILABLE_MESSAGE };
  }
  return { ...base,
    processorName: statement.processorName ?? "Processor not identified",
    totalVolume: statement.totalVolume, totalFees: statement.totalFees,
    effectiveRate: statement.effectiveRate,
    analysisStatus: statement.analysisStatus, benchmarkVerdict: statement.benchmarkVerdict,
    processorMarkup: statement.processorMarkup,
    processorMarkupBps: statement.processorMarkupBps,
    cardNetworkFees: statement.cardNetworkFees,
  };
}

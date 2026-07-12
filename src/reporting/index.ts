export { buildSingleStatementCustomerReport } from "./buildSingleStatement.js";
export type { BuildCustomerReportInput } from "./buildSingleStatement.js";
export { buildMultiStatementGlobalReport, renderMultiStatementGlobalReportMarkdown } from "./buildMultiStatement.js";
export type {
  BuildMultiStatementGlobalReportOptions,
  MultiStatementActionItemReport,
  MultiStatementFeeTimelineItem,
  MultiStatementGlobalReport,
  MultiStatementRecurringAvoidableFee,
  MultiStatementReportMetric,
  MultiStatementReportMoneyRange,
  MultiStatementTopFinding,
} from "./buildMultiStatement.js";
export type {
  CustomerAction,
  CustomerCTA,
  CustomerConfidence,
  CustomerDataQualityNote,
  CustomerDisplayMode,
  CustomerFeeTableRow,
  CustomerFinding,
  CustomerReportBuildState,
  CustomerReportDTO,
  CustomerReportIdentity,
  CustomerReportMetric,
  CustomerReportSection,
  CustomerReportSituation,
  CustomerReportTextBlock,
  ReportKind,
} from "./types.js";

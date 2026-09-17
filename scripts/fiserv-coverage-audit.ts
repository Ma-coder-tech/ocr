import fs from "node:fs/promises";
import path from "node:path";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../src/fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../src/genericFiservStatementParser.js";
import type { FiservParserOutput } from "../src/fiservParserOutputSchema.js";
import { parsePdf } from "../src/parser.js";
import type { ParserDriver } from "../src/parserFoundation.js";

type AuditSample = {
  label: string;
  path: string;
  source: "repo_fixture" | "private_sample";
};

type AuditResult = {
  sample: AuditSample;
  exists: boolean;
  parserStatus: "parsed" | "unsupported" | "failed";
  driverId: string | null;
  driverName: string | null;
  error: string | null;
  fallthroughErrors: string[];
  output: FiservParserOutput | null;
};

const root = process.cwd();
const configuredPrivateSampleDir = process.env.RATEREVEAL_FISERV_PRIVATE_SAMPLE_DIR?.trim();
const privateSampleDir = configuredPrivateSampleDir
  ? path.resolve(configuredPrivateSampleDir)
  : null;

const samples: AuditSample[] = [
  {
    label: "Full Clover October fixture",
    source: "repo_fixture",
    path: path.resolve(root, "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf"),
  },
  {
    label: "Short Clover June fixture",
    source: "repo_fixture",
    path: path.resolve(root, "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf"),
  },
  {
    label: "Paysafe February fixture",
    source: "repo_fixture",
    path: path.resolve(root, "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf"),
  },
  {
    label: "Priority December fixture",
    source: "repo_fixture",
    path: path.resolve(root, "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf"),
  },
  {
    label: "November statement fixture",
    source: "repo_fixture",
    path: path.resolve(root, "test/fixtures/pdfs/Nov_2024_Statement.pdf"),
  },
  {
    label: "NXGEN January 2022",
    source: "repo_fixture",
    path: path.resolve(root, "test/fixtures/pdfs/fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf"),
  },
  ...(privateSampleDir
    ? [
        "Fiserv_BasysProcessing_March_2020.pdf",
        "fiserv_Clover_Jan_2024.pdf",
        "fiserv_Clover_June_2024.pdf",
        "fiserv_PAYSAFE_Febr_2024.pdf",
        "Fiser_PRIORITY PAYMENT SYSTEMS_2024pdf.pdf",
        "Dec_2024_Statement.pdf",
        "Fiserv_2025_PHILIP FUTURMARKET LLC.pdf",
        "Fiserv_PHILIP FUTUREMARKET1_ LLC.pdf",
        "Fiserv_Karen_ReneeWert_Statement_Dec_2024.pdf",
        "Fiserv_ABDUL BASHER_Aug_2025.pdf",
      ].map((fileName, index) => ({
        label: `Private Fiserv sample ${String(index + 1).padStart(2, "0")}`,
        source: "private_sample" as const,
        path: path.resolve(privateSampleDir, fileName),
      }))
    : []),
];

const drivers: Array<ParserDriver<FiservParserOutput>> = [
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
  genericFiservStatementDriver,
];

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function cell(value: unknown): string {
  const text = String(value ?? "-")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0 ? "-" : text;
}

function period(output: FiservParserOutput): string {
  const start = output.statementIdentity.statementPeriodStart;
  const end = output.statementIdentity.statementPeriodEnd;
  return start.slice(0, 7) === end.slice(0, 7) ? start.slice(0, 7) : `${start} to ${end}`;
}

function statusSymbol(status: string | null | undefined): string {
  if (!status) return "-";
  if (/not_mapped|fail|failed|unreconciled|unsupported/i.test(status)) return `FAIL ${status}`;
  if (/warning|rounding|unresolved|accepted_with_warnings|reconciled_with_warnings/i.test(status)) return `WARN ${status}`;
  if (/(accepted|validated|reconciled|pass)/i.test(status)) return `PASS ${status}`;
  return status;
}

function summarizeAtCost(output: FiservParserOutput): string {
  const rows = output.feeLedger.rows;
  if (rows.length === 0) return "not mapped";
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = row.classification.atCostStatus;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

function summarizeGaps(result: AuditResult): string {
  if (!result.exists) return "File not available in this environment.";
  if (result.parserStatus === "unsupported") return "No Fiserv / First Data parser driver currently supports this layout.";
  if (result.parserStatus === "failed") return `Parser matched but failed: ${result.error}`;
  const output = result.output;
  if (!output) return "No parser output.";

  const gaps: string[] = [];
  if (!output.decision.reportable) gaps.push("parser decision blocks customer-facing totals");
  if (output.feeLedger.status === "not_mapped") gaps.push("fee ledger not mapped");
  if (output.fundingBatchLedger.status === "not_mapped") gaps.push("batch funding ledger not mapped");
  if (output.feeLedger.feeClassificationSummary.status.includes("unresolved")) gaps.push("fee classification has unresolved/unbundled rows");
  if (output.fundingBatchLedger.anomalyCount > 0) gaps.push("batch funding anomaly present");
  if (output.pricingModel.pricingModel === "unknown") gaps.push("pricing model unknown");
  if (output.feeLedger.rows.some((row) => row.classification.atCostStatus === "indeterminate")) {
    gaps.push("at-cost proof waits on reference-rate catalog");
  }
  if (output.warnings.length > 0) gaps.push(`${output.warnings.length} parser warning(s)`);
  return gaps.length > 0 ? gaps.join("; ") : "No current parser gap detected for this sample.";
}

async function auditSample(sample: AuditSample): Promise<AuditResult> {
  try {
    await fs.access(sample.path);
  } catch {
    return {
      sample,
      exists: false,
      parserStatus: "failed",
      driverId: null,
      driverName: null,
      error: "File does not exist.",
      fallthroughErrors: [],
      output: null,
    };
  }

  try {
    const doc = await parsePdf(sample.path);
    const fallthroughErrors: string[] = [];
    for (const driver of drivers) {
      if (!driver.supports(doc)) continue;
      try {
        const output = driver.parse(doc, { sourceFileName: path.basename(sample.path) });
        return {
          sample,
          exists: true,
          parserStatus: "parsed",
          driverId: driver.id,
          driverName: driver.displayName,
          error: null,
          fallthroughErrors,
          output,
        };
      } catch (error) {
        fallthroughErrors.push(`${driver.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return {
      sample,
      exists: true,
      parserStatus: fallthroughErrors.length > 0 ? "failed" : "unsupported",
      driverId: null,
      driverName: null,
      error: fallthroughErrors.length > 0 ? "All supporting Fiserv parser drivers failed." : null,
      fallthroughErrors,
      output: null,
    };
  } catch (error) {
    return {
      sample,
      exists: true,
      parserStatus: "failed",
      driverId: null,
      driverName: null,
      error: error instanceof Error ? error.message : String(error),
      fallthroughErrors: [],
      output: null,
    };
  }
}

function row(result: AuditResult): string {
  const output = result.output;
  const displayedFile = result.sample.source === "private_sample"
    ? "<private sample filename omitted>"
    : path.basename(result.sample.path);
  return [
    cell(result.sample.label),
    cell(result.sample.source),
    cell(displayedFile),
    cell(result.parserStatus),
    cell(result.driverId),
    cell(output?.statementIdentity.visibleBrand),
    cell(output?.statementIdentity.statementFamily),
    cell(output ? period(output) : null),
    cell(output ? money(output.selectedFinancials.totalVolume) : null),
    cell(output ? money(output.selectedFinancials.totalFees) : null),
    cell(output ? rate(output.selectedFinancials.effectiveRate) : null),
    cell(output ? statusSymbol(output.decision.status) : result.error),
    cell(output ? statusSymbol(output.feeLedger.status) : null),
    cell(output ? output.feeLedger.rows.length : null),
    cell(output ? statusSymbol(output.fundingBatchLedger.status) : null),
    cell(output ? output.fundingBatchLedger.rowCount : null),
    cell(output ? statusSymbol(output.feeLedger.feeClassificationSummary.status) : null),
    cell(output ? output.pricingModel.pricingModel : null),
    cell(output ? summarizeAtCost(output) : null),
    cell([summarizeGaps(result), ...result.fallthroughErrors.map((error) => `fallthrough: ${error}`)].join("; ")),
  ].join(" | ");
}

function recommendations(results: AuditResult[]): string[] {
  const unsupported = results.filter((result) => result.parserStatus === "unsupported");
  const failed = results.filter((result) => result.parserStatus === "failed" && result.exists);
  const privateSamplesParsed = results.filter((result) => result.sample.source === "private_sample" && result.parserStatus === "parsed");
  const indeterminateAtCost = results.filter((result) =>
    result.output?.feeLedger.rows.some((feeRow) => feeRow.classification.atCostStatus === "indeterminate"),
  );

  const notes: string[] = [];
  if (unsupported.length > 0) {
    notes.push(`Add or intentionally reject layout support for unsupported samples: ${unsupported.map((result) => result.sample.label).join(", ")}.`);
  }
  if (failed.length > 0) {
    notes.push(`Fix matched-but-failing parser paths before broadening reports: ${failed.map((result) => `${result.sample.label} (${result.error})`).join(", ")}.`);
  }
  if (privateSamplesParsed.length > 0) {
    notes.push(
      `${privateSamplesParsed.length} configured private sample(s) parsed; their identities and filenames remain omitted from this report.`,
    );
  }
  if (indeterminateAtCost.length > 0) {
    notes.push("Reference-rate catalog remains the next blocker for proving at-cost assessment/network rows.");
  }
  notes.push("Do not add new processor families until this matrix has no unexpected unsupported/failing Fiserv samples.");
  return notes;
}

const results = await Promise.all(samples.map(auditSample));
const parsedCount = results.filter((result) => result.parserStatus === "parsed").length;
const unsupportedCount = results.filter((result) => result.parserStatus === "unsupported").length;
const failedCount = results.filter((result) => result.parserStatus === "failed").length;

const lines = [
  "# Fiserv / First Data Parser Coverage Audit",
  "",
  `Generated: ${process.env.RATEREVEAL_FISERV_COVERAGE_GENERATED_AT?.trim() || new Date().toISOString()}`,
  "",
  "## Scope",
  "",
  "This audit checks the current Fiserv / First Data parser drivers against repository fixtures and, only when explicitly configured, a private sample directory. It is a parser coverage audit, not a merchant-facing accuracy report.",
  "",
  "## Summary",
  "",
  `- Samples checked: ${results.length}`,
  `- Parsed by a Fiserv driver: ${parsedCount}`,
  `- Unsupported by current Fiserv drivers: ${unsupportedCount}`,
  `- Failed or missing: ${failedCount}`,
  "",
  "## Coverage Matrix",
  "",
  [
    "Sample",
    "Source",
    "File",
    "Parser status",
    "Driver",
    "Visible brand",
    "Family",
    "Period",
    "Volume",
    "Fees",
    "Eff. rate",
    "Decision",
    "Fee ledger",
    "Fee rows",
    "Batch ledger",
    "Batch rows",
    "Classification",
    "Pricing model",
    "At-cost statuses",
    "Gap / next action",
  ].join(" | "),
  [
    "---",
    "---",
    "---",
    "---",
    "---",
    "---",
    "---",
    "---",
    "---:",
    "---:",
    "---:",
    "---",
    "---",
    "---:",
    "---",
    "---:",
    "---",
    "---",
    "---",
    "---",
  ].join(" | "),
  ...results.map(row),
  "",
  "## Engineering Recommendations",
  "",
  ...recommendations(results).map((note) => `- ${note}`),
  "",
  "## Review Notes",
  "",
  "- PASS means the parser produced internally reconciled output for that specific layer; it does not mean every economic claim is fully proven.",
  "- WARN means the parser intentionally preserved a known issue, such as row-level batch anomaly, fee-ledger rounding, or unresolved classification.",
  "- `indeterminate` at-cost statuses are expected until approved, period-backed reference rates are available.",
  "- Private samples are optional, privacy-contained inputs and are not a substitute for portable repository fixtures.",
  "",
];

const configuredOutputPath = process.env.RATEREVEAL_FISERV_COVERAGE_OUTPUT?.trim();
const outputPath = configuredOutputPath
  ? path.resolve(configuredOutputPath)
  : path.resolve(root, "data/fiserv-parser-coverage-audit.md");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join("\n")}\n`);
console.log(outputPath);

const requiredFixtureFailures = results.filter(
  (result) => result.sample.source === "repo_fixture" && result.parserStatus !== "parsed",
);
if (requiredFixtureFailures.length > 0) process.exitCode = 1;

import fs from "node:fs/promises";
import path from "node:path";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../src/fiservFirstDataParser.js";
import type { FiservParserOutput } from "../src/fiservParserOutputSchema.js";
import { parsePdf } from "../src/parser.js";
import type { ParserDriver } from "../src/parserFoundation.js";

type AuditSample = {
  label: string;
  path: string;
  source: "repo_fixture" | "downloads_sample";
};

type AuditResult = {
  sample: AuditSample;
  exists: boolean;
  parserStatus: "parsed" | "unsupported" | "failed";
  driverId: string | null;
  driverName: string | null;
  error: string | null;
  output: FiservParserOutput | null;
};

const root = process.cwd();
const downloads = "/Users/martialmahougnonamoussou/Downloads";

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
    label: "Basys Processing March 2020",
    source: "downloads_sample",
    path: path.resolve(downloads, "Fiserv_BasysProcessing_March_2020.pdf"),
  },
  {
    label: "Clover January 2024",
    source: "downloads_sample",
    path: path.resolve(downloads, "fiserv_Clover_Jan_2024.pdf"),
  },
  {
    label: "Clover June 2024 original",
    source: "downloads_sample",
    path: path.resolve(downloads, "fiserv_Clover_June_2024.pdf"),
  },
  {
    label: "NXGEN January 2022",
    source: "repo_fixture",
    path: path.resolve(root, "test/fixtures/pdfs/fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf"),
  },
  {
    label: "Paysafe February original",
    source: "downloads_sample",
    path: path.resolve(downloads, "fiserv_PAYSAFE_Febr_2024.pdf"),
  },
  {
    label: "Priority December original",
    source: "downloads_sample",
    path: path.resolve(downloads, "Fiser_PRIORITY PAYMENT SYSTEMS_2024pdf.pdf"),
  },
  {
    label: "December 2024 statement",
    source: "downloads_sample",
    path: path.resolve(downloads, "Dec_2024_Statement.pdf"),
  },
  {
    label: "Philip Futuremarket October 2025 original",
    source: "downloads_sample",
    path: path.resolve(downloads, "Fiserv_2025_PHILIP FUTURMARKET LLC.pdf"),
  },
  {
    label: "Philip Futuremarket September 2025 zero-volume original",
    source: "downloads_sample",
    path: path.resolve(downloads, "Fiserv_PHILIP FUTUREMARKET1_ LLC.pdf"),
  },
  {
    label: "Karen ReneeWert December 2024",
    source: "downloads_sample",
    path: path.resolve(downloads, "Fiserv_Karen_ReneeWert_Statement_Dec_2024.pdf"),
  },
  {
    label: "Abdul Basher August 2025",
    source: "downloads_sample",
    path: path.resolve(downloads, "Fiserv_ABDUL BASHER_Aug_2025.pdf"),
  },
];

const drivers: Array<ParserDriver<FiservParserOutput>> = [
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
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
      output: null,
    };
  }

  try {
    const doc = await parsePdf(sample.path);
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
          output,
        };
      } catch (error) {
        return {
          sample,
          exists: true,
          parserStatus: "failed",
          driverId: driver.id,
          driverName: driver.displayName,
          error: error instanceof Error ? error.message : String(error),
          output: null,
        };
      }
    }
    return {
      sample,
      exists: true,
      parserStatus: "unsupported",
      driverId: null,
      driverName: null,
      error: null,
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
      output: null,
    };
  }
}

function row(result: AuditResult): string {
  const output = result.output;
  return [
    cell(result.sample.label),
    cell(result.sample.source),
    cell(path.basename(result.sample.path)),
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
    cell(summarizeGaps(result)),
  ].join(" | ");
}

function recommendations(results: AuditResult[]): string[] {
  const unsupported = results.filter((result) => result.parserStatus === "unsupported");
  const failed = results.filter((result) => result.parserStatus === "failed" && result.exists);
  const downloadsOnlyParsed = results.filter((result) => result.sample.source === "downloads_sample" && result.parserStatus === "parsed");
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
  if (downloadsOnlyParsed.length > 0) {
    notes.push(
      `Move parsed Downloads-only samples into repo fixtures once we trust them: ${downloadsOnlyParsed
        .map((result) => result.sample.label)
        .join(", ")}.`,
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
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Scope",
  "",
  "This audit checks the current Fiserv / First Data parser drivers against the Fiserv-related PDFs currently available in repo fixtures and the known local Downloads samples. It is a parser coverage audit, not a merchant-facing accuracy report.",
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
  "- Downloads-only samples are useful for exploration but are not regression-safe until copied into repo fixtures and covered by tests.",
  "",
];

const outputPath = path.resolve(root, "data/fiserv-parser-coverage-audit.md");
await fs.writeFile(outputPath, `${lines.join("\n")}\n`);
console.log(outputPath);

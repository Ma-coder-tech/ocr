import type { FeeBreakdownRow, FeeBroadType, FeeClass, FeeClassificationConfidence } from "./types.js";

export type FeeClassificationInput = {
  label: string;
  amount?: number;
  sharePct?: number;
  processorName?: string | null;
  sourceSection?: string | null;
  evidenceLine?: string | null;
};

export type FeeClassification = {
  feeClass: FeeClass;
  broadType: FeeBroadType;
  classificationConfidence: FeeClassificationConfidence;
  classificationRule: string;
  classificationReason: string;
};

function normalizeForMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactForMatch(value: string | null | undefined): string {
  return normalizeForMatch(value).replace(/\s+/g, "");
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function buildContext(input: FeeClassificationInput): { label: string; section: string; evidence: string; combined: string; compact: string } {
  const label = normalizeForMatch(input.label);
  const section = normalizeForMatch(input.sourceSection);
  const evidence = normalizeForMatch(input.evidenceLine);
  const processor = normalizeForMatch(input.processorName);
  const combined = [label, section, evidence, processor].filter(Boolean).join(" ");
  return {
    label,
    section,
    evidence,
    combined,
    compact: compactForMatch(combined),
  };
}

function result(
  feeClass: FeeClass,
  broadType: FeeBroadType,
  classificationConfidence: FeeClassificationConfidence,
  classificationRule: string,
  classificationReason: string,
): FeeClassification {
  return {
    feeClass,
    broadType,
    classificationConfidence,
    classificationRule,
    classificationReason,
  };
}

export function classifyFeeRow(input: FeeClassificationInput): FeeClassification {
  const context = buildContext(input);

  if (!context.combined) {
    return result("unknown", "Unknown", "low", "E010", "No statement label or section evidence was available.");
  }

  if (/commercial card interchange savings adjustment|interchange savings adjustment|savings adjustment/.test(context.combined)) {
    return result(
      "processor_service_add_on",
      "Processor",
      "high",
      "E027",
      "Savings-share adjustments use interchange language but represent processor-retained savings, not pass-through card-brand cost.",
    );
  }

  if (
    includesAny(context.combined, [
      /\bpci\b.*\bnon\b/,
      /\bnon\b.*\bcompliance\b/,
      /\bnoncompliance\b/,
      /\bnon\s?emv\b/,
    ])
  ) {
    return result(
      "compliance_remediation",
      "Service / compliance",
      "high",
      "E023/E024",
      "PCI non-compliance and non-EMV penalties are avoidable compliance/remediation fees in the statement guide.",
    );
  }

  if (
    includesAny(context.combined, [
      /\brisk fee\b/,
      /\bcustomer intelligence suite\b/,
      /\bexpress merchant funding\b/,
      /\bmonthly minimum\b/,
      /\bstatement fee\b/,
      /\bpaper statement\b/,
      /\bgateway fee\b/,
      /\bplatform fee\b/,
      /\badmin(?:istrative)? fee\b/,
      /\bmonthly fee\b/,
      /\bservice fee\b/,
      /\baccount fee\b/,
    ])
  ) {
    return result(
      "processor_service_add_on",
      "Service / compliance",
      "high",
      "E020/E022/E025",
      "The line matches an add-on, minimum, risk, gateway, statement, or service fee class that should be reviewed separately from core pass-through costs.",
    );
  }

  if (
    /\bservice charges?\b/.test(context.combined) ||
    /\bhps processing fees?\b/.test(context.combined) ||
    /\bprocessor markup\b/.test(context.combined) ||
    /\bmarkup\b/.test(context.combined) ||
    /\bprocessing fees?\b/.test(context.combined) ||
    /\bdiscount fees?\b/.test(context.combined) ||
    /\bdiscount rate\b/.test(context.combined)
  ) {
    return result(
      "processor_markup",
      "Processor",
      "high",
      "E018/E042",
      "The statement guide maps processor markup and service-charge style labels to processor-owned fees.",
    );
  }

  if (/\bauthori[sz]ation fees?\b|\bauth fees?\b|\btransaction fees?\b|\bper item\b|\bbatch fees?\b/.test(context.combined)) {
    return result(
      "processor_transaction_or_auth",
      "Processor",
      "high",
      "E019",
      "Transaction, authorization, batch, and per-item fees are processor-owned economics that should be analyzed apart from card-brand costs.",
    );
  }

  const hasCardBrandSection =
    /\binterchange\b/.test(context.section) ||
    /\bcard brand\b/.test(context.section) ||
    /\bnetwork\b/.test(context.section) ||
    /interchangecharges|programfees|cardbrandfees/.test(context.compact);
  const hasCardBrandLabel =
    /\binterchange\b/.test(context.label) ||
    /\bassessment\b/.test(context.label) ||
    /\bassessments\b/.test(context.label) ||
    /\bdues\b/.test(context.label) ||
    /\bcard brand\b/.test(context.label) ||
    /\bnetwork\b/.test(context.label) ||
    /\bvisa\b/.test(context.label) ||
    /\bmastercard\b/.test(context.label) ||
    /\bdiscover\b/.test(context.label) ||
    /\bamex\b/.test(context.label) ||
    /\bamerican express\b/.test(context.label);

  if (hasCardBrandSection || hasCardBrandLabel) {
    return result(
      "card_brand_pass_through",
      "Pass-through",
      hasCardBrandSection ? "high" : "medium",
      "E017",
      "Interchange, assessment, dues, network, and card-brand lines are classified as card-brand pass-through costs.",
    );
  }

  if (/\bprocessor fees?\b|\bprocessing\b|\bqualified\b|\bmid qualified\b|\bnon qualified\b/.test(context.combined)) {
    return result(
      "processor_markup",
      "Processor",
      "medium",
      "E018/E038",
      "The label points to processor-owned pricing, but the exact processor markup component should still be validated against statement sections.",
    );
  }

  return result(
    "unknown",
    "Unknown",
    "low",
    "E010",
    "The available label/section evidence is not specific enough to classify this fee without risking a fabricated statement interpretation.",
  );
}

export function withFeeClassification(
  row: Pick<FeeBreakdownRow, "label" | "amount" | "sharePct"> & Partial<FeeBreakdownRow>,
  context: Omit<FeeClassificationInput, "label" | "amount" | "sharePct"> = {},
): FeeBreakdownRow {
  const classification = classifyFeeRow({
    ...context,
    label: row.label,
    amount: row.amount,
    sharePct: row.sharePct,
    sourceSection: row.sourceSection ?? context.sourceSection,
    evidenceLine: row.evidenceLine ?? context.evidenceLine,
  });

  return {
    ...row,
    ...classification,
    sourceSection: row.sourceSection ?? context.sourceSection ?? undefined,
    evidenceLine: row.evidenceLine ?? context.evidenceLine ?? undefined,
  };
}

export function isCardBrandPassThrough(row: FeeBreakdownRow): boolean {
  return row.feeClass === "card_brand_pass_through" || row.broadType === "Pass-through";
}

export function isProcessorCoreFee(row: FeeBreakdownRow): boolean {
  if (row.feeClass) {
    return row.feeClass === "processor_markup" || row.feeClass === "processor_transaction_or_auth";
  }
  return row.broadType === "Processor";
}

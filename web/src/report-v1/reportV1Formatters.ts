import type { ChargeCadence, ConfidenceLevel, FeeCategoryCode, FindingDisposition } from "./reportV1Types";

export function formatMoney(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(digits)}%`;
}

export function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function confidenceLabel(confidence: ConfidenceLevel | null | undefined) {
  return confidence ? `${statusLabel(confidence)} confidence` : "Confidence unavailable";
}

export function categoryLabel(category: FeeCategoryCode) {
  const labels: Record<FeeCategoryCode, string> = {
    card_brand_network: "Card brand/network",
    processor_fees: "Processor fees",
    service_compliance: "Service and compliance",
    needs_review: "Needs review",
  };
  return labels[category];
}

export function categoryExplanation(category: FeeCategoryCode) {
  const labels: Record<FeeCategoryCode, string> = {
    card_brand_network: "Usually set by card brands and banks, not directly negotiable.",
    processor_fees: "Processor-controlled fees and markup that may be negotiable.",
    service_compliance: "Administrative, service, PCI, gateway, or compliance charges.",
    needs_review: "Needs documentation before RateReveal can classify the charge safely.",
  };
  return labels[category];
}

export function dispositionLabel(disposition: FindingDisposition | "none") {
  if (disposition === "none") return "No action";
  return statusLabel(disposition);
}

export function cadenceLabel(cadence: ChargeCadence) {
  return statusLabel(cadence);
}

export function actionLabel(action: string) {
  const labels: Record<string, string> = {
    retry_upload: "Analyze another statement",
    resolve_statement_conflict: "Verify statement totals",
    request_documentation: "Request documentation",
    renegotiate: "Renegotiate pricing",
    compare_quotes: "Compare quotes",
    request_removal: "Request removal",
    monitor: "Analyze another month",
  };
  return labels[action] ?? statusLabel(action);
}

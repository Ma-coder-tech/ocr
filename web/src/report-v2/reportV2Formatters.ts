import type { MoneyAmount, ReportV2Experience } from "./reportV2Types";

export function formatMoney(value: MoneyAmount | null): string {
  if (!value) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: value.currency }).format(value.amountMinor / 100);
}

export function formatRate(value: string | null): string {
  if (!value || !Number.isFinite(Number(value))) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatStatementPeriod(value: { start: string; end: string } | null): string | null {
  if (!value) return null;
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(`${value.start}T00:00:00Z`))} – ${format.format(new Date(`${value.end}T00:00:00Z`))}`;
}

export function experienceLabel(value: ReportV2Experience): string {
  return value === "analysis_completed" ? "Analysis completed" : value === "analysis_available_with_open_questions" ? "Analysis available with open questions" : "Review unavailable";
}

export function positionLabel(value: "below_reference" | "within_reference" | "above_reference"): string {
  return value === "within_reference" ? "Within reference range" : value === "below_reference" ? "Below reference range" : "Above reference range";
}

export function confidenceLabel(value: "high" | "medium" | "low"): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)} confidence`;
}

export function priorityLabel(value: "routine" | "review" | "high_priority"): string {
  return value === "high_priority" ? "High priority" : value === "review" ? "Review" : "Routine";
}

import type { ConfidenceLevel, OmissionReasonCode, ReportValue } from "./types.js";
import { singleStatementReportV1Policy } from "./policyConfig.js";

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function confidenceFromScore(score: number | null | undefined): ConfidenceLevel {
  if (score === null || score === undefined || !Number.isFinite(score)) return "medium";
  if (score >= singleStatementReportV1Policy.confidence.highMin) return "high";
  if (score >= singleStatementReportV1Policy.confidence.mediumMin) return "medium";
  return "low";
}

export function confidenceFromLabel(value: string | null | undefined): ConfidenceLevel {
  if (value === "high" || value === "medium" || value === "low") return value;
  if (value === "needs_review") return "low";
  return "low";
}

export function lowerConfidence(left: ConfidenceLevel, right: ConfidenceLevel): ConfidenceLevel {
  const rank: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };
  return rank[left] <= rank[right] ? left : right;
}

export function unavailableValue<T>(reason: OmissionReasonCode, explanation?: string): ReportValue<T> {
  return {
    value: null,
    status: "unavailable",
    confidence: null,
    evidenceRefs: [],
    unavailableReason: reason,
    explanation,
  };
}

export function observedValue<T>(value: T, confidence: ConfidenceLevel, evidenceRefs: string[] = [], explanation?: string): ReportValue<T> {
  return {
    value,
    status: "observed",
    confidence,
    evidenceRefs,
    explanation,
  };
}

export function calculatedValue<T>(
  value: T,
  confidence: ConfidenceLevel,
  calculationRef: string,
  evidenceRefs: string[] = [],
  explanation?: string,
): ReportValue<T> {
  return {
    value,
    status: "calculated",
    confidence,
    evidenceRefs,
    calculationRef,
    explanation,
  };
}

export function stableId(parts: Array<string | number | null | undefined>): string {
  const raw = parts
    .filter((part) => part !== null && part !== undefined && String(part).trim())
    .map((part) =>
      String(part)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean)
    .join("_");
  return raw || "item";
}

export function customerSafeExcerpt(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "")
    .replace(/\b\d{6,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 240) : null;
}

export function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordOrNull).filter((item): item is Record<string, unknown> => item !== null) : [];
}

export function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function positiveOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number !== null && number > 0 ? number : null;
}

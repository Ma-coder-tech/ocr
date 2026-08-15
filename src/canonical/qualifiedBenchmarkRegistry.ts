import fs from "node:fs";
import path from "node:path";
import type {
  CanonicalAnnualVolumeTier,
  CanonicalBusinessRiskClass,
  CanonicalBusinessQualificationConfidence,
  CanonicalProcessingChannel,
} from "./types.js";

export const QUALIFIED_BENCHMARK_REGISTRY_SCHEMA_VERSION = "ratereveal_qualified_benchmark_registry_v1" as const;

export type QualifiedBenchmarkSourceRecord = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceType: "public_schedule" | "industry_analysis" | "internal_anonymized_validation";
  locator: string;
  publishedAt: string | null;
  reviewedAt: string;
  supportedClaim: string;
  limitations: string[];
};

export type QualifiedBenchmarkRegistryEntry = {
  referenceId: string;
  displayLabel: string;
  segmentId: string;
  riskClass: Exclude<CanonicalBusinessRiskClass, "unknown">;
  channel: Exclude<CanonicalProcessingChannel, "unknown">;
  annualVolumeTier: Exclude<CanonicalAnnualVolumeTier, "unknown">;
  applicableProcessor: "fiserv";
  effectiveFrom: string;
  effectiveTo: string;
  range: { low: string; high: string };
  confidence: Exclude<CanonicalBusinessQualificationConfidence, "low">;
  merchantDisplayEligible: true;
  materiallyAboveDelta: string | null;
  sourceIds: string[];
  methodology: string;
  limitations: string[];
};

export type QualifiedBenchmarkRegistry = {
  schemaVersion: typeof QUALIFIED_BENCHMARK_REGISTRY_SCHEMA_VERSION;
  registryId: string;
  version: string;
  createdAt: string;
  reviewedAt: string;
  market: "US";
  normalRuntimeNetworkRequired: false;
  methodologySummary: string;
  sourceRecords: QualifiedBenchmarkSourceRecord[];
  entries: QualifiedBenchmarkRegistryEntry[];
  unavailableCoverage: Array<{ scope: string; reason: string }>;
};

let cachedRegistry: QualifiedBenchmarkRegistry | null = null;

export function loadQualifiedBenchmarkRegistry(): QualifiedBenchmarkRegistry {
  if (cachedRegistry) return structuredClone(cachedRegistry);
  const registryPath = path.resolve(process.cwd(), "data", "qualified-benchmark", "ratereveal_reference_registry_v1.json");
  const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8")) as unknown;
  cachedRegistry = validateQualifiedBenchmarkRegistry(parsed);
  return structuredClone(cachedRegistry);
}

export function validateQualifiedBenchmarkRegistry(value: unknown): QualifiedBenchmarkRegistry {
  const errors: string[] = [];
  const registry = asRecord(value);
  if (registry.schemaVersion !== QUALIFIED_BENCHMARK_REGISTRY_SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  if (!nonempty(registry.registryId)) errors.push("registryId is required");
  if (!nonempty(registry.version)) errors.push("version is required");
  if (!isoDate(registry.createdAt) || !isoDate(registry.reviewedAt)) errors.push("createdAt and reviewedAt must be ISO dates");
  if (registry.market !== "US") errors.push("only the U.S. market is supported");
  if (registry.normalRuntimeNetworkRequired !== false) errors.push("normal runtime must not require network access");
  if (!nonempty(registry.methodologySummary)) errors.push("methodologySummary is required");

  const sourceRecords = Array.isArray(registry.sourceRecords) ? registry.sourceRecords.map(asSourceRecord) : [];
  const sourceIds = new Set(sourceRecords.map((source) => source.sourceId));
  if (sourceRecords.length < 2 || sourceIds.size !== sourceRecords.length) errors.push("source records must be unique and include at least two sources");
  for (const source of sourceRecords) {
    if (!nonempty(source.sourceId) || !nonempty(source.title) || !nonempty(source.publisher) || !nonempty(source.locator) || !nonempty(source.supportedClaim)) {
      errors.push("each source record requires identity, publisher, locator, and a supported claim");
    }
    if (!["public_schedule", "industry_analysis", "internal_anonymized_validation"].includes(source.sourceType)) {
      errors.push(`source ${source.sourceId} has an unsupported sourceType`);
    }
    if ((source.publishedAt !== null && !isoDate(source.publishedAt)) || !isoDate(source.reviewedAt)) {
      errors.push(`source ${source.sourceId} has invalid publication or review dates`);
    }
    if (source.limitations.length < 2) errors.push(`source ${source.sourceId} requires explicit limitations`);
  }

  const entries = Array.isArray(registry.entries) ? registry.entries.map(asEntry) : [];
  const referenceIds = new Set<string>();
  for (const entry of entries) {
    if (referenceIds.has(entry.referenceId)) errors.push(`duplicate referenceId ${entry.referenceId}`);
    referenceIds.add(entry.referenceId);
    if (!entry.merchantDisplayEligible) errors.push(`entry ${entry.referenceId} is not merchant-display eligible`);
    if (!nonempty(entry.referenceId) || !nonempty(entry.displayLabel) || !nonempty(entry.segmentId)) {
      errors.push("each entry requires a referenceId, displayLabel, and segmentId");
    }
    if (!["standard", "high_risk"].includes(entry.riskClass)) errors.push(`entry ${entry.referenceId} has an unsupported riskClass`);
    if (!["card_present", "card_not_present", "mixed"].includes(entry.channel)) errors.push(`entry ${entry.referenceId} has an unsupported channel`);
    if (!["under_100k", "100k_500k", "500k_2m", "2m_10m", "over_10m"].includes(entry.annualVolumeTier)) {
      errors.push(`entry ${entry.referenceId} has an unsupported annualVolumeTier`);
    }
    if (entry.applicableProcessor !== "fiserv") errors.push(`entry ${entry.referenceId} has an unsupported processor`);
    if (!["high", "medium"].includes(entry.confidence)) errors.push(`entry ${entry.referenceId} has an unsupported confidence`);
    if (!isoDate(entry.effectiveFrom) || !isoDate(entry.effectiveTo) || entry.effectiveFrom > entry.effectiveTo) {
      errors.push(`entry ${entry.referenceId} has an invalid effective period`);
    }
    const low = decimal(entry.range.low);
    const high = decimal(entry.range.high);
    if (low === null || high === null || low <= 0 || high <= low) errors.push(`entry ${entry.referenceId} has an invalid range`);
    if (entry.materiallyAboveDelta !== null) errors.push(`entry ${entry.referenceId} uses an unapproved materially-above policy`);
    if (!nonempty(entry.methodology) || entry.methodology.length < 80) errors.push(`entry ${entry.referenceId} lacks a sufficiently explicit methodology`);
    if (entry.limitations.length < 2) errors.push(`entry ${entry.referenceId} requires explicit limitations`);
    if (entry.sourceIds.length < 2 || new Set(entry.sourceIds).size !== entry.sourceIds.length || entry.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
      errors.push(`entry ${entry.referenceId} has missing or insufficient source provenance`);
    }
    if (entry.segmentId === "default" || entry.segmentId === "other" || entry.segmentId.includes("unknown")) {
      errors.push(`entry ${entry.referenceId} uses a prohibited default segment`);
    }
  }

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex]!;
      const right = entries[rightIndex]!;
      const sameFactors =
        left.segmentId === right.segmentId &&
        left.riskClass === right.riskClass &&
        left.channel === right.channel &&
        left.annualVolumeTier === right.annualVolumeTier &&
        left.applicableProcessor === right.applicableProcessor;
      const periodsOverlap = left.effectiveFrom <= right.effectiveTo && right.effectiveFrom <= left.effectiveTo;
      if (sameFactors && periodsOverlap) errors.push(`entries ${left.referenceId} and ${right.referenceId} overlap for the same qualification factors`);
    }
  }

  const unavailableCoverage = Array.isArray(registry.unavailableCoverage)
    ? registry.unavailableCoverage.map((entry) => ({ scope: String(asRecord(entry).scope ?? ""), reason: String(asRecord(entry).reason ?? "") }))
    : [];
  if (unavailableCoverage.length === 0 || unavailableCoverage.some((entry) => !nonempty(entry.scope) || !nonempty(entry.reason))) {
    errors.push("unavailableCoverage must explicitly document excluded scopes");
  }

  if (errors.length > 0) throw new Error(`Qualified benchmark registry is invalid: ${errors.join("; ")}`);
  return {
    schemaVersion: QUALIFIED_BENCHMARK_REGISTRY_SCHEMA_VERSION,
    registryId: String(registry.registryId),
    version: String(registry.version),
    createdAt: String(registry.createdAt),
    reviewedAt: String(registry.reviewedAt),
    market: "US",
    normalRuntimeNetworkRequired: false,
    methodologySummary: String(registry.methodologySummary),
    sourceRecords,
    entries,
    unavailableCoverage,
  };
}

function asSourceRecord(value: unknown): QualifiedBenchmarkSourceRecord {
  const record = asRecord(value);
  return {
    sourceId: String(record.sourceId ?? ""),
    title: String(record.title ?? ""),
    publisher: String(record.publisher ?? ""),
    sourceType: record.sourceType as QualifiedBenchmarkSourceRecord["sourceType"],
    locator: String(record.locator ?? ""),
    publishedAt: record.publishedAt === null ? null : String(record.publishedAt ?? ""),
    reviewedAt: String(record.reviewedAt ?? ""),
    supportedClaim: String(record.supportedClaim ?? ""),
    limitations: strings(record.limitations),
  };
}

function asEntry(value: unknown): QualifiedBenchmarkRegistryEntry {
  const record = asRecord(value);
  const range = asRecord(record.range);
  return {
    referenceId: String(record.referenceId ?? ""),
    displayLabel: String(record.displayLabel ?? ""),
    segmentId: String(record.segmentId ?? ""),
    riskClass: record.riskClass as QualifiedBenchmarkRegistryEntry["riskClass"],
    channel: record.channel as QualifiedBenchmarkRegistryEntry["channel"],
    annualVolumeTier: record.annualVolumeTier as QualifiedBenchmarkRegistryEntry["annualVolumeTier"],
    applicableProcessor: record.applicableProcessor as "fiserv",
    effectiveFrom: String(record.effectiveFrom ?? ""),
    effectiveTo: String(record.effectiveTo ?? ""),
    range: { low: String(range.low ?? ""), high: String(range.high ?? "") },
    confidence: record.confidence as QualifiedBenchmarkRegistryEntry["confidence"],
    merchantDisplayEligible: record.merchantDisplayEligible as true,
    materiallyAboveDelta: record.materiallyAboveDelta === null ? null : String(record.materiallyAboveDelta ?? ""),
    sourceIds: strings(record.sourceIds),
    methodology: String(record.methodology ?? ""),
    limitations: strings(record.limitations),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isoDate(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function decimal(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+\.\d{6}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

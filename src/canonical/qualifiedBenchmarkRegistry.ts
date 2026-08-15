import fs from "node:fs";
import path from "node:path";
import type {
  CanonicalAnnualVolumeTier,
  CanonicalBusinessRiskClass,
  CanonicalBusinessQualificationConfidence,
  CanonicalProcessingChannel,
} from "./types.js";

export const QUALIFIED_BENCHMARK_REGISTRY_SCHEMA_VERSION = "ratereveal_qualified_benchmark_registry_v1" as const;
export const QUALIFIED_BENCHMARK_PROVENANCE_POLICY_VERSION = "qualified_benchmark_provenance_policy_v2" as const;
export const QUALIFIED_BENCHMARK_SYNTHESIS_VERSION = "ratereveal_market_informed_synthesis_v1" as const;

export type QualifiedBenchmarkQuantitativeValue = {
  metricId: string;
  label: string;
  value: string;
  unit: "decimal_rate";
  locationWithinSource: string;
};

export type QualifiedBenchmarkSourceRecord = {
  sourceId: string;
  documentId: string;
  title: string;
  publisher: string;
  independenceGroup: string;
  sourceType: "network_schedule" | "government_data" | "industry_analysis" | "processor_pricing" | "legal_analysis";
  locator: string;
  locationWithinSource: string;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  accessedAt: string;
  reviewedAt: string;
  metricType: string;
  sourceQuality: "high" | "medium" | "low";
  supportedObservation: string;
  quantitativeValues: QualifiedBenchmarkQuantitativeValue[];
  limitations: string[];
};

export type QualifiedBenchmarkSynthesis = {
  methodVersion: typeof QUALIFIED_BENCHMARK_SYNTHESIS_VERSION;
  evidenceSummary: string;
  rateRevealRationale: string;
  assumptions: string[];
  limitations: string[];
  reviewedAt: string;
  reviewBy: string;
};

export type QualifiedBenchmarkRegistryEntry = {
  referenceId: string;
  displayLabel: string;
  referenceKind: "ratereveal_reference_range";
  segmentId: string;
  riskClass: Exclude<CanonicalBusinessRiskClass, "unknown">;
  channel: Exclude<CanonicalProcessingChannel, "unknown">;
  annualVolumeTier: Exclude<CanonicalAnnualVolumeTier, "unknown">;
  applicableProcessor: "fiserv";
  effectiveFrom: string;
  effectiveTo: string;
  range: { low: string; high: string };
  confidence: CanonicalBusinessQualificationConfidence;
  productApproval: {
    status: "approved_for_merchant_display";
    approvedAt: string;
    decisionRef: string;
  };
  merchantDisplayEligible: true;
  materiallyAboveDelta: string | null;
  sourceIds: string[];
  synthesis: QualifiedBenchmarkSynthesis;
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
  merchantDisplayAdmissionPolicy: {
    policyVersion: typeof QUALIFIED_BENCHMARK_PROVENANCE_POLICY_VERSION;
    requiresExplicitProductApproval: true;
    requiresDocumentedResearchEvidence: true;
    requiresRateRevealRationale: true;
    requiresApplicabilityContext: true;
    requiresConfidence: true;
    requiresReviewHorizon: true;
    requiresExactExternalBoundaryPublication: false;
    requiresReproducibleBoundaryDerivation: false;
    allowsLegacyRegistryAsSoleEvidence: false;
    normalRuntimeNetworkRequired: false;
  };
  researchBasis: {
    researchId: string;
    researchDate: string;
    sourceWorkbookName: string;
    summaryDocumentName: string;
    sourceObservationCount: number;
    modifierObservationCount: number;
    repositoryRepresentation: string;
    summary: string;
    limitations: string[];
  };
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
  if (!nonempty(registry.registryId) || !nonempty(registry.version)) errors.push("registryId and version are required");
  if (!isoDate(registry.createdAt) || !isoDate(registry.reviewedAt)) errors.push("createdAt and reviewedAt must be ISO dates");
  if (registry.market !== "US") errors.push("only the U.S. market is supported");
  if (registry.normalRuntimeNetworkRequired !== false) errors.push("normal runtime must not require network access");
  if (!nonempty(registry.methodologySummary)) errors.push("methodologySummary is required");

  const admissionPolicy = asRecord(registry.merchantDisplayAdmissionPolicy);
  if (
    admissionPolicy.policyVersion !== QUALIFIED_BENCHMARK_PROVENANCE_POLICY_VERSION ||
    admissionPolicy.requiresExplicitProductApproval !== true ||
    admissionPolicy.requiresDocumentedResearchEvidence !== true ||
    admissionPolicy.requiresRateRevealRationale !== true ||
    admissionPolicy.requiresApplicabilityContext !== true ||
    admissionPolicy.requiresConfidence !== true ||
    admissionPolicy.requiresReviewHorizon !== true ||
    admissionPolicy.requiresExactExternalBoundaryPublication !== false ||
    admissionPolicy.requiresReproducibleBoundaryDerivation !== false ||
    admissionPolicy.allowsLegacyRegistryAsSoleEvidence !== false ||
    admissionPolicy.normalRuntimeNetworkRequired !== false
  ) {
    errors.push("merchant-display admission policy is missing or inconsistent with RateReveal synthesis policy");
  }

  const researchBasis = asResearchBasis(registry.researchBasis);
  if (
    !nonempty(researchBasis.researchId) ||
    !isoDate(researchBasis.researchDate) ||
    !nonempty(researchBasis.sourceWorkbookName) ||
    !nonempty(researchBasis.summaryDocumentName) ||
    researchBasis.sourceObservationCount < 1 ||
    researchBasis.modifierObservationCount < 1 ||
    !researchBasis.repositoryRepresentation.startsWith("data/qualified-benchmark/") ||
    researchBasis.summary.length < 80 ||
    researchBasis.limitations.length < 2
  ) {
    errors.push("researchBasis must identify and summarize the approved evidence pack");
  }

  const sourceRecords = Array.isArray(registry.sourceRecords) ? registry.sourceRecords.map(asSourceRecord) : [];
  const sourceIds = new Set(sourceRecords.map((source) => source.sourceId));
  if (sourceRecords.length === 0 || sourceIds.size !== sourceRecords.length) errors.push("source records must be present and unique");
  for (const source of sourceRecords) validateSource(source, errors);

  const entries = Array.isArray(registry.entries) ? registry.entries.map(asEntry) : [];
  const referenceIds = new Set<string>();
  for (const entry of entries) {
    if (referenceIds.has(entry.referenceId)) errors.push(`duplicate referenceId ${entry.referenceId}`);
    referenceIds.add(entry.referenceId);
    validateEntry(entry, sourceIds, errors);
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
    merchantDisplayAdmissionPolicy: {
      policyVersion: QUALIFIED_BENCHMARK_PROVENANCE_POLICY_VERSION,
      requiresExplicitProductApproval: true,
      requiresDocumentedResearchEvidence: true,
      requiresRateRevealRationale: true,
      requiresApplicabilityContext: true,
      requiresConfidence: true,
      requiresReviewHorizon: true,
      requiresExactExternalBoundaryPublication: false,
      requiresReproducibleBoundaryDerivation: false,
      allowsLegacyRegistryAsSoleEvidence: false,
      normalRuntimeNetworkRequired: false,
    },
    researchBasis,
    sourceRecords,
    entries,
    unavailableCoverage,
  };
}

function validateSource(source: QualifiedBenchmarkSourceRecord, errors: string[]): void {
  if (
    !nonempty(source.sourceId) ||
    !nonempty(source.documentId) ||
    !singlePublisher(source.publisher) ||
    !nonempty(source.title) ||
    !nonempty(source.independenceGroup) ||
    !directHttpsLocator(source.locator) ||
    !nonempty(source.locationWithinSource) ||
    !isoDate(source.accessedAt) ||
    !isoDate(source.reviewedAt) ||
    !nonempty(source.metricType) ||
    !nonempty(source.supportedObservation)
  ) {
    errors.push(`source ${source.sourceId || "<missing>"} lacks concrete, traceable research metadata`);
  }
  if (!['network_schedule', 'government_data', 'industry_analysis', 'processor_pricing', 'legal_analysis'].includes(source.sourceType)) {
    errors.push(`source ${source.sourceId} has an unsupported sourceType`);
  }
  if (!['high', 'medium', 'low'].includes(source.sourceQuality)) errors.push(`source ${source.sourceId} has an unsupported sourceQuality`);
  if (source.publishedAt !== null && !isoDate(source.publishedAt)) errors.push(`source ${source.sourceId} has an invalid publication date`);
  if ((source.effectiveFrom !== null && !isoDate(source.effectiveFrom)) || (source.effectiveTo !== null && !isoDate(source.effectiveTo))) {
    errors.push(`source ${source.sourceId} has invalid effective dates`);
  }
  if (source.effectiveFrom && source.effectiveTo && source.effectiveFrom > source.effectiveTo) errors.push(`source ${source.sourceId} has an inverted effective period`);
  if (source.limitations.length < 1) errors.push(`source ${source.sourceId} requires at least one explicit limitation`);
  for (const metric of source.quantitativeValues) {
    if (!nonempty(metric.metricId) || !nonempty(metric.label) || decimal(metric.value) === null || metric.unit !== "decimal_rate" || !nonempty(metric.locationWithinSource)) {
      errors.push(`source ${source.sourceId} has an invalid quantitative value`);
    }
  }
}

function validateEntry(entry: QualifiedBenchmarkRegistryEntry, sourceIds: Set<string>, errors: string[]): void {
  if (!entry.merchantDisplayEligible || entry.referenceKind !== "ratereveal_reference_range") errors.push(`entry ${entry.referenceId} is not a RateReveal merchant-display reference`);
  if (!nonempty(entry.referenceId) || !nonempty(entry.displayLabel) || !/^RateReveal .+ reference range$/.test(entry.displayLabel) || !nonempty(entry.segmentId)) {
    errors.push("each entry requires a stable ID, segment, and RateReveal reference-range label");
  }
  if (!['standard', 'high_risk'].includes(entry.riskClass)) errors.push(`entry ${entry.referenceId} has an unsupported riskClass`);
  if (!['card_present', 'card_not_present', 'mixed'].includes(entry.channel)) errors.push(`entry ${entry.referenceId} has an unsupported channel`);
  if (!['under_100k', '100k_500k', '500k_2m', '2m_10m', 'over_10m'].includes(entry.annualVolumeTier)) errors.push(`entry ${entry.referenceId} has an unsupported annualVolumeTier`);
  if (entry.applicableProcessor !== "fiserv") errors.push(`entry ${entry.referenceId} has an unsupported processor`);
  if (!['high', 'medium', 'low'].includes(entry.confidence)) errors.push(`entry ${entry.referenceId} is missing confidence`);
  if (!isoDate(entry.effectiveFrom) || !isoDate(entry.effectiveTo) || entry.effectiveFrom > entry.effectiveTo) errors.push(`entry ${entry.referenceId} has an invalid effective period`);
  const low = decimal(entry.range.low);
  const high = decimal(entry.range.high);
  if (low === null || high === null || low <= 0 || high <= low) errors.push(`entry ${entry.referenceId} has an invalid range`);
  if (entry.productApproval.status !== "approved_for_merchant_display" || !isoDate(entry.productApproval.approvedAt) || !nonempty(entry.productApproval.decisionRef)) {
    errors.push(`entry ${entry.referenceId} lacks explicit product approval`);
  }
  if (entry.materiallyAboveDelta !== null) errors.push(`entry ${entry.referenceId} uses an unapproved materially-above policy`);
  if (entry.sourceIds.length === 0 || new Set(entry.sourceIds).size !== entry.sourceIds.length || entry.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
    errors.push(`entry ${entry.referenceId} has missing research evidence linkage`);
  }
  if (
    entry.synthesis.methodVersion !== QUALIFIED_BENCHMARK_SYNTHESIS_VERSION ||
    entry.synthesis.evidenceSummary.length < 80 ||
    entry.synthesis.rateRevealRationale.length < 80 ||
    entry.synthesis.assumptions.length < 2 ||
    entry.synthesis.limitations.length < 2 ||
    !isoDate(entry.synthesis.reviewedAt) ||
    !isoDate(entry.synthesis.reviewBy) ||
    entry.synthesis.reviewBy < entry.synthesis.reviewedAt
  ) {
    errors.push(`entry ${entry.referenceId} lacks documented RateReveal synthesis, assumptions, limitations, or review horizon`);
  }
  if (entry.limitations.length < 2) errors.push(`entry ${entry.referenceId} requires explicit merchant-facing limitations`);
  if (entry.segmentId === "default" || entry.segmentId === "other" || entry.segmentId.includes("unknown")) errors.push(`entry ${entry.referenceId} uses a prohibited default segment`);
}

function asResearchBasis(value: unknown): QualifiedBenchmarkRegistry["researchBasis"] {
  const record = asRecord(value);
  return {
    researchId: String(record.researchId ?? ""),
    researchDate: String(record.researchDate ?? ""),
    sourceWorkbookName: String(record.sourceWorkbookName ?? ""),
    summaryDocumentName: String(record.summaryDocumentName ?? ""),
    sourceObservationCount: Number(record.sourceObservationCount ?? 0),
    modifierObservationCount: Number(record.modifierObservationCount ?? 0),
    repositoryRepresentation: String(record.repositoryRepresentation ?? ""),
    summary: String(record.summary ?? ""),
    limitations: strings(record.limitations),
  };
}

function asSourceRecord(value: unknown): QualifiedBenchmarkSourceRecord {
  const record = asRecord(value);
  return {
    sourceId: String(record.sourceId ?? ""), documentId: String(record.documentId ?? ""), title: String(record.title ?? ""),
    publisher: String(record.publisher ?? ""), independenceGroup: String(record.independenceGroup ?? ""),
    sourceType: record.sourceType as QualifiedBenchmarkSourceRecord["sourceType"], locator: String(record.locator ?? ""),
    locationWithinSource: String(record.locationWithinSource ?? ""), publishedAt: record.publishedAt === null ? null : String(record.publishedAt ?? ""),
    effectiveFrom: record.effectiveFrom === null ? null : String(record.effectiveFrom ?? ""), effectiveTo: record.effectiveTo === null ? null : String(record.effectiveTo ?? ""),
    accessedAt: String(record.accessedAt ?? ""), reviewedAt: String(record.reviewedAt ?? ""), metricType: String(record.metricType ?? ""),
    sourceQuality: record.sourceQuality as QualifiedBenchmarkSourceRecord["sourceQuality"], supportedObservation: String(record.supportedObservation ?? ""),
    quantitativeValues: Array.isArray(record.quantitativeValues) ? record.quantitativeValues.map((value) => ({
      metricId: String(asRecord(value).metricId ?? ""), label: String(asRecord(value).label ?? ""), value: String(asRecord(value).value ?? ""),
      unit: asRecord(value).unit as "decimal_rate", locationWithinSource: String(asRecord(value).locationWithinSource ?? ""),
    })) : [], limitations: strings(record.limitations),
  };
}

function asEntry(value: unknown): QualifiedBenchmarkRegistryEntry {
  const record = asRecord(value);
  const range = asRecord(record.range);
  const productApproval = asRecord(record.productApproval);
  const synthesis = asRecord(record.synthesis);
  return {
    referenceId: String(record.referenceId ?? ""), displayLabel: String(record.displayLabel ?? ""), referenceKind: record.referenceKind as "ratereveal_reference_range",
    segmentId: String(record.segmentId ?? ""), riskClass: record.riskClass as QualifiedBenchmarkRegistryEntry["riskClass"],
    channel: record.channel as QualifiedBenchmarkRegistryEntry["channel"], annualVolumeTier: record.annualVolumeTier as QualifiedBenchmarkRegistryEntry["annualVolumeTier"],
    applicableProcessor: record.applicableProcessor as "fiserv", effectiveFrom: String(record.effectiveFrom ?? ""), effectiveTo: String(record.effectiveTo ?? ""),
    range: { low: String(range.low ?? ""), high: String(range.high ?? "") }, confidence: record.confidence as QualifiedBenchmarkRegistryEntry["confidence"],
    productApproval: { status: productApproval.status as "approved_for_merchant_display", approvedAt: String(productApproval.approvedAt ?? ""), decisionRef: String(productApproval.decisionRef ?? "") },
    merchantDisplayEligible: record.merchantDisplayEligible as true, materiallyAboveDelta: record.materiallyAboveDelta === null ? null : String(record.materiallyAboveDelta ?? ""),
    sourceIds: strings(record.sourceIds), synthesis: {
      methodVersion: synthesis.methodVersion as typeof QUALIFIED_BENCHMARK_SYNTHESIS_VERSION,
      evidenceSummary: String(synthesis.evidenceSummary ?? ""), rateRevealRationale: String(synthesis.rateRevealRationale ?? ""), assumptions: strings(synthesis.assumptions),
      limitations: strings(synthesis.limitations), reviewedAt: String(synthesis.reviewedAt ?? ""), reviewBy: String(synthesis.reviewBy ?? ""),
    }, limitations: strings(record.limitations),
  };
}

function directHttpsLocator(value: string): boolean {
  try { const locator = new URL(value); return locator.protocol === "https:" && locator.hostname.length > 0; } catch { return false; }
}
function singlePublisher(value: string): boolean { return nonempty(value) && !/[,&;]|\band\b|\//i.test(value); }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isoDate(value: unknown): boolean { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)); }
function decimal(value: unknown): number | null { if (typeof value !== "string" || !/^\d+\.\d{6}$/.test(value)) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }

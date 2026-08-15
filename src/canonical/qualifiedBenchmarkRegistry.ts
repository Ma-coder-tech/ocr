import fs from "node:fs";
import path from "node:path";
import type {
  CanonicalAnnualVolumeTier,
  CanonicalBusinessRiskClass,
  CanonicalBusinessQualificationConfidence,
  CanonicalProcessingChannel,
} from "./types.js";

export const QUALIFIED_BENCHMARK_REGISTRY_SCHEMA_VERSION = "ratereveal_qualified_benchmark_registry_v1" as const;
export const QUALIFIED_BENCHMARK_PROVENANCE_POLICY_VERSION = "qualified_benchmark_provenance_policy_v1" as const;
export const QUALIFIED_BENCHMARK_DERIVATION_VERSION = "qualified_benchmark_linear_derivation_v1" as const;

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
  sourceType: "public_schedule" | "industry_analysis" | "internal_anonymized_validation";
  locator: string;
  locationWithinSource: string;
  publishedAt: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  accessedAt: string;
  contentDigestSha256: string;
  reviewedAt: string;
  supportedClaim: string;
  quantitativeValues: QualifiedBenchmarkQuantitativeValue[];
  limitations: string[];
};

export type QualifiedBenchmarkDerivationInput = {
  inputId: string;
  sourceId: string;
  metricId: string;
  value: string;
  unit: "decimal_rate";
};

export type QualifiedBenchmarkDerivationBoundary = {
  offset: string;
  terms: Array<{ inputId: string; weight: string }>;
  result: string;
};

export type QualifiedBenchmarkRangeDerivation = {
  methodVersion: typeof QUALIFIED_BENCHMARK_DERIVATION_VERSION;
  summary: string;
  inputs: QualifiedBenchmarkDerivationInput[];
  lowerBound: QualifiedBenchmarkDerivationBoundary;
  upperBound: QualifiedBenchmarkDerivationBoundary;
  assumptions: string[];
  reviewedAt: string;
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
  derivation: QualifiedBenchmarkRangeDerivation;
  methodology: string;
  limitations: string[];
};

export type QualifiedBenchmarkProvenanceReview = {
  reviewVersion: string;
  reviewedAt: string;
  conclusion: string;
  sourceAssessments: Array<{
    assessmentId: string;
    title: string;
    publisher: string;
    locator: string;
    publishedAt: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    locationWithinSource: string;
    finding: string;
    supportsExactMerchantRange: false;
  }>;
  candidateRangeAssessments: Array<{
    segmentId: string;
    displayLabel: string;
    previousRange: { low: string; high: string };
    sourceAssessmentIds: string[];
    decision: "unavailable";
    derivationFinding: string;
    evidenceGaps: string[];
  }>;
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
    minimumIndependentQuantitativeSources: 2;
    requiresHttpsLocatorForExternalSource: true;
    requiresPublicationDate: true;
    requiresScheduleEffectivePeriod: true;
    requiresContentDigest: true;
    requiresExactSourceLocation: true;
    requiresReproducibleBoundaryDerivation: true;
    allowsBundledPublishers: false;
    allowsLegacyRegistryAsSource: false;
    normalRuntimeNetworkRequired: false;
  };
  sourceRecords: QualifiedBenchmarkSourceRecord[];
  entries: QualifiedBenchmarkRegistryEntry[];
  provenanceReview: QualifiedBenchmarkProvenanceReview;
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
  const admissionPolicy = asRecord(registry.merchantDisplayAdmissionPolicy);
  if (
    admissionPolicy.policyVersion !== QUALIFIED_BENCHMARK_PROVENANCE_POLICY_VERSION ||
    admissionPolicy.minimumIndependentQuantitativeSources !== 2 ||
    admissionPolicy.requiresHttpsLocatorForExternalSource !== true ||
    admissionPolicy.requiresPublicationDate !== true ||
    admissionPolicy.requiresScheduleEffectivePeriod !== true ||
    admissionPolicy.requiresContentDigest !== true ||
    admissionPolicy.requiresExactSourceLocation !== true ||
    admissionPolicy.requiresReproducibleBoundaryDerivation !== true ||
    admissionPolicy.allowsBundledPublishers !== false ||
    admissionPolicy.allowsLegacyRegistryAsSource !== false ||
    admissionPolicy.normalRuntimeNetworkRequired !== false
  ) {
    errors.push("merchant-display admission policy is missing or weakened");
  }

  const sourceRecords = Array.isArray(registry.sourceRecords) ? registry.sourceRecords.map(asSourceRecord) : [];
  const sourceIds = new Set(sourceRecords.map((source) => source.sourceId));
  if (sourceIds.size !== sourceRecords.length) errors.push("source records must be unique");
  for (const source of sourceRecords) {
    if (
      !nonempty(source.sourceId) ||
      !nonempty(source.documentId) ||
      !nonempty(source.title) ||
      !singlePublisher(source.publisher) ||
      !nonempty(source.independenceGroup) ||
      !nonempty(source.locator) ||
      !nonempty(source.locationWithinSource) ||
      !nonempty(source.supportedClaim)
    ) {
      errors.push("each source record requires concrete identity, one publisher, direct location, and a supported claim");
    }
    if (!["public_schedule", "industry_analysis", "internal_anonymized_validation"].includes(source.sourceType)) {
      errors.push(`source ${source.sourceId} has an unsupported sourceType`);
    }
    if (!isoDate(source.publishedAt) || !isoDate(source.accessedAt) || !isoDate(source.reviewedAt)) {
      errors.push(`source ${source.sourceId} has invalid publication, access, or review dates`);
    }
    if ((source.effectiveFrom !== null && !isoDate(source.effectiveFrom)) || (source.effectiveTo !== null && !isoDate(source.effectiveTo))) {
      errors.push(`source ${source.sourceId} has invalid effective dates`);
    }
    if (source.sourceType === "public_schedule" && (!source.effectiveFrom || !source.effectiveTo || source.effectiveFrom > source.effectiveTo)) {
      errors.push(`public schedule ${source.sourceId} requires an effective period`);
    }
    if (source.sourceType !== "internal_anonymized_validation" && !directHttpsLocator(source.locator)) {
      errors.push(`external source ${source.sourceId} requires a direct HTTPS locator and cannot point to a legacy registry`);
    }
    if (source.sourceType === "internal_anonymized_validation" && !source.locator.startsWith("repository:data/qualified-benchmark/evidence/")) {
      errors.push(`internal source ${source.sourceId} requires a pinned qualified-benchmark evidence artifact`);
    }
    if (!/^[a-f0-9]{64}$/.test(source.contentDigestSha256)) errors.push(`source ${source.sourceId} requires a SHA-256 content digest`);
    if (source.quantitativeValues.length === 0) errors.push(`source ${source.sourceId} requires exact quantitative values`);
    for (const metric of source.quantitativeValues) {
      if (!nonempty(metric.metricId) || !nonempty(metric.label) || decimal(metric.value) === null || metric.unit !== "decimal_rate" || !nonempty(metric.locationWithinSource)) {
        errors.push(`source ${source.sourceId} has an invalid quantitative value`);
      }
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
    validateEntryProvenance(entry, sourceRecords, errors);
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

  const provenanceReview = asProvenanceReview(registry.provenanceReview);
  validateProvenanceReview(provenanceReview, errors);

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
      minimumIndependentQuantitativeSources: 2,
      requiresHttpsLocatorForExternalSource: true,
      requiresPublicationDate: true,
      requiresScheduleEffectivePeriod: true,
      requiresContentDigest: true,
      requiresExactSourceLocation: true,
      requiresReproducibleBoundaryDerivation: true,
      allowsBundledPublishers: false,
      allowsLegacyRegistryAsSource: false,
      normalRuntimeNetworkRequired: false,
    },
    sourceRecords,
    entries,
    provenanceReview,
    unavailableCoverage,
  };
}

function asSourceRecord(value: unknown): QualifiedBenchmarkSourceRecord {
  const record = asRecord(value);
  return {
    sourceId: String(record.sourceId ?? ""),
    documentId: String(record.documentId ?? ""),
    title: String(record.title ?? ""),
    publisher: String(record.publisher ?? ""),
    independenceGroup: String(record.independenceGroup ?? ""),
    sourceType: record.sourceType as QualifiedBenchmarkSourceRecord["sourceType"],
    locator: String(record.locator ?? ""),
    locationWithinSource: String(record.locationWithinSource ?? ""),
    publishedAt: String(record.publishedAt ?? ""),
    effectiveFrom: record.effectiveFrom === null ? null : String(record.effectiveFrom ?? ""),
    effectiveTo: record.effectiveTo === null ? null : String(record.effectiveTo ?? ""),
    accessedAt: String(record.accessedAt ?? ""),
    contentDigestSha256: String(record.contentDigestSha256 ?? ""),
    reviewedAt: String(record.reviewedAt ?? ""),
    supportedClaim: String(record.supportedClaim ?? ""),
    quantitativeValues: Array.isArray(record.quantitativeValues)
      ? record.quantitativeValues.map((value) => {
          const metric = asRecord(value);
          return {
            metricId: String(metric.metricId ?? ""),
            label: String(metric.label ?? ""),
            value: String(metric.value ?? ""),
            unit: metric.unit as "decimal_rate",
            locationWithinSource: String(metric.locationWithinSource ?? ""),
          };
        })
      : [],
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
    derivation: asDerivation(record.derivation),
    methodology: String(record.methodology ?? ""),
    limitations: strings(record.limitations),
  };
}

function asDerivation(value: unknown): QualifiedBenchmarkRangeDerivation {
  const record = asRecord(value);
  const boundary = (candidate: unknown): QualifiedBenchmarkDerivationBoundary => {
    const item = asRecord(candidate);
    return {
      offset: String(item.offset ?? ""),
      terms: Array.isArray(item.terms)
        ? item.terms.map((term) => ({ inputId: String(asRecord(term).inputId ?? ""), weight: String(asRecord(term).weight ?? "") }))
        : [],
      result: String(item.result ?? ""),
    };
  };
  return {
    methodVersion: record.methodVersion as typeof QUALIFIED_BENCHMARK_DERIVATION_VERSION,
    summary: String(record.summary ?? ""),
    inputs: Array.isArray(record.inputs)
      ? record.inputs.map((input) => ({
          inputId: String(asRecord(input).inputId ?? ""),
          sourceId: String(asRecord(input).sourceId ?? ""),
          metricId: String(asRecord(input).metricId ?? ""),
          value: String(asRecord(input).value ?? ""),
          unit: asRecord(input).unit as "decimal_rate",
        }))
      : [],
    lowerBound: boundary(record.lowerBound),
    upperBound: boundary(record.upperBound),
    assumptions: strings(record.assumptions),
    reviewedAt: String(record.reviewedAt ?? ""),
  };
}

function validateEntryProvenance(
  entry: QualifiedBenchmarkRegistryEntry,
  sourceRecords: QualifiedBenchmarkSourceRecord[],
  errors: string[],
): void {
  const linkedSources = entry.sourceIds
    .map((sourceId) => sourceRecords.find((source) => source.sourceId === sourceId))
    .filter((source): source is QualifiedBenchmarkSourceRecord => Boolean(source));
  const independentExternalGroups = new Set(
    linkedSources
      .filter((source) => source.sourceType !== "internal_anonymized_validation")
      .map((source) => source.independenceGroup),
  );
  if (independentExternalGroups.size < 2) {
    errors.push(`entry ${entry.referenceId} requires at least two independent external quantitative sources`);
  }

  const derivation = entry.derivation;
  if (
    derivation.methodVersion !== QUALIFIED_BENCHMARK_DERIVATION_VERSION ||
    derivation.summary.length < 80 ||
    !isoDate(derivation.reviewedAt) ||
    derivation.assumptions.length < 2
  ) {
    errors.push(`entry ${entry.referenceId} lacks a reproducible reviewed boundary derivation`);
  }
  const inputIds = new Set(derivation.inputs.map((input) => input.inputId));
  if (derivation.inputs.length < 2 || inputIds.size !== derivation.inputs.length) {
    errors.push(`entry ${entry.referenceId} derivation inputs are missing or duplicated`);
  }
  const usedSourceIds = new Set<string>();
  for (const input of derivation.inputs) {
    const source = linkedSources.find((candidate) => candidate.sourceId === input.sourceId);
    const metric = source?.quantitativeValues.find((candidate) => candidate.metricId === input.metricId);
    if (
      !nonempty(input.inputId) ||
      !source ||
      !metric ||
      input.unit !== "decimal_rate" ||
      input.value !== metric.value ||
      decimal(input.value) === null
    ) {
      errors.push(`entry ${entry.referenceId} derivation input ${input.inputId || "<missing>"} does not reconstruct from a linked source metric`);
    }
    usedSourceIds.add(input.sourceId);
  }
  if (entry.sourceIds.some((sourceId) => !usedSourceIds.has(sourceId))) {
    errors.push(`entry ${entry.referenceId} has a source that is not used by its exact range derivation`);
  }

  validateBoundary(entry, "lower", derivation.lowerBound, entry.range.low, derivation.inputs, linkedSources, errors);
  validateBoundary(entry, "upper", derivation.upperBound, entry.range.high, derivation.inputs, linkedSources, errors);
}

function validateBoundary(
  entry: QualifiedBenchmarkRegistryEntry,
  label: "lower" | "upper",
  boundary: QualifiedBenchmarkDerivationBoundary,
  expected: string,
  inputs: QualifiedBenchmarkDerivationInput[],
  sources: QualifiedBenchmarkSourceRecord[],
  errors: string[],
): void {
  const inputById = new Map(inputs.map((input) => [input.inputId, input]));
  const termInputIds = new Set(boundary.terms.map((term) => term.inputId));
  const independenceGroups = new Set<string>();
  if (boundary.terms.length < 2 || termInputIds.size !== boundary.terms.length || decimal(boundary.offset) === null) {
    errors.push(`entry ${entry.referenceId} ${label} boundary is not a reproducible multi-source calculation`);
    return;
  }
  let result = Number(boundary.offset);
  for (const term of boundary.terms) {
    const input = inputById.get(term.inputId);
    const weight = decimal(term.weight);
    if (!input || weight === null) {
      errors.push(`entry ${entry.referenceId} ${label} boundary contains an invalid derivation term`);
      return;
    }
    result += Number(input.value) * weight;
    const source = sources.find((candidate) => candidate.sourceId === input.sourceId);
    if (source?.sourceType !== "internal_anonymized_validation") independenceGroups.add(source?.independenceGroup ?? "");
  }
  if (independenceGroups.size < 2) {
    errors.push(`entry ${entry.referenceId} ${label} boundary requires two independent external sources`);
  }
  const reconstructed = result.toFixed(6);
  if (boundary.result !== expected || reconstructed !== expected) {
    errors.push(`entry ${entry.referenceId} ${label} boundary does not reconstruct to the displayed range`);
  }
}

function asProvenanceReview(value: unknown): QualifiedBenchmarkProvenanceReview {
  const record = asRecord(value);
  return {
    reviewVersion: String(record.reviewVersion ?? ""),
    reviewedAt: String(record.reviewedAt ?? ""),
    conclusion: String(record.conclusion ?? ""),
    sourceAssessments: Array.isArray(record.sourceAssessments)
      ? record.sourceAssessments.map((assessment) => {
          const item = asRecord(assessment);
          return {
            assessmentId: String(item.assessmentId ?? ""),
            title: String(item.title ?? ""),
            publisher: String(item.publisher ?? ""),
            locator: String(item.locator ?? ""),
            publishedAt: item.publishedAt === null ? null : String(item.publishedAt ?? ""),
            effectiveFrom: item.effectiveFrom === null ? null : String(item.effectiveFrom ?? ""),
            effectiveTo: item.effectiveTo === null ? null : String(item.effectiveTo ?? ""),
            locationWithinSource: String(item.locationWithinSource ?? ""),
            finding: String(item.finding ?? ""),
            supportsExactMerchantRange: item.supportsExactMerchantRange as false,
          };
        })
      : [],
    candidateRangeAssessments: Array.isArray(record.candidateRangeAssessments)
      ? record.candidateRangeAssessments.map((assessment) => {
          const item = asRecord(assessment);
          const previousRange = asRecord(item.previousRange);
          return {
            segmentId: String(item.segmentId ?? ""),
            displayLabel: String(item.displayLabel ?? ""),
            previousRange: { low: String(previousRange.low ?? ""), high: String(previousRange.high ?? "") },
            sourceAssessmentIds: strings(item.sourceAssessmentIds),
            decision: item.decision as "unavailable",
            derivationFinding: String(item.derivationFinding ?? ""),
            evidenceGaps: strings(item.evidenceGaps),
          };
        })
      : [],
  };
}

function validateProvenanceReview(review: QualifiedBenchmarkProvenanceReview, errors: string[]): void {
  if (!nonempty(review.reviewVersion) || !isoDate(review.reviewedAt) || review.conclusion.length < 80) {
    errors.push("provenance review requires a version, review date, and substantive conclusion");
  }
  const assessmentIds = new Set(review.sourceAssessments.map((assessment) => assessment.assessmentId));
  if (review.sourceAssessments.length === 0 || assessmentIds.size !== review.sourceAssessments.length) {
    errors.push("provenance review source assessments must be present and unique");
  }
  for (const assessment of review.sourceAssessments) {
    if (
      !nonempty(assessment.assessmentId) ||
      !nonempty(assessment.title) ||
      !nonempty(assessment.publisher) ||
      !nonempty(assessment.locator) ||
      !nonempty(assessment.locationWithinSource) ||
      assessment.finding.length < 40 ||
      assessment.supportsExactMerchantRange !== false ||
      (assessment.publishedAt !== null && !isoDate(assessment.publishedAt)) ||
      (assessment.effectiveFrom !== null && !isoDate(assessment.effectiveFrom)) ||
      (assessment.effectiveTo !== null && !isoDate(assessment.effectiveTo))
    ) {
      errors.push(`provenance source assessment ${assessment.assessmentId || "<missing>"} is incomplete`);
    }
  }
  const segments = new Set(review.candidateRangeAssessments.map((assessment) => assessment.segmentId));
  if (review.candidateRangeAssessments.length === 0 || segments.size !== review.candidateRangeAssessments.length) {
    errors.push("candidate range assessments must be present and unique by segment");
  }
  for (const assessment of review.candidateRangeAssessments) {
    if (
      !nonempty(assessment.segmentId) ||
      !nonempty(assessment.displayLabel) ||
      decimal(assessment.previousRange.low) === null ||
      decimal(assessment.previousRange.high) === null ||
      assessment.sourceAssessmentIds.length < 2 ||
      assessment.sourceAssessmentIds.some((sourceId) => !assessmentIds.has(sourceId)) ||
      assessment.decision !== "unavailable" ||
      assessment.derivationFinding.length < 80 ||
      assessment.evidenceGaps.length < 2
    ) {
      errors.push(`candidate range assessment ${assessment.segmentId || "<missing>"} is incomplete or not fail-closed`);
    }
  }
}

function directHttpsLocator(value: string): boolean {
  try {
    const locator = new URL(value);
    return locator.protocol === "https:" && locator.hostname.length > 0;
  } catch {
    return false;
  }
}

function singlePublisher(value: string): boolean {
  return nonempty(value) && !/[,&;]|\band\b|\//i.test(value);
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

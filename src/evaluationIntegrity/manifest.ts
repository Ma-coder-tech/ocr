import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { EvaluationIntegrityError } from "./errors.js";
import { normalizeSha256, sha256Canonical } from "./stable.js";
import {
  EVALUATION_PREFLIGHT_VERSION,
  EVALUATION_SOURCE_MANIFEST_VERSION,
  evaluationExecutionStages,
  paidEvaluationStages,
  type ApprovedExecutionPermit,
  type DeterministicEvaluationPreflight,
  type DeterministicPreflightDocument,
  type DuplicateDecision,
  type EvaluationExecutionStage,
  type EvaluationManifestDocument,
  type EvaluationSourceSnapshot,
  type EvaluationSourceManifest,
  type ObservedEvaluationSource,
  type RequestedDocumentExecution,
} from "./types.js";

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const statementPeriodSchema = z.object({ start: z.string().min(1), end: z.string().min(1) }).strict();
const parserControlSchema = z.object({
  controlId: z.string().min(1),
  status: z.enum(["pass", "warning", "fail", "not_applicable"]),
  basisId: z.string().nullable(),
  populationId: z.string().nullable(),
  expected: z.number().nullable(),
  actual: z.number().nullable(),
  delta: z.number().nullable(),
  tolerance: z.number().nullable(),
  reportabilityImpact: z.enum(["blocking", "warning", "none"]),
}).strict();
const parserDecisionSchema = z.object({
  status: z.enum(["accepted", "accepted_with_warnings", "needs_review", "unsupported", "failed"]),
  reportable: z.boolean(),
  confidence: z.enum(["high", "medium", "low", "needs_review"]),
  reason: z.string().min(1),
  reasonCode: z.string().min(1),
  failedControls: z.array(parserControlSchema),
  warningControls: z.array(parserControlSchema),
  reportabilityImpact: z.enum(["blocks_report", "allows_report_with_warnings", "allows_report"]),
}).strict();
const manifestDocumentSchema = z.object({
  sourceDocumentId: z.string().min(1),
  internalSourceRef: z.string().min(1),
  sha256: sha256Schema,
  byteCount: z.number().int().nonnegative(),
  displayFileName: z.string().nullable(),
  parsedProcessor: z.string().nullable(),
  parsedStatementPeriod: statementPeriodSchema.nullable(),
  parserEligibility: z.enum(["eligible", "unsupported", "failed"]),
  processorLayoutFamily: z.enum(["fiserv_family", "nxgen_vortax", "unknown"]),
  productScopeEligibility: z.enum(["eligible", "ineligible"]),
  productScopeReasonCode: z.enum(["fiserv_family_supported", "processor_layout_out_of_product_scope", "processor_layout_unknown"]),
  paidStageEligibility: z.enum(["eligible", "ineligible"]),
  paidStageExclusionReason: z.enum(["parser_ineligible", "product_scope_ineligible"]).nullable(),
  selectedDriver: z.string().nullable(),
  duplicateGroupId: z.string().min(1),
  selectedDuplicateRepresentative: z.boolean(),
  duplicateExclusionReason: z.literal("duplicate_checksum_non_representative").nullable(),
  allowedExecutionStages: z.array(z.enum(evaluationExecutionStages)),
  parentPreflightArtifactId: z.string().min(1),
  parentPreflightArtifactHash: sha256Schema,
  parserRecordId: z.string().min(1),
  parserDecision: parserDecisionSchema,
}).strict();
const duplicateDecisionSchema = z.object({
  duplicateGroupId: z.string().min(1),
  checksum: sha256Schema,
  groupMembers: z.array(z.string().min(1)).min(1),
  selectedRepresentative: z.string().min(1),
  exclusions: z.array(z.object({
    sourceDocumentId: z.string().min(1),
    reason: z.literal("duplicate_checksum_non_representative"),
  }).strict()),
}).strict();

export const evaluationSourceManifestSchema = z.object({
  type: z.literal(EVALUATION_SOURCE_MANIFEST_VERSION),
  expectedDocumentCount: z.number().int().nonnegative(),
  selectedDocumentCount: z.number().int().nonnegative(),
  parentPreflightArtifactId: z.string().min(1),
  parentPreflightArtifactHash: sha256Schema,
  documents: z.array(manifestDocumentSchema),
  duplicateDecisions: z.array(duplicateDecisionSchema),
  manifestContentHash: sha256Schema,
}).strict();

export type PreflightArtifactInput = {
  artifactId: string;
  documents: DeterministicPreflightDocument[];
};

export async function observeEvaluationSourceFile(input: {
  sourceDocumentId: string;
  internalSourceRef: string;
  sourcePath: string;
  displayFileName: string | null;
  displayMetadataStatementPeriod?: { start: string; end: string } | null;
}): Promise<ObservedEvaluationSource> {
  const snapshot = await readEvaluationSourceSnapshot(input);
  return snapshot.observation;
}

export async function readEvaluationSourceSnapshot(input: {
  sourceDocumentId: string;
  internalSourceRef: string;
  sourcePath: string;
  displayFileName: string | null;
  displayMetadataStatementPeriod?: { start: string; end: string } | null;
}): Promise<EvaluationSourceSnapshot> {
  const bytes = await readFile(input.sourcePath);
  return evaluationSourceSnapshotFromBytes({
    sourceDocumentId: input.sourceDocumentId,
    internalSourceRef: input.internalSourceRef,
    bytes,
    displayFileName: input.displayFileName,
    displayMetadataStatementPeriod: input.displayMetadataStatementPeriod,
  });
}

export function evaluationSourceSnapshotFromBytes(input: {
  sourceDocumentId: string;
  internalSourceRef: string;
  bytes: Uint8Array;
  displayFileName: string | null;
  displayMetadataStatementPeriod?: { start: string; end: string } | null;
}): EvaluationSourceSnapshot {
  const bytes = Uint8Array.from(input.bytes);
  const observation: ObservedEvaluationSource = {
    sourceDocumentId: input.sourceDocumentId,
    internalSourceRef: input.internalSourceRef,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    byteCount: bytes.byteLength,
    displayFileName: input.displayFileName,
    displayMetadataStatementPeriod: input.displayMetadataStatementPeriod,
  };
  return { observation, bytes };
}

export function createDeterministicPreflightArtifact(input: PreflightArtifactInput): DeterministicEvaluationPreflight {
  assertUnique(input.documents.map((item) => item.sourceDocumentId), "source document ID");
  assertUnique(input.documents.map((item) => item.internalSourceRef), "internal source reference");
  assertUnique(input.documents.map((item) => item.parserRecordId), "parser record ID");
  const documents = input.documents
    .map(normalizePreflightDocument)
    .sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId));
  const content = {
    type: EVALUATION_PREFLIGHT_VERSION,
    artifactId: input.artifactId,
    expectedDocumentCount: documents.length,
    documents,
  } as const;
  return { ...content, artifactHash: sha256Canonical(content) };
}

export function buildEvaluationSourceManifest(preflight: DeterministicEvaluationPreflight): EvaluationSourceManifest {
  assertPreflightIntegrity(preflight);
  const grouped = groupBy(preflight.documents, (document) => document.sha256);
  const duplicateDecisions: DuplicateDecision[] = [];
  const documents: EvaluationManifestDocument[] = [];

  for (const [checksum, members] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const sortedMembers = [...members].sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId));
    const representative = sortedMembers[0]!;
    const duplicateGroupId = `dup_${checksum.slice("sha256:".length, "sha256:".length + 20)}`;
    duplicateDecisions.push({
      duplicateGroupId,
      checksum,
      groupMembers: sortedMembers.map((item) => item.sourceDocumentId),
      selectedRepresentative: representative.sourceDocumentId,
      exclusions: sortedMembers.slice(1).map((item) => ({
        sourceDocumentId: item.sourceDocumentId,
        reason: "duplicate_checksum_non_representative" as const,
      })),
    });
    for (const document of sortedMembers) {
      const selected = document.sourceDocumentId === representative.sourceDocumentId;
      documents.push({
        ...document,
        duplicateGroupId,
        selectedDuplicateRepresentative: selected,
        duplicateExclusionReason: selected ? null : "duplicate_checksum_non_representative",
        parentPreflightArtifactId: preflight.artifactId,
        parentPreflightArtifactHash: preflight.artifactHash,
      });
    }
  }

  documents.sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId));
  duplicateDecisions.sort((left, right) => left.duplicateGroupId.localeCompare(right.duplicateGroupId));
  const content = {
    type: EVALUATION_SOURCE_MANIFEST_VERSION,
    expectedDocumentCount: preflight.expectedDocumentCount,
    selectedDocumentCount: documents.filter((item) => item.selectedDuplicateRepresentative).length,
    parentPreflightArtifactId: preflight.artifactId,
    parentPreflightArtifactHash: preflight.artifactHash,
    documents,
    duplicateDecisions,
  } as const;
  return { ...content, manifestContentHash: sha256Canonical(content) };
}

export function calculateManifestContentHash(manifest: EvaluationSourceManifest): string {
  const { manifestContentHash: _ignored, ...content } = manifest;
  return sha256Canonical(content);
}

export async function loadExactApprovedManifest(input: {
  manifestPath: string;
  approvedManifestHash: string;
}): Promise<EvaluationSourceManifest> {
  if (!input.manifestPath.trim()) {
    throw new EvaluationIntegrityError("manifest_schema_invalid", "An exact manifest path is required.");
  }
  const approvedHash = normalizeSha256(input.approvedManifestHash);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(input.manifestPath, "utf8"));
  } catch (error) {
    throw new EvaluationIntegrityError("manifest_schema_invalid", "The exact approved manifest could not be read as JSON.", {
      cause: error instanceof Error ? error.name : "unknown_error",
    });
  }
  const result = evaluationSourceManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new EvaluationIntegrityError("manifest_schema_invalid", "The exact approved manifest failed schema validation.", {
      issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  const manifest = result.data as EvaluationSourceManifest;
  assertManifestIntegrity(manifest);
  if (manifest.manifestContentHash !== approvedHash) {
    throw new EvaluationIntegrityError(
      "approved_manifest_hash_mismatch",
      "The manifest content hash does not equal the explicitly approved hash.",
      { approvedHash, manifestHash: manifest.manifestContentHash },
    );
  }
  return manifest;
}

export async function prepareApprovedExecution(input: {
  manifestPath: string;
  approvedManifestHash: string;
  observedSources: ObservedEvaluationSource[];
  requestedExecutions: RequestedDocumentExecution[];
}): Promise<{ manifest: EvaluationSourceManifest; permit: ApprovedExecutionPermit }> {
  const manifest = await loadExactApprovedManifest(input);
  const permit = validateExecutionSet({
    manifest,
    manifestPath: input.manifestPath,
    approvedManifestHash: normalizeSha256(input.approvedManifestHash),
    observedSources: input.observedSources,
    requestedExecutions: input.requestedExecutions,
  });
  return { manifest, permit };
}

export function validateExecutionSet(input: {
  manifest: EvaluationSourceManifest;
  manifestPath: string;
  approvedManifestHash: string;
  observedSources: ObservedEvaluationSource[];
  requestedExecutions: RequestedDocumentExecution[];
}): ApprovedExecutionPermit {
  assertManifestIntegrity(input.manifest);
  const observedById = new Map(input.observedSources.map((source) => [source.sourceDocumentId, normalizeObservedSource(source)]));
  if (observedById.size !== input.observedSources.length) {
    throw new EvaluationIntegrityError("unexpected_source_present", "Observed sources contain duplicate source document IDs.");
  }
  const expectedIds = new Set(input.manifest.documents.map((document) => document.sourceDocumentId));
  for (const document of input.manifest.documents) {
    const observed = observedById.get(document.sourceDocumentId);
    if (!observed) {
      throw new EvaluationIntegrityError("expected_source_missing", "An expected source document is missing.", {
        sourceDocumentId: document.sourceDocumentId,
      });
    }
    if (observed.sha256 !== document.sha256 || observed.internalSourceRef !== document.internalSourceRef) {
      throw new EvaluationIntegrityError("source_substituted", "An approved source identity was substituted.", {
        sourceDocumentId: document.sourceDocumentId,
      });
    }
    if (observed.byteCount !== document.byteCount) {
      throw new EvaluationIntegrityError("source_byte_count_mismatch", "An approved source byte count changed.", {
        sourceDocumentId: document.sourceDocumentId,
      });
    }
  }
  const unexpected = input.observedSources.find((source) => !expectedIds.has(source.sourceDocumentId));
  if (unexpected) {
    throw new EvaluationIntegrityError("unexpected_source_present", "An unexpected source document is present.", {
      sourceDocumentId: unexpected.sourceDocumentId,
    });
  }

  assertDuplicateDecisions(input.manifest);
  const requestedById = new Map(input.requestedExecutions.map((item) => [item.sourceDocumentId, item]));
  if (requestedById.size !== input.requestedExecutions.length) {
    throw new EvaluationIntegrityError("selected_count_mismatch", "Requested executions contain duplicate source document IDs.");
  }
  const selectedRows = input.manifest.documents.filter((document) => document.selectedDuplicateRepresentative);
  if (requestedById.size !== input.manifest.selectedDocumentCount || selectedRows.length !== input.manifest.selectedDocumentCount) {
    throw new EvaluationIntegrityError("selected_count_mismatch", "The requested execution count differs from the approved selected count.", {
      requestedCount: requestedById.size,
      approvedCount: input.manifest.selectedDocumentCount,
    });
  }

  const diagnostics: ApprovedExecutionPermit["diagnostics"] = [];
  const documents = selectedRows.map((document) => {
    const requested = requestedById.get(document.sourceDocumentId);
    if (!requested) {
      throw new EvaluationIntegrityError("selected_count_mismatch", "An approved duplicate representative was not selected.", {
        sourceDocumentId: document.sourceDocumentId,
      });
    }
    const paidStage = requested.stages.find((stage) => paidEvaluationStages.includes(stage as (typeof paidEvaluationStages)[number]));
    if (paidStage && document.parserEligibility !== "eligible") {
      throw new EvaluationIntegrityError("paid_stage_parser_ineligible", "A parser-ineligible document cannot enter a paid stage.", {
        sourceDocumentId: document.sourceDocumentId,
        stage: paidStage,
      });
    }
    if (paidStage && document.productScopeEligibility !== "eligible") {
      throw new EvaluationIntegrityError("paid_stage_product_scope_ineligible", "A product-scope-ineligible document cannot enter a paid stage.", {
        sourceDocumentId: document.sourceDocumentId,
        processorLayoutFamily: document.processorLayoutFamily,
        productScopeReasonCode: document.productScopeReasonCode,
        stage: paidStage,
      });
    }
    if (paidStage && document.paidStageEligibility !== "eligible") {
      throw new EvaluationIntegrityError("paid_stage_product_scope_ineligible", "The manifest does not admit this document to paid stages.", {
        sourceDocumentId: document.sourceDocumentId,
        paidStageExclusionReason: document.paidStageExclusionReason,
        stage: paidStage,
      });
    }
    const unauthorized = requested.stages.find((stage) => !document.allowedExecutionStages.includes(stage));
    if (unauthorized) {
      throw new EvaluationIntegrityError("stage_not_authorized", "A requested stage is not authorized by the manifest.", {
        sourceDocumentId: document.sourceDocumentId,
        stage: unauthorized,
      });
    }
    const observed = observedById.get(document.sourceDocumentId)!;
    if (
      observed.displayMetadataStatementPeriod &&
      document.parsedStatementPeriod &&
      !samePeriod(observed.displayMetadataStatementPeriod, document.parsedStatementPeriod)
    ) {
      diagnostics.push({
        code: "filename_period_disagrees_with_parsed_period",
        sourceDocumentId: document.sourceDocumentId,
        detail: "Display metadata period differs from the parser-derived period; checksum identity and parser facts remain authoritative.",
      });
    }
    return {
      sourceDocumentId: document.sourceDocumentId,
      internalSourceRef: document.internalSourceRef,
      sha256: document.sha256,
      byteCount: document.byteCount,
      selectedDriver: document.selectedDriver,
      processorLayoutFamily: document.processorLayoutFamily,
      productScopeEligibility: document.productScopeEligibility,
      paidStageEligibility: document.paidStageEligibility,
      stages: [...new Set(requested.stages)].sort(stageOrder),
    };
  });

  const nonRepresentativeRequest = input.requestedExecutions.find((requested) => {
    const row = input.manifest.documents.find((document) => document.sourceDocumentId === requested.sourceDocumentId);
    return !row || !row.selectedDuplicateRepresentative;
  });
  if (nonRepresentativeRequest) {
    throw new EvaluationIntegrityError("duplicate_decision_mismatch", "Execution selection does not follow the approved duplicate decision.", {
      sourceDocumentId: nonRepresentativeRequest.sourceDocumentId,
    });
  }
  documents.sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId));
  return {
    type: "approved_evaluation_execution_permit_v1",
    manifestPath: input.manifestPath,
    approvedManifestHash: input.approvedManifestHash,
    recalculatedManifestHash: calculateManifestContentHash(input.manifest),
    selectedCount: documents.length,
    documents,
    diagnostics,
  };
}

export function assertManifestIntegrity(manifest: EvaluationSourceManifest): void {
  const recalculated = calculateManifestContentHash(manifest);
  if (recalculated !== manifest.manifestContentHash) {
    throw new EvaluationIntegrityError("manifest_hash_mismatch", "Manifest content changed after its hash was calculated.", {
      recordedHash: manifest.manifestContentHash,
      recalculatedHash: recalculated,
    });
  }
  if (manifest.expectedDocumentCount !== manifest.documents.length) {
    throw new EvaluationIntegrityError("preflight_count_mismatch", "Manifest expected document count does not match its records.");
  }
  assertUnique(manifest.documents.map((item) => item.sourceDocumentId), "manifest source document ID");
  assertUnique(manifest.documents.map((item) => item.internalSourceRef), "manifest internal source reference");
  assertUnique(manifest.duplicateDecisions.map((item) => item.checksum), "duplicate decision checksum");
  assertUnique(manifest.duplicateDecisions.map((item) => item.duplicateGroupId), "duplicate decision group ID");
  for (const document of manifest.documents) normalizePreflightDocument(preflightDocumentFromManifest(document));
  const parentIds = new Set(manifest.documents.map((item) => item.parentPreflightArtifactId));
  const parentHashes = new Set(manifest.documents.map((item) => item.parentPreflightArtifactHash));
  if (
    parentIds.size !== 1 ||
    parentHashes.size !== 1 ||
    !parentIds.has(manifest.parentPreflightArtifactId) ||
    !parentHashes.has(manifest.parentPreflightArtifactHash)
  ) {
    throw new EvaluationIntegrityError("preflight_hash_mismatch", "Manifest rows do not share the declared parent preflight identity.");
  }
  if (calculateParentPreflightHash(manifest) !== manifest.parentPreflightArtifactHash) {
    throw new EvaluationIntegrityError("preflight_hash_mismatch", "Manifest rows do not reconstruct the declared deterministic preflight hash.");
  }
  assertDuplicateDecisions(manifest);
}

export function calculateParentPreflightHash(manifest: EvaluationSourceManifest): string {
  const reconstructedPreflightContent = {
    type: EVALUATION_PREFLIGHT_VERSION,
    artifactId: manifest.parentPreflightArtifactId,
    expectedDocumentCount: manifest.expectedDocumentCount,
    documents: manifest.documents.map(preflightDocumentFromManifest).sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId)),
  } as const;
  return sha256Canonical(reconstructedPreflightContent);
}

function assertPreflightIntegrity(preflight: DeterministicEvaluationPreflight): void {
  const { artifactHash: _ignored, ...content } = preflight;
  const recalculated = sha256Canonical(content);
  if (recalculated !== preflight.artifactHash) {
    throw new EvaluationIntegrityError("preflight_hash_mismatch", "Deterministic preflight content changed after hashing.");
  }
  if (preflight.expectedDocumentCount !== preflight.documents.length) {
    throw new EvaluationIntegrityError("preflight_count_mismatch", "Deterministic preflight count does not match its records.");
  }
}

function assertDuplicateDecisions(manifest: EvaluationSourceManifest): void {
  const grouped = groupBy(manifest.documents, (document) => document.sha256);
  if (grouped.size !== manifest.duplicateDecisions.length) {
    throw new EvaluationIntegrityError("duplicate_decision_mismatch", "Duplicate decision count does not match checksum groups.");
  }
  for (const decision of manifest.duplicateDecisions) {
    const members = (grouped.get(decision.checksum) ?? []).sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId));
    const memberIds = members.map((item) => item.sourceDocumentId);
    const selected = members.filter((item) => item.selectedDuplicateRepresentative);
    if (
      members.length === 0 ||
      decision.duplicateGroupId !== members[0]!.duplicateGroupId ||
      JSON.stringify(memberIds) !== JSON.stringify(decision.groupMembers) ||
      selected.length !== 1 ||
      selected[0]!.sourceDocumentId !== decision.selectedRepresentative ||
      decision.exclusions.length !== members.length - 1 ||
      JSON.stringify(
        [...decision.exclusions]
          .sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId))
          .map((item) => [item.sourceDocumentId, item.reason]),
      ) !== JSON.stringify(
        memberIds
          .filter((sourceDocumentId) => sourceDocumentId !== decision.selectedRepresentative)
          .map((sourceDocumentId) => [sourceDocumentId, "duplicate_checksum_non_representative"]),
      ) ||
      members.some((item) => item.sourceDocumentId === decision.selectedRepresentative
        ? item.duplicateExclusionReason !== null
        : item.duplicateExclusionReason !== "duplicate_checksum_non_representative")
    ) {
      throw new EvaluationIntegrityError("duplicate_decision_mismatch", "A checksum duplicate decision is incomplete or inconsistent.", {
        duplicateGroupId: decision.duplicateGroupId,
      });
    }
  }
  const selectedCount = manifest.documents.filter((item) => item.selectedDuplicateRepresentative).length;
  if (selectedCount !== manifest.selectedDocumentCount) {
    throw new EvaluationIntegrityError("selected_count_mismatch", "Manifest selected count does not match duplicate representatives.");
  }
}

function normalizePreflightDocument(document: DeterministicPreflightDocument): DeterministicPreflightDocument {
  const allowedExecutionStages = [...new Set(document.allowedExecutionStages)].sort(stageOrder);
  if (document.parserEligibility === "eligible" && !document.selectedDriver) {
    throw new EvaluationIntegrityError("manifest_schema_invalid", "Parser-eligible preflight records require a selected driver.");
  }
  const expectedScopeReason = document.processorLayoutFamily === "fiserv_family"
    ? "fiserv_family_supported"
    : document.processorLayoutFamily === "nxgen_vortax"
      ? "processor_layout_out_of_product_scope"
      : "processor_layout_unknown";
  const expectedProductScope = document.processorLayoutFamily === "fiserv_family" ? "eligible" : "ineligible";
  if (document.productScopeEligibility !== expectedProductScope || document.productScopeReasonCode !== expectedScopeReason) {
    throw new EvaluationIntegrityError("manifest_schema_invalid", "Product-scope state must be derived from the processor/layout family.");
  }
  const expectedPaidEligibility = document.parserEligibility === "eligible" && document.productScopeEligibility === "eligible"
    ? "eligible"
    : "ineligible";
  const expectedPaidExclusion = document.parserEligibility !== "eligible"
    ? "parser_ineligible"
    : document.productScopeEligibility !== "eligible"
      ? "product_scope_ineligible"
      : null;
  if (document.paidStageEligibility !== expectedPaidEligibility || document.paidStageExclusionReason !== expectedPaidExclusion) {
    throw new EvaluationIntegrityError("manifest_schema_invalid", "Paid-stage eligibility must be derived from parser and product-scope eligibility.");
  }
  const authorizesPaidStage = allowedExecutionStages.some((stage) => paidEvaluationStages.includes(stage as never));
  if (document.parserEligibility !== "eligible" && authorizesPaidStage) {
    throw new EvaluationIntegrityError("paid_stage_parser_ineligible", "Parser-ineligible preflight records cannot authorize paid stages.");
  }
  if (document.productScopeEligibility !== "eligible" && authorizesPaidStage) {
    throw new EvaluationIntegrityError("paid_stage_product_scope_ineligible", "Product-scope-ineligible preflight records cannot authorize paid stages.");
  }
  return {
    ...document,
    sha256: normalizeSha256(document.sha256),
    allowedExecutionStages,
  };
}

function normalizeObservedSource(source: ObservedEvaluationSource): ObservedEvaluationSource {
  return { ...source, sha256: normalizeSha256(source.sha256) };
}

function preflightDocumentFromManifest(document: EvaluationManifestDocument): DeterministicPreflightDocument {
  return {
    sourceDocumentId: document.sourceDocumentId,
    internalSourceRef: document.internalSourceRef,
    sha256: document.sha256,
    byteCount: document.byteCount,
    displayFileName: document.displayFileName,
    parsedProcessor: document.parsedProcessor,
    parsedStatementPeriod: document.parsedStatementPeriod,
    parserEligibility: document.parserEligibility,
    processorLayoutFamily: document.processorLayoutFamily,
    productScopeEligibility: document.productScopeEligibility,
    productScopeReasonCode: document.productScopeReasonCode,
    paidStageEligibility: document.paidStageEligibility,
    paidStageExclusionReason: document.paidStageExclusionReason,
    selectedDriver: document.selectedDriver,
    allowedExecutionStages: document.allowedExecutionStages,
    parserRecordId: document.parserRecordId,
    parserDecision: document.parserDecision,
  };
}

function samePeriod(left: { start: string; end: string }, right: { start: string; end: string }): boolean {
  return left.start === right.start && left.end === right.end;
}

function stageOrder(left: EvaluationExecutionStage, right: EvaluationExecutionStage): number {
  return evaluationExecutionStages.indexOf(left) - evaluationExecutionStages.indexOf(right);
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new EvaluationIntegrityError("manifest_schema_invalid", `Duplicate ${label} values are not allowed.`);
  }
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

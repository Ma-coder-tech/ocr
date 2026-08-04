import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvaluationRunIntegrityArtifact, verifyEvaluationRunIntegrityArtifact } from "./artifact.js";
import { EvaluationCostBudgetLedger, type CostReservationInput } from "./costLedger.js";
import { EvaluationIntegrityError } from "./errors.js";
import { provePackagesBEFinancialInvariance, type PackagesBEProjectionInput } from "./invariance.js";
import { createLifecycleLedger, lifecycleRefs, recordAiLifecycleState, recordLifecycleStage } from "./lifecycle.js";
import { evaluationSourceSnapshotFromBytes, loadExactApprovedManifest, validateExecutionSet } from "./manifest.js";
import {
  createRepositoryEvaluationAdapter,
  prepareRepositoryEvaluationSource,
  type PreparedRepositoryEvaluationSource,
  type RepositoryEvaluationAdapterId,
  type RepositoryProviderTransport,
  type RepositoryProviderTransportResult,
} from "./repositoryAdapter.js";
import type { OneTimeStatementEvaluationServices } from "./oneTimeStatementEvaluationAdapter.js";
import type { BusinessTypeId } from "../businessTypes.js";
import {
  paidEvaluationStages,
  type ApprovedExecutionPermit,
  type CostBudgetLedgerSnapshot,
  type EvaluationExecutionStage,
  type EvaluationLifecycleLedger,
  type EvaluationManifestDocument,
  type EvaluationRunIntegrityArtifact,
  type EvaluationSourceManifest,
  type EvaluationSourceSnapshot,
  type RequestedDocumentExecution,
} from "./types.js";

export type ManifestDrivenEvaluationCall = {
  sourceDocumentId: string;
  stage: (typeof paidEvaluationStages)[number];
  reservation: CostReservationInput;
};

export type ManifestDrivenEvaluationResult = {
  manifest: EvaluationSourceManifest;
  executionPermit: ApprovedExecutionPermit;
  lifecycleLedger: EvaluationLifecycleLedger;
  packageFinancialInvariance: EvaluationRunIntegrityArtifact["packageFinancialInvariance"];
  costLedger: CostBudgetLedgerSnapshot;
  providerCallOutcomes: EvaluationRunIntegrityArtifact["providerCallOutcomes"];
  finalStatus: EvaluationRunIntegrityArtifact["finalStatus"];
  reasonCodes: string[];
  liveRunBlocked: boolean;
  blockedPackages: EvaluationRunIntegrityArtifact["packageFinancialInvariance"][number]["result"]["packages"][number]["package"][];
  financialMismatchPaths: string[];
  artifact: EvaluationRunIntegrityArtifact;
  artifactPath: string;
};

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function blockUnmanifestedLiveEvaluationEntrypoint(entrypoint: string): never {
  throw new EvaluationIntegrityError(
    "manifest_schema_invalid",
    `Unmanifested live evaluation entry point is disabled: ${entrypoint}. Use the manifest-driven evaluation runner.`,
  );
}

export async function runManifestDrivenLiveEvaluation(input: {
  manifestPath: string;
  approvedManifestHash: string;
  requestedExecutions: RequestedDocumentExecution[];
  approvedBudgetUsd: number;
  calls: ManifestDrivenEvaluationCall[];
  outputArtifactPath: string;
  adapterId: RepositoryEvaluationAdapterId;
  businessType?: BusinessTypeId;
  resolveSourceBytes: (manifestRow: EvaluationManifestDocument) => Promise<Uint8Array>;
  transportForTesting?: RepositoryProviderTransport;
  oneTimeServicesForTesting?: Partial<OneTimeStatementEvaluationServices>;
  onAdapterCreatedForTesting?: () => void;
  afterSourceResolution?: (snapshots: ReadonlyArray<EvaluationSourceSnapshot>) => void | Promise<void>;
  beforePacketPreparationForTesting?: (sourceDocumentId: string, bytes: Uint8Array) => void | Promise<void>;
  afterPacketPreparedForTesting?: (sourceDocumentId: string, sanitizedPacket: unknown) => void | Promise<void>;
}): Promise<ManifestDrivenEvaluationResult> {
  await assertOutsideRepositoryArtifactPath(input.outputArtifactPath);
  const manifest = await loadExactApprovedManifest({
    manifestPath: input.manifestPath,
    approvedManifestHash: input.approvedManifestHash,
  });
  const snapshots = await Promise.all(manifest.documents.map(async (row) => evaluationSourceSnapshotFromBytes({
    sourceDocumentId: row.sourceDocumentId,
    internalSourceRef: row.internalSourceRef,
    bytes: await input.resolveSourceBytes(row),
    displayFileName: row.displayFileName,
    displayMetadataStatementPeriod: row.parsedStatementPeriod,
  })));
  await input.afterSourceResolution?.(snapshots.map(cloneSnapshot));

  const executionPermit = validateExecutionSet({
    manifest,
    manifestPath: input.manifestPath,
    approvedManifestHash: input.approvedManifestHash,
    observedSources: snapshots.map((snapshot) => snapshot.observation),
    requestedExecutions: input.requestedExecutions,
  });
  assertCallPlan(executionPermit, input.calls);

  const lifecycleLedger = createLifecycleLedger(manifest);
  const ledger = new EvaluationCostBudgetLedger(input.approvedBudgetUsd);
  for (const call of input.calls) ledger.reserve(call.reservation);

  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.observation.sourceDocumentId, snapshot]));
  const packets = new Map<string, unknown>();
  const beforeStates = new Map<string, PackagesBEProjectionInput>();
  const preparedSources: PreparedRepositoryEvaluationSource[] = [];

  try {
    for (const document of executionPermit.documents) {
      const row = manifest.documents.find((item) => item.sourceDocumentId === document.sourceDocumentId)!;
      const snapshot = snapshotById.get(document.sourceDocumentId)!;
      assertSnapshotStillMatches(row, snapshot);
      const packetBytes = Uint8Array.from(snapshot.bytes);
      await input.beforePacketPreparationForTesting?.(document.sourceDocumentId, packetBytes);
      assertBytesMatch(row, packetBytes);
      const prepared = await prepareRepositoryEvaluationSource({
        adapterId: input.adapterId,
        manifestRow: row,
        verifiedSourceBytes: packetBytes,
        businessType: input.businessType,
      });
      assertSnapshotStillMatches(row, snapshot);
      assertSanitizedPacketSourceIdentityExcluded(prepared.sanitizedPacket);
      await input.afterPacketPreparedForTesting?.(document.sourceDocumentId, structuredClone(prepared.sanitizedPacket));
      preparedSources.push(prepared);
      packets.set(document.sourceDocumentId, prepared.sanitizedPacket);
      beforeStates.set(document.sourceDocumentId, structuredClone(prepared.canonicalState));
    }
  } catch (error) {
    cancelReservedCalls(ledger, input.calls, [], "packet_preparation_failed");
    throw error;
  }

  const adapter = createRepositoryEvaluationAdapter({
    adapterId: input.adapterId,
    preparedSources,
    transport: input.transportForTesting,
    oneTimeServices: input.oneTimeServicesForTesting,
  });
  input.onAdapterCreatedForTesting?.();

  const providerCallOutcomes: EvaluationRunIntegrityArtifact["providerCallOutcomes"] = [];
  const results: Array<{ callId: string; value: unknown }> = [];
  let finalStatus: EvaluationRunIntegrityArtifact["finalStatus"] = "completed";
  let reasonCodes = ["evaluation_completed"];

  for (let index = 0; index < input.calls.length; index += 1) {
    const call = input.calls[index]!;
    const sourceDocument = manifest.documents.find((item) => item.sourceDocumentId === call.sourceDocumentId)!;
    const capabilityRef = `capability:${call.reservation.callId}`;
    const providerRef = `provider:${call.reservation.callId}`;
    recordAiLifecycleState({
      ledger: lifecycleLedger,
      sourceDocumentId: call.sourceDocumentId,
      stateName: "executed",
      state: "completed",
      reasonCodes: ["provider_call_started"],
    });
    recordLifecycleStage(lifecycleLedger, lifecycleRefs({
      sourceDocumentId: call.sourceDocumentId,
      stage: "capability_execution",
      state: "completed",
      reasonCodes: ["capability_execution_started"],
      manifestRowRef: sourceDocument.sourceDocumentId,
      preflightRecordRef: sourceDocument.parentPreflightArtifactId,
      parserRecordRef: sourceDocument.parserRecordId,
      capabilityExecutionRef: capabilityRef,
      providerRequestRef: providerRef,
    }));

    const started = Date.now();
    let result: RepositoryProviderTransportResult;
    try {
      result = await adapter.invoke({
        sanitizedPacket: packets.get(call.sourceDocumentId),
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
        reservedCallId: call.reservation.callId,
        approvedCallMetadata: structuredClone(call.reservation),
      });
    } catch (error) {
      const failure = providerFailure(error, Math.max(0, Date.now() - started));
      const costExceeded = finalizeCallOrDetectCostOverrun(ledger, call.reservation.callId, {
        ...failure.accounting,
        status: failure.status,
        billingDisposition: "unknown",
      });
      const reasonCode = costExceeded ? "cost_exceeded_reservation" : failure.reasonCode;
      providerCallOutcomes.push({
        callId: call.reservation.callId,
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
        status: costExceeded ? "failure" : failure.status,
        requestId: failure.accounting.requestId ?? null,
        reasonCodes: [reasonCode],
      });
      recordFailedLifecycle(lifecycleLedger, sourceDocument, call, costExceeded ? "failure" : failure.status, reasonCode, capabilityRef, providerRef);
      cancelReservedCalls(ledger, input.calls.slice(index + 1), providerCallOutcomes, "cancelled_after_provider_failure");
      finalStatus = !costExceeded && failure.status === "timeout" ? "timed_out" : "failed";
      reasonCodes = [reasonCode];
      break;
    }

    const costExceeded = finalizeCallOrDetectCostOverrun(ledger, call.reservation.callId, {
      ...result.accounting,
      status: "success",
      billingDisposition: result.accounting.billingDisposition ?? "unknown",
    });
    if (costExceeded) {
      providerCallOutcomes.push({
        callId: call.reservation.callId,
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
        status: "failure",
        requestId: result.accounting.requestId ?? null,
        reasonCodes: ["cost_exceeded_reservation"],
      });
      recordFailedLifecycle(lifecycleLedger, sourceDocument, call, "failure", "cost_exceeded_reservation", capabilityRef, providerRef);
      cancelReservedCalls(ledger, input.calls.slice(index + 1), providerCallOutcomes, "cancelled_after_cost_exceeded_reservation");
      finalStatus = "failed";
      reasonCodes = ["cost_exceeded_reservation"];
      break;
    }
    providerCallOutcomes.push({
      callId: call.reservation.callId,
      sourceDocumentId: call.sourceDocumentId,
      stage: call.stage,
      status: "success",
      requestId: result.accounting.requestId ?? null,
      reasonCodes: [...new Set(result.lifecycle?.reasonCodes ?? ["provider_call_completed"])].sort(),
    });
    results.push({ callId: call.reservation.callId, value: result.value });
    recordSuccessfulLifecycle(lifecycleLedger, sourceDocument, call, result, capabilityRef, providerRef);

    const current = adapter.canonicalStateFor(call.sourceDocumentId);
    const invariance = provePackagesBEFinancialInvariance(beforeStates.get(call.sourceDocumentId)!, current);
    if (!invariance.invariant) {
      cancelReservedCalls(ledger, input.calls.slice(index + 1), providerCallOutcomes, "cancelled_after_financial_invariance_failure");
      finalStatus = "blocked";
      reasonCodes = ["packages_b_e_financial_invariance_failed"];
      recordLifecycleStage(lifecycleLedger, lifecycleRefs({
        sourceDocumentId: call.sourceDocumentId,
        stage: "canonical_admission",
        state: "blocked",
        reasonCodes,
        manifestRowRef: sourceDocument.sourceDocumentId,
        preflightRecordRef: sourceDocument.parentPreflightArtifactId,
        parserRecordRef: sourceDocument.parserRecordId,
        capabilityExecutionRef: capabilityRef,
        providerRequestRef: providerRef,
      }));
      recordLifecycleStage(lifecycleLedger, lifecycleRefs({
        sourceDocumentId: call.sourceDocumentId,
        stage: "customer_publication",
        state: "withheld",
        reasonCodes: ["packages_b_e_financial_invariance_failed"],
        manifestRowRef: sourceDocument.sourceDocumentId,
        preflightRecordRef: sourceDocument.parentPreflightArtifactId,
        parserRecordRef: sourceDocument.parserRecordId,
        capabilityExecutionRef: capabilityRef,
        providerRequestRef: providerRef,
      }));
      break;
    }
    recordAdmissionLifecycle(lifecycleLedger, sourceDocument, result, capabilityRef, providerRef);
  }

  const packageFinancialInvariance = executionPermit.documents.map((document) => ({
    sourceDocumentId: document.sourceDocumentId,
    result: provePackagesBEFinancialInvariance(
      beforeStates.get(document.sourceDocumentId)!,
      adapter.canonicalStateFor(document.sourceDocumentId),
    ),
  }));
  if (packageFinancialInvariance.some((item) => !item.result.invariant)) {
    finalStatus = "blocked";
    reasonCodes = ["packages_b_e_financial_invariance_failed"];
  }

  const artifact = await writeVerifiedFinalArtifact({
    outputArtifactPath: input.outputArtifactPath,
    manifest,
    approvedManifestHash: input.approvedManifestHash,
    executionPermit,
    lifecycleLedger,
    packageFinancialInvariance,
    costBudgetLedger: ledger.snapshot(),
    providerCallOutcomes,
    finalStatus,
    reasonCodes,
  });
  const blockedPackages = [...new Set(packageFinancialInvariance.flatMap((item) =>
    item.result.packages.filter((proof) => !proof.invariant).map((proof) => proof.package),
  ))].sort();
  const financialMismatchPaths = [...new Set(packageFinancialInvariance.flatMap((item) => item.result.mismatchPaths))].sort();

  return {
    manifest,
    executionPermit,
    lifecycleLedger: artifact.lifecycleLedger,
    packageFinancialInvariance,
    costLedger: artifact.costBudgetLedger,
    providerCallOutcomes,
    finalStatus,
    reasonCodes,
    liveRunBlocked: packageFinancialInvariance.some((item) => item.result.liveRunBlocked),
    blockedPackages,
    financialMismatchPaths,
    artifact,
    artifactPath: path.resolve(input.outputArtifactPath),
  };
}

async function writeVerifiedFinalArtifact(input: {
  outputArtifactPath: string;
  manifest: EvaluationSourceManifest;
  approvedManifestHash: string;
  executionPermit: ApprovedExecutionPermit;
  lifecycleLedger: EvaluationLifecycleLedger;
  packageFinancialInvariance: EvaluationRunIntegrityArtifact["packageFinancialInvariance"];
  costBudgetLedger: CostBudgetLedgerSnapshot;
  providerCallOutcomes: EvaluationRunIntegrityArtifact["providerCallOutcomes"];
  finalStatus: EvaluationRunIntegrityArtifact["finalStatus"];
  reasonCodes: string[];
}): Promise<EvaluationRunIntegrityArtifact> {
  const outputPath = path.resolve(input.outputArtifactPath);
  const pendingPath = `${outputPath}.pending`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  const draft = buildEvaluationRunIntegrityArtifact(input);
  await writeFile(pendingPath, `${JSON.stringify(draft, null, 2)}\n`, { mode: 0o600 });
  const independentlyReadDraft = JSON.parse(await readFile(pendingPath, "utf8")) as EvaluationRunIntegrityArtifact;
  if (!verifyEvaluationRunIntegrityArtifact(independentlyReadDraft)) throw new Error("pending_integrity_artifact_verification_failed");

  for (const document of input.lifecycleLedger.documents) {
    const manifestRow = input.manifest.documents.find((item) => item.sourceDocumentId === document.sourceDocumentId)!;
    recordLifecycleStage(input.lifecycleLedger, lifecycleRefs({
      sourceDocumentId: document.sourceDocumentId,
      stage: "final_artifact",
      state: "completed",
      reasonCodes: ["final_integrity_artifact_written_and_verified"],
      manifestRowRef: manifestRow.sourceDocumentId,
      preflightRecordRef: manifestRow.parentPreflightArtifactId,
      parserRecordRef: manifestRow.parserRecordId,
      finalArtifactRef: "self:artifactContentHash",
    }));
  }
  const finalArtifact = buildEvaluationRunIntegrityArtifact(input);
  await writeFile(outputPath, `${JSON.stringify(finalArtifact, null, 2)}\n`, { mode: 0o600 });
  const independentlyReadFinal = JSON.parse(await readFile(outputPath, "utf8")) as EvaluationRunIntegrityArtifact;
  if (!verifyEvaluationRunIntegrityArtifact(independentlyReadFinal)) throw new Error("final_integrity_artifact_verification_failed");
  await unlink(pendingPath);
  return independentlyReadFinal;
}

function recordSuccessfulLifecycle(
  ledger: EvaluationLifecycleLedger,
  source: EvaluationManifestDocument,
  call: ManifestDrivenEvaluationCall,
  result: RepositoryProviderTransportResult,
  capabilityRef: string,
  providerRef: string,
): void {
  const reasons = result.lifecycle?.reasonCodes ?? ["provider_call_completed"];
  recordLifecycleStage(ledger, lifecycleRefs({
    sourceDocumentId: source.sourceDocumentId,
    stage: "provider_request",
    state: "completed",
    reasonCodes: reasons,
    manifestRowRef: source.sourceDocumentId,
    preflightRecordRef: source.parentPreflightArtifactId,
    parserRecordRef: source.parserRecordId,
    capabilityExecutionRef: capabilityRef,
    providerRequestRef: providerRef,
  }));
  if (result.lifecycle?.generated) recordAiLifecycleState({ ledger, sourceDocumentId: source.sourceDocumentId, stateName: "generated", state: "completed", reasonCodes: reasons });
  if (result.lifecycle?.schemaValid) recordAiLifecycleState({ ledger, sourceDocumentId: source.sourceDocumentId, stateName: "schema_valid", state: "completed", reasonCodes: reasons });
  if (result.lifecycle?.evidenceValidated) recordAiLifecycleState({ ledger, sourceDocumentId: source.sourceDocumentId, stateName: "evidence_validated", state: "completed", reasonCodes: reasons });
  if (result.lifecycle?.policyAccepted) recordAiLifecycleState({ ledger, sourceDocumentId: source.sourceDocumentId, stateName: "policy_accepted", state: "completed", reasonCodes: reasons });
  if (call.stage === "web_search_discovery" || call.stage === "document_retrieval") {
    recordLifecycleStage(ledger, lifecycleRefs({
      sourceDocumentId: source.sourceDocumentId,
      stage: "research_retrieval",
      state: "completed",
      reasonCodes: reasons,
      manifestRowRef: source.sourceDocumentId,
      preflightRecordRef: source.parentPreflightArtifactId,
      parserRecordRef: source.parserRecordId,
      capabilityExecutionRef: capabilityRef,
      providerRequestRef: providerRef,
      researchRetrievalRefs: result.lifecycle?.researchRetrievalRefs ?? [],
    }));
  }
  if (call.stage === "semantic_verification") {
    recordLifecycleStage(ledger, lifecycleRefs({
      sourceDocumentId: source.sourceDocumentId,
      stage: "semantic_verification",
      state: "completed",
      reasonCodes: reasons,
      manifestRowRef: source.sourceDocumentId,
      preflightRecordRef: source.parentPreflightArtifactId,
      parserRecordRef: source.parserRecordId,
      capabilityExecutionRef: capabilityRef,
      providerRequestRef: providerRef,
      semanticVerificationRef: result.lifecycle?.semanticVerificationRef ?? null,
    }));
  }
}

function recordAdmissionLifecycle(
  ledger: EvaluationLifecycleLedger,
  source: EvaluationManifestDocument,
  result: RepositoryProviderTransportResult,
  capabilityRef: string,
  providerRef: string,
): void {
  const reasons = result.lifecycle?.reasonCodes ?? ["provider_call_completed"];
  if (result.lifecycle?.canonicalAdmitted) {
    recordAiLifecycleState({ ledger, sourceDocumentId: source.sourceDocumentId, stateName: "canonical_admitted", state: "completed", reasonCodes: reasons });
    recordLifecycleStage(ledger, lifecycleRefs({
      sourceDocumentId: source.sourceDocumentId,
      stage: "canonical_admission",
      state: "completed",
      reasonCodes: reasons,
      manifestRowRef: source.sourceDocumentId,
      preflightRecordRef: source.parentPreflightArtifactId,
      parserRecordRef: source.parserRecordId,
      capabilityExecutionRef: capabilityRef,
      providerRequestRef: providerRef,
      canonicalAdmissionRef: result.lifecycle.canonicalAdmissionRef ?? null,
    }));
  }
  if (result.lifecycle?.customerPublished) {
    recordAiLifecycleState({ ledger, sourceDocumentId: source.sourceDocumentId, stateName: "customer_published", state: "completed", reasonCodes: reasons });
    recordLifecycleStage(ledger, lifecycleRefs({
      sourceDocumentId: source.sourceDocumentId,
      stage: "customer_publication",
      state: "completed",
      reasonCodes: reasons,
      manifestRowRef: source.sourceDocumentId,
      preflightRecordRef: source.parentPreflightArtifactId,
      parserRecordRef: source.parserRecordId,
      capabilityExecutionRef: capabilityRef,
      providerRequestRef: providerRef,
      customerPublicationRef: result.lifecycle.customerPublicationRef ?? null,
    }));
  }
}

function recordFailedLifecycle(
  ledger: EvaluationLifecycleLedger,
  source: EvaluationManifestDocument,
  call: ManifestDrivenEvaluationCall,
  status: "failure" | "timeout",
  reasonCode: string,
  capabilityRef: string,
  providerRef: string,
): void {
  recordLifecycleStage(ledger, lifecycleRefs({
    sourceDocumentId: source.sourceDocumentId,
    stage: "provider_request",
    state: "failed",
    reasonCodes: [reasonCode],
    manifestRowRef: source.sourceDocumentId,
    preflightRecordRef: source.parentPreflightArtifactId,
    parserRecordRef: source.parserRecordId,
    capabilityExecutionRef: capabilityRef,
    providerRequestRef: providerRef,
  }));
  if (call.stage === "semantic_verification") {
    recordLifecycleStage(ledger, lifecycleRefs({
      sourceDocumentId: source.sourceDocumentId,
      stage: "semantic_verification",
      state: "failed",
      reasonCodes: [reasonCode],
      manifestRowRef: source.sourceDocumentId,
      preflightRecordRef: source.parentPreflightArtifactId,
      parserRecordRef: source.parserRecordId,
      capabilityExecutionRef: capabilityRef,
      providerRequestRef: providerRef,
    }));
  }
}

function cancelReservedCalls(
  ledger: EvaluationCostBudgetLedger,
  calls: ManifestDrivenEvaluationCall[],
  outcomes: EvaluationRunIntegrityArtifact["providerCallOutcomes"],
  reasonCode: string,
): void {
  const snapshot = ledger.snapshot();
  for (const call of calls) {
    const entry = snapshot.entries.find((item) => item.callId === call.reservation.callId);
    if (entry?.status !== "reserved") continue;
    ledger.finalize(call.reservation.callId, {
      status: "cancelled_before_send",
      durationMs: 0,
      billingDisposition: "provider_confirmed_zero",
      observedOrEstimatedFinalCostUsd: 0,
    });
    outcomes.push({
      callId: call.reservation.callId,
      sourceDocumentId: call.sourceDocumentId,
      stage: call.stage,
      status: "cancelled_before_send",
      requestId: null,
      reasonCodes: [reasonCode],
    });
  }
}

function finalizeCallOrDetectCostOverrun(
  ledger: EvaluationCostBudgetLedger,
  callId: string,
  input: Parameters<EvaluationCostBudgetLedger["finalize"]>[1],
): boolean {
  try {
    ledger.finalize(callId, input);
    return false;
  } catch (error) {
    if (error instanceof EvaluationIntegrityError && error.code === "cost_exceeded_reservation") return true;
    throw error;
  }
}

function providerFailure(error: unknown, fallbackDurationMs: number): {
  status: "failure" | "timeout";
  reasonCode: string;
  accounting: {
    requestId?: string | null;
    durationMs: number;
    inputTokens?: number | null;
    outputTokens?: number | null;
    toolEvents?: Array<{ type: string; count: number }>;
    observedOrEstimatedFinalCostUsd?: number | null;
  };
} {
  const safe = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const timeout = safe.name === "AbortError" || safe.code === "provider_timeout";
  const accounting = safe.accounting && typeof safe.accounting === "object" ? safe.accounting as Record<string, unknown> : {};
  return {
    status: timeout ? "timeout" : "failure",
    reasonCode: timeout ? "provider_call_timed_out" : "provider_call_failed",
    accounting: {
      requestId: typeof accounting.requestId === "string" ? accounting.requestId : null,
      durationMs: typeof accounting.durationMs === "number" ? accounting.durationMs : fallbackDurationMs,
      inputTokens: typeof accounting.inputTokens === "number" ? accounting.inputTokens : null,
      outputTokens: typeof accounting.outputTokens === "number" ? accounting.outputTokens : null,
      toolEvents: Array.isArray(accounting.toolEvents) ? accounting.toolEvents as Array<{ type: string; count: number }> : [],
      observedOrEstimatedFinalCostUsd: typeof accounting.observedOrEstimatedFinalCostUsd === "number" ? accounting.observedOrEstimatedFinalCostUsd : null,
    },
  };
}

function assertCallPlan(permit: ApprovedExecutionPermit, calls: ManifestDrivenEvaluationCall[]): void {
  const callIds = calls.map((call) => call.reservation.callId);
  if (new Set(callIds).size !== callIds.length) throw new Error("Manifest-driven evaluation call IDs must be unique.");
  const capabilityByStage = {
    whole_statement_ai_review: "ai_sdk",
    web_search_discovery: "web_search",
    document_retrieval: "retrieval",
    semantic_verification: "semantic_verification",
  } as const;
  for (const call of calls) {
    const document = permit.documents.find((item) => item.sourceDocumentId === call.sourceDocumentId);
    if (!document || !document.stages.includes(call.stage)) {
      throw new EvaluationIntegrityError("stage_not_authorized", "A provider call is not covered by the approved execution permit.", {
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
      });
    }
    if (call.reservation.capability !== capabilityByStage[call.stage]) {
      throw new EvaluationIntegrityError("manifest_schema_invalid", "A provider call reservation capability does not match its approved stage.", {
        callId: call.reservation.callId,
        stage: call.stage,
      });
    }
  }
}

function assertSnapshotStillMatches(row: EvaluationManifestDocument, snapshot: EvaluationSourceSnapshot): void {
  assertBytesMatch(row, snapshot.bytes);
}

function assertBytesMatch(row: EvaluationManifestDocument, bytes: Uint8Array): void {
  const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (checksum !== row.sha256 || bytes.byteLength !== row.byteCount) {
    throw new EvaluationIntegrityError("verified_source_bytes_mismatch", "The in-memory source snapshot changed after manifest verification.", {
      sourceDocumentId: row.sourceDocumentId,
    });
  }
}

function assertSanitizedPacketSourceIdentityExcluded(packet: unknown): void {
  const forbidden = /^(?:sourcepath|filepath|localpath|filename|displayfilename|sha256|checksum|hash|internalsourceref|sourcedocumentid|uploadid)$/i;
  const visit = (value: unknown, fieldPath: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${fieldPath}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.test(key)) {
        throw new EvaluationIntegrityError("sanitized_packet_source_identity_leak", "Sanitized provider packets cannot contain source identity fields.", {
          fieldPath: fieldPath ? `${fieldPath}.${key}` : key,
        });
      }
      visit(item, fieldPath ? `${fieldPath}.${key}` : key);
    }
  };
  visit(packet, "");
}

export async function assertOutsideRepositoryArtifactPath(outputArtifactPath: string): Promise<void> {
  if (!path.isAbsolute(outputArtifactPath)) throw new Error("Evaluation artifact path must be absolute.");
  const repositoryRoot = await realpath(REPOSITORY_ROOT);
  const outputPath = await resolveProspectiveRealPath(path.resolve(outputArtifactPath));
  const relative = path.relative(repositoryRoot, outputPath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("Evaluation artifact must be written outside the repository.");
  }
}

async function resolveProspectiveRealPath(targetPath: string): Promise<string> {
  const missingSegments: string[] = [];
  let cursor = targetPath;
  while (true) {
    try {
      return path.join(await realpath(cursor), ...missingSegments.reverse());
    } catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new Error("Evaluation artifact path has no resolvable ancestor.");
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function cloneSnapshot(snapshot: EvaluationSourceSnapshot): EvaluationSourceSnapshot {
  return { observation: structuredClone(snapshot.observation), bytes: Uint8Array.from(snapshot.bytes) };
}

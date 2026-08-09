import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvaluationRunIntegrityArtifact, verifyEvaluationRunIntegrityArtifact } from "./artifact.js";
import {
  buildEvaluationRunIntegrityArtifactV2,
  verifyEvaluationRunIntegrityArtifactV2,
  writeAndVerifyEvaluationRunIntegrityArtifactV2,
} from "./canonicalAdmissionArtifact.js";
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
import { safeProviderReasonCode, safeProviderReasonCodes } from "../canonical/providerFailureDiagnostics.js";
import type { OneTimeResearchLimits, OneTimeStatementEvaluationServices } from "./oneTimeStatementEvaluationAdapter.js";
import type { FinalizedOneTimeStatementEvaluation } from "./oneTimeStatementEvaluationAdapter.js";
import { projectOneTimeCanonicalAdmissionResult } from "./oneTimeCanonicalAdmissionProjection.js";
import type { ApprovedFeeKnowledgeSourceRegistry } from "../canonical/feeKnowledgeTypes.js";
import type { FeeKnowledgeResearchQuestion } from "../canonical/feeKnowledgeResearch.js";
import type { CanonicalStatementAnalysis } from "../canonical/types.js";
import type { BusinessTypeId } from "../businessTypes.js";
import {
  paidEvaluationStages,
  type ApprovedExecutionPermit,
  type CostBudgetLedgerSnapshot,
  type EvaluationExecutionStage,
  type EvaluationLifecycleLedger,
  type EvaluationManifestDocument,
  type EvaluationRunIntegrityArtifact,
  type EvaluationRunIntegrityArtifactV2,
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
  artifact: EvaluationRunIntegrityArtifact | EvaluationRunIntegrityArtifactV2;
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
  oneTimeRegistryForTesting?: ApprovedFeeKnowledgeSourceRegistry | null;
  oneTimeResearchQuestionsForTesting?: (analysis: CanonicalStatementAnalysis) => FeeKnowledgeResearchQuestion[];
  oneTimeResearchLimitsForTesting?: OneTimeResearchLimits;
  onAdapterCreatedForTesting?: () => void;
  afterSourceResolution?: (snapshots: ReadonlyArray<EvaluationSourceSnapshot>) => void | Promise<void>;
  beforePacketPreparationForTesting?: (sourceDocumentId: string, bytes: Uint8Array) => void | Promise<void>;
  afterPacketPreparedForTesting?: (sourceDocumentId: string, sanitizedPacket: unknown) => void | Promise<void>;
  onCanonicalAdmissionProjectedForTesting?: (result: ReturnType<typeof projectOneTimeCanonicalAdmissionResult>) => void | Promise<void>;
  onOneTimeFinalizedForTesting?: (sourceDocumentId: string, finalized: FinalizedOneTimeStatementEvaluation) => void | Promise<void>;
  beforeArtifactV2WriteForTesting?: (input: {
    canonicalAdmissionResults: Array<ReturnType<typeof projectOneTimeCanonicalAdmissionResult>>;
    lifecycleLedger: EvaluationLifecycleLedger;
  }) => void | Promise<void>;
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
  assertCallPlan(executionPermit, input.calls, input.adapterId);

  const lifecycleLedger = createLifecycleLedger(manifest);
  const ledger = new EvaluationCostBudgetLedger(input.approvedBudgetUsd);
  for (const call of input.calls) ledger.reserve(reservationForExecution(call, input.adapterId));

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
        oneTimeRegistryForTesting: input.oneTimeRegistryForTesting,
        oneTimeResearchQuestionsForTesting: input.oneTimeResearchQuestionsForTesting,
        oneTimeResearchLimitsForTesting: input.oneTimeResearchLimitsForTesting,
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
  const sourceExecutionFailures = new Map<string, "failed" | "timed_out" | "safety_blocked">();
  let finalStatus: EvaluationRunIntegrityArtifact["finalStatus"] = "completed";
  let reasonCodes = ["evaluation_completed"];

  for (let index = 0; index < input.calls.length; index += 1) {
    const call = input.calls[index]!;
    const currentReservation = ledger.snapshot().entries.find((entry) => entry.callId === call.reservation.callId);
    if (currentReservation?.status === "cancelled_before_send") continue;
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
      ledger.assertReadyToSend(call.reservation.callId);
      const childBudgetController = input.adapterId === "one_time_statement_evaluation_v1" && call.stage === "whole_statement_ai_review"
        ? {
            reserve: (reservation: CostReservationInput) => { ledger.reserve(reservation); },
            assertReadyToSend: (callId: string) => { ledger.assertReadyToSend(callId); },
            finalize: (callId: string, finalizeInput: Parameters<EvaluationCostBudgetLedger["finalize"]>[1]) => finalizeCallOrDetectCostOverrun(ledger, callId, finalizeInput),
          }
        : null;
      result = await adapter.invoke({
        sanitizedPacket: packets.get(call.sourceDocumentId),
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
        reservedCallId: call.reservation.callId,
        approvedCallMetadata: structuredClone(reservationForExecution(call, input.adapterId)),
        ...(childBudgetController ? { childBudgetController } : {}),
      });
    } catch (error) {
      const failure = providerFailure(error, Math.max(0, Date.now() - started));
      const costExceeded = finalizeCallOrDetectCostOverrun(ledger, call.reservation.callId, {
        ...failure.accounting,
        status: failure.status,
        billingDisposition: "unknown",
      });
      const reasonCode = costExceeded ? "cost_exceeded_reservation" : failure.reasonCode;
      const failureReasonCodes = costExceeded ? [reasonCode] : failure.reasonCodes;
      providerCallOutcomes.push({
        callId: call.reservation.callId,
        ...outcomeOperationFields(reservationForExecution(call, input.adapterId)),
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
        status: costExceeded ? "failure" : failure.status,
        requestId: failure.accounting.requestId ?? null,
        reasonCodes: failureReasonCodes,
      });
      recordFailedLifecycle(lifecycleLedger, sourceDocument, call, costExceeded ? "failure" : failure.status, reasonCode, capabilityRef, providerRef);
      cancelReservedCalls(
        ledger,
        input.adapterId === "one_time_statement_evaluation_v1"
          ? input.calls.slice(index + 1).filter((pending) => pending.sourceDocumentId === call.sourceDocumentId)
          : input.calls.slice(index + 1),
        providerCallOutcomes,
        "cancelled_after_provider_failure",
      );
      const sourceStatus = !costExceeded && failure.status === "timeout" ? "timed_out" : "failed";
      sourceExecutionFailures.set(call.sourceDocumentId, sourceStatus);
      finalStatus = sourceStatus;
      reasonCodes = [reasonCode];
      if (input.adapterId === "one_time_statement_evaluation_v1") continue;
      break;
    }

    if (result.providerFailure) {
      const costExceeded = finalizeCallOrDetectCostOverrun(ledger, call.reservation.callId, {
        ...result.accounting,
        status: result.providerFailure.status,
        billingDisposition: "unknown",
      });
      const reasonCode = costExceeded ? "cost_exceeded_reservation" : result.providerFailure.reasonCode;
      const failureReasonCodes = costExceeded ? [reasonCode] : result.providerFailure.reasonCodes ?? [reasonCode];
      const status = costExceeded ? "failure" : result.providerFailure.status;
      providerCallOutcomes.push({
        callId: call.reservation.callId,
        ...outcomeOperationFields(reservationForExecution(call, input.adapterId)),
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
        status,
        requestId: result.accounting.requestId ?? null,
        reasonCodes: [...new Set(failureReasonCodes)].sort(),
      });
      recordFailedLifecycle(lifecycleLedger, sourceDocument, call, status, reasonCode, capabilityRef, providerRef);
      if (costExceeded) {
        cancelReservedCalls(
          ledger,
          input.calls.slice(index + 1).filter((pending) => pending.sourceDocumentId === call.sourceDocumentId),
          providerCallOutcomes,
          "cancelled_after_cost_exceeded_reservation",
        );
        sourceExecutionFailures.set(call.sourceDocumentId, "failed");
        finalStatus = "failed";
        reasonCodes = [reasonCode];
      } else if (result.providerFailure.scope === "research_graph") {
        const safetyBlocked = result.researchTerminal?.status === "safety_blocked";
        cancelReservedCalls(
          ledger,
          input.calls.slice(index + 1).filter((pending) => pending.sourceDocumentId === call.sourceDocumentId
            && (safetyBlocked || pending.stage !== "whole_statement_ai_review")),
          providerCallOutcomes,
          `cancelled_after_research_${result.researchTerminal?.status ?? "failed"}`,
        );
        if (safetyBlocked) {
          sourceExecutionFailures.set(call.sourceDocumentId, "safety_blocked");
          finalStatus = "blocked";
          reasonCodes = [reasonCode];
        }
      }
      continue;
    }

    const costExceeded = finalizeCallOrDetectCostOverrun(ledger, call.reservation.callId, {
      ...result.accounting,
      status: "success",
      billingDisposition: result.accounting.billingDisposition ?? "unknown",
    });
    if (costExceeded) {
      providerCallOutcomes.push({
        callId: call.reservation.callId,
        ...outcomeOperationFields(reservationForExecution(call, input.adapterId)),
        sourceDocumentId: call.sourceDocumentId,
        stage: call.stage,
        status: "failure",
        requestId: result.accounting.requestId ?? null,
        reasonCodes: ["cost_exceeded_reservation"],
      });
      recordFailedLifecycle(lifecycleLedger, sourceDocument, call, "failure", "cost_exceeded_reservation", capabilityRef, providerRef);
      cancelReservedCalls(
        ledger,
        input.adapterId === "one_time_statement_evaluation_v1"
          ? input.calls.slice(index + 1).filter((pending) => pending.sourceDocumentId === call.sourceDocumentId)
          : input.calls.slice(index + 1),
        providerCallOutcomes,
        "cancelled_after_cost_exceeded_reservation",
      );
      sourceExecutionFailures.set(call.sourceDocumentId, "failed");
      finalStatus = "failed";
      reasonCodes = ["cost_exceeded_reservation"];
      if (input.adapterId === "one_time_statement_evaluation_v1") continue;
      break;
    }
    providerCallOutcomes.push(...(result.childProviderCallOutcomes ?? []));
    providerCallOutcomes.push({
      callId: call.reservation.callId,
      ...outcomeOperationFields(reservationForExecution(call, input.adapterId)),
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
    if (result.researchTerminal) {
      const safetyBlocked = result.researchTerminal.status === "safety_blocked";
      cancelReservedCalls(
        ledger,
        input.calls.slice(index + 1).filter((pending) => pending.sourceDocumentId === call.sourceDocumentId
          && (safetyBlocked || pending.stage !== "whole_statement_ai_review")),
        providerCallOutcomes,
        `cancelled_after_research_${result.researchTerminal.status}`,
      );
      if (safetyBlocked) {
        sourceExecutionFailures.set(call.sourceDocumentId, "safety_blocked");
        finalStatus = "blocked";
        reasonCodes = ["canonical_admission_safety_blocked"];
      }
    }
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

  const sourceExecutionStatuses = new Map(executionPermit.documents.map((document) => [
    document.sourceDocumentId,
    deriveSourceExecutionStatus(
      document.sourceDocumentId,
      providerCallOutcomes,
      sourceExecutionFailures,
      adapter.oneTimeResearchTerminalFor(document.sourceDocumentId),
    ),
  ] as const));
  if (input.adapterId === "one_time_statement_evaluation_v1" && [...sourceExecutionStatuses.values()].includes("timed_out")) {
    finalStatus = "timed_out";
    reasonCodes = ["provider_call_timed_out"];
  } else if (input.adapterId === "one_time_statement_evaluation_v1" && [...sourceExecutionStatuses.values()].includes("failed")) {
    finalStatus = "failed";
    reasonCodes = ["provider_call_failed"];
  } else if (input.adapterId === "one_time_statement_evaluation_v1" && [...sourceExecutionStatuses.values()].includes("safety_blocked")) {
    finalStatus = "blocked";
    reasonCodes = ["canonical_admission_safety_blocked"];
  }

  const canonicalAdmissionResults = [] as Array<ReturnType<typeof projectOneTimeCanonicalAdmissionResult>>;
  const preparedSanitizedPackets = [] as Array<{ resultId: string; packet: import("./oneTimeStatementEvaluationAdapter.js").OneTimeStatementEvaluationPacket }>;
  if (input.adapterId === "one_time_statement_evaluation_v1") {
    for (const document of executionPermit.documents) {
      const executionStatus = sourceExecutionStatuses.get(document.sourceDocumentId) ?? "failed";
      const finalized = adapter.finalizeOneTimeFor(document.sourceDocumentId, executionStatus);
      await input.onOneTimeFinalizedForTesting?.(document.sourceDocumentId, structuredClone(finalized));
      const projected = projectOneTimeCanonicalAdmissionResult({ sourceDocumentId: document.sourceDocumentId, finalized });
      await input.onCanonicalAdmissionProjectedForTesting?.(structuredClone(projected));
      canonicalAdmissionResults.push(projected);
      preparedSanitizedPackets.push({ resultId: projected.resultId, packet: finalized.preparedPacket });
      recordCanonicalAdmissionLifecycle(lifecycleLedger, manifest, projected);
    }
    if (finalStatus === "completed") {
      const rejected = canonicalAdmissionResults.find((result) => result.admissionDisposition !== "admitted");
      if (rejected) {
        finalStatus = "blocked";
        reasonCodes = [rejected.admission.validationErrorCodes[0] ?? "canonical_admission_rejected"];
      }
    }
    canonicalAdmissionResults.sort((left, right) => left.resultId.localeCompare(right.resultId));
    preparedSanitizedPackets.sort((left, right) => left.resultId.localeCompare(right.resultId));
  }

  const finalInvariance = executionPermit.documents.map((document) => ({
    sourceDocumentId: document.sourceDocumentId,
    result: provePackagesBEFinancialInvariance(
      beforeStates.get(document.sourceDocumentId)!,
      adapter.canonicalStateFor(document.sourceDocumentId),
    ),
  }));
  if (finalInvariance.some((item) => !item.result.invariant)) {
    finalStatus = "blocked";
    reasonCodes = ["packages_b_e_financial_invariance_failed"];
  }

  const artifactInput = {
    outputArtifactPath: input.outputArtifactPath,
    manifest,
    approvedManifestHash: input.approvedManifestHash,
    executionPermit,
    lifecycleLedger,
    packageFinancialInvariance: finalInvariance,
    costBudgetLedger: ledger.snapshot(),
    providerCallOutcomes,
    finalStatus,
    reasonCodes,
  };
  const artifact = input.adapterId === "one_time_statement_evaluation_v1"
    ? await (async () => {
        await input.beforeArtifactV2WriteForTesting?.(structuredClone({ canonicalAdmissionResults, lifecycleLedger }));
        return writeVerifiedFinalArtifactV2({
          ...artifactInput,
          canonicalAdmissionResults,
          preparedSanitizedPackets,
        });
      })()
    : await writeVerifiedFinalArtifact(artifactInput);
  const blockedPackages = [...new Set(finalInvariance.flatMap((item) =>
    item.result.packages.filter((proof) => !proof.invariant).map((proof) => proof.package),
  ))].sort();
  const financialMismatchPaths = [...new Set(finalInvariance.flatMap((item) => item.result.mismatchPaths))].sort();

  return {
    manifest,
    executionPermit,
    lifecycleLedger: artifact.lifecycleLedger,
    packageFinancialInvariance: finalInvariance,
    costLedger: artifact.costBudgetLedger,
    providerCallOutcomes,
    finalStatus,
    reasonCodes,
    liveRunBlocked: finalInvariance.some((item) => item.result.liveRunBlocked),
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

async function writeVerifiedFinalArtifactV2(input: {
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
  canonicalAdmissionResults: Array<ReturnType<typeof projectOneTimeCanonicalAdmissionResult>>;
  preparedSanitizedPackets: Array<{ resultId: string; packet: import("./oneTimeStatementEvaluationAdapter.js").OneTimeStatementEvaluationPacket }>;
}): Promise<EvaluationRunIntegrityArtifactV2> {
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
  const artifact = buildEvaluationRunIntegrityArtifactV2({
    manifest: input.manifest,
    approvedManifestHash: input.approvedManifestHash,
    executionPermit: input.executionPermit,
    lifecycleLedger: input.lifecycleLedger,
    packageFinancialInvariance: input.packageFinancialInvariance,
    costBudgetLedger: input.costBudgetLedger,
    providerCallOutcomes: input.providerCallOutcomes,
    finalStatus: input.finalStatus,
    reasonCodes: input.reasonCodes,
    canonicalAdmissionResults: input.canonicalAdmissionResults,
    preparedSanitizedPackets: input.preparedSanitizedPackets,
  });
  if (!verifyEvaluationRunIntegrityArtifactV2(artifact)) throw new Error("final_integrity_artifact_v2_verification_failed");
  await writeAndVerifyEvaluationRunIntegrityArtifactV2({ artifact, outputPath: path.resolve(input.outputArtifactPath) });
  const independentlyRead = JSON.parse(await readFile(path.resolve(input.outputArtifactPath), "utf8")) as EvaluationRunIntegrityArtifactV2;
  if (!verifyEvaluationRunIntegrityArtifactV2(independentlyRead)) throw new Error("published_integrity_artifact_v2_verification_failed");
  return independentlyRead;
}

function recordCanonicalAdmissionLifecycle(
  ledger: EvaluationLifecycleLedger,
  manifest: EvaluationSourceManifest,
  result: ReturnType<typeof projectOneTimeCanonicalAdmissionResult>,
): void {
  const source = manifest.documents.find((item) => item.sourceDocumentId === result.sourceDocumentId);
  if (!source) throw new Error("canonical_admission_manifest_source_missing");
  const reason = result.reasonCodes[0]!;
  const state = result.admissionDisposition === "admitted" ? "completed"
    : result.admissionDisposition === "safety_blocked" ? "blocked" : "withheld";
  recordAiLifecycleState({
    ledger,
    sourceDocumentId: source.sourceDocumentId,
    stateName: "canonical_admitted",
    state,
    reasonCodes: [reason],
  });
  recordLifecycleStage(ledger, lifecycleRefs({
    sourceDocumentId: source.sourceDocumentId,
    stage: "canonical_admission",
    state,
    reasonCodes: [reason],
    manifestRowRef: source.sourceDocumentId,
    preflightRecordRef: source.parentPreflightArtifactId,
    parserRecordRef: source.parserRecordId,
    capabilityExecutionRef: result.executionRef,
    canonicalAdmissionRef: result.lifecycleAdmissionRef,
  }));
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
    const researchStatus = result.researchStageStatus ?? result.researchTerminal?.status;
    const researchState = researchStatus === "safety_blocked" ? "blocked"
      : researchStatus ? "failed" : "completed";
    recordLifecycleStage(ledger, lifecycleRefs({
      sourceDocumentId: source.sourceDocumentId,
      stage: "research_retrieval",
      state: researchState,
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
    const semanticStatus = result.researchStageStatus ?? result.researchTerminal?.status;
    const semanticState = semanticStatus === "safety_blocked" ? "blocked"
      : semanticStatus ? "failed" : "completed";
    recordLifecycleStage(ledger, lifecycleRefs({
      sourceDocumentId: source.sourceDocumentId,
      stage: "semantic_verification",
      state: semanticState,
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
      ...outcomeOperationFields(entry),
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

function reservationForExecution(
  call: ManifestDrivenEvaluationCall,
  adapterId: RepositoryEvaluationAdapterId,
): CostReservationInput {
  if (adapterId !== "one_time_statement_evaluation_v1" || call.stage !== "whole_statement_ai_review") {
    return structuredClone(call.reservation);
  }
  return {
    ...structuredClone(call.reservation),
    operationKind: "package_5b_budget_envelope",
    operationRef: "package_5b_budget_envelope",
    reservationScope: "budget_envelope",
  };
}

function outcomeOperationFields(input: Pick<CostReservationInput, "parentCallId" | "operationKind" | "operationRef">): {
  parentCallId: string | null;
  operationKind: NonNullable<CostReservationInput["operationKind"]>;
  operationRef: string | null;
} {
  return {
    parentCallId: input.parentCallId ?? null,
    operationKind: input.operationKind ?? "manifest_call",
    operationRef: input.operationRef ?? null,
  };
}

function deriveSourceExecutionStatus(
  sourceDocumentId: string,
  outcomes: EvaluationRunIntegrityArtifact["providerCallOutcomes"],
  explicitFailures: ReadonlyMap<string, "failed" | "timed_out" | "safety_blocked">,
  graphTerminal: "failed" | "timed_out" | "safety_blocked" | null,
): "completed" | "failed" | "timed_out" | "safety_blocked" {
  const explicit = explicitFailures.get(sourceDocumentId);
  if (explicit) return explicit;
  const sourceOutcomes = outcomes.filter((outcome) => outcome.sourceDocumentId === sourceDocumentId);
  const wholeStatementOutcome = sourceOutcomes.find((outcome) =>
    outcome.stage === "whole_statement_ai_review"
    && outcome.operationKind !== "package_5b_work_unit"
  );
  if (wholeStatementOutcome?.status === "success") return "completed";
  if (graphTerminal) return graphTerminal;
  if (sourceOutcomes.some((outcome) => outcome.status === "timeout")) return "timed_out";
  if (sourceOutcomes.some((outcome) => outcome.status === "failure")) return "failed";
  return "failed";
}

function providerFailure(error: unknown, fallbackDurationMs: number): {
  status: "failure" | "timeout";
  reasonCode: string;
  reasonCodes: string[];
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
    reasonCode: safeProviderReasonCode(error, timeout ? "provider_call_timed_out" : "provider_call_failed"),
    reasonCodes: safeProviderReasonCodes(error, timeout ? "provider_call_timed_out" : "provider_call_failed"),
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

function assertCallPlan(
  permit: ApprovedExecutionPermit,
  calls: ManifestDrivenEvaluationCall[],
  adapterId: RepositoryEvaluationAdapterId,
): void {
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
  if (adapterId === "one_time_statement_evaluation_v1") {
    const stageOrder = ["web_search_discovery", "document_retrieval", "semantic_verification", "whole_statement_ai_review"] as const;
    for (const document of permit.documents) {
      const documentCalls = calls.filter((call) => call.sourceDocumentId === document.sourceDocumentId);
      const ranks = documentCalls.map((call) => stageOrder.indexOf(call.stage));
      if (ranks.some((rank, index) => index > 0 && rank < ranks[index - 1]!)) {
        throw new EvaluationIntegrityError("manifest_schema_invalid", "One-time evaluation calls are out of stage order.", {
          sourceDocumentId: document.sourceDocumentId,
        });
      }
      const counts = Object.fromEntries(stageOrder.map((stage) => [stage, documentCalls.filter((call) => call.stage === stage).length])) as Record<(typeof stageOrder)[number], number>;
      if (counts.whole_statement_ai_review !== 1
        || counts.web_search_discovery < 1
        || counts.document_retrieval < 1
        || counts.semantic_verification < 1) {
        throw new EvaluationIntegrityError("manifest_schema_invalid", "One-time evaluation call plan does not contain the exact approved stage population.", {
          sourceDocumentId: document.sourceDocumentId,
        });
      }
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

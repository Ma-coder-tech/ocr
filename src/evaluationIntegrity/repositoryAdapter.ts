import type { BusinessTypeId } from "../businessTypes.js";
import type { CostReservationInput } from "./costLedger.js";
import type { PackagesBEProjectionInput } from "./invariance.js";
import {
  createOneTimeStatementEvaluationTransport,
  prepareOneTimeStatementEvaluationSource,
  type OneTimeStatementEvaluationServices,
  type PreparedOneTimeStatementEvaluation,
} from "./oneTimeStatementEvaluationAdapter.js";
import { sha256Canonical } from "./stable.js";
import type { CostToolEvent, EvaluationExecutionStage, EvaluationManifestDocument } from "./types.js";

export const repositoryEvaluationAdapterIds = [
  "one_time_statement_evaluation_v1",
  "verified_canonical_packet_v1",
] as const;
export type RepositoryEvaluationAdapterId = (typeof repositoryEvaluationAdapterIds)[number];

export type RepositoryProviderTransportInput = {
  sanitizedPacket: unknown;
  sourceDocumentId: string;
  stage: EvaluationExecutionStage;
  reservedCallId: string;
  approvedCallMetadata: CostReservationInput;
};

export type RepositoryProviderTransportResult = {
  value: unknown;
  canonicalState?: PackagesBEProjectionInput;
  accounting: {
    requestId?: string | null;
    durationMs: number;
    inputTokens?: number | null;
    outputTokens?: number | null;
    toolEvents?: CostToolEvent[];
    observedOrEstimatedFinalCostUsd?: number | null;
    billingDisposition?: "observed" | "provider_confirmed_zero" | "unknown";
  };
  lifecycle?: {
    generated?: boolean;
    schemaValid?: boolean;
    evidenceValidated?: boolean;
    policyAccepted?: boolean;
    canonicalAdmitted?: boolean;
    customerPublished?: boolean;
    researchRetrievalRefs?: string[];
    semanticVerificationRef?: string | null;
    canonicalAdmissionRef?: string | null;
    customerPublicationRef?: string | null;
    reasonCodes?: string[];
  };
};

export type RepositoryProviderTransport = (
  input: RepositoryProviderTransportInput,
) => Promise<RepositoryProviderTransportResult>;

export type PreparedRepositoryEvaluationSource = {
  adapterId: RepositoryEvaluationAdapterId;
  sourceDocumentId: string;
  sanitizedPacket: unknown;
  canonicalState: PackagesBEProjectionInput;
  oneTime: PreparedOneTimeStatementEvaluation | null;
};

export type RepositoryEvaluationAdapter = {
  invoke(input: RepositoryProviderTransportInput): Promise<RepositoryProviderTransportResult>;
  canonicalStateFor(sourceDocumentId: string): PackagesBEProjectionInput;
};

export async function prepareRepositoryEvaluationSource(input: {
  adapterId: RepositoryEvaluationAdapterId;
  manifestRow: EvaluationManifestDocument;
  verifiedSourceBytes: Uint8Array;
  businessType?: BusinessTypeId;
}): Promise<PreparedRepositoryEvaluationSource> {
  assertAdapterId(input.adapterId);
  if (input.adapterId === "one_time_statement_evaluation_v1") {
    const oneTime = await prepareOneTimeStatementEvaluationSource({
      manifestRow: input.manifestRow,
      verifiedSourceBytes: input.verifiedSourceBytes,
      businessType: input.businessType ?? "restaurant_food_beverage",
    });
    return {
      adapterId: input.adapterId,
      sourceDocumentId: input.manifestRow.sourceDocumentId,
      sanitizedPacket: structuredClone(oneTime.sanitizedPacket),
      canonicalState: structuredClone(oneTime.canonicalState),
      oneTime,
    };
  }
  const envelope = parseVerifiedCanonicalEnvelope(input.verifiedSourceBytes);
  return {
    adapterId: input.adapterId,
    sourceDocumentId: input.manifestRow.sourceDocumentId,
    sanitizedPacket: structuredClone(envelope.sanitizedPacket),
    canonicalState: structuredClone(envelope.canonicalState),
    oneTime: null,
  };
}

export function createRepositoryEvaluationAdapter(input: {
  adapterId: RepositoryEvaluationAdapterId;
  preparedSources: readonly PreparedRepositoryEvaluationSource[];
  transport?: RepositoryProviderTransport;
  oneTimeServices?: Partial<OneTimeStatementEvaluationServices>;
}): RepositoryEvaluationAdapter {
  assertAdapterId(input.adapterId);
  if (input.preparedSources.some((source) => source.adapterId !== input.adapterId)) throw new Error("Prepared source adapter ID mismatch.");
  const preparedBySource = new Map(input.preparedSources.map((source) => [source.sourceDocumentId, source]));
  if (preparedBySource.size !== input.preparedSources.length) throw new Error("Prepared source IDs must be unique.");
  const canonicalStateBySource = new Map(input.preparedSources.map((source) => [source.sourceDocumentId, structuredClone(source.canonicalState)]));
  const oneTimeBySource = new Map(
    input.preparedSources
      .filter((source): source is PreparedRepositoryEvaluationSource & { oneTime: PreparedOneTimeStatementEvaluation } => Boolean(source.oneTime))
      .map((source) => [source.sourceDocumentId, source.oneTime]),
  );
  const transport = input.transport ?? (input.adapterId === "one_time_statement_evaluation_v1"
    ? createOneTimeStatementEvaluationTransport({ preparedBySource: oneTimeBySource, services: input.oneTimeServices })
    : unavailableRepositoryTransport);

  return {
    async invoke(request) {
      const prepared = preparedBySource.get(request.sourceDocumentId);
      if (!prepared) throw new Error(`Approved source was not prepared: ${request.sourceDocumentId}.`);
      if (request.approvedCallMetadata.callId !== request.reservedCallId) throw new Error("Approved call metadata does not match the reserved call ID.");
      if (sha256Canonical(request.sanitizedPacket) !== sha256Canonical(prepared.sanitizedPacket)) {
        throw new Error("approved_sanitized_packet_mismatch");
      }
      const result = await transport({
        sanitizedPacket: structuredClone(request.sanitizedPacket),
        sourceDocumentId: request.sourceDocumentId,
        stage: request.stage,
        reservedCallId: request.reservedCallId,
        approvedCallMetadata: structuredClone(request.approvedCallMetadata),
      });
      if (result.canonicalState) canonicalStateBySource.set(request.sourceDocumentId, structuredClone(result.canonicalState));
      return structuredClone(result);
    },
    canonicalStateFor(sourceDocumentId) {
      const state = canonicalStateBySource.get(sourceDocumentId);
      if (!state) throw new Error(`Canonical state was not prepared for approved source ${sourceDocumentId}.`);
      return structuredClone(state);
    },
  };
}

function assertAdapterId(adapterId: string): asserts adapterId is RepositoryEvaluationAdapterId {
  if (!repositoryEvaluationAdapterIds.includes(adapterId as RepositoryEvaluationAdapterId)) {
    throw new Error("Evaluation adapter is not in the repository allowlist.");
  }
}

function parseVerifiedCanonicalEnvelope(bytes: Uint8Array): {
  sanitizedPacket: unknown;
  canonicalState: PackagesBEProjectionInput;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("verified_canonical_packet_invalid_json");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("verified_canonical_packet_invalid");
  const record = parsed as Record<string, unknown>;
  if (record.type !== "verified_canonical_evaluation_packet_v1") throw new Error("verified_canonical_packet_type_invalid");
  const state = record.canonicalState;
  if (!state || typeof state !== "object") throw new Error("verified_canonical_packet_state_missing");
  const canonicalState = state as Record<string, unknown>;
  for (const key of ["financialFacts", "feeLedger", "feeOwnershipActionability", "opportunityEngine"]) {
    if (!canonicalState[key] || typeof canonicalState[key] !== "object") throw new Error(`verified_canonical_packet_${key}_missing`);
  }
  return {
    sanitizedPacket: record.sanitizedPacket,
    canonicalState: structuredClone(state) as PackagesBEProjectionInput,
  };
}

async function unavailableRepositoryTransport(): Promise<never> {
  throw new Error("repository_statement_evaluation_transport_unavailable");
}

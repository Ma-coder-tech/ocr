import { assertManifestIntegrity, calculateParentPreflightHash } from "./manifest.js";
import { sha256Canonical } from "./stable.js";
import {
  EVALUATION_INTEGRITY_ARTIFACT_VERSION,
  EVALUATION_SOURCE_MANIFEST_VERSION,
  type ApprovedExecutionPermit,
  type CostBudgetLedgerSnapshot,
  type EvaluationLifecycleLedger,
  type EvaluationRunIntegrityArtifact,
  type EvaluationSourceManifest,
  type FinancialInvarianceResult,
} from "./types.js";

export function buildEvaluationRunIntegrityArtifact(input: {
  manifest: EvaluationSourceManifest;
  approvedManifestHash: string;
  executionPermit: ApprovedExecutionPermit;
  lifecycleLedger: EvaluationLifecycleLedger;
  packageFinancialInvariance: Array<{ sourceDocumentId: string; result: FinancialInvarianceResult }>;
  costBudgetLedger: CostBudgetLedgerSnapshot;
  providerCallOutcomes: EvaluationRunIntegrityArtifact["providerCallOutcomes"];
  finalStatus: EvaluationRunIntegrityArtifact["finalStatus"];
  reasonCodes: string[];
}): EvaluationRunIntegrityArtifact {
  assertManifestIntegrity(input.manifest);
  if (input.manifest.manifestContentHash !== input.approvedManifestHash) {
    throw new Error("Integrity artifact requires the exact approved manifest hash.");
  }
  if (
    input.executionPermit.approvedManifestHash !== input.approvedManifestHash ||
    input.executionPermit.recalculatedManifestHash !== input.approvedManifestHash
  ) {
    throw new Error("Execution permit does not prove the approved manifest hash.");
  }
  const lifecycleLedger = structuredClone(input.lifecycleLedger);
  const sourceIds = new Set(input.manifest.documents.map((document) => document.sourceDocumentId));
  if (lifecycleLedger.documents.some((document) => !sourceIds.has(document.sourceDocumentId))) {
    throw new Error("Lifecycle ledger contains a source outside the approved manifest.");
  }
  for (const document of lifecycleLedger.documents) {
    if (!document.events.some((event) => event.stage === "final_artifact")) throw new Error("Lifecycle ledger is missing its final-artifact stage.");
  }
  const reconstructedPreflightHash = calculateParentPreflightHash(input.manifest);
  const content = {
    type: EVALUATION_INTEGRITY_ARTIFACT_VERSION,
    manifestVersion: EVALUATION_SOURCE_MANIFEST_VERSION,
    manifestHash: input.manifest.manifestContentHash,
    approvedManifestHash: input.approvedManifestHash,
    sourceIdentity: input.manifest.documents.map(({ displayFileName, ...document }) => ({
      ...document,
      displayFileNameHash: displayFileName === null ? null : sha256Canonical(displayFileName),
    })),
    deduplicationDecisions: input.manifest.duplicateDecisions,
    parentPreflightProof: {
      artifactId: input.manifest.parentPreflightArtifactId,
      recordedHash: input.manifest.parentPreflightArtifactHash,
      reconstructedHash: reconstructedPreflightHash,
      verified: reconstructedPreflightHash === input.manifest.parentPreflightArtifactHash,
    },
    lifecycleLedger,
    parserDecisions: input.manifest.documents.map((document) => ({
      sourceDocumentId: document.sourceDocumentId,
      parserRecordId: document.parserRecordId,
      decision: document.parserDecision,
    })),
    packageFinancialInvariance: input.packageFinancialInvariance,
    costBudgetLedger: input.costBudgetLedger,
    executionPermit: {
      ...input.executionPermit,
      manifestPath: "internal:approved_manifest",
    },
    providerCallOutcomes: [...input.providerCallOutcomes].sort((left, right) => left.callId.localeCompare(right.callId)),
    finalStatus: input.finalStatus,
    reasonCodes: [...new Set(input.reasonCodes)].sort(),
  } as const;
  return { ...content, artifactContentHash: sha256Canonical(content) };
}

export function verifyEvaluationRunIntegrityArtifact(artifact: EvaluationRunIntegrityArtifact): boolean {
  const { artifactContentHash, ...content } = artifact;
  return artifact.manifestHash === artifact.approvedManifestHash && artifact.parentPreflightProof.verified && sha256Canonical(content) === artifactContentHash;
}

export const buildEvaluationRunIntegrityArtifactV1 = buildEvaluationRunIntegrityArtifact;

import { sha256Canonical } from "./stable.js";
import {
  aiLifecycleStates,
  type AiLifecycleStateName,
  type EvaluationLifecycleLedger,
  type EvaluationSourceManifest,
  type LifecycleEvent,
  type LifecycleState,
} from "./types.js";

export function createLifecycleLedger(manifest: EvaluationSourceManifest): EvaluationLifecycleLedger {
  return {
    type: "evaluation_lifecycle_ledger_v1",
    documents: manifest.documents.map((document) => ({
      sourceDocumentId: document.sourceDocumentId,
      aiStates: Object.fromEntries(
        aiLifecycleStates.map((state) => [state, { state: "not_reached" as const, reasonCodes: ["stage_not_reached"] }]),
      ) as EvaluationLifecycleLedger["documents"][number]["aiStates"],
      events: [
        lifecycleEvent(lifecycleRefs({
          sourceDocumentId: document.sourceDocumentId,
          stage: "manifest_row",
          state: "completed",
          reasonCodes: ["manifest_row_approved"],
          manifestRowRef: document.sourceDocumentId,
          preflightRecordRef: document.parentPreflightArtifactId,
          parserRecordRef: document.parserRecordId,
        })),
        lifecycleEvent(lifecycleRefs({
          sourceDocumentId: document.sourceDocumentId,
          stage: "preflight_record",
          state: "completed",
          reasonCodes: ["deterministic_preflight_retained"],
          manifestRowRef: document.sourceDocumentId,
          preflightRecordRef: document.parentPreflightArtifactId,
          parserRecordRef: document.parserRecordId,
        })),
        lifecycleEvent(lifecycleRefs({
          sourceDocumentId: document.sourceDocumentId,
          stage: "parser_record",
          state: document.parserEligibility === "eligible" ? "completed" : "withheld",
          reasonCodes: [document.parserDecision.reasonCode],
          manifestRowRef: document.sourceDocumentId,
          preflightRecordRef: document.parentPreflightArtifactId,
          parserRecordRef: document.parserRecordId,
        })),
        ...([
          "capability_execution",
          "provider_request",
          "research_retrieval",
          "semantic_verification",
          "canonical_admission",
          "customer_publication",
          "final_artifact",
        ] as const).map((stage) => lifecycleEvent(lifecycleRefs({
          sourceDocumentId: document.sourceDocumentId,
          stage,
          state: "not_reached",
          reasonCodes: ["stage_not_reached"],
          manifestRowRef: document.sourceDocumentId,
          preflightRecordRef: document.parentPreflightArtifactId,
          parserRecordRef: document.parserRecordId,
        }))),
      ],
    })),
  };
}

export function appendLifecycleEvent(
  ledger: EvaluationLifecycleLedger,
  input: Omit<LifecycleEvent, "eventId">,
): EvaluationLifecycleLedger {
  const document = ledger.documents.find((item) => item.sourceDocumentId === input.sourceDocumentId);
  if (!document) throw new Error(`Lifecycle source document is not in the approved manifest: ${input.sourceDocumentId}`);
  document.events.push(lifecycleEvent(input));
  return ledger;
}

export function recordLifecycleStage(
  ledger: EvaluationLifecycleLedger,
  input: Omit<LifecycleEvent, "eventId">,
): EvaluationLifecycleLedger {
  const document = ledger.documents.find((item) => item.sourceDocumentId === input.sourceDocumentId);
  if (!document) throw new Error(`Lifecycle source document is not in the approved manifest: ${input.sourceDocumentId}`);
  const stageIndexes = document.events
    .map((event, index) => event.stage === input.stage ? index : -1)
    .filter((index) => index >= 0);
  const placeholderIndex = stageIndexes.find((index) => document.events[index]?.state === "not_reached");
  const event = lifecycleEvent(input);
  if (placeholderIndex === undefined) document.events.push(event);
  else document.events[placeholderIndex] = event;
  return ledger;
}

export function recordAiLifecycleState(input: {
  ledger: EvaluationLifecycleLedger;
  sourceDocumentId: string;
  stateName: AiLifecycleStateName;
  state: LifecycleState;
  reasonCodes: string[];
}): EvaluationLifecycleLedger {
  const document = input.ledger.documents.find((item) => item.sourceDocumentId === input.sourceDocumentId);
  if (!document) throw new Error(`AI lifecycle source document is not in the approved manifest: ${input.sourceDocumentId}`);
  document.aiStates[input.stateName] = {
    state: input.state,
    reasonCodes: [...new Set(input.reasonCodes)].sort(),
  };
  return input.ledger;
}

function lifecycleEvent(input: Omit<LifecycleEvent, "eventId">): LifecycleEvent {
  return {
    ...input,
    reasonCodes: [...new Set(input.reasonCodes)].sort(),
    researchRetrievalRefs: [...input.researchRetrievalRefs].sort(),
    eventId: `life_${sha256Canonical(input).slice("sha256:".length, "sha256:".length + 20)}`,
  };
}

export function lifecycleRefs(input: {
  sourceDocumentId: string;
  stage: LifecycleEvent["stage"];
  state: LifecycleEvent["state"];
  reasonCodes: string[];
  manifestRowRef: string;
  preflightRecordRef: string;
  parserRecordRef?: string | null;
  capabilityExecutionRef?: string | null;
  providerRequestRef?: string | null;
  researchRetrievalRefs?: string[];
  semanticVerificationRef?: string | null;
  canonicalAdmissionRef?: string | null;
  customerPublicationRef?: string | null;
  finalArtifactRef?: string | null;
}): Omit<LifecycleEvent, "eventId"> {
  return {
    ...input,
    parserRecordRef: input.parserRecordRef ?? null,
    capabilityExecutionRef: input.capabilityExecutionRef ?? null,
    providerRequestRef: input.providerRequestRef ?? null,
    researchRetrievalRefs: input.researchRetrievalRefs ?? [],
    semanticVerificationRef: input.semanticVerificationRef ?? null,
    canonicalAdmissionRef: input.canonicalAdmissionRef ?? null,
    customerPublicationRef: input.customerPublicationRef ?? null,
    finalArtifactRef: input.finalArtifactRef ?? null,
  };
}

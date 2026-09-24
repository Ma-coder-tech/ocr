import type { ContextualUse, PresentationCeiling, ProhibitedClaimCode } from "../contextualKnowledge/contracts.js";

export const GOVERNED_AI_PACKET_VERSION = "governed_contextual_ai_packet_v1" as const;
export const GOVERNED_AI_OUTPUT_VERSION = "governed_contextual_ai_output_v1" as const;

export type NextDocumentCode =
  | "second_consecutive_statement"
  | "pricing_schedule_rate_sheet"
  | "merchant_agreement"
  | "additional_consecutive_statements"
  | "transaction_batch_detail";

export type ApprovedClaimCode =
  | "observed_charge" | "observed_credit" | "fixed_total" | "fixed_ratio"
  | "ratio_unavailable" | "changeability_unknown" | "review_context";

export type GovernedNumericFact = {
  id: string;
  kind: "signed_fee_amount" | "fixed_total" | "compatible_volume" | "basis_points_equivalent";
  amountMinor: number | null;
  decimalValue: string | null;
  currency: "USD" | null;
  display: string;
  evidenceRefs: string[];
};

export type GovernedFinding = {
  id: string;
  kind: "observed_line_item_effect" | "fixed_fee_burden";
  state: "assessed" | "amount_only";
  statementLabel: string | null;
  knowledgeRecordId: string;
  permittedUse: ContextualUse;
  presentationCeiling: PresentationCeiling;
  limitations: string[];
  prohibitedClaimCodes: ProhibitedClaimCode[];
  evidenceRefs: string[];
  numericFactIds: string[];
};

export type GovernedClause = {
  id: string;
  findingId: string;
  claimCode: ApprovedClaimCode;
  text: string;
  evidenceRefs: string[];
  knowledgeRecordId: string;
};

export type GovernedUnavailableState = {
  kind: "observed_line_item_effect" | "fixed_fee_burden" | "fixed_burden_ratio";
  status: "not_assessed" | "unavailable";
  reasonCodes: string[];
};

export type GovernedAiInputPacket = {
  schemaVersion: typeof GOVERNED_AI_PACKET_VERSION;
  packetId: string;
  mode: "offline_evaluation";
  fixtureId: string;
  sourceDocumentRef: string;
  contextualFactPacketId: string;
  knowledgeSnapshotId: string;
  selectionBasis: "product_curated_fixture_ids";
  approvedFindingIds: string[];
  findings: GovernedFinding[];
  allowedClauses: GovernedClause[];
  numericFacts: GovernedNumericFact[];
  unavailableStates: GovernedUnavailableState[];
  approvedNextDocuments: Array<{ code: NextDocumentCode; rationale: string }>;
  prohibitedClaimCodes: ProhibitedClaimCode[];
};

export type GovernedAiOutput = {
  schemaVersion: typeof GOVERNED_AI_OUTPUT_VERSION;
  selectedFindingIds: string[];
  orderedFindingIds: string[];
  selectedClauseIds: string[];
  merchantExplanation: string;
  nextDocumentCode: NextDocumentCode | null;
  rationale: string;
  evidenceRefsUsed: string[];
  knowledgeRecordIdsUsed: string[];
};

export type GovernedAiValidation = {
  status: "accepted" | "rejected";
  reasonCodes: string[];
  output: GovernedAiOutput | null;
};

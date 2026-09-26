import { createHash } from "node:crypto";
import type { ParsedDocument } from "./parser.js";
import { adjudicateSupportedFiservProtocolIdentity } from "./canonical/v2/fiservCapabilityContract.js";
import { FISERV_PROTOCOL_IDENTITY_RULE_VERSION } from "./canonical/v2/fiservCapabilityContract.js";
import { proveNeutralFromParsedPdfBytes } from "./processorNeutral/directProof/neutralEngine.js";
import { FISERV_STATEMENT_NEUTRAL_PACKAGE_ID, FISERV_STATEMENT_NEUTRAL_PACKAGE_VERSION } from
  "./processorNeutral/directProof/neutralInstalledProtocols.js";
import { evaluateResearchFeeFact, FEE_FACT_CANDIDATE_RULE_VERSION, FEE_PRODUCT_SCOPE_RULE_VERSION,
  type ResearchFeeFactCandidate } from "./processorNeutral/feeFactCandidate.js";

export const PHASE2_FEE_PERMISSION_VERSION = "phase2_printed_fee_charge_permission_v1" as const;
export const PHASE2_FEE_FLAG = "RATEREVEAL_PHASE2_FEE_CHARGE_V1_ENABLED" as const;

export type Phase2FeeAudit = Readonly<{
  permissionVersion: typeof PHASE2_FEE_PERMISSION_VERSION;
  sourceDocumentRef: string;
  sourceSha256: string;
  candidate: ResearchFeeFactCandidate;
  decision: "eligible" | "withheld";
  reasonCodes: readonly string[];
}>;

export type PublicPhase2FeeFact = Readonly<{
  kind: "printed_processing_fee_charge_aggregate_v1";
  permissionVersion: typeof PHASE2_FEE_PERMISSION_VERSION;
  displayChargeMagnitudeMinor: number;
  printedCurrencySymbol: "$";
  printedStatementPeriod: Readonly<{ start: string; end: string }>;
  scope: "bounded_declared_processing_fee_charge_aggregate";
  completeFeeOccurrenceInventory: false;
}>;

/** Environment kill switch is checked at both computation and every public projection. */
export function phase2FeeEnabled(): boolean {
  return process.env[PHASE2_FEE_FLAG] === "true";
}

/** The parsed document and proof are bound to one in-memory copy of the uploaded bytes. */
export function evaluatePhase2FeeForNewUpload(document: ParsedDocument, bytes: Uint8Array): Phase2FeeAudit {
  const snapshot = Uint8Array.from(bytes);
  const sourceSha256 = createHash("sha256").update(snapshot).digest("hex");
  const identity = adjudicateSupportedFiservProtocolIdentity(document);
  const run = proveNeutralFromParsedPdfBytes(document, snapshot);
  const candidate = evaluateResearchFeeFact(run, { sourceSha256, identity });
  const eligible = candidate.permission.prospective === "eligible_for_product_review";
  return { permissionVersion: PHASE2_FEE_PERMISSION_VERSION,
    sourceDocumentRef: candidate.sourceDocumentRef, sourceSha256, candidate,
    decision: eligible ? "eligible" : "withheld",
    reasonCodes: candidate.permission.reasonCodes };
}

/** Never includes the proof packet, source hash, processor identity or internal refs. */
export function publicPhase2FeeFact(audit: Phase2FeeAudit | null | undefined): PublicPhase2FeeFact | null {
  if (!phase2FeeEnabled() || !audit || audit.permissionVersion !== PHASE2_FEE_PERMISSION_VERSION
    || audit.decision !== "eligible" || audit.candidate.permission.prospective !== "eligible_for_product_review"
    || audit.candidate.sourceSha256 !== audit.sourceSha256
    || audit.candidate.sourceDocumentRef !== audit.sourceDocumentRef) return null;
  const { amount, period, population } = audit.candidate;
  if (audit.candidate.schemaVersion !== FEE_FACT_CANDIDATE_RULE_VERSION
    || audit.candidate.factId !== "total_processing_fees"
    || audit.candidate.proof.neutralRuleVersion !== "family_neutral_protocol_proof_v2"
    || audit.candidate.proof.protocolPackageId !== FISERV_STATEMENT_NEUTRAL_PACKAGE_ID
    || audit.candidate.proof.protocolPackageVersion !== FISERV_STATEMENT_NEUTRAL_PACKAGE_VERSION
    || audit.candidate.proof.productScopeRuleVersion !== FEE_PRODUCT_SCOPE_RULE_VERSION
    || audit.candidate.proof.supportIdentityRuleVersion !== FISERV_PROTOCOL_IDENTITY_RULE_VERSION
    || audit.candidate.permission.customer !== "disabled_research_only"
    || !/^neutral-proof-v2:[a-f0-9]{64}$/.test(audit.candidate.proof.proofId ?? "")
    || !audit.candidate.proof.controlRefs.includes("fee_component_sum")
    || !audit.candidate.proof.controlRefs.includes("fee_summary_alignment")
    || audit.candidate.proof.factEvidenceRefs.length === 0
    || period.evidenceRefs.length === 0) return null;
  if (amount.sourceDebitMinor === null || amount.sourceDebitMinor >= 0
    || amount.displayChargeMagnitudeMinor !== -amount.sourceDebitMinor
    || amount.printedCurrencySymbol !== "$" || period.context !== "printed_statement_period_only"
    || !period.start || !period.end || period.feeEarningPeriod !== "unresolved"
    || period.feePostingPeriod !== "unresolved" || period.cardActivityCompatibility !== "unresolved"
    || amount.sourceSign !== "negative_fee_debit" || amount.displaySign !== "positive_charge_magnitude"
    || population.scope !== "statement_processing_fee_charge_aggregate_bounded_declared_components"
    || !population.boundedDeclaredComponents || population.completeFeeOccurrenceInventory !== false
    || population.processorOwnership !== "unresolved" || !audit.candidate.proof.proofId) return null;
  return { kind: "printed_processing_fee_charge_aggregate_v1",
    permissionVersion: PHASE2_FEE_PERMISSION_VERSION,
    displayChargeMagnitudeMinor: amount.displayChargeMagnitudeMinor,
    printedCurrencySymbol: "$",
    printedStatementPeriod: { start: period.start, end: period.end },
    scope: "bounded_declared_processing_fee_charge_aggregate",
    completeFeeOccurrenceInventory: false };
}

export function publicPhase2FeeFactForJob(job: Readonly<{ status: string;
  phase2FeeAudit?: Phase2FeeAudit | null }>): PublicPhase2FeeFact | null {
  return job.status === "completed" || job.status === "fee_fact_available"
    ? publicPhase2FeeFact(job.phase2FeeAudit) : null;
}

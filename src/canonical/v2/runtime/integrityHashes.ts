import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalAnalysisArtifacts } from "./analysisRunTypes.js";

export const FINANCIAL_FOUNDATION_INTEGRITY_VERSION = "canonical_financial_foundation_integrity_v1" as const;
export const SEMANTIC_STATE_INTEGRITY_VERSION = "canonical_semantic_state_integrity_v1" as const;

export function financialFoundationHash(input: {
  sourceFingerprint: string;
  capabilityProof: unknown;
  artifacts: CanonicalAnalysisArtifacts;
}): string | null {
  const { rb, rc, rd } = input.artifacts;
  if (!rb) return null;
  return digest({
    version: FINANCIAL_FOUNDATION_INTEGRITY_VERSION,
    sourceFingerprint: input.sourceFingerprint,
    documentIntegrity: rb.documentIntegrity,
    statementPeriod: rb.identity.statementPeriod,
    capabilityProof: input.capabilityProof,
    sourceEvidence: rb.sourceModel.evidence,
    sourceSections: rb.sourceModel.sections,
    occurrences: rb.sourceModel.occurrences,
    representationGroups: rb.sourceModel.representationGroups,
    financialPopulations: rb.financialPopulations,
    metrics: rb.metrics,
    reconciliation: rb.reconciliation,
    pricingFinancialProjection: rc ? {
      pricingPopulations: rc.pricingArchitecture.pricingPopulations,
      observedPricingComponents: rc.pricingArchitecture.observedPricingComponents,
    } : null,
    chargeFinancialProjection: rd?.economicLayer.charges.map((charge) => ({
      id: charge.id,
      status: charge.status === "unavailable" ? "unavailable" : "present",
      sourceOccurrenceRefs: charge.sourceOccurrenceRefs,
      representationGroupRef: charge.representationGroupRef,
      contributingOccurrenceRef: charge.contributingOccurrenceRef,
      observedAmount: charge.observedAmount,
      financialDirection: charge.financialDirection,
      contributionMembership: charge.contributionStatus.startsWith("contributes_")
        ? "contributing"
        : charge.contributionStatus,
      statementPeriodApplicability: charge.statementPeriodApplicability,
      evidenceRefs: charge.evidenceRefs,
      reconciliationRefs: charge.reconciliationRefs,
    })) ?? null,
    statementCostProjection: rd ? {
      authoritativeStatementFeeTotal: rd.economicLayer.costStack.authoritativeStatementFeeTotal,
      totalStatementProcessingCost: rd.economicLayer.costStack.totalStatementProcessingCost,
      reconciliationDeltaMinor: rd.economicLayer.costStack.reconciliationDeltaMinor,
      reconciliationRef: rd.economicLayer.costStack.reconciliationRef,
    } : null,
  });
}

export function semanticStateHash(artifacts: CanonicalAnalysisArtifacts, applicationProjection: unknown = null): string {
  return digest({
    version: SEMANTIC_STATE_INTEGRITY_VERSION,
    rd: artifacts.rd,
    re: artifacts.re,
    unresolvedClaims: artifacts.unresolvedClaims,
    rgWorkLedger: artifacts.rgWorkLedger,
    rh: artifacts.rh,
    applicationProjection,
  });
}

export function canonicalStateHash(input: {
  financialFoundationHash: string | null;
  semanticHash: string;
  rfSnapshotHash: string;
}): string {
  return digest({ version: "canonical_analysis_state_integrity_v1", ...input });
}

export function digestCanonical(value: unknown): string {
  return digest(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

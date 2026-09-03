import { createHash } from "node:crypto";

import { canonicalJson } from "./canonicalJson.js";
import type { RbKernelReconstructableControlProof } from "./kernelControlProof.js";

export const RB_KERNEL_LIMITED_AUTHORITY_POLICY = "kernel_card_summary_direct_facts_v1" as const;
export const RB_KERNEL_LIMITED_AUTHORITY_REF =
  "product-approved-kernel-card-summary-limited-authority-2026-09-02" as const;

export const RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS = [
  "grossSaleVolume",
  "refundVolume",
  "grossSaleTransactionCount",
  "refundTransactionCount",
  "submittedTransactionCount",
] as const;

export type RbKernelLimitedAuthorityPopulation =
  (typeof RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS)[number];

export const RB_KERNEL_LIMITED_AUTHORITY_DESCRIPTORS = {
  grossSaleVolume: {
    population: "gross_sale_volume",
    valueKind: "money_minor",
    requiredControlIds: ["document-ir.control.card-summary-formula", "document-ir.control.card-summary-headline-match"],
  },
  refundVolume: {
    population: "refund_volume",
    valueKind: "money_minor",
    requiredControlIds: ["document-ir.control.card-summary-formula", "document-ir.control.card-summary-headline-match"],
  },
  grossSaleTransactionCount: {
    population: "gross_sale_transaction_count",
    valueKind: "count",
    requiredControlIds: ["document-ir.control.card-summary-count-formula"],
  },
  refundTransactionCount: {
    population: "refund_transaction_count",
    valueKind: "count",
    requiredControlIds: ["document-ir.control.card-summary-count-formula"],
  },
  submittedTransactionCount: {
    population: "submitted_transaction_count",
    valueKind: "count",
    requiredControlIds: ["document-ir.control.card-summary-count-formula"],
  },
} as const satisfies Record<RbKernelLimitedAuthorityPopulation, {
  population: string;
  valueKind: "money_minor" | "count";
  requiredControlIds: readonly string[];
}>;

export type RbKernelAuthorityProofCore = {
  kind: "statement_reconstruction_kernel_limited_authority";
  populationKey: RbKernelLimitedAuthorityPopulation;
  authorityRef: typeof RB_KERNEL_LIMITED_AUTHORITY_REF;
  policyVersion: typeof RB_KERNEL_LIMITED_AUTHORITY_POLICY;
  authorityFactRef: string;
  authorityOverlayHash: string;
  sourceDocumentRef: string;
  sourceFingerprint: string;
  evidenceRefs: string[];
  controlProofs: RbKernelReconstructableControlProof[];
  deterministicOnly: true;
  providerAuthority: "prohibited";
};

export type RbKernelAuthorityProof = RbKernelAuthorityProofCore & { proofHash: string };

export function rbKernelAuthorityProofHash(proof: RbKernelAuthorityProofCore): string {
  return createHash("sha256").update(canonicalJson(proof)).digest("hex");
}

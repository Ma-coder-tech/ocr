import { proveCardActivityRows } from "./cardActivityProof.js";
import { probeCardActivity, CARD_ACTIVITY_PACKAGE_VERSION } from "./cardActivityPackage.js";
import { HPS_SETTLED_PROTOCOL } from "./heartlandPackage.js";
import type { NeutralProtocolPackage } from "./neutralContracts.js";

const FACT_MEANINGS: Record<string, string> = {
  gross_sale_volume: "Gross submitted card sales", refund_volume: "Card refunds",
  net_submitted_volume: "Net submitted card sales",
  total_processing_fees: "Printed processing-fee charge aggregate over bounded declared components",
  headline_effective_rate: "Fee to volume ratio", complete_fee_inventory: "All fee occurrences",
};

export const FISERV_STATEMENT_NEUTRAL_PACKAGE_ID = "statement_card_activity_and_fee_charge_v1" as const;
export const FISERV_STATEMENT_NEUTRAL_PACKAGE_VERSION = "statement_card_fee_neutral_package_v1" as const;

/** The old card proof is an adapter behind the same neutral proposal interface. */
const CARD_ACTIVITY_ADAPTER: NeutralProtocolPackage = {
  id: FISERV_STATEMENT_NEUTRAL_PACKAGE_ID, version: FISERV_STATEMENT_NEUTRAL_PACKAGE_VERSION,
  probe: (packet) => probeCardActivity(packet.rows),
  evaluate: ({ document, packet }) => {
    const old = proveCardActivityRows({ document, inputSha256: packet.sourceSha256,
      sourceKind: packet.sourceKind, parseBoundToInputBytes: packet.sourceKind === "pdf_bytes" });
    const fee = old.outputs.find((output) => output.id === "total_processing_fees");
    const independentlyResolvedFee = fee?.state === "proven";
    return { protocolStatus: independentlyResolvedFee ? "resolved" as const : old.protocol.status,
      protocolEvidenceRefs: [...new Set([...old.protocol.evidenceRefs,
        ...(independentlyResolvedFee ? fee.evidenceRefs : [])])],
      reasonCodes: [...old.protocol.reasonCodes,
        ...(independentlyResolvedFee ? ["fee_section_resolved_independently_of_card_table"] : [])],
      statementPeriod: old.statementPeriod,
      controls: old.controls,
      facts: old.outputs.map((output) => ({ id: output.id,
        meaning: FACT_MEANINGS[output.id] ?? output.id,
        population: { scope: output.id === "total_processing_fees"
          ? "statement_processing_fee_charge_aggregate_bounded_declared_components"
          : output.id === "complete_fee_inventory" ? "fee_occurrence_inventory_unproven"
            : output.id === "headline_effective_rate" ? "fee_to_card_volume_ratio_unproven"
              : "card_activity_gross_refund_net_population",
          period: { printedContext: old.statementPeriod.state === "proven" ? "statement" as const : "unknown" as const,
            start: old.statementPeriod.start, end: old.statementPeriod.end,
            evidenceRefs: old.statementPeriod.evidenceRefs,
            economicCoverage: ["gross_sale_volume", "refund_volume", "net_submitted_volume"].includes(output.id)
              && old.periodCompatibility.cardActivityStatementContext === "proven"
              ? "versioned_same_period" as const : "unresolved" as const,
            activityCompatibility: ["total_processing_fees", "headline_effective_rate"].includes(output.id)
              ? "unresolved" as const : "not_applicable" as const },
          signConvention: output.id === "total_processing_fees" ? "source_negative_fee_debit"
            : output.id === "refund_volume" ? "source_signed_refund"
              : output.id === "headline_effective_rate" ? "ratio_unproven"
                : "source_printed_activity_amount",
          currency: output.unit === "printed_dollar" ? "$" : null,
          completeness: output.state === "proven" ? "bounded" as const : "unproven" as const,
          occurrenceCompleteness: ["total_processing_fees", "complete_fee_inventory"].includes(output.id)
            ? "unproven" as const : "not_applicable" as const,
          representation: output.state === "proven" ? "deduplicated" as const : "unresolved" as const },
        amountMinor: output.amountMinor, unit: output.unit, premises: output.premises,
        evidenceRefs: output.evidenceRefs, controlRefs: output.controlRefs,
        assumptionIds: output.premises.flatMap((item) => item.assumptionId ? [item.assumptionId] : []),
        reasonCodes: output.reasonCodes })),
      assumptions: old.assumptions.map((item) => ({ id: item.id, state: item.state,
        evidenceRefs: item.evidenceRefs, dependentOutputs: item.dependentOutputs })),
      diagnostics: { adapterVersion: FISERV_STATEMENT_NEUTRAL_PACKAGE_VERSION,
        bindingVersion: CARD_ACTIVITY_PACKAGE_VERSION } };
  },
};

export const NEUTRAL_INSTALLED_PROTOCOLS: readonly NeutralProtocolPackage[] = [
  CARD_ACTIVITY_ADAPTER, HPS_SETTLED_PROTOCOL,
];

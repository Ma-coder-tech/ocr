import type { SourceEvidence } from "../contracts.js";
import { proveStatementPeriod } from "./evidence.js";
import { DIRECT_PREMISES, type DirectControl, type DirectPremise, type PremiseDecision } from "./types.js";
import type { EvidencePacket, NeutralProtocolPackage, SemanticFactProposal } from "./neutralContracts.js";

const VERSION = "hps_settled_processing_summary_v1";
const section = /^processing summary\s*-\s*settled by hps$/i;
const salesHeader = /^card\s*\|\s*# of\s*\|\s*\$ sales\s*\|\s*# of\s*\|\s*\$ amount\s*\|\s*\$ amount\s*\|\s*average$/i;
const meaningHeader = /^type\s*\|\s*trans\s*\|\s*volume\s*\|\s*refunds\s*\|\s*of refunds\s*\|\s*net sales\s*\|\s*ticket$/i;
const fields = (row: SourceEvidence) => row.rawText.split("|").map((cell) => cell.trim());
const money = (raw: string, allowDash = false): number | null => {
  if (allowDash && raw === "-") return 0;
  const match = raw.match(/^(\()?\$((?:\d{1,3}(?:,\d{3})*|\d+))\.(\d{2})(\))?$/);
  if (!match || Boolean(match[1]) !== Boolean(match[4])) return null;
  const whole = Number(match[2]!.replace(/,/g, ""));
  const value = whole * 100 + Number(match[3]);
  return Number.isSafeInteger(value) ? value * (match[1] ? -1 : 1) : null;
};
const count = (raw: string): number | null => {
  if (raw === "-") return 0;
  if (!/^(?:\d{1,3}(?:,\d{3})*|\d+)$/.test(raw)) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isSafeInteger(n) ? n : null;
};
type Activity = { ref: string; transactions: number; gross: number; refunds: number;
  refundAmount: number; net: number };
function parseActivity(row: SourceEvidence): Activity | null {
  const f = fields(row);
  if (f.length !== 7 || !f[0]) return null;
  const transactions = count(f[1]!), gross = money(f[2]!), refunds = count(f[3]!);
  const refundAmount = money(f[4]!, true), net = money(f[5]!);
  const averageTicket = money(f[6]!, true);
  if ([transactions, gross, refunds, refundAmount, net, averageTicket].some((value) => value === null)) return null;
  return { ref: row.id, transactions: transactions!, gross: gross!, refunds: refunds!,
    refundAmount: refundAmount!, net: net! };
}
const sum = (rows: readonly Activity[], key: keyof Activity) => rows.reduce((n, row) => n + Number(row[key]), 0);
function control(id: string, expected: number | null, observed: number | null,
  inputRefs: string[], targetRef: string | null, independent: boolean): DirectControl {
  return { id, kind: independent ? "detail_sum" : "semantic_equation",
    status: expected === null || observed === null ? "unresolved" : expected === observed ? "pass" : "fail",
    independent, independenceBasis: independent ? "distinct_source_rows_same_extraction_lane" : "unproven",
    inputRefs, targetRef, expectedMinor: expected, observedMinor: observed,
    reasonCode: "hps_processing_summary_bounded_detail_vs_printed_total" };
}
function premise(premise: DirectPremise, state: PremiseDecision["state"], reasonCode: string,
  evidenceRefs: string[], controlRefs: string[] = [], assumptionId: string | null = null): PremiseDecision {
  return { premise, state, reasonCode, evidenceRefs, controlRefs, assumptionId,
    basis: assumptionId && state === "proven" ? "versioned_protocol_assumption"
      : state === "proven" ? "direct_source" : "unresolved" };
}

export const HPS_SETTLED_PROTOCOL: NeutralProtocolPackage = {
  id: "hps_settled_processing_summary", version: VERSION,
  probe: (packet: EvidencePacket) => {
    const heads = packet.rows.filter((row) => section.test(row.normalizedText));
    const schemas = packet.rows.filter((row) => salesHeader.test(row.normalizedText));
    const meanings = packet.rows.filter((row) => meaningHeader.test(row.normalizedText));
    return { status: heads.length && schemas.length && meanings.length ? "candidate" : "unresolved",
      evidenceRefs: [...heads, ...schemas, ...meanings].map((row) => row.id) };
  },
  evaluate: ({ packet }) => {
    const rows = packet.rows;
    const period = proveStatementPeriod(rows);
    const headings = rows.filter((row) => section.test(row.normalizedText));
    const head = headings.length === 1 ? headings[0]! : null;
    const following = head ? rows.filter((row) => row.coordinate.pageIndex === head.coordinate.pageIndex
      && row.coordinate.rowIndex !== null && head.coordinate.rowIndex !== null
      && row.coordinate.rowIndex > head.coordinate.rowIndex) : [];
    const nextSection = following.find((row) => /^processing summary\s*-\s*settled by others$/i.test(row.normalizedText));
    const pageRows = nextSection ? following.filter((row) => row.coordinate.rowIndex! < nextSection.coordinate.rowIndex!) : following;
    const totalCandidates = pageRows.filter((row) => /^totals\s*\|/i.test(row.rawText));
    const totalRow = totalCandidates[0] ?? null;
    const schema = totalRow && pageRows.filter((row) => row.coordinate.rowIndex! < totalRow.coordinate.rowIndex!);
    const sales = schema?.filter((row) => salesHeader.test(row.normalizedText)) ?? [];
    const meanings = schema?.filter((row) => meaningHeader.test(row.normalizedText)) ?? [];
    const schemaOkay = sales.length === 1 && meanings.length === 1
      && sales[0]!.coordinate.rowIndex! < meanings[0]!.coordinate.rowIndex!;
    const detailCandidates = schemaOkay ? pageRows.filter((row) =>
      row.coordinate.rowIndex! > meanings[0]!.coordinate.rowIndex!
      && row.coordinate.rowIndex! < totalRow!.coordinate.rowIndex!) : [];
    const details = detailCandidates.filter((row) => row.rawText.includes("|") || /\$\s*\d/.test(row.rawText));
    const parsed = details.map(parseActivity);
    const activity = parsed.filter((row): row is Activity => row !== null);
    const bounded = headings.length === 1 && totalCandidates.length === 1 && schemaOkay
      && details.length > 0 && parsed.every(Boolean)
      && new Set(activity.map((row) => row.ref)).size === activity.length
      && totalRow !== null;
    const total = bounded ? parseActivity(totalRow!) : null;
    const rowEquations = activity.every((row) => row.gross + row.refundAmount === row.net
      && row.refundAmount <= 0 && row.gross >= 0 && row.net >= 0);
    const totalEquation = total !== null && total.gross + total.refundAmount === total.net
      && total.refundAmount <= 0 && total.gross >= 0 && total.net >= 0;
    const sourceRefs = [head?.id, sales[0]?.id, meanings[0]?.id, totalRow?.id,
      ...activity.map((row) => row.ref)].filter((ref): ref is string => Boolean(ref));
    const controls: DirectControl[] = [
      control("hps_gross_detail_sum", total?.gross ?? null, bounded ? sum(activity, "gross") : null,
        activity.map((row) => row.ref), totalRow?.id ?? null, bounded),
      control("hps_refund_detail_sum", total?.refundAmount ?? null,
        bounded ? sum(activity, "refundAmount") : null, activity.map((row) => row.ref), totalRow?.id ?? null, bounded),
      control("hps_net_detail_sum", total?.net ?? null, bounded ? sum(activity, "net") : null,
        activity.map((row) => row.ref), totalRow?.id ?? null, bounded),
      control("hps_row_and_total_equations", 1, bounded ? Number(rowEquations && totalEquation) : null,
        activity.map((row) => row.ref), totalRow?.id ?? null, false),
      control("hps_transaction_count_sum", total?.transactions ?? null,
        bounded ? sum(activity, "transactions") : null, activity.map((row) => row.ref), totalRow?.id ?? null, bounded),
      control("hps_refund_count_sum", total?.refunds ?? null,
        bounded ? sum(activity, "refunds") : null, activity.map((row) => row.ref), totalRow?.id ?? null, bounded),
    ];
    const allControlsPass = controls.every((item) => item.status === "pass");
    const periodAssumptionId = "hps_processing_summary_covers_printed_statement_period";
    const assumptionState = period.state === "proven" && bounded
      ? "versioned_protocol" as const : "unresolved" as const;
    const assumptions = [{ id: periodAssumptionId, state: assumptionState,
      evidenceRefs: [head?.id, ...period.evidenceRefs].filter((ref): ref is string => Boolean(ref)),
      dependentOutputs: ["hps_settled_gross_sales", "hps_settled_refunds", "hps_settled_net_sales"] }];
    const make = (id: string, meaning: string, value: number | null, controlId: string,
      signConvention: string): SemanticFactProposal => {
      const proofState = bounded && total && allControlsPass && period.state === "proven"
        ? "proven" as const : "unresolved" as const;
      const decisions = Object.fromEntries(DIRECT_PREMISES.map((key) => {
        const refs = key === "period_meaning" ? [...period.evidenceRefs, ...(head ? [head.id] : [])] : sourceRefs;
        return [key, premise(key, key === "input_integrity" || key === "statement_page_completeness"
          ? "unresolved" : proofState, key === "input_integrity" || key === "statement_page_completeness"
          ? "core_source_integrity_required" : `hps_${key}_${proofState}`, refs,
          key === "arithmetic" || key === "independent_control" ? controls.map((item) => item.id) : [],
          key === "period_meaning" ? periodAssumptionId : null)];
      })) as Record<DirectPremise, PremiseDecision>;
      // The core owns the integrity decision; the package can only mirror its source observation.
      // Actual admission still checks the core's independently computed integrity state.
      decisions.input_integrity = premise("input_integrity", packet.pageInventory.enumerated !== null
        && packet.pageInventory.enumerated === packet.pageInventory.processed
        && packet.pageInventory.fatalErrors === 0 && packet.pageInventory.truncated === false
        ? "proven" : "unresolved", "all_supplied_pages_processed", sourceRefs);
      const footers = rows.filter((row) => /\bpage\s*\d+\s*of\s*\d+\b/i.test(row.rawText));
      decisions.statement_page_completeness = premise("statement_page_completeness",
        footers.length === packet.pageInventory.enumerated && footers.length > 0
          ? "proven" : "unresolved", "printed_pagination_matches_inventory",
        footers.map((row) => row.id));
      return { id, meaning, population: { scope: "processing_summary_settled_by_hps_only",
        period: { printedContext: period.state === "proven" ? "statement" : "unknown",
          start: period.start, end: period.end, evidenceRefs: period.evidenceRefs,
          economicCoverage: assumptionState === "versioned_protocol" ? "versioned_same_period" : "unresolved",
          activityCompatibility: "not_applicable" },
        signConvention, currency: "$", completeness: bounded ? "bounded" : "unproven",
        occurrenceCompleteness: "not_applicable",
        representation: headings.length === 1 ? "single" : "unresolved" },
      amountMinor: value, unit: value === null ? null : "printed_dollar", premises: DIRECT_PREMISES.map((key) => decisions[key]),
      evidenceRefs: sourceRefs, controlRefs: [controlId, "hps_row_and_total_equations",
        "hps_transaction_count_sum", "hps_refund_count_sum"], assumptionIds: [periodAssumptionId],
      reasonCodes: proofState === "proven" ? ["bounded_hps_processing_summary_direct_proof"]
        : ["hps_processing_summary_proof_unresolved"] };
    };
    const facts = [
      make("hps_settled_gross_sales", "Gross sales in HPS-settled processing summary", total?.gross ?? null,
        "hps_gross_detail_sum", "sales_positive"),
      make("hps_settled_refunds", "Refund amount in HPS-settled processing summary", total?.refundAmount ?? null,
        "hps_refund_detail_sum", "refunds_negative_parentheses"),
      make("hps_settled_net_sales", "Net sales in HPS-settled processing summary", total?.net ?? null,
        "hps_net_detail_sum", "gross_plus_signed_refunds"),
    ];
    return { protocolStatus: bounded ? "resolved" : "unresolved", protocolEvidenceRefs: sourceRefs,
      reasonCodes: [bounded ? "hps_summary_schema_and_bounded_details" : "hps_summary_unbound"],
      statementPeriod: period, controls, facts, assumptions,
      diagnostics: { packageVersion: VERSION, bounded, detailRows: activity.length,
        unparsedDetailRows: parsed.length - activity.length, allControlsPass,
        feeInventory: "unresolved", effectiveRate: "withheld_operand_compatibility_unproven",
        scope: "settled_by_hps_only" } };
  },
};

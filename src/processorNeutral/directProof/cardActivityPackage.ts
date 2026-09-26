import type { SourceEvidence } from "../contracts.js";
import type { BoundAmount, BoundCardTable, BoundFeeComposition, ProtocolBindings } from "./types.js";

export const CARD_ACTIVITY_PACKAGE_VERSION = "card_activity_gross_refund_net_binding_v2" as const;

/** Cheap semantic candidate check. It reads no money and grants no proof. */
export function probeCardActivity(rows: readonly SourceEvidence[]): {
  status: "candidate" | "unresolved"; evidenceRefs: readonly string[];
} {
  const title = rows.filter((row) => /\byour card processing statement\b/i.test(row.normalizedText));
  const merchantId = rows.filter((row) => /\bmerchant number\b/i.test(row.normalizedText));
  const schema = rows.filter((row) => /\btotal gross sales you submitted\b/i.test(row.normalizedText)
    && /\brefunds\b/i.test(row.normalizedText)
    && /\btotal amount you submitted\b/i.test(row.normalizedText));
  return { status: title.length && merchantId.length || schema.length ? "candidate" : "unresolved",
    evidenceRefs: [...new Set([...title, ...merchantId, ...schema].map((row) => row.id))] };
}

function cells(row: SourceEvidence): string[] {
  return row.rawText.split("|").map((cell) => cell.trim());
}
function at(row: SourceEvidence, index: number): BoundAmount | null {
  const value = cells(row)[index];
  if (value === undefined) return null;
  const compact = value.replace(/\s+/g, "");
  const negative = compact.startsWith("(") && compact.endsWith(")");
  const unwrapped = negative ? compact.slice(1, -1) : compact;
  const normalized = unwrapped.replace(/^\$-/, "-$");
  if (!/^-?\$?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized.replace(/[$,]/g, "")) * 100) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(minor)) return null;
  return { minor, ref: row.id, printedUnit: compact.includes("$") ? "dollar_symbol" : "unmarked",
    printedSign: minor === 0 ? "zero" : minor < 0 ? "negative" : "positive" };
}
function last(row: SourceEvidence): BoundAmount | null { return at(row, cells(row).length - 1); }
function samePage(a: SourceEvidence, b: SourceEvidence): boolean {
  return a.coordinate.pageIndex !== null && a.coordinate.pageIndex === b.coordinate.pageIndex;
}
function after(a: SourceEvidence, b: SourceEvidence): boolean {
  return a.coordinate.rowIndex !== null && b.coordinate.rowIndex !== null
    && a.coordinate.rowIndex > b.coordinate.rowIndex;
}

function summaryAmounts(rows: readonly SourceEvidence[]): { volume: BoundAmount[]; fees: BoundAmount[] } {
  const headings = rows.filter((row) => /\bsummary\b.*\boverview\s+of\s+account\s+activity\b/i.test(row.normalizedText));
  if (headings.length === 0) return { volume: [], fees: [] };
  const windows = headings.flatMap((heading) => rows.filter((row) => samePage(row, heading) && after(row, heading)
    && row.coordinate.rowIndex! <= heading.coordinate.rowIndex! + 28));
  const pick = (pattern: RegExp) => windows.flatMap((row) => {
    const parts = cells(row);
    const label = parts.slice(0, -1).join(" ");
    const amount = pattern.test(label) ? last(row) : null;
    return amount ? [amount] : [];
  });
  return {
    volume: pick(/\b(?:total\s+amount\s+submitted|amounts\s+submitted)\b/i),
    fees: pick(/^(?:page\s*\d+\s*)?(?:fees(?:\s+charged)?)$/i),
  };
}

const CARD_HEADING = /\b(?:summary[\s:,-]+by\s+card\s+type|card\s+type[\s:,-]+summary)\b/i;
function cardTables(rows: readonly SourceEvidence[]): BoundCardTable[] {
  const result: BoundCardTable[] = [];
  // These are layout aliases for the same printed table, not processor aliases.
  for (const section of rows.filter((row) => CARD_HEADING.test(row.normalizedText))) {
    const pageRows = rows.filter((row) => samePage(row, section) && after(row, section)
      && row.coordinate.rowIndex! <= section.coordinate.rowIndex! + 40);
    const schema = pageRows.find((row) => /\btotal\s+gross\s+sales\s+you\s+submitted\b/i.test(row.normalizedText)
      && /\brefunds\b/i.test(row.normalizedText)
      && /\btotal\s+amount\s+you\s+submitted\b/i.test(row.normalizedText));
    const header = schema && pageRows.find((row) => after(row, schema)
      && row.coordinate.rowIndex! <= schema.coordinate.rowIndex! + 5
      && /\bcard\s+type\b/i.test(row.normalizedText)
      && /\bitems?\b/i.test(row.normalizedText) && /\bamount\b/i.test(row.normalizedText));
    const total = header && pageRows.find((row) => after(row, header) && /^total\s*\|/i.test(row.rawText));
    if (!schema || !header || !total) continue;
    const nextSection = pageRows.find((row) => after(row, total)
      && /^(?:summary\s+by\s+|card\s+type\s+summary|transaction\s+fees\b|fees\b)/i.test(row.normalizedText));
    const duplicateTotals = pageRows.filter((row) => after(row, total)
      && (!nextSection || !after(row, nextSection)) && row.id !== nextSection?.id
      && /^total\s*\|/i.test(row.rawText)).length > 0;
    const gross = at(total, 2), refunds = at(total, 4), net = last(total);
    if (!gross || !refunds || !net) continue;
    const between = pageRows.filter((row) => after(row, header) && !after(row, total) && row.id !== total.id);
    const detailRows: Array<{ ref: string; cardType: string; gross: BoundAmount;
      refunds: BoundAmount; net: BoundAmount }> = [];
    let unparsed = 0;
    for (const row of between) {
      const parts = cells(row);
      if (!/[a-z]/i.test(parts[0] ?? "")) continue;
      if (parts.length < 6) {
        if (/[$]?\d[\d,]*\.\d{2}/.test(row.rawText)) unparsed++;
        continue;
      }
      const rowGross = at(row, 3), rowRefunds = at(row, 5), rowNet = last(row);
      if (!rowGross || !rowRefunds || !rowNet) { unparsed++; continue; }
      detailRows.push({ ref: row.id, cardType: parts[0]!.toLowerCase().replace(/\s+/g, " ").trim(),
        gross: rowGross, refunds: rowRefunds, net: rowNet });
    }
    const distinctRows = new Set(detailRows.map((item) => item.ref)).size === detailRows.length;
    const distinctCardTypes = new Set(detailRows.map((item) => item.cardType)).size === detailRows.length;
    result.push({ schemaRefs: [schema.id, header.id], sectionRef: section.id, totalRef: total.id,
      gross, refunds, net, detailRows,
      detailComplete: detailRows.length > 0 && unparsed === 0 && distinctRows && distinctCardTypes,
      duplicateRepresentation: !distinctRows || !distinctCardTypes || duplicateTotals,
      reasonCodes: [unparsed ? "unparsed_card_detail_rows" : "card_detail_rows_bound",
        distinctRows && distinctCardTypes && !duplicateTotals ? "distinct_card_rows_and_total"
          : "duplicate_card_type_or_total_representation"] });
  }
  return result;
}

const COMPONENT_GROUPS: ReadonlyArray<ReadonlyArray<[string, RegExp]>> = [
  [["card_fees", /^total\s+card\s+fees$/i], ["misc_fees", /^total\s+miscellaneous\s+fees$/i]],
  [["interchange", /^total\s+interchange\s+charges(?:\/program\s+fees)?$/i],
    ["service", /^total\s+service\s+charges$/i], ["fees", /^total\s+fees$/i]],
];
function feeCompositions(rows: readonly SourceEvidence[]): BoundFeeComposition[] {
  const results: BoundFeeComposition[] = [];
  for (const aggregateRow of rows.filter((row) => /^total\s*\((?:miscellaneous\s+fees\s+and\s+card\s+fees|service\s+charges,\s*interchange\s+charges)/i.test(row.normalizedText))) {
    const aggregate = last(aggregateRow);
    if (!aggregate) continue;
    const preceding = rows.filter((row) => samePage(row, aggregateRow) && after(aggregateRow, row)
      && row.coordinate.rowIndex! >= aggregateRow.coordinate.rowIndex! - 18);
    const group = /miscellaneous/i.test(aggregateRow.normalizedText) ? COMPONENT_GROUPS[0]! : COMPONENT_GROUPS[1]!;
    const components: Array<{ kind: string; amount: BoundAmount }> = [];
    let complete = true;
    let duplicate = false;
    for (const [kind, pattern] of group) {
      const matches = preceding.filter((row) => pattern.test(cells(row).slice(0, -1).join(" ")));
      if (matches.length !== 1) { complete = false; if (matches.length > 1) duplicate = true; continue; }
      const amount = last(matches[0]!);
      if (!amount) { complete = false; continue; }
      components.push({ kind, amount });
    }
    results.push({ sectionRef: aggregateRow.id, aggregate, components,
      componentSetComplete: complete && components.length === group.length,
      duplicateRepresentation: duplicate,
      reasonCodes: [complete ? "declared_fee_component_set_bound" : "fee_component_set_incomplete",
        duplicate ? "duplicate_fee_component_representation" : "no_duplicate_fee_components"] });
  }
  return results;
}

/** Bind one printed gross/refund/net protocol, independent of branding or backend. */
export function bindCardActivity(rows: readonly SourceEvidence[]): ProtocolBindings {
  const instructional = rows.filter((item) => /\bhow to read your statement\b/i.test(item.normalizedText));
  const statementTitles = rows.filter((item) => /\byour card processing statement\b/i.test(item.normalizedText));
  const accountIdentifiers = rows.filter((item) => /\bmerchant number\b/i.test(item.normalizedText));
  const documentKind: ProtocolBindings["documentKind"] = {
    state: instructional.length ? "conflicting"
      : statementTitles.length && accountIdentifiers.length ? "proven" : "unresolved",
    reasonCode: instructional.length ? "instructional_document_not_merchant_statement"
      : statementTitles.length && accountIdentifiers.length ? "statement_title_and_account_identifier_bound"
        : "merchant_statement_document_kind_unproven",
    evidenceRefs: [...new Set([...instructional, ...statementTitles, ...accountIdentifiers]
      .map((item) => item.id))],
  };
  const summary = summaryAmounts(rows);
  const tables = cardTables(rows);
  const fees = feeCompositions(rows);
  const completeSchemaRows = rows.filter((row) => /\btotal\s+gross\s+sales\s+you\s+submitted\b/i.test(row.normalizedText)
    && /\brefunds\b/i.test(row.normalizedText)
    && /\btotal\s+amount\s+you\s+submitted\b/i.test(row.normalizedText));
  const boundSchemaRefs = new Set(tables.flatMap((item) => item.schemaRefs));
  const unboundCardCandidates = completeSchemaRows.filter((row) => !boundSchemaRefs.has(row.id))
    .map((row) => row.id);
  return { documentKind, protocolEvidenceRefs: tables.flatMap((item) => [item.sectionRef, ...item.schemaRefs]),
    cardSectionCandidateCount: rows.filter((row) => CARD_HEADING.test(row.normalizedText)).length,
    summaryVolume: summary.volume, summaryFees: summary.fees, cardTables: tables,
    feeCompositions: fees, unboundCardCandidates,
    reasonCodes: [tables.length ? "card_activity_semantic_schema_bound" : "card_activity_schema_unresolved",
      ...(unboundCardCandidates.length ? ["unbound_gross_refund_net_schema_requires_layout_or_extraction_review"] : []),
      fees.length ? "fee_composition_candidates_bound" : "fee_composition_unresolved"] };
}

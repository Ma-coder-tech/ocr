import type { ProtocolCandidate, SourceEvidence } from "./contracts.js";

type Observation = ProtocolCandidate["representationObservations"][number];
type Row = SourceEvidence;

function nearby(rows: readonly Row[], anchor: Row, before: number, after: number): Row[] {
  return rows.filter((row) => row.coordinate.pageIndex === anchor.coordinate.pageIndex
    && row.coordinate.rowIndex !== null && anchor.coordinate.rowIndex !== null
    && row.coordinate.rowIndex >= anchor.coordinate.rowIndex - before
    && row.coordinate.rowIndex <= anchor.coordinate.rowIndex + after);
}
function observation(witness: Observation["witness"], basis: Observation["basis"], rows: readonly Row[]): Observation {
  return { witness, basis, evidenceRefs: [...new Set(rows.map((row) => row.id))], authority: "candidate_only" };
}
const MONEY = /-?\$\s*\d[\d,\s]*\.\d{2}\b/gu;
function cardDataRow(row: Row): boolean {
  const cells = row.rawText.split("|").map((cell) => cell.trim());
  return cells.length >= 4 && Boolean(cells[0])
    && !/^(?:total|card type|items|amount|ticket|average|page)\b/i.test(cells[0]!)
    && (row.rawText.match(MONEY) ?? []).length >= 2
    && cells.slice(1).some((cell) => /^\d+$/.test(cell));
}
function cardTable(rows: readonly Row[]): Row[] | null {
  for (const header of rows) {
    if (!/\bcard\s+type\b/i.test(header.normalizedText)
      || !/\bitems?\b|\bamount\b/i.test(header.normalizedText)) continue;
    const window = nearby(rows, header, 4, 12);
    const schema = window.find((row) => row.coordinate.rowIndex! <= header.coordinate.rowIndex!
      && /\btotal\s+(?:gross\s+)?sales\b/i.test(row.normalizedText)
      && /\brefunds\b/i.test(row.normalizedText));
    const data = window.find((row) => row.coordinate.rowIndex! > header.coordinate.rowIndex!
      && cardDataRow(row));
    const total = window.find((row) => row.coordinate.rowIndex! > header.coordinate.rowIndex!
      && /^total\b/i.test(row.normalizedText) && (row.rawText.match(MONEY) ?? []).length > 0);
    if (schema && data && total) return [schema, header, data, total];
  }
  return null;
}

/** Fiserv-specific diagnostic witnesses. Neither signal admits money or chain identity. */
export function fiservRepresentationObservations(rows: readonly Row[]): Observation[] {
  const observations: Observation[] = [];
  const heading = rows.find((row) => /\bsummary\s+by\s+card\s+type\b/i.test(row.normalizedText));
  const table = cardTable(rows);
  if (heading) observations.push(observation("card_type_representation", "direct_text", [heading]));
  else if (table) observations.push(observation("card_type_representation", "table_structure", table));

  const directBridge = rows.find((row) => /\btotal\s+(?:gross\s+)?sales\s+you\s+submitted\b.*\brefunds\b.*\btotal\s+amount\s+you\s+submitted\b/i.test(row.normalizedText));
  if (directBridge) observations.push(observation("gross_refund_net_bridge", "direct_text", [directBridge]));
  else if (table) {
    const schema = table[0]!;
    const next = rows.find((row) => row.coordinate.pageIndex === schema.coordinate.pageIndex
      && row.coordinate.rowIndex === schema.coordinate.rowIndex! + 1);
    if (next && (next.normalizedText.match(/\byou\s+submitted\b/gi) ?? []).length >= 2) {
      observations.push(observation("gross_refund_net_bridge", "table_structure", [...table, next]));
    }
  }
  return observations;
}

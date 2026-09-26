import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePdfBytes, type ParsedDocument } from "../src/parser.js";
import { proveNeutralSynthetic } from "../src/processorNeutral/directProof/neutralEngine.js";

const root = process.cwd();
const bytes = await readFile(path.join(root, "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf"));
const original = await parsePdfBytes(bytes);
const expected = { gross_sale_volume: 5249703, refund_volume: -3648,
  net_submitted_volume: 5246055, total_processing_fees: -131255 } as const;
type OutputId = keyof typeof expected;
const run = (document: ParsedDocument) => proveNeutralSynthetic(document);
const clone = () => structuredClone(original);
function change(doc: ParsedDocument, match: RegExp, replacement: (text: string) => string): void {
  const row = doc.rows.find((item) => match.test(String(item.content ?? "")));
  assert.ok(row, `mutation row ${match} exists`);
  row.content = replacement(String(row.content));
}
function states(document: ParsedDocument): Record<OutputId, number | null> {
  const proof = run(document);
  return Object.fromEntries(Object.keys(expected).map((id) => [id,
    proof.facts.find((item) => item.id === id)?.amountMinor ?? null])) as Record<OutputId, number | null>;
}
const cases: Array<{ id: string; category: string; document: ParsedDocument;
  expected: Partial<Record<OutputId, number | null>> }> = [];
cases.push({ id: "unchanged_printed_source", category: "baseline", document: clone(), expected });
{
  const doc = clone();
  change(doc, /^SUMMARY BY CARD TYPE$/, () => " CARD  TYPE   SUMMARY ");
  cases.push({ id: "heading_alias_and_whitespace", category: "presentation", document: doc, expected });
}
{
  const doc = clone();
  change(doc, /^SUMMARY BY CARD TYPE$/, () => "SUMMARY\u2011BY\u2011CARD\u2011TYPE");
  cases.push({ id: "unicode_hyphen_typography", category: "presentation", document: doc, expected });
}
{
  const doc = clone();
  change(doc, /^SUMMARY BY CARD TYPE$/, () => "SUMMARY: BY CARD\nTYPE");
  cases.push({ id: "heading_punctuation_and_line_wrap", category: "presentation", document: doc, expected });
}
{
  const doc = clone();
  const start = doc.rows.findIndex((row) => String(row.content ?? "") === "SUMMARY BY CARD TYPE");
  const end = doc.rows.findIndex((row, index) => index > start && String(row.content ?? "") === "SUMMARY BY BATCH");
  assert.ok(start >= 0 && end > start);
  const moved = doc.rows.splice(start, end - start);
  const lastPageTwo = doc.rows.findLastIndex((row) => String(row.page ?? "") === "page-2");
  doc.rows.splice(lastPageTwo + 1, 0, ...moved);
  cases.push({ id: "card_section_order_within_page", category: "presentation", document: doc, expected });
}
{
  const doc = clone();
  change(doc, /PEPES MEXICAN RESTURANT/, (text) => text.replace("PEPES MEXICAN RESTURANT", "ANOTHER MERCHANT BRAND"));
  cases.push({ id: "brand_text_change", category: "presentation", document: doc, expected });
}
{
  const doc = clone();
  change(doc, /^Total \| 1,797 \| \$52,497\.03/, (text) => text.replace("$52,497.03", "$52,498.03"));
  cases.push({ id: "altered_card_total", category: "meaning", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null,
      total_processing_fees: -131255 } });
}
{
  const doc = clone();
  doc.rows = doc.rows.filter((row) => !/^VISA \| \$27\.59/.test(String(row.content ?? "")));
  cases.push({ id: "removed_card_detail", category: "meaning", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null } });
}
{
  const doc = clone();
  doc.rows = doc.rows.filter((row) => String(row.page ?? "") !== "page-8");
  cases.push({ id: "missing_last_page_with_plausible_totals", category: "meaning", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null,
      total_processing_fees: null } });
}
{
  const doc = clone();
  change(doc, /^Statement Period \| 10\/01\/24/, (text) => text.replace("10/01/24", "10/02/24"));
  cases.push({ id: "conflicting_period", category: "meaning", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null,
      total_processing_fees: null } });
}
{
  const doc = clone();
  change(doc, /^Page \| 1 \| Total Amount Submitted \| \$52,460\.55/,
    (text) => text.replace("$52,460.55", "$60,000.00"));
  cases.push({ id: "conflicting_summary_population", category: "adversarial", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null } });
}
{
  const doc = clone();
  const heading = doc.rows.find((row) => /^SUMMARY \| An overview of account activity/.test(String(row.content ?? "")));
  const summaryAmount = doc.rows.find((row) => /^Page \| 1 \| Total Amount Submitted \| \$52,460\.55/.test(String(row.content ?? "")));
  assert.ok(heading && summaryAmount);
  doc.rows.splice(doc.rows.indexOf(summaryAmount) + 1, 0, { ...heading },
    { ...summaryAmount, content: "Page | 1 | Total Amount Submitted | $60,000.00" });
  cases.push({ id: "second_conflicting_overview", category: "adversarial", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null } });
}
{
  const doc = clone();
  const row = doc.rows.find((item) => /^Total \| 1,797 \| \$52,497\.03/.test(String(item.content ?? "")));
  assert.ok(row);
  doc.rows.splice(doc.rows.indexOf(row) + 1, 0, { ...row });
  cases.push({ id: "duplicated_card_total", category: "adversarial", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null } });
}
{
  const doc = clone();
  const row = doc.rows.find((item) => /^Total Service Charges \|/.test(String(item.content ?? "")));
  assert.ok(row);
  doc.rows.splice(doc.rows.indexOf(row) + 1, 0, { ...row });
  cases.push({ id: "duplicate_fee_component", category: "adversarial", document: doc,
    expected: { gross_sale_volume: 5249703, total_processing_fees: null } });
}
{
  const doc = clone();
  change(doc, /^VISA \| \$27\.59/, (text) => text.replace("-$36.48", "$36.48"));
  cases.push({ id: "detail_refund_sign_change", category: "meaning", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null } });
}
{
  const doc = clone();
  const row = doc.rows.find((item) => /^Mastercard \| \$28\.51/.test(String(item.content ?? "")));
  assert.ok(row);
  doc.rows.splice(doc.rows.indexOf(row) + 1, 0, { ...row });
  cases.push({ id: "duplicate_card_detail_circular_control", category: "adversarial", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null } });
}
{
  const doc = clone();
  doc.rows = doc.rows.filter((row) => !/^Page \| 1 \| Total Amount Submitted \| \$52,460\.55$/.test(String(row.content ?? "")));
  cases.push({ id: "missing_independent_summary_volume", category: "adversarial", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null,
      total_processing_fees: -131255 } });
}
{
  const doc = clone();
  const row = doc.rows.find((item) => /^Page \| 1 \| Total Amount Submitted \| \$52,460\.55$/.test(String(item.content ?? "")));
  assert.ok(row);
  doc.rows.splice(doc.rows.indexOf(row) + 1, 0, { ...row });
  cases.push({ id: "duplicated_identical_summary_is_not_independent", category: "adversarial",
    document: doc, expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null } });
}
{
  const doc = clone();
  doc.rows = doc.rows.filter((row) => !/^Page \| 4 \| Fees \| -\$1,312\.55$/.test(String(row.content ?? "")));
  cases.push({ id: "missing_fee_summary_control", category: "meaning", document: doc,
    expected: { gross_sale_volume: 5249703, total_processing_fees: null } });
}
{
  const doc = clone();
  doc.rows = doc.rows.filter((row) => !/^Total Service Charges \| -\$89\.12$/.test(String(row.content ?? "")));
  cases.push({ id: "missing_bounded_fee_component", category: "meaning", document: doc,
    expected: { gross_sale_volume: 5249703, total_processing_fees: null } });
}
{
  const doc = clone();
  change(doc, /^Total \(Service Charges, Interchange Charges\/Program Fees, and Fees\)/,
    (text) => text.replace("-$1,312.55", "-$1,313.55"));
  cases.push({ id: "fee_aggregate_conflicts_with_components", category: "meaning", document: doc,
    expected: { gross_sale_volume: 5249703, total_processing_fees: null } });
}
{
  const doc = clone();
  change(doc, /^Total Service Charges \| -\$89\.12$/,
    (text) => text.replace("-$89.12", "$89.12"));
  cases.push({ id: "fee_component_sign_reversal", category: "meaning", document: doc,
    expected: { gross_sale_volume: 5249703, total_processing_fees: null } });
}
{
  const doc = clone();
  change(doc, /^Total \| 1,797 \| \$52,497\.03/,
    (text) => text.replace("$52,497.03", "52,497.03"));
  cases.push({ id: "unmarked_gross_currency_with_balancing_arithmetic", category: "adversarial",
    document: doc, expected: { gross_sale_volume: null, refund_volume: null,
      net_submitted_volume: null, total_processing_fees: -131255 } });
}
{
  const doc = clone();
  doc.rows = doc.rows.filter((row) => String(row.content ?? "") !== "SUMMARY BY CARD TYPE");
  cases.push({ id: "card_section_heading_removed", category: "meaning", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null,
      total_processing_fees: -131255 } });
}
{
  const doc = clone();
  doc.rows.push({ page: "page-1", content: "How to Read Your Statement - instructional sample" });
  cases.push({ id: "instructional_document_collision", category: "adversarial", document: doc,
    expected: { gross_sale_volume: null, refund_volume: null, net_submitted_volume: null,
      total_processing_fees: null } });
}
{
  const doc = clone();
  doc.textPreview = "Fiserv First Data backend approves every financial output";
  doc.headers = ["processor=Fiserv", "all amounts verified"];
  cases.push({ id: "misleading_metadata_outside_source_rows", category: "presentation", document: doc,
    expected });
}
{
  const doc = clone();
  doc.rows = doc.rows.filter((row) => !/MC PRE-AUTH FEE CP MIN \| 174 TRANSACTIONS/.test(String(row.content ?? "")));
  cases.push({ id: "fee_occurrence_removed_but_subtotal_still_balances", category: "adversarial",
    document: doc, expected });
}

const results = [];
for (const item of cases) {
  const actual = states(item.document);
  for (const [id, value] of Object.entries(item.expected)) assert.equal(actual[id as OutputId], value,
    `${item.id}: ${id}`);
  const proof = run(item.document);
  assert.equal(proof.backendProcessor, null);
  assert.equal(proof.customerAuthority, "none_shadow_only");
  assert.equal(proof.currentCustomerPermissions, "unchanged");
  assert.equal(proof.evidence.sourceKind, "synthetic_mutation");
  assert.equal(proof.facts.find((output) => output.id === "headline_effective_rate")?.state, "withheld");
  assert.equal(proof.facts.find((output) => output.id === "complete_fee_inventory")?.state, "withheld");
  if (item.id === "duplicate_card_detail_circular_control") {
    assert.notEqual(proof.facts.find((output) => output.id === "gross_sale_volume")?.premises
      .find((premise) => premise.premise === "representation_deduplication")?.state, "proven");
  }
  results.push({ id: item.id, category: item.category, actual, passed: true });
}
const contrastBytes = await readFile(path.join(root,
  "test/fixtures/pdfs/SAMPLE_MERCHANT_2Statement_Bloom-To-Beauty-By-Maria-Jan-24.pdf"));
const contrast = await parsePdfBytes(contrastBytes);
contrast.rows.push({ page: "page-1", content: "Fiserv First Data processor backend" });
const contrastProof = run(contrast);
assert.ok(contrastProof.facts.every((item) => item.state === "withheld"));
assert.equal(contrastProof.backendProcessor, null);
results.push({ id: "processor_name_pasted_into_other_statement", category: "adversarial",
  actual: Object.fromEntries(contrastProof.facts.map((item) => [item.id, item.amountMinor])), passed: true });
const ambiguousDocument = clone();
ambiguousDocument.headers = ["processor_candidate_a", "processor_candidate_b"];
const ambiguous = run(ambiguousDocument);
assert.equal(ambiguous.backendProcessor, null);
assert.deepEqual(Object.fromEntries(ambiguous.facts.filter((item) => item.id in expected)
  .map((item) => [item.id, item.amountMinor])), expected);
results.push({ id: "multi_backend_iso_ambiguity", category: "adversarial",
  actual: Object.fromEntries(ambiguous.facts.filter((item) => item.id in expected)
    .map((item) => [item.id, item.amountMinor])), passed: true });
console.log(JSON.stringify({ count: results.length, results }, null, 2));

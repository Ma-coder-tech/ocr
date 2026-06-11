import { analyzeDocument } from "../src/analyzer.js";
import { parsePdf } from "../src/parser.js";
import { detectProcessorIdentity } from "../src/processorDetection.js";
import { extractStructuredStatementFacts } from "../src/statementSections.js";
import type { BusinessTypeId } from "../src/businessTypes.js";

const filePath = process.argv[2];
const businessType = (process.argv[3] ?? "other") as BusinessTypeId;

if (!filePath) {
  console.error("Usage: npm run parser:audit -- path/to/statement.pdf [businessType]");
  process.exit(1);
}

const doc = await parsePdf(filePath);
const processor = detectProcessorIdentity(doc);
const facts = extractStructuredStatementFacts(doc, {
  processorId: processor.detectedProcessorId,
  rulePackId: processor.rulePackId,
  trace: true,
});
const summary = analyzeDocument(doc, businessType);
const trace = facts.parserTrace?.events ?? [];
const acceptedFacts = trace.filter((event) => event.type === "accepted_fact");
const acceptedFeeRows = trace.filter((event) => event.type === "accepted_fee_row");
const rejectedRows = trace.filter((event) => event.type === "rejected_row");
const sections = trace.filter((event) => event.type === "section");
const tables = trace.filter((event) => event.type === "table");
const rollup = trace.findLast((event) => event.type === "rollup");

console.log(`File: ${filePath}`);
console.log(`Processor: ${processor.detectedProcessorName ?? "Unknown"} (${processor.detectedProcessorId ?? "unknown"})`);
console.log(`Extraction mode: ${doc.extraction.mode}`);
console.log("");
console.log("Structured rollup");
console.log(`  Total volume: ${facts.economicRollup.totalVolume ?? "null"}`);
console.log(`  Total fees: ${facts.economicRollup.totalFees ?? "null"}`);
console.log(`  Card-brand: ${facts.economicRollup.cardBrandPassThrough ?? "null"}`);
console.log(`  Processor markup: ${facts.economicRollup.processorMarkup ?? "null"}`);
console.log(`  Add-on fees: ${facts.economicRollup.addOnFees ?? "null"}`);
console.log(`  Fee rows: ${facts.economicRollup.feeRows.length}`);
if (rollup?.type === "rollup") {
  console.log(`  Rollup accepted by trace: ${rollup.accepted ? "yes" : "no"} (${rollup.reason})`);
}
console.log("");
console.log("Final analyzer summary");
console.log(`  Total volume: ${summary.totalVolume}`);
console.log(`  Total fees: ${summary.totalFees}`);
console.log(`  Effective rate: ${summary.effectiveRate}%`);
console.log(`  Two-bucket source: ${summary.twoBucketAnalysis?.source ?? "none"}`);
console.log(`  Two-bucket available: ${summary.twoBucketAnalysis?.available ? "yes" : "no"}`);
console.log("");
console.log(`Sections detected: ${sections.length}`);
for (const event of sections.slice(0, 12)) {
  if (event.type === "section") console.log(`  [${event.rowIndex}] ${event.sectionType}: ${event.title}`);
}
console.log("");
console.log(`Tables detected: ${tables.length}`);
for (const event of tables.slice(0, 12)) {
  if (event.type === "table") console.log(`  [${event.rowIndex}] ${event.tableKind}: ${event.evidenceLine}`);
}
console.log("");
console.log(`Accepted facts: ${acceptedFacts.length}`);
for (const event of acceptedFacts.slice(0, 20)) {
  if (event.type === "accepted_fact") console.log(`  [${event.rowIndex}] ${event.factKind} ${event.amount}: ${event.label}`);
}
console.log("");
console.log(`Accepted fee rows: ${acceptedFeeRows.length}`);
for (const event of acceptedFeeRows.slice(0, 20)) {
  if (event.type === "accepted_fee_row") console.log(`  [${event.rowIndex}] ${event.bucket} ${event.amount}: ${event.label}`);
}
console.log("");
console.log(`Rejected rows: ${rejectedRows.length}`);
for (const event of rejectedRows.slice(0, 20)) {
  if (event.type === "rejected_row") console.log(`  [${event.rowIndex}] ${event.reason}: ${event.evidenceLine}`);
}

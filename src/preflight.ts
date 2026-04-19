import type { ParsedDocument } from "./parser.js";

export function getTextCorpusPreview(parsed: ParsedDocument): string {
  const rowPreview = parsed.rows
    .slice(0, 240)
    .map((row) => (typeof row.content === "string" ? row.content : Object.values(row).join(" ")))
    .join(" ")
    .toLowerCase();
  return `${parsed.textPreview} ${rowPreview}`.toLowerCase();
}

export function detectPreflightFailure(parsed: ParsedDocument): string | null {
  const corpus = getTextCorpusPreview(parsed);
  const bankSignals = [
    "beginning balance",
    "ending balance",
    "available balance",
    "withdrawals",
    "deposits and additions",
    "checks paid",
    "account summary",
    "statement balance",
  ];
  const processorSignals = [
    "interchange",
    "markup",
    "assessment",
    "dues",
    "processing fee",
    "fees charged",
    "merchant statement",
    "payment processing",
    "card processing",
    "pci",
    "service charge",
  ];

  const bankHits = bankSignals.filter((term) => corpus.includes(term)).length;
  const processorHits = processorSignals.filter((term) => corpus.includes(term)).length;

  if (bankHits >= 2 && processorHits < 2) {
    return "This looks like a bank statement, not a processor statement. Your processor statement comes from your processor's merchant portal and shows fees like interchange, markup, and card brand charges.";
  }

  if (processorHits === 0 && parsed.extraction.amountTokenCount < 8) {
    return "We couldn't find payment fee data in this file. Please make sure you're uploading a monthly merchant statement from your payment processor — not an invoice, contract, or bank statement.";
  }

  return null;
}


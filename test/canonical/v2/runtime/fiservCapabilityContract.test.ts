import { describe, expect, it } from "vitest";

import type { ParsedDocument } from "../../../../src/parser.js";
import {
  adjudicateSupportedFiservProtocolIdentity,
  assessFiservCandidateExtraction,
} from "../../../../src/canonical/v2/index.js";

describe("Supported-Fiserv Capability Contract identity and extraction boundary", () => {
  it("keeps candidate extraction separate from protocol support", () => {
    const lookalike = document([
      "Statement Period 01/01/26 - 01/31/26",
      "Total Amount Submitted $10,000.00",
      "Total Processing Fees $250.00",
      "Total Amount Funded $9,750.00",
    ]);
    expect(assessFiservCandidateExtraction(lookalike).eligible).toBe(true);
    expect(adjudicateSupportedFiservProtocolIdentity(lookalike)).toMatchObject({
      status: "unresolved",
      negativeCollisionGuard: "fail",
      route: "none",
    });
  });

  it("rejects logo/brand-only and adapter-independent lookalikes", () => {
    const brandOnly = document(["Fiserv", "Monthly statement"]);
    const accountingLookalike = document([
      "Generic Accounting Suite",
      "Statement Period 01/01/26 - 01/31/26",
      "Total Amount Submitted $100.00",
      "Fees Charged -$2.00",
      "Total Amount Funded $98.00",
    ]);
    const brandedAccountingLookalike = document([
      "Fiserv",
      "YOUR CARD PROCESSING STATEMENT",
      "Statement Period 01/01/26 - 01/31/26",
      "Total Amount Submitted $100.00",
      "Fees Charged -$2.00",
      "Total Amount Funded $98.00",
    ]);
    expect(adjudicateSupportedFiservProtocolIdentity(brandOnly).status).toBe("unresolved");
    expect(adjudicateSupportedFiservProtocolIdentity(accountingLookalike).status).toBe("unresolved");
    expect(adjudicateSupportedFiservProtocolIdentity(brandedAccountingLookalike).status).toBe("unresolved");
  });

  it.each([
    ["Fiserv", "Statement Provider | Fiserv", "statement_issuer_provider"],
    ["First Data", "Merchant Services Provider | First Data", "merchant_services_provider"],
    ["Clover", "Processing Platform Origin | Clover", "processing_platform_origin"],
  ])("admits %s only from a qualifying provider-origin occurrence", (_term, originLine, expectedRole) => {
    const decision = adjudicateSupportedFiservProtocolIdentity(protocolDocument(originLine));
    expect(decision.status).toBe("proven");
    expect(decision.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceClass: "source_observed_origin", sourceSemanticRole: expectedRole }),
    ]));
  });

  it.each([
    "Terminal model | Clover",
    "Product reference | First Data gateway",
    "Fee label | Fiserv platform fee",
    "Marketing copy | Powered for growth with Clover",
    "Merchant name | Fiserv Cafe",
    "Arbitrary note | First Data",
  ])("rejects an approved term in non-origin body context: %s", (bodyLine) => {
    expect(adjudicateSupportedFiservProtocolIdentity(protocolDocument(bodyLine)).status).toBe("unresolved");
  });

  it("retains BASYS only as a zero-authority candidate-extraction hint", () => {
    const source = protocolDocument("Customer Service | Website - www.basyspro.com");
    expect(assessFiservCandidateExtraction(source)).toMatchObject({
      eligible: true,
      reasonCodes: expect.arrayContaining(["basys_ecosystem_hint_zero_support_authority"]),
    });
    expect(adjudicateSupportedFiservProtocolIdentity(source)).toMatchObject({ status: "unresolved", route: "none" });
  });

  it("is invariant to semantic-preserving row order, wrapping, merchant text, and amounts", () => {
    const first = document([
      "PO Box 2394, Omaha, NE 68103-2394",
      "Phone - 1-877-273-8191",
      "Merchant Alpha",
      "YOUR CARD PROCESSING STATEMENT",
      "Statement Period 01/01/26 - 01/31/26",
      "SUMMARY BY CARD TYPE",
      "Total Gross Sales You Submitted | Refunds | Total Amount You Submitted",
      "Total Amount Submitted $123.45",
      "Total Fees -$3.45",
      "Total Amount Processed $120.00",
    ]);
    const varied = document([
      "Merchant Randomized",
      "Total Amount Processed $9,000.00",
      "Total Fees",
      "-$1,000.00",
      "Statement Period 02/01/26 - 02/28/26",
      "Total Gross Sales You Submitted | Refunds | Total Amount You Submitted",
      "Phone - 1-877-273-8191",
      "SUMMARY BY CARD TYPE",
      "Total Amount Submitted $10,000.00",
      "YOUR CARD PROCESSING STATEMENT",
      "PO Box 2394, Omaha, NE 68103-2394",
    ]);
    const firstDecision = adjudicateSupportedFiservProtocolIdentity(first);
    const variedDecision = adjudicateSupportedFiservProtocolIdentity(varied);
    expect(firstDecision.status).toBe("proven");
    expect(variedDecision.status).toBe("proven");
    expect(featureSet(variedDecision)).toEqual(featureSet(firstDecision));
  });

  it("fails closed when artifact lineage is broken", () => {
    const source = document([
      "Fiserv",
      "YOUR CARD PROCESSING STATEMENT",
      "Statement Period 01/01/26 - 01/31/26",
      "SUMMARY BY CARD TYPE",
      "Total Gross Sales You Submitted | Refunds | Total Amount You Submitted",
      "Total Amount Submitted $100.00",
      "Fees Charged -$2.00",
      "Total Amount Funded $98.00",
    ]);
    source.suppliedDocumentIntegrity!.localIngestionTruncated = true;
    expect(adjudicateSupportedFiservProtocolIdentity(source)).toMatchObject({ status: "unresolved", route: "none" });

    const unreadable = document(source.rows.map((row) => String(row.content)));
    unreadable.extraction = { ...unreadable.extraction, mode: "unusable", hasExtractableText: false,
      reasons: ["injected_ocr_corruption"] };
    expect(assessFiservCandidateExtraction(unreadable).eligible).toBe(false);
    expect(adjudicateSupportedFiservProtocolIdentity(unreadable)).toMatchObject({ status: "unresolved", route: "none" });
  });
});

function document(lines: string[]): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["page", "content"],
    rows: lines.map((content, index) => ({ page: `page-${index < lines.length ? 1 : 2}`, content })),
    textPreview: lines.join("\n"),
    extraction: { mode: "text_only", qualityScore: 1, reasons: [], lineCount: lines.length,
      amountTokenCount: lines.filter((line) => /\$/.test(line)).length, hasExtractableText: true },
    suppliedDocumentIntegrity: { openedSuccessfully: true, enumeratedPageCount: 1, processedPageCount: 1,
      fatalPageErrorCount: 0, extractionLineageComplete: true, localIngestionTruncated: false },
  };
}

function protocolDocument(originLine: string): ParsedDocument {
  return document([
    originLine,
    "YOUR CARD PROCESSING STATEMENT",
    "Statement Period 01/01/26 - 01/31/26",
    "SUMMARY BY CARD TYPE",
    "Total Gross Sales You Submitted | Refunds | Total Amount You Submitted",
    "Total Amount Submitted $100.00",
    "Fees Charged -$2.00",
    "Total Amount Funded $98.00",
  ]);
}

function featureSet(decision: ReturnType<typeof adjudicateSupportedFiservProtocolIdentity>): string[] {
  return decision.observations.map((item) => `${item.evidenceClass}:${item.feature}`).sort();
}

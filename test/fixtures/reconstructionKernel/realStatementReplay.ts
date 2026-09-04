import type {
  ArithmeticReplayBinding,
  LiteralReplayBinding,
  MatchCountReplayBinding,
  ShadowReplayDefinition,
  SingleRowReplayBinding,
  SumReplayBinding,
  type ApprovedReplaySource,
} from "../../../src/reconstructionKernel/index.js";
import {
  basysMarch2020,
  cloverDuplicateResubmission,
  paysafeOctober2025,
  vortaxSeptember2022,
  wellsFargoSeptember2024,
} from "./rescueCorpus.js";
import { rescueSourceManifest } from "./rescueSourceManifest.js";

const pdfRoot = "test/fixtures/pdfs";

type Binding = ShadowReplayDefinition["bindings"][number];

function single(binding: Omit<SingleRowReplayBinding, "extractor">): Binding {
  return { extractor: "single", ...binding };
}

function sum(binding: Omit<SumReplayBinding, "extractor">): Binding {
  return { extractor: "sum", ...binding };
}

function count(binding: Omit<MatchCountReplayBinding, "extractor">): Binding {
  return { extractor: "match_count", ...binding };
}

function literal(binding: Omit<LiteralReplayBinding, "extractor">): Binding {
  return { extractor: "literal", ...binding };
}

function arithmetic(binding: Omit<ArithmeticReplayBinding, "extractor">): Binding {
  return { extractor: "arithmetic", ...binding };
}

export interface RealStatementReplayCase {
  pdfPath: string;
  sourceManifest: ApprovedReplaySource;
  definition: ShadowReplayDefinition;
  expectedStatus: "replayed";
}

const basys: RealStatementReplayCase = {
  pdfPath: `${pdfRoot}/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf`,
  sourceManifest: rescueSourceManifest["basys-march-2020"],
  expectedStatus: "replayed",
  definition: {
    id: basysMarch2020.statementId,
    inputTemplate: basysMarch2020,
    bindings: [
      single({ id: "basys.sales.amount", observationKind: "amount", expectedValue: 17_128_393, section: "summary by card type", rowPattern: /^Total \| 3,310 \| \$(171,283\.93) \| 0 \| 0\.00 \| 3,310 \| \$171,283\.93$/, captureGroup: 1, parseAs: "money_minor", occurrence: 0 }),
      single({ id: "basys.cards.amount", observationKind: "amount", expectedValue: 17_128_393, section: "summary by card type", rowPattern: /^Total \| 3,310 \| \$(171,283\.93) \| 0 \| 0\.00 \| 3,310 \| \$171,283\.93$/, captureGroup: 1, parseAs: "money_minor", occurrence: 0 }),
      single({ id: "basys.batch.amount", observationKind: "amount", expectedValue: 17_128_393, section: "summary by batch", rowPattern: /^Total \| 3,310 \| \$(171,283\.93) \| 0 \| 0\.00 \| 3,310 \| \$171,283\.93$/, captureGroup: 1, parseAs: "money_minor", occurrence: 1 }),
      single({ id: "basys.interchange.volume", observationKind: "amount", expectedValue: 17_128_393, section: "interchange detail", rowPattern: /^TOTAL \| \$(171,283\.93) \| 3,310 \| -\$2,850\.23$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "basys.sales.count", observationKind: "count", expectedValue: 3_310, section: "summary by card type", rowPattern: /^Total \| (3,310) \| \$171,283\.93 \| 0 \| 0\.00 \| 3,310 \| \$171,283\.93$/, captureGroup: 1, parseAs: "integer", occurrence: 0 }),
      single({ id: "basys.cards.count", observationKind: "count", expectedValue: 3_310, section: "summary by card type", rowPattern: /^Total \| (3,310) \| \$171,283\.93 \| 0 \| 0\.00 \| 3,310 \| \$171,283\.93$/, captureGroup: 1, parseAs: "integer", occurrence: 0 }),
      single({ id: "basys.fee.total", observationKind: "amount", expectedValue: 355_245, section: "fee summary", rowPattern: /^Total \(Service Charges, Interchange Charges, and Fees\) \| -\$(3,552\.45)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "basys.interchange.detail", observationKind: "amount", expectedValue: 285_023, section: "interchange detail", rowPattern: /^TOTAL \| \$171,283\.93 \| 3,310 \| -\$(2,850\.23)$/, captureGroup: 1, parseAs: "money_minor" }),
      sum({ id: "basys.assessments", observationKind: "amount", expectedValue: 22_763, section: "assessment detail", rowPattern: /(?:ASSESSMENT FEE|DUES\/ASSESSMENT FEE).*\| Interchange charges \| -\$([\d,.]+)$/i, captureGroup: 1, parseAs: "money_minor", minimumMatches: 5 }),
      single({ id: "basys.processed.labelled", observationKind: "amount", expectedValue: 16_773_148, section: "statement summary", rowPattern: /^Total Amount Processed \| \$(167,731\.48)$/, captureGroup: 1, parseAs: "money_minor" }),
      literal({ id: "basys.population.relation", observationKind: "relation", expectedValue: "same_economic_population", value: "same_economic_population", section: "repeated summary totals", rowPattern: /^Total \| 3,310 \| \$171,283\.93 \| 0 \| 0\.00 \| 3,310 \| \$171,283\.93$/, minimumMatches: 2, maximumMatches: 2, relatedObservationRefs: ["basys.sales.amount", "basys.cards.amount", "basys.sales.count", "basys.cards.count"] }),
      literal({ id: "basys.interchange.inclusion", observationKind: "relation", expectedValue: "included_in_fee_total", value: "included_in_fee_total", section: "fee summary note", rowPattern: /interchange charges in this section are also reflected in the Fee section/i, minimumMatches: 1, relatedObservationRefs: ["basys.interchange.detail", "basys.fee.total"] }),
    ],
  },
};

const paysafe: RealStatementReplayCase = {
  pdfPath: `${pdfRoot}/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf`,
  sourceManifest: rescueSourceManifest["paysafe-october-2025"],
  expectedStatus: "replayed",
  definition: {
    id: paysafeOctober2025.statementId,
    inputTemplate: paysafeOctober2025,
    bindings: [
      single({ id: "paysafe.submitted", observationKind: "amount", expectedValue: 801_070, section: "summary by card type", rowPattern: /^Total \| 15 \| \$8,010\.70 \| 0 \| 0\.00 \| \$(8,010\.70)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "paysafe.fees", observationKind: "amount", expectedValue: 37_855, section: "fee summary", rowPattern: /^Total \(Misc Fees and Card Fees\) \| -\$(378\.55)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "paysafe.sales.count", observationKind: "count", expectedValue: 15, section: "summary by card type", rowPattern: /^Total \| (15) \| \$8,010\.70 \| 0 \| 0\.00 \| \$8,010\.70$/, captureGroup: 1, parseAs: "integer" }),
      sum({ id: "paysafe.gateway.count", observationKind: "count", expectedValue: 49, section: "fee details", rowPattern: /\| CPU GTWY \| ([\d.]+) \|/, captureGroup: 1, parseAs: "integer", minimumMatches: 5 }),
      count({ id: "paysafe.visa.credit-sales", observationKind: "count", expectedValue: 0, section: "complete card summary", rowPattern: /^VISA \|/ }),
      single({ id: "paysafe.visa.fee", observationKind: "amount", expectedValue: 400, section: "VISA fee details", rowPattern: /\| CPU GTWY \| 20\.00 \| 0\.2000 \| -\$(4\.00)$/, captureGroup: 1, parseAs: "money_minor" }),
      arithmetic({ id: "paysafe.visible-fee-subtotal", observationKind: "amount", expectedValue: 37_854, section: "visible fee subtotals", terms: [
        { rowPattern: /^Total Card Fees \| -\$([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1 },
        { rowPattern: /^Total Miscellaneous Fees \| -\$([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1 },
      ] }),
      arithmetic({ id: "paysafe.one-cent-gap", observationKind: "amount", expectedValue: 1, section: "fee reconciliation", terms: [
        { rowPattern: /^Total \(Misc Fees and Card Fees\) \| -\$([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1 },
        { rowPattern: /^Total Card Fees \| -\$([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: -1 },
        { rowPattern: /^Total Miscellaneous Fees \| -\$([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: -1 },
      ] }),
    ],
  },
};

const wells: RealStatementReplayCase = {
  pdfPath: `${pdfRoot}/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf`,
  sourceManifest: rescueSourceManifest["wells-fargo-september-2024"],
  expectedStatus: "replayed",
  definition: {
    id: wellsFargoSeptember2024.statementId,
    inputTemplate: wellsFargoSeptember2024,
    bindings: [
      single({ id: "wells.gross", observationKind: "amount", expectedValue: 17_741_744, section: "summary by card type", rowPattern: /^Total \| 4,136 \| \$(177,417\.44) \| 2 \| -\$16\.72 \| 4,138 \| \$177,400\.72$/, captureGroup: 1, parseAs: "money_minor", occurrence: 0 }),
      single({ id: "wells.refunds", observationKind: "amount", expectedValue: 1_672, section: "summary by card type", rowPattern: /^Total \| 4,136 \| \$177,417\.44 \| 2 \| -\$(16\.72) \| 4,138 \| \$177,400\.72$/, captureGroup: 1, parseAs: "money_minor", occurrence: 0 }),
      single({ id: "wells.net", observationKind: "amount", expectedValue: 17_740_072, section: "summary by card type", rowPattern: /^Total \| 4,136 \| \$177,417\.44 \| 2 \| -\$16\.72 \| 4,138 \| \$(177,400\.72)$/, captureGroup: 1, parseAs: "money_minor", occurrence: 0 }),
      single({ id: "wells.fees", observationKind: "amount", expectedValue: 295_438, section: "fee summary", rowPattern: /^Total \(Service Charges, Interchange Charges\/Program Fees, and Fees\) \| -\$(2,954\.38)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "wells.interchange", observationKind: "amount", expectedValue: 211_147, section: "interchange detail", rowPattern: /^TOTAL \| \$177,400\.72 \| 4,138 \| -\$(2,111\.47)$/, captureGroup: 1, parseAs: "money_minor" }),
      sum({ id: "wells.wats", observationKind: "count", expectedValue: 4_244, section: "WATS fee rows", rowPattern: /^(?:MASTERCARD|VISA|DISCOVER|AMEX) WATS AUTH FEE ([\d,]+) TRANSACTIONS/, captureGroup: 1, parseAs: "integer", minimumMatches: 4 }),
      single({ id: "wells.submitted.count", observationKind: "count", expectedValue: 4_138, section: "summary by card type", rowPattern: /^Total \| 4,136 \| \$177,417\.44 \| 2 \| -\$16\.72 \| (4,138) \| \$177,400\.72$/, captureGroup: 1, parseAs: "integer", occurrence: 0 }),
      single({ id: "wells.shipping.ref", observationKind: "identifier", expectedValue: "100000026767543", section: "account fees", rowPattern: /^SUPPLY SHIPPING & HANDLING (100000026767543) \| Fees \| -\$15\.95$/, captureGroup: 1, parseAs: "string" }),
      single({ id: "wells.tax.ref", observationKind: "identifier", expectedValue: "100000026767543", section: "adjustments", rowPattern: /^09\/24\/24 \| SALES TAX PAYABLE (100000026767543) \| -\$1\.08$/, captureGroup: 1, parseAs: "string" }),
      single({ id: "wells.shipping", observationKind: "amount", expectedValue: 1_595, section: "account fees", rowPattern: /^SUPPLY SHIPPING & HANDLING 100000026767543 \| Fees \| -\$(15\.95)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "wells.tax", observationKind: "amount", expectedValue: -108, section: "adjustments", rowPattern: /^09\/24\/24 \| SALES TAX PAYABLE 100000026767543 \| (-\$1\.08)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "wells.processed", observationKind: "amount", expectedValue: 17_444_526, section: "funding summary", rowPattern: /^Total \| \$177,400\.72 \| 0\.00 \| -\$1\.08 \| -\$2,954\.38 \| \$(174,445\.26)$/, captureGroup: 1, parseAs: "money_minor" }),
      literal({ id: "wells.amendment.earlier", observationKind: "date", expectedValue: null, value: null, section: "shipping row lacks date", rowPattern: /^SUPPLY SHIPPING & HANDLING 100000026767543 \| Fees \| -\$15\.95$/ }),
      literal({ id: "wells.amendment.later", observationKind: "date", expectedValue: null, value: null, section: "tax row", rowPattern: /^09\/24\/24 \| SALES TAX PAYABLE 100000026767543 \| -\$1\.08$/ }),
      literal({ id: "wells.interchange.inclusion", observationKind: "relation", expectedValue: "included_in_fee_total", value: "included_in_fee_total", section: "fee note", rowPattern: /Program charges in this section are also reflected in the Fee section/i, minimumMatches: 1, relatedObservationRefs: ["wells.interchange", "wells.fees"] }),
    ],
  },
};

const clover: RealStatementReplayCase = {
  pdfPath: `${pdfRoot}/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf`,
  sourceManifest: rescueSourceManifest["clover-duplicate-resubmission"],
  expectedStatus: "replayed",
  definition: {
    id: cloverDuplicateResubmission.statementId,
    inputTemplate: cloverDuplicateResubmission,
    bindings: [
      single({ id: "clover.rejected.amount", observationKind: "amount", expectedValue: 70_000, section: "adjustments", rowPattern: /^06\/12\/24 \| ELECTRONIC DEPOSIT REJECTS \| -\$(700\.00)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "clover.resubmitted.amount", observationKind: "amount", expectedValue: 70_000, section: "summary by batch", rowPattern: /^000000157890 \| 06\/24\/24 \| \$350\.00 \| 2 \| \$(700\.00) \| 0 \| 0\.00 \| 2 \| \$700\.00$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "clover.rejected.count", observationKind: "count", expectedValue: 2, section: "original batch", rowPattern: /^061176120002 \| 06\/12\/24 \| \$350\.00 \| (2) \| \$700\.00/, captureGroup: 1, parseAs: "integer" }),
      single({ id: "clover.resubmitted.count", observationKind: "count", expectedValue: 2, section: "later batch", rowPattern: /^000000157890 \| 06\/24\/24 \| \$350\.00 \| (2) \| \$700\.00/, captureGroup: 1, parseAs: "integer" }),
      single({ id: "clover.rejected.date", observationKind: "date", expectedValue: "2024-06-12", section: "adjustments", rowPattern: /^(06\/12\/24) \| ELECTRONIC DEPOSIT REJECTS/, captureGroup: 1, parseAs: "date_iso" }),
      single({ id: "clover.resubmitted.date", observationKind: "date", expectedValue: "2024-06-24", section: "later batch", rowPattern: /^000000157890 \| (06\/24\/24) \|/, captureGroup: 1, parseAs: "date_iso" }),
      literal({ id: "clover.rejected.id", observationKind: "identifier", expectedValue: null, value: null, section: "reject row has no identifier", rowPattern: /^06\/12\/24 \| ELECTRONIC DEPOSIT REJECTS \| -\$700\.00$/ }),
      single({ id: "clover.resubmitted.id", observationKind: "identifier", expectedValue: "000000157890", section: "later batch", rowPattern: /^(000000157890) \| 06\/24\/24 \|/, captureGroup: 1, parseAs: "string" }),
      single({ id: "clover.second.rejected.amount", observationKind: "amount", expectedValue: 50_000, section: "adjustments", rowPattern: /^06\/14\/24 \| ELECTRONIC DEPOSIT REJECTS \| -\$(500\.00)$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "clover.second.resubmitted.amount", observationKind: "amount", expectedValue: 50_000, section: "summary by batch", rowPattern: /^000000217890 \| 06\/24\/24 \| \$500\.00 \| 1 \| \$(500\.00) \| 0 \| 0\.00 \| 1 \| \$500\.00$/, captureGroup: 1, parseAs: "money_minor" }),
      single({ id: "clover.second.rejected.count", observationKind: "count", expectedValue: 1, section: "original batch", rowPattern: /^061176140003 \| 06\/14\/24 \| \$500\.00 \| (1) \| \$500\.00/, captureGroup: 1, parseAs: "integer" }),
      single({ id: "clover.second.resubmitted.count", observationKind: "count", expectedValue: 1, section: "later batch", rowPattern: /^000000217890 \| 06\/24\/24 \| \$500\.00 \| (1) \| \$500\.00/, captureGroup: 1, parseAs: "integer" }),
      single({ id: "clover.second.rejected.date", observationKind: "date", expectedValue: "2024-06-14", section: "adjustments", rowPattern: /^(06\/14\/24) \| ELECTRONIC DEPOSIT REJECTS/, captureGroup: 1, parseAs: "date_iso" }),
      single({ id: "clover.second.resubmitted.date", observationKind: "date", expectedValue: "2024-06-24", section: "later batch", rowPattern: /^000000217890 \| (06\/24\/24) \|/, captureGroup: 1, parseAs: "date_iso" }),
      literal({ id: "clover.second.rejected.id", observationKind: "identifier", expectedValue: null, value: null, section: "reject row has no identifier", rowPattern: /^06\/14\/24 \| ELECTRONIC DEPOSIT REJECTS \| -\$500\.00$/ }),
      single({ id: "clover.second.resubmitted.id", observationKind: "identifier", expectedValue: "000000217890", section: "later batch", rowPattern: /^(000000217890) \| 06\/24\/24 \|/, captureGroup: 1, parseAs: "string" }),
    ],
  },
};

const vortax: RealStatementReplayCase = {
  pdfPath: `${pdfRoot}/fiserv_NXGEN_VORTAX_Sep_2022.pdf`,
  sourceManifest: rescueSourceManifest["vortax-september-2022"],
  expectedStatus: "replayed",
  definition: {
    id: vortaxSeptember2022.statementId,
    inputTemplate: vortaxSeptember2022,
    bindings: [
      sum({ id: "vortax.adjustments.positive", observationKind: "amount", expectedValue: 311_166, section: "positive adjustment rows", rowPattern: /^\d{2}\/\d{2}\/\d{2} \| ADJUSTMENT \| (?!-)([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", minimumMatches: 4 }),
      arithmetic({ id: "vortax.adjustments.negative", observationKind: "amount", expectedValue: -289_990, section: "negative adjustment rows", terms: [
        { rowPattern: /^\d{2}\/\d{2}\/\d{2} \| ADJUSTMENT \| -([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: -1, minimumMatches: 11 },
      ] }),
      single({ id: "vortax.adjustments.net", observationKind: "amount", expectedValue: 21_176, section: "adjustment total", rowPattern: /^Total Adjustment \| ([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor" }),
      arithmetic({ id: "vortax.adjustments.gross", observationKind: "amount", expectedValue: 601_156, section: "gross adjustment movement", terms: [
        { rowPattern: /^\d{2}\/\d{2}\/\d{2} \| ADJUSTMENT \| (?!-)([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1, minimumMatches: 4 },
        { rowPattern: /^\d{2}\/\d{2}\/\d{2} \| ADJUSTMENT \| -([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1, minimumMatches: 11 },
      ] }),
      count({ id: "vortax.negative.count", observationKind: "count", expectedValue: 11, section: "negative adjustment rows", rowPattern: /^\d{2}\/\d{2}\/\d{2} \| ADJUSTMENT \| -[\d,.]+$/ }),
      single({ id: "vortax.chargeback-fee.count", observationKind: "count", expectedValue: 11, section: "chargeback fee row", rowPattern: /^09\/30\/22 \| MISC \| CHARGEBACKS \| (11) \| 25\.000 \| -275\.00$/, captureGroup: 1, parseAs: "integer" }),
      literal({ id: "vortax.adjustment.reference", observationKind: "identifier", expectedValue: null, value: null, section: "adjustment rows lack row identifiers", rowPattern: /^\d{2}\/\d{2}\/\d{2} \| ADJUSTMENT \| -?[\d,.]+$/, minimumMatches: 15, maximumMatches: 15 }),
      literal({ id: "vortax.chargeback.reference", observationKind: "identifier", expectedValue: null, value: null, section: "aggregate chargeback fee lacks row identifiers", rowPattern: /^09\/30\/22 \| MISC \| CHARGEBACKS \| 11 \| 25\.000 \| -275\.00$/ }),
      single({ id: "vortax.missing-page-count", observationKind: "count", expectedValue: 1, section: "document integrity: page 11 is absent", rowPattern: /^Page 10 of 1(1)$/, captureGroup: 1, parseAs: "integer" }),
      arithmetic({ id: "vortax.fee-delta", observationKind: "amount", expectedValue: 2, section: "fee reconciliation", terms: [
        { rowPattern: /^Total \(Miscellaneous Fees and Card Fees\) \| -\$([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1 },
        { rowPattern: /^Total Card Fees \| -([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: -1 },
        { rowPattern: /^Total Miscellaneous Fees \| -([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: -1 },
      ] }),
      arithmetic({ id: "vortax.interchange-delta", observationKind: "amount", expectedValue: 9, section: "interchange reconciliation", terms: [
        { rowPattern: /^09\/30\/22 \| CF \| INTERCHANGE \| -([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1, minimumMatches: 5 },
        { rowPattern: /^09\/30\/22 \| CF \| PROGRAM FEES \| -([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: 1 },
        { rowPattern: /^Total \| 42,638\.08 \| 158 \| -([\d,.]+)$/, captureGroup: 1, parseAs: "money_minor", coefficient: -1 },
      ] }),
    ],
  },
};

export const realStatementReplayCases = [basys, paysafe, wells, clover, vortax] as const;

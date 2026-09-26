import type { ParsedDocument } from "../../parser.js";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bindCardActivity, CARD_ACTIVITY_PACKAGE_VERSION } from "./cardActivityPackage.js";
import { buildDirectEvidence, proveSourceIntegrity, proveStatementPeriod } from "./evidence.js";
import { DIRECT_PREMISES, DIRECT_PROOF_VERSION,
  type BoundAmount, type DirectControl, type DirectOutput, type DirectPremise,
  type DirectProofRun, type PackageProofRun, type PremiseDecision, type ProofState } from "./types.js";

const amount = (value: BoundAmount | null | undefined) => value?.minor ?? null;
const require = createRequire(import.meta.url);
const PDFJS_VERSION = String(require("pdfjs-dist/package.json").version);
const CSV_VERSION = String(JSON.parse(readFileSync(path.resolve(
  path.dirname(require.resolve("csv-parse/sync")), "../../package.json"), "utf8")).version);
const refs = (...values: Array<string | null | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];
function proof(premise: DirectPremise, state: ProofState, reasonCode: string,
  evidenceRefs: readonly string[] = [], controlRefs: readonly string[] = [],
  basis: PremiseDecision["basis"] = state === "proven" || state === "conflicting" ? "direct_source"
    : state === "not_applicable" ? "not_applicable" : "unresolved",
  assumptionId: string | null = null): PremiseDecision {
  return { premise, state, basis, assumptionId, reasonCode, evidenceRefs, controlRefs };
}
function premiseMap(defaultState: ProofState = "unresolved"): Record<DirectPremise, PremiseDecision> {
  return Object.fromEntries(DIRECT_PREMISES.map((premise) => [premise,
    proof(premise, defaultState, "not_evaluated_for_this_output")])) as Record<DirectPremise, PremiseDecision>;
}
function control(id: string, kind: DirectControl["kind"], expectedMinor: number | null,
  observedMinor: number | null, inputRefs: readonly string[], targetRef: string | null,
  independent: boolean, reasonCode: string): DirectControl {
  const status = expectedMinor === null || observedMinor === null ? "unresolved"
    : expectedMinor === observedMinor ? "pass" : "fail";
  return { id, kind, status, independent,
    independenceBasis: !targetRef || inputRefs.length === 0 ? "unproven"
      : inputRefs.includes(targetRef) ? "same_source_row"
        : independent ? "distinct_source_rows_same_extraction_lane" : "unproven",
    inputRefs, targetRef,
    expectedMinor, observedMinor, reasonCode };
}
function finish(id: string, value: number | null, unit: DirectOutput["unit"],
  premises: Record<DirectPremise, PremiseDecision>, evidenceRefs: readonly string[],
  controlRefs: readonly string[]): DirectOutput {
  const state = value !== null && DIRECT_PREMISES.every((key) =>
    premises[key].state === "proven" || premises[key].state === "not_applicable")
    ? "proven" : "withheld";
  return { id, state, amountMinor: state === "proven" ? value : null,
    unit: state === "proven" ? unit : null,
    premises: DIRECT_PREMISES.map((key) => premises[key]), evidenceRefs, controlRefs,
    reasonCodes: state === "proven" ? ["all_direct_premises_proven"]
      : DIRECT_PREMISES.filter((key) => premises[key].state !== "proven"
        && premises[key].state !== "not_applicable")
        .map((key) => `${key}:${premises[key].reasonCode}`),
    customerAuthority: "none_shadow_only" };
}
function setShared(premises: Record<DirectPremise, PremiseDecision>, run: {
  integrity: DirectProofRun["sourceIntegrity"]; period: DirectProofRun["statementPeriod"];
  documentKind: PremiseDecision;
}, sourceRefs: readonly string[], periodRefs: readonly string[]): void {
  premises.input_integrity = proof("input_integrity", run.integrity.suppliedArtifact,
    run.integrity.reasonCodes[0]!, sourceRefs);
  premises.statement_page_completeness = proof("statement_page_completeness", run.integrity.statementPages,
    run.integrity.reasonCodes[1]!, run.integrity.evidenceRefs);
  premises.document_kind = run.documentKind;
  premises.period_meaning = proof("period_meaning", run.period.state,
    run.period.reasonCodes[0]!, periodRefs);
}
function positiveUnit(...values: Array<BoundAmount | null | undefined>): boolean {
  return values.every((value) => value && (value.minor === 0 || value.printedUnit === "dollar_symbol"));
}
function add(values: readonly BoundAmount[]): number { return values.reduce((total, value) => total + value.minor, 0); }

/** Financial proof from source rows only. No legacy values, permissions, or processor knowledge are read. */
export function proveCardActivityRows(input: {
  document: ParsedDocument;
  inputSha256: string;
  sourceKind: "pdf_bytes" | "synthetic_mutation";
  parseBoundToInputBytes: boolean;
  unverifiedBackendCandidates?: readonly string[];
}): PackageProofRun {
  const sourceKind = input.sourceKind;
  const parsedDocumentSha256 = createHash("sha256").update(JSON.stringify({
    sourceType: input.document.sourceType, rows: input.document.rows,
    suppliedDocumentIntegrity: input.document.suppliedDocumentIntegrity ?? null,
  })).digest("hex");
  const evidence = buildDirectEvidence(input.document, input.inputSha256);
  const integrity = proveSourceIntegrity(input.document, evidence);
  const period = proveStatementPeriod(evidence);
  const bindings = bindCardActivity(evidence);
  const documentKind = proof("document_kind", bindings.documentKind.state,
    bindings.documentKind.reasonCode, bindings.documentKind.evidenceRefs);
  const backendCandidates = [...new Set((input.unverifiedBackendCandidates ?? [])
    .map((candidate) => candidate.trim()).filter(Boolean))];
  const table = bindings.cardTables.length === 1 && bindings.cardSectionCandidateCount === 1
    ? bindings.cardTables[0]! : null;
  const fee = bindings.feeCompositions.length === 1 ? bindings.feeCompositions[0]! : null;
  const summaryFee = bindings.summaryFees.length === 1 ? bindings.summaryFees[0]! : null;
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const hasPeriodOnPage = (ref: string | undefined): boolean => {
    const page = ref ? evidenceById.get(ref)?.coordinate.pageIndex : null;
    return page !== null && page !== undefined && period.state === "proven"
      && period.evidenceRefs.some((periodRef) => evidenceById.get(periodRef)?.coordinate.pageIndex === page);
  };
  const periodCompatibility: DirectProofRun["periodCompatibility"] = {
    cardActivityStatementContext: table && hasPeriodOnPage(table.sectionRef) ? "proven" : "unresolved",
    feeSectionStatementContext: fee && hasPeriodOnPage(fee.sectionRef) ? "proven" : "unresolved",
    ratioOperands: "unresolved",
    evidenceRefs: refs(...period.evidenceRefs, table?.sectionRef, fee?.sectionRef),
    reasonCodes: ["card_activity_and_fee_charges_may_have_different_earning_or_posting_periods",
      "statement_header_dates_alone_do_not_prove_ratio_operand_compatibility"],
  };
  const controls: DirectControl[] = [];
  if (table) {
    const rows = table.detailRows;
    controls.push(control("card_gross_detail_sum", "detail_sum", table.gross.minor,
      table.detailComplete ? add(rows.map((row) => row.gross)) : null,
      rows.map((row) => row.ref), table.totalRef, table.detailComplete,
      "distinct_card_detail_rows_vs_printed_card_total"));
    controls.push(control("card_refund_detail_sum", "detail_sum", table.refunds.minor,
      table.detailComplete ? add(rows.map((row) => row.refunds)) : null,
      rows.map((row) => row.ref), table.totalRef, table.detailComplete,
      "distinct_card_detail_rows_vs_printed_card_total"));
    controls.push(control("card_net_detail_sum", "detail_sum", table.net.minor,
      table.detailComplete ? add(rows.map((row) => row.net)) : null,
      rows.map((row) => row.ref), table.totalRef, table.detailComplete,
      "distinct_card_detail_rows_vs_printed_card_total"));
    const signedRefundNet = table.gross.minor + (table.refunds.minor < 0
      ? table.refunds.minor : -table.refunds.minor);
    controls.push(control("gross_refund_net_semantics", "semantic_equation", table.net.minor,
      signedRefundNet, [table.gross.ref, table.refunds.ref], table.net.ref, false,
      "printed_gross_refunds_net_schema_and_signed_equation"));
    const detailEquationsPass = rows.every((row) => row.gross.minor
      + (row.refunds.minor < 0 ? row.refunds.minor : -row.refunds.minor) === row.net.minor);
    controls.push(control("card_detail_row_semantics", "semantic_equation", 1,
      table.detailComplete ? Number(detailEquationsPass) : null,
      rows.map((row) => row.ref), table.totalRef, false,
      "each_card_detail_row_obeys_gross_refund_net_equation"));
    // A summary value is a cross-section control only after its population is identified.
    // It may match gross rather than net (the November fixture demonstrates this).
    if (bindings.summaryVolume.length === 1) {
      const summary = bindings.summaryVolume[0]!;
      // "Amount Submitted" means the net submitted column in this protocol.
      // A coincidental match to gross must not relabel a conflicting summary.
      if (summary.minor === table.net.minor) {
        controls.push(control("summary_card_population_alignment", "cross_section_equality",
          summary.minor, table.net.minor,
          [summary.ref], table.totalRef, summary.ref !== table.totalRef,
          "summary_corresponds_to_net_submitted_population"));
      } else controls.push(control("summary_card_population_alignment", "cross_section_equality",
        summary.minor, table.net.minor, [summary.ref], table.totalRef, true,
        "summary_amount_submitted_conflicts_with_net_card_population"));
    }
  }
  if (fee) {
    controls.push(control("fee_component_sum", "component_sum", fee.aggregate.minor,
      fee.componentSetComplete ? add(fee.components.map((item) => item.amount)) : null,
      fee.components.map((item) => item.amount.ref), fee.aggregate.ref,
      fee.componentSetComplete && !fee.duplicateRepresentation,
      "declared_fee_components_vs_printed_aggregate"));
    controls.push(control("fee_summary_alignment", "cross_section_equality",
      amount(summaryFee), fee.aggregate.minor, summaryFee ? [summaryFee.ref] : [], fee.aggregate.ref,
      Boolean(summaryFee && summaryFee.ref !== fee.aggregate.ref),
      "statement_summary_fees_vs_independent_fee_section_aggregate"));
  }
  const byId = new Map(controls.map((item) => [item.id, item]));
  const core = { integrity, period, documentKind };
  const cardOutputs: DirectOutput[] = [
    ["gross_sale_volume", table?.gross ?? null],
    ["refund_volume", table?.refunds ?? null],
    ["net_submitted_volume", table?.net ?? null],
  ].map(([id, selected]) => {
    const key = String(id), value = selected as BoundAmount | null;
    const allDetails = ["card_gross_detail_sum", "card_refund_detail_sum", "card_net_detail_sum"]
      .map((name) => byId.get(name));
    const allDetailsPass = allDetails.every((item) => item?.status === "pass" && item.independent);
    const anyDetailFails = allDetails.some((item) => item?.status === "fail");
    const semantic = byId.get("gross_refund_net_semantics");
    const rowSemantics = byId.get("card_detail_row_semantics");
    const crossSection = byId.get("summary_card_population_alignment");
    const p = premiseMap();
    setShared(p, core, table ? [table.sectionRef] : [], period.evidenceRefs);
    p.section_binding = proof("section_binding", table ? "proven" : "unresolved",
      table ? "card_type_section_and_columns_bound" : "card_type_section_unbound", table?.schemaRefs ?? []);
    p.population_meaning = proof("population_meaning", crossSection?.status === "fail"
      || bindings.summaryVolume.length > 1 ? "conflicting"
        : crossSection?.status === "pass" && crossSection.independent ? "proven" : "unresolved",
      crossSection?.status === "fail" ? "summary_card_population_conflict"
        : bindings.summaryVolume.length > 1 ? "multiple_summary_volume_candidates"
          : table ? `printed_${key}_column_meaning` : "gross_refund_net_semantics_unbound",
      table?.schemaRefs ?? [], crossSection ? [crossSection.id] : []);
    p.sign_semantics = proof("sign_semantics", semantic?.status === "fail" || rowSemantics?.status === "fail"
      ? "conflicting" : semantic?.status === "pass" && rowSemantics?.status === "pass" ? "proven" : "unresolved",
    "printed_gross_refund_net_equation_for_total_and_detail_rows", table ? [table.totalRef] : [],
    refs(semantic?.id, rowSemantics?.id));
    const cardAmounts = table ? [table.gross, table.refunds, table.net,
      ...table.detailRows.flatMap((row) => [row.gross, row.refunds, row.net])] : [];
    p.currency_unit = proof("currency_unit", value && positiveUnit(...cardAmounts) ? "proven" : "unresolved",
      "printed_dollar_unit_required_for_all_nonzero_card_operands",
      refs(...cardAmounts.map((item) => item.ref)));
    p.representation_deduplication = proof("representation_deduplication",
      table && bindings.cardTables.length === 1 && bindings.cardSectionCandidateCount === 1
        && !table.duplicateRepresentation ? "proven" : "unresolved",
      "single_nonduplicated_card_table", table ? [table.sectionRef] : []);
    p.detail_completeness = proof("detail_completeness", table?.detailComplete ? "proven" : "unresolved",
      "bounded_card_rows_between_schema_and_total", table?.detailRows.map((row) => row.ref) ?? []);
    p.arithmetic = proof("arithmetic", semantic?.status === "pass" && rowSemantics?.status === "pass"
      && allDetailsPass ? "proven"
      : semantic?.status === "fail" || rowSemantics?.status === "fail" || anyDetailFails
        ? "conflicting" : "unresolved",
    "gross_refund_net_and_detail_sum_controls", table ? [table.totalRef] : [],
    refs(semantic?.id, ...allDetails.map((item) => item?.id)));
    p.independent_control = proof("independent_control", anyDetailFails || crossSection?.status === "fail"
      ? "conflicting" : allDetailsPass && crossSection?.status === "pass" && crossSection.independent
        ? "proven" : "unresolved",
    "distinct_card_details_and_separate_summary_population_required",
    refs(...(table?.detailRows.map((row) => row.ref) ?? []),
      ...(bindings.summaryVolume.map((item) => item.ref))),
    refs(...allDetails.map((item) => item?.id), crossSection?.id));
    p.period_meaning = proof("period_meaning", periodCompatibility.cardActivityStatementContext,
      "card_activity_under_same_page_statement_period_by_versioned_protocol_rule",
      refs(table?.sectionRef, ...period.evidenceRefs), [],
      periodCompatibility.cardActivityStatementContext === "proven"
        ? "versioned_protocol_assumption" : "unresolved",
      "card_activity_covers_header_statement_period");
    p.operand_compatibility = proof("operand_compatibility", table ? "proven" : "unresolved",
      "single_card_activity_schema_for_all_three_populations", table?.schemaRefs ?? []);
    return finish(key, value?.minor ?? null, "printed_dollar", p,
      table ? [...table.schemaRefs, table.totalRef, ...table.detailRows.map((row) => row.ref)] : [],
      refs(...allDetails.map((item) => item?.id), semantic?.id, rowSemantics?.id, crossSection?.id));
  });
  const feePremises = premiseMap();
  setShared(feePremises, core, fee ? [fee.sectionRef] : [], period.evidenceRefs);
  const feeSum = byId.get("fee_component_sum"), feeSummary = byId.get("fee_summary_alignment");
  feePremises.section_binding = proof("section_binding", fee && summaryFee ? "proven" : "unresolved",
    "statement_summary_and_fee_section_bound", refs(fee?.sectionRef, summaryFee?.ref));
  feePremises.population_meaning = proof("population_meaning", fee && summaryFee ? "proven" : "unresolved",
    "printed_statement_fee_charge_and_aggregate_labels", refs(fee?.sectionRef, summaryFee?.ref));
  feePremises.sign_semantics = proof("sign_semantics", fee && summaryFee
    && fee.aggregate.minor < 0 && summaryFee.minor < 0
    && fee.components.every((item) => item.amount.minor <= 0) ? "proven" : "unresolved",
  "negative_printed_fee_debits_required", refs(fee?.aggregate.ref, summaryFee?.ref));
  feePremises.currency_unit = proof("currency_unit", fee && summaryFee
    && positiveUnit(fee.aggregate, summaryFee, ...fee.components.map((item) => item.amount)) ? "proven" : "unresolved",
  "printed_dollar_symbol_required_for_nonzero_fees", refs(fee?.aggregate.ref, summaryFee?.ref));
  feePremises.representation_deduplication = proof("representation_deduplication",
    fee && bindings.feeCompositions.length === 1 && !fee.duplicateRepresentation ? "proven" : "unresolved",
  "one_fee_aggregate_and_unique_components", fee ? [fee.sectionRef] : []);
  feePremises.detail_completeness = proof("detail_completeness", fee?.componentSetComplete ? "proven" : "unresolved",
    "declared_fee_component_set_bounded_by_aggregate_not_line_inventory",
    fee?.components.map((item) => item.amount.ref) ?? []);
  feePremises.arithmetic = proof("arithmetic", feeSum?.status === "pass" && feeSummary?.status === "pass"
    ? "proven" : feeSum?.status === "fail" || feeSummary?.status === "fail" ? "conflicting" : "unresolved",
  "fee_component_sum_and_summary_alignment", refs(fee?.aggregate.ref, summaryFee?.ref),
  refs(feeSum?.id, feeSummary?.id));
  feePremises.independent_control = proof("independent_control", feeSum?.status === "pass"
    && feeSummary?.status === "pass" && feeSum.independent && feeSummary.independent ? "proven"
    : feeSum?.status === "fail" || feeSummary?.status === "fail" ? "conflicting" : "unresolved",
  "distinct_fee_component_rows_and_summary_section", refs(fee?.aggregate.ref, summaryFee?.ref),
  refs(feeSum?.id, feeSummary?.id));
  feePremises.operand_compatibility = proof("operand_compatibility", "not_applicable",
    "single_fee_charge_scalar_has_no_cross_population_ratio_operands");
  const feeOutput = finish("total_processing_fees", fee?.aggregate.minor ?? null, "printed_dollar",
    feePremises, fee ? [fee.sectionRef, ...fee.components.map((item) => item.amount.ref)] : [],
    refs(feeSum?.id, feeSummary?.id));
  // A fee/volume ratio and complete fee inventory need additional source and
  // period premises. Numeric division and broad component closure do not grant them.
  const ratioPremises = premiseMap();
  setShared(ratioPremises, core, [], period.evidenceRefs);
  ratioPremises.operand_compatibility = proof("operand_compatibility", "unresolved",
    "fee_posting_period_and_card_activity_population_compatibility_unproven");
  const ratio = finish("headline_effective_rate", null, "ratio", ratioPremises, [], []);
  const inventoryPremises = premiseMap();
  setShared(inventoryPremises, core, [], period.evidenceRefs);
  inventoryPremises.detail_completeness = proof("detail_completeness", "unresolved",
    "individual_fee_occurrence_inventory_not_directly_bound");
  inventoryPremises.operand_compatibility = proof("operand_compatibility", "not_applicable",
    "inventory_completeness_is_not_a_ratio_of_two_populations");
  const inventory = finish("complete_fee_inventory", null, null, inventoryPremises, [], []);
  const feeInventory: DirectProofRun["feeInventory"] = {
    observedFeeRows: evidence.filter((item) => /\|\s*(?:fees|service charges|interchange charges|program fees)\s*\|\s*-?\$?[\d,]+\.\d{2}\s*$/i
      .test(item.rawText)).map((item) => item.id),
    boundedComponentRows: fee?.components.map((item) => item.amount.ref) ?? [],
    boundedSubtotal: feeOutput.state === "proven" ? "proven" : "unresolved",
    completeOccurrences: "unresolved",
    reasonCodes: ["observed_fee_rows_are_unclosed_candidates_not_a_complete_inventory",
      "subtotal_reconciliation_does_not_close_fee_occurrence_inventory"],
  };
  const assumptions: DirectProofRun["assumptions"] = [
    { id: "card_activity_covers_header_statement_period",
      proposition: "The bounded card activity table under a same-page statement-period header covers that period",
      state: periodCompatibility.cardActivityStatementContext === "proven"
        ? "versioned_protocol" : "unresolved",
      ruleVersion: CARD_ACTIVITY_PACKAGE_VERSION,
      evidenceRefs: refs(table?.sectionRef, ...period.evidenceRefs),
      dependentOutputs: ["gross_sale_volume", "refund_volume", "net_submitted_volume"] },
    { id: "fee_posting_matches_card_activity",
      proposition: "Fees charged on this statement economically cover the same period and population as card activity",
      state: "unresolved", ruleVersion: CARD_ACTIVITY_PACKAGE_VERSION,
      evidenceRefs: periodCompatibility.evidenceRefs,
      dependentOutputs: ["headline_effective_rate"] },
    { id: "all_fee_occurrences_captured",
      proposition: "Every individual fee occurrence across all fee sections and pages is captured exactly once",
      state: "unresolved", ruleVersion: CARD_ACTIVITY_PACKAGE_VERSION,
      evidenceRefs: feeInventory.observedFeeRows,
      dependentOutputs: ["complete_fee_inventory"] },
  ];
  return {
    version: DIRECT_PROOF_VERSION, inputSha256: input.inputSha256,
    sourceKind, sourceIntegrity: integrity, statementPeriod: period,
    periodCompatibility, feeInventory, assumptions,
    provenance: { extractionLane: input.document.sourceType === "pdf" ? "pdfjs_current" : "csv_current",
      extractorVersion: input.document.sourceType === "pdf" ? PDFJS_VERSION : CSV_VERSION,
      parsedDocumentSha256, inputBytesHashVerified: sourceKind === "pdf_bytes",
      parseBoundToInputBytes: input.parseBoundToInputBytes,
      sourceCoordinateScope: "page_and_extracted_row_only", tokenSpansAvailable: false,
      geometryAvailable: false,
      independentExtractionLaneAvailable: false },
    protocol: { id: table ? "card_activity_gross_refund_net_v2" : null,
      status: bindings.cardSectionCandidateCount > 1 || bindings.cardTables.length > 1
        ? "conflicting" : table ? "resolved"
        : bindings.unboundCardCandidates.length ? "candidate" : "unresolved",
      evidenceRefs: refs(...bindings.protocolEvidenceRefs, ...bindings.unboundCardCandidates),
      reasonCodes: bindings.reasonCodes },
    chain: { backendProcessor: { status: backendCandidates.length > 1 ? "conflicting" : "unresolved",
      value: null, competingValues: backendCandidates, knowledgeRelease: null },
      merchantFacingBrand: { status: "unresolved", value: null },
      knowledgeRelease: null },
    evidence, controls, outputs: [...cardOutputs, feeOutput, ratio, inventory],
    currentCustomerPermissions: "unchanged",
  };
}

import { makeEvidenceRecord, normalizeEvidenceText } from "./evidence.js";
import { moneyFromNumber } from "./money.js";
import { buildCanonicalFeeRollupAssessments, FEE_ROLLUP_COMPLETENESS_POLICY_VERSION } from "./feeRollupEvidence.js";
import type { ParsedDocument } from "../parser.js";
import type {
  CanonicalCrossSummaryLinkEvidence,
  CanonicalCrossSummaryNode,
  CanonicalCrossSummaryRelationship,
  CanonicalCrossSummaryAdjudicationClass,
  CanonicalCrossSummaryRelationshipCandidate,
  CanonicalCrossSummaryReusableRule,
  CanonicalEvidenceRecord,
  CanonicalFactValue,
  CanonicalFeeLedger,
  CanonicalFinancialFacts,
  CanonicalStatementIdentity,
  MoneyAmount,
} from "./types.js";

export const CROSS_SUMMARY_LINK_EVIDENCE_POLICY_VERSION = "cross_summary_link_evidence_v2" as const;
export const CROSS_SUMMARY_RECONCILIATION_ADJUDICATION_POLICY_VERSION = "cross_summary_reconciliation_adjudication_v1" as const;

type FundingMeasure = "submitted_amount" | "fee_amount" | "funded_amount";

export function buildCanonicalCrossSummaryLinkEvidence(input: {
  doc: ParsedDocument;
  documentId: string;
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  feeLedger: CanonicalFeeLedger;
  parserOutput: Record<string, unknown> | null;
  evidence: Map<string, CanonicalEvidenceRecord>;
}): CanonicalCrossSummaryLinkEvidence {
  const period =
    input.identity.statementPeriod.status === "selected" && input.identity.statementPeriod.value
      ? input.identity.statementPeriod.value
      : null;
  const identifierBasis: CanonicalCrossSummaryNode["identifierBasis"] = [
    "source_document_ref",
    ...(input.identity.merchantIdentifier.status === "selected" ? (["merchant_identifier"] as const) : []),
  ];
  const nodes: CanonicalCrossSummaryNode[] = [
    factNode("headline_submitted", "financialFacts.processedSales", "submitted_amount", input.financialFacts.processedSales, "Processed sales", input, period, identifierBasis),
    factNode("headline_fees", "financialFacts.totalFees", "fee_amount", input.financialFacts.totalFees, "Total fees", input, period, identifierBasis),
    factNode("headline_funded", "financialFacts.amountFunded", "funded_amount", input.financialFacts.amountFunded, "Amount funded", input, period, identifierBasis),
  ];

  const feeControlByNodeId = new Map<string, CanonicalFeeLedger["controls"][number]>();
  for (const control of input.feeLedger.controls) {
    if (control.type !== "printed_charge_sum" || control.independence !== "printed_source_control") continue;
    const node: CanonicalCrossSummaryNode = {
      id: nodeId(`fee_control_${control.id}`),
      summaryRef: `feeLedger.controls.${control.id}`,
      sourceKind: "printed_fee_control",
      printedLabel: control.label,
      measure: "fee_amount",
      grain: control.basis === "grand_control" ? "statement_period_total" : control.basis === "section_control" ? "fee_section_total" : "unknown",
      period,
      sourceDocumentRef: input.documentId,
      identifierBasis,
      amount: control.expectedAmount,
      evidenceRefs: [...new Set(control.evidenceRefs)].sort(),
    };
    nodes.push(node);
    feeControlByNodeId.set(node.id, control);
  }

  const funding = recordOrNull(input.parserOutput?.fundingBatchLedger);
  const fundingTableEvidence = funding
    ? addFundingTableEvidence(input.doc, input.documentId, funding, input.evidence)
    : { headerRefs: [], totalRef: null };
  const fundingHeaderRefs = fundingTableEvidence.headerRefs;
  const fundingTotalRef = fundingTableEvidence.totalRef;
  const fundingEvidenceRefs = [...fundingHeaderRefs, fundingTotalRef].filter((ref): ref is string => Boolean(ref));
  const fundingNodes = new Map<FundingMeasure, CanonicalCrossSummaryNode>();
  if (funding) {
    for (const [measure, field, label] of [
      ["submitted_amount", "controlSubmittedTotal", "Funding batch submitted total"],
      ["fee_amount", "controlFeesChargedTotal", "Funding batch fees charged total"],
      ["funded_amount", "controlFundedTotal", "Funding batch funded total"],
    ] as const) {
      const node: CanonicalCrossSummaryNode = {
        id: nodeId(`funding_${measure}`),
        summaryRef: `parserOutput.fundingBatchLedger.${field}`,
        sourceKind: "funding_batch_control",
        printedLabel: label,
        measure,
        grain: "funding_batch_period_total",
        period,
        sourceDocumentRef: input.documentId,
        identifierBasis,
        amount: moneyFromUnknown(funding[field]),
        evidenceRefs: [...fundingEvidenceRefs],
      };
      nodes.push(node);
      fundingNodes.set(measure, node);
    }
  }

  const relationships: CanonicalCrossSummaryRelationship[] = [];
  const headlineFees = nodeById(nodes, "headline_fees");
  const headlineSubmitted = nodeById(nodes, "headline_submitted");
  const headlineFunded = nodeById(nodes, "headline_funded");
  const feeControls = [...feeControlByNodeId.entries()];
  const feeRollups = buildCanonicalFeeRollupAssessments(input.feeLedger);

  for (const [controlNodeId, control] of feeControls) {
    const controlNode = nodeById(nodes, controlNodeId);
    relationships.push(
      evaluateRelationship({
        left: headlineFees,
        right: controlNode,
        candidateType: "same_measure_same_population",
        evidence: input.evidence,
        explicitLink:
          control.basis === "grand_control" &&
          feeMeasureIsPrinted(headlineFees, input.evidence) &&
          feeMeasureIsPrinted(controlNode, input.evidence),
        reusableRuleId: "independent_printed_total_identity_v1",
      }),
    );
  }

  const grandControls = feeControls.filter(([, control]) => control.basis === "grand_control");
  const sectionControls = feeControls.filter(([, control]) => control.basis === "section_control");
  for (const [sectionNodeId, section] of sectionControls) {
    for (const [grandNodeId, grand] of grandControls) {
      const sectionNode = nodeById(nodes, sectionNodeId);
      const grandNode = nodeById(nodes, grandNodeId);
      const rollup = feeRollups.find(
        (assessment) => assessment.grandControlRef === grand.id && assessment.sectionControlRefs.includes(section.id),
      );
      const rollupProven = rollup?.status === "proven_complete_exact" || rollup?.status === "proven_complete_with_rounding";
      const explicitCoverage =
        rollupProven &&
        feeMeasureIsPrinted(sectionNode, input.evidence) &&
        feeMeasureIsPrinted(grandNode, input.evidence);
      const reusableRuleId: CanonicalCrossSummaryReusableRule =
        rollup?.status === "proven_complete_with_rounding"
          ? "exact_rounding_bridge_fee_partition_v1"
          : "complete_non_overlapping_fee_partition_v1";
      relationships.push(
        evaluateRelationship({
          left: sectionNode,
          right: grandNode,
          candidateType: "component_rollup",
          evidence: input.evidence,
          explicitLink: explicitCoverage,
          reusableRuleId,
          blockingClass:
            rollup?.membershipStatus !== "complete_non_overlapping"
              ? "unresolved_fee_partition_membership"
              : "unresolved_fee_rollup_residual",
        }),
      );
    }
  }

  const fundingHeaderPresent = fundingHeaderRefs.length > 0 && Boolean(fundingTotalRef);
  const fundingStatus = stringOrNull(funding?.status);
  const fundingStatusSafe = fundingStatus === "reconciled" || fundingStatus === "reconciled_with_warnings";
  const fundingReusableRule: CanonicalCrossSummaryReusableRule =
    fundingStatus === "reconciled_with_warnings"
      ? "measure_scoped_funding_warning_v1"
      : "independent_printed_total_identity_v1";
  for (const [headline, measure] of [
    [headlineSubmitted, "submitted_amount"],
    [headlineFees, "fee_amount"],
    [headlineFunded, "funded_amount"],
  ] as const) {
    const fundingNode = fundingNodes.get(measure);
    if (!fundingNode) continue;
    const fundingValuePrinted = fundingControlDirectlyPrintsMeasure(
      measure,
      fundingNode.amount,
      fundingHeaderRefs,
      fundingTotalRef,
      input.evidence,
    );
    relationships.push(
      evaluateRelationship({
        left: headline,
        right: fundingNode,
        candidateType: "same_measure_same_population",
        evidence: input.evidence,
        explicitLink: fundingStatusSafe && fundingHeaderPresent && fundingValuePrinted,
        reusableRuleId: fundingReusableRule,
        blockingClass:
          fundingStatusSafe && fundingValuePrinted
            ? undefined
            : "unresolved_incomplete_or_conflicting_controls",
      }),
    );
  }

  const fundingFeeNode = fundingNodes.get("fee_amount");
  if (fundingFeeNode) {
    const fundingFeeValuePrinted = fundingControlDirectlyPrintsMeasure(
      "fee_amount",
      fundingFeeNode.amount,
      fundingHeaderRefs,
      fundingTotalRef,
      input.evidence,
    );
    for (const [grandNodeId] of grandControls) {
      relationships.push(
        evaluateRelationship({
          left: nodeById(nodes, grandNodeId),
          right: fundingFeeNode,
          candidateType: "same_measure_same_population",
          evidence: input.evidence,
          explicitLink: fundingStatusSafe && fundingHeaderPresent && fundingFeeValuePrinted,
          reusableRuleId: fundingReusableRule,
          blockingClass:
            fundingStatusSafe && fundingFeeValuePrinted
              ? undefined
              : "unresolved_incomplete_or_conflicting_controls",
        }),
      );
    }
  }

  const unknownCount = relationships.filter((relationship) => relationship.status === "unknown").length;
  const provenCount = relationships.length - unknownCount;
  const unresolvedRollupCount = feeRollups.filter((rollup) => rollup.status === "unresolved").length;
  return {
    policyVersion: CROSS_SUMMARY_LINK_EVIDENCE_POLICY_VERSION,
    adjudicationPolicyVersion: CROSS_SUMMARY_RECONCILIATION_ADJUDICATION_POLICY_VERSION,
    feeRollupPolicyVersion: FEE_ROLLUP_COMPLETENESS_POLICY_VERSION,
    authority: "diagnostic_relationship_only",
    status:
      relationships.length === 0 && feeRollups.length === 0
        ? "unavailable"
        : unknownCount === 0 && unresolvedRollupCount === 0 && provenCount > 0
          ? "available"
          : "partial",
    nodes,
    relationships,
    feeRollups,
    limitations: [
      ...(unknownCount > 0 ? [`${unknownCount} evaluated cross-summary relationship(s) remain unknown because one or more proof dimensions were missing or incompatible.`] : []),
      ...(unresolvedRollupCount > 0 ? [`${unresolvedRollupCount} fee roll-up assessment(s) remain unresolved because partition or residual evidence is incomplete.`] : []),
      "Detail reconciliation warnings neither prove nor disprove identity between independently printed totals; section-to-grand claims are decided by partition completeness and printed-total arithmetic.",
      "Fee section-to-grand roll-ups require a complete, non-overlapping partition; nonzero residuals remain unresolved unless exact unrounded arithmetic reconstructs every printed total.",
      "Cross-summary links are reference-only and never add amounts to the canonical fee total or opportunity totals.",
    ],
  };
}

function factNode(
  id: string,
  summaryRef: string,
  measure: FundingMeasure,
  fact: CanonicalFactValue<MoneyAmount | null> | CanonicalFactValue<MoneyAmount>,
  fallbackLabel: string,
  input: { documentId: string; evidence: Map<string, CanonicalEvidenceRecord> },
  period: { start: string; end: string } | null,
  identifierBasis: CanonicalCrossSummaryNode["identifierBasis"],
): CanonicalCrossSummaryNode {
  const evidenceRefs = fact.status === "selected" ? [...new Set(fact.evidenceRefs)].sort() : [];
  const firstText = evidenceRefs.map((ref) => input.evidence.get(ref)?.extractedText).find((text): text is string => Boolean(text));
  return {
    id: nodeId(id),
    summaryRef,
    sourceKind: "selected_financial_fact",
    printedLabel: firstText ?? fallbackLabel,
    measure,
    grain: fact.status === "selected" ? "statement_period_total" : "unknown",
    period: fact.status === "selected" ? period : null,
    sourceDocumentRef: input.documentId,
    identifierBasis,
    amount: fact.status === "selected" ? fact.value : null,
    evidenceRefs,
  };
}

function evaluateRelationship(input: {
  left: CanonicalCrossSummaryNode;
  right: CanonicalCrossSummaryNode;
  candidateType: CanonicalCrossSummaryRelationshipCandidate;
  evidence: Map<string, CanonicalEvidenceRecord>;
  explicitLink: boolean;
  reusableRuleId: CanonicalCrossSummaryReusableRule;
  blockingClass?: CanonicalCrossSummaryAdjudicationClass;
}): CanonicalCrossSummaryRelationship {
  const measure = input.left.measure === input.right.measure ? "compatible" : "incompatible";
  const period =
    input.left.period === null || input.right.period === null
      ? "unknown"
      : input.left.period.start === input.right.period.start && input.left.period.end === input.right.period.end
        ? "same_statement_period"
        : "incompatible";
  const grain = grainComparison(input.left, input.right, input.candidateType);
  const identifiers =
    input.left.sourceDocumentRef && input.left.sourceDocumentRef === input.right.sourceDocumentRef ? "matched" : "incompatible";
  const amount = amountComparison(input.left.amount, input.right.amount, input.candidateType);
  const distinctSources = haveDistinctPrintedSources(input.left, input.right, input.evidence);
  const explicitLinkEvidence = input.explicitLink && distinctSources ? "present" : "absent";
  const proven =
    measure === "compatible" &&
    period === "same_statement_period" &&
    grain === "compatible" &&
    identifiers === "matched" &&
    explicitLinkEvidence === "present" &&
    (input.candidateType === "component_rollup" ? amount !== "conflicts" : amount === "corroborates");
  const evidenceRefs = [...new Set([...input.left.evidenceRefs, ...input.right.evidenceRefs])].sort();
  const missing = [
    ...(measure !== "compatible" ? ["measure_not_comparable"] : []),
    ...(period !== "same_statement_period" ? ["period_not_comparable"] : []),
    ...(grain !== "compatible" ? ["grain_not_comparable"] : []),
    ...(identifiers !== "matched" ? ["identifiers_not_comparable"] : []),
    ...(explicitLinkEvidence !== "present" ? ["explicit_link_evidence_missing"] : []),
    ...(input.candidateType !== "component_rollup" && amount !== "corroborates" ? ["amount_does_not_corroborate"] : []),
  ];
  const relationshipClass: CanonicalCrossSummaryAdjudicationClass = proven
    ? input.reusableRuleId === "complete_non_overlapping_fee_partition_v1"
      ? "resolved_complete_fee_partition"
      : input.reusableRuleId === "exact_rounding_bridge_fee_partition_v1"
        ? "resolved_rounding_attributed_fee_partition"
      : input.reusableRuleId === "measure_scoped_funding_warning_v1"
        ? "resolved_measure_scoped_funding_warning"
        : "resolved_independent_printed_totals"
    : period !== "same_statement_period"
      ? "unresolved_period"
      : grain !== "compatible"
        ? "unresolved_grain"
        : amount === "conflicts"
          ? "unresolved_amount_conflict"
          : input.blockingClass ?? "unresolved_missing_explicit_link_evidence";
  return {
    id: relationshipId(input.left.id, input.right.id, input.candidateType),
    leftSummaryId: input.left.id,
    rightSummaryId: input.right.id,
    evaluatedCandidateType: input.candidateType,
    relationshipType: proven ? input.candidateType : "unknown",
    status: proven ? "proven" : "unknown",
    comparison: { measure, period, grain, identifiers, explicitLinkEvidence, amount },
    evidenceRefs,
    countingTreatment: "reference_only_no_addition",
    reasonCodes: proven ? [`${input.candidateType}_proven_by_comparable_printed_evidence`, input.reusableRuleId] : missing,
    limitations: proven ? [] : ["Relationship withheld: matching dollar amounts alone do not establish identity, overlap, or roll-up membership."],
    adjudication: {
      policyVersion: CROSS_SUMMARY_RECONCILIATION_ADJUDICATION_POLICY_VERSION,
      outcome: proven ? "resolved_by_reusable_rule" : "remain_unknown",
      relationshipClass,
      reusableRuleId: proven ? input.reusableRuleId : null,
    },
  };
}

function grainComparison(
  left: CanonicalCrossSummaryNode,
  right: CanonicalCrossSummaryNode,
  candidateType: CanonicalCrossSummaryRelationshipCandidate,
): "compatible" | "incompatible" | "unknown" {
  if (left.grain === "unknown" || right.grain === "unknown") return "unknown";
  if (candidateType === "component_rollup") {
    return left.grain === "fee_section_total" && right.grain === "statement_period_total" ? "compatible" : "incompatible";
  }
  const supported = new Set(["statement_period_total", "funding_batch_period_total"]);
  return supported.has(left.grain) && supported.has(right.grain) ? "compatible" : "incompatible";
}

function amountComparison(
  left: MoneyAmount | null,
  right: MoneyAmount | null,
  candidateType: CanonicalCrossSummaryRelationshipCandidate,
): "corroborates" | "conflicts" | "not_comparable" {
  if (candidateType === "component_rollup") return "not_comparable";
  if (!left || !right || left.currency !== right.currency) return "not_comparable";
  return left.amountMinor === right.amountMinor ? "corroborates" : "conflicts";
}

function feeMeasureIsPrinted(node: CanonicalCrossSummaryNode, evidence: Map<string, CanonicalEvidenceRecord>): boolean {
  const text = [node.printedLabel, ...node.evidenceRefs.map((ref) => evidence.get(ref)?.extractedText ?? "")].join(" ");
  return /\b(fees?|charges?|service)\b/i.test(text);
}

function fundingControlDirectlyPrintsMeasure(
  measure: FundingMeasure,
  amount: MoneyAmount | null,
  headerEvidenceRefs: string[],
  totalEvidenceRef: string | null,
  evidence: Map<string, CanonicalEvidenceRecord>,
): boolean {
  if (!amount || !totalEvidenceRef || headerEvidenceRefs.length === 0) return false;
  const headerText = headerEvidenceRefs.map((ref) => evidence.get(ref)?.extractedText ?? "").join(" ");
  if (!isCompleteFundingHeader(headerText, true)) return false;
  const totalText = evidence.get(totalEvidenceRef)?.extractedText ?? "";
  const printedAmounts = fundingRowAmounts(totalText);
  if (printedAmounts.length < 3) return false;
  const selected =
    measure === "submitted_amount"
      ? printedAmounts[0]
      : measure === "fee_amount"
        ? printedAmounts.at(-2)
        : printedAmounts.at(-1);
  return selected !== undefined && Math.round(Math.abs(selected) * 100) === Math.abs(amount.amountMinor);
}

function fundingRowAmounts(text: string): number[] {
  return (text.match(/\(?-?\$?\s*\d[\d,]*\.\d{2}\)?/g) ?? [])
    .map((token) => Number(token.replace(/[$,()\s]/g, "")))
    .filter(Number.isFinite);
}

function sameMoneyNumber(left: number | undefined, right: unknown): boolean {
  return (
    left !== undefined &&
    typeof right === "number" &&
    Number.isFinite(right) &&
    Math.round(Math.abs(left) * 100) === Math.round(Math.abs(right) * 100)
  );
}

function haveDistinctPrintedSources(
  left: CanonicalCrossSummaryNode,
  right: CanonicalCrossSummaryNode,
  evidence: Map<string, CanonicalEvidenceRecord>,
): boolean {
  const leftFingerprints = new Set(left.evidenceRefs.map((ref) => sourceFingerprint(evidence.get(ref))).filter(Boolean));
  const rightFingerprints = new Set(right.evidenceRefs.map((ref) => sourceFingerprint(evidence.get(ref))).filter(Boolean));
  return leftFingerprints.size > 0 && rightFingerprints.size > 0 && [...leftFingerprints].some((fingerprint) => !rightFingerprints.has(fingerprint));
}

function sourceFingerprint(evidence: CanonicalEvidenceRecord | undefined): string {
  if (!evidence) return "";
  return [evidence.documentId, evidence.pageNumber ?? "page_unknown", evidence.lineId ?? evidence.rowIndex ?? "row_unknown", evidence.normalizedText ?? ""].join("|");
}

function addFundingTableEvidence(
  doc: ParsedDocument,
  documentId: string,
  funding: Record<string, unknown>,
  evidence: Map<string, CanonicalEvidenceRecord>,
): { headerRefs: string[]; totalRef: string | null } {
  const rows = doc.rows.map((row, index) => ({ row, index, text: String(row.content ?? "") }));
  for (const total of rows.filter(({ text }) => /^\s*total\s*\|/i.test(text) && fundingTotalMatchesControls(text, funding))) {
    const totalPage = pageFromRow(total.row);
    for (let index = total.index - 1; index >= 0; index -= 1) {
      const second = rows[index]!;
      if (pageFromRow(second.row) !== totalPage) break;
      if (isCompleteFundingHeader(second.text, false)) {
        return {
          headerRefs: [addControlEvidence(documentId, second.text, totalPage, second.index, "FUNDING", evidence)],
          totalRef: addControlEvidence(documentId, total.text, totalPage, total.index, "FUNDING", evidence),
        };
      }
      if (isFundingTableBoundary(second.text)) break;
      const first = rows[index - 1];
      if (
        first &&
        pageFromRow(first.row) === totalPage &&
        isCompleteFundingHeader(`${first.text} ${second.text}`, true)
      ) {
        return {
          headerRefs: [first, second].map((match) =>
            addControlEvidence(documentId, match.text, totalPage, match.index, "FUNDING", evidence),
          ),
          totalRef: addControlEvidence(documentId, total.text, totalPage, total.index, "FUNDING", evidence),
        };
      }
    }
  }
  return { headerRefs: [], totalRef: null };
}

function isFundingTableBoundary(text: string): boolean {
  const normalized = normalizeEvidenceText(text);
  return /^(?:summary by|amounts submitted|fees charged|third party transactions|adjustments chargebacks|your card processing statement)\b/.test(normalized);
}

function isCompleteFundingHeader(text: string, allowSplitAmountLabel: boolean): boolean {
  const cellCount = text.split("|").length;
  if (cellCount < (allowSplitAmountLabel ? 5 : 6)) return false;
  const normalized = normalizeEvidenceText(text);
  const submitted = /(?:amounts?|total) submitted|submitted amount/.test(normalized);
  const fees = /\bfees?(?: charged)?\b/.test(normalized);
  const funded = allowSplitAmountLabel ? /\b(?:funded|processed)\b/.test(normalized) : /amount (?:funded|processed)/.test(normalized);
  const bridgeComponent = /adjustments?|chargebacks?|reversals?|third party/.test(normalized);
  return submitted && fees && funded && bridgeComponent;
}

function fundingTotalMatchesControls(
  text: string,
  funding: Record<string, unknown>,
): boolean {
  const printedAmounts = fundingRowAmounts(text);
  if (printedAmounts.length < 3) return false;
  return (
    sameMoneyNumber(printedAmounts[0], funding.controlSubmittedTotal) &&
    sameMoneyNumber(printedAmounts.at(-2), funding.controlFeesChargedTotal) &&
    sameMoneyNumber(printedAmounts.at(-1), funding.controlFundedTotal)
  );
}

function addControlEvidence(
  documentId: string,
  text: string,
  pageNumber: number | null,
  rowIndex: number | null,
  section: string,
  evidence: Map<string, CanonicalEvidenceRecord>,
): string {
  const record = makeEvidenceRecord({ documentId, pageNumber, rowIndex, section, extractedText: text, sourceRole: "control_total", confidence: "high", extractionMethod: "document_ir" });
  evidence.set(record.id, record);
  return record.id;
}

function nodeId(value: string): string {
  return `summary_${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function relationshipId(left: string, right: string, type: string): string {
  return `summaryrel_${[left, right].sort().join("__")}_${type}`;
}

function nodeById(nodes: CanonicalCrossSummaryNode[], id: string): CanonicalCrossSummaryNode {
  const normalizedId = id.startsWith("summary_") ? id : nodeId(id);
  const node = nodes.find((item) => item.id === normalizedId);
  if (!node) throw new Error(`Cross-summary node ${normalizedId} is missing.`);
  return node;
}

function moneyFromUnknown(value: unknown): MoneyAmount | null {
  return typeof value === "number" && Number.isFinite(value) ? moneyFromNumber(value) : null;
}

function pageFromRow(row: ParsedDocument["rows"][number]): number | null {
  const match = String(row.page ?? "").match(/page-(\d+)/i);
  return match ? Number(match[1]) : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

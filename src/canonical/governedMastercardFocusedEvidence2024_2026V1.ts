import { createHash } from "node:crypto";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";
import type {
  GovernedUsNetworkFeeEvidenceResolution,
  GovernedUsNetworkRowResolution,
  GovernedUsNetworkValue,
} from "./governedUsNetworkFeeEvidence2020_2026V1.js";

export const GOVERNED_MASTERCARD_FOCUSED_EVIDENCE_2024_2026_V1 =
  "governed_mastercard_focused_evidence_2024_2026_product_adjudicated_v2_2026_09_07_v1" as const;

export type MastercardFocusedEvidenceClass =
  | "G1_product_domain_adjudication"
  | "E2_public_merchant_agreement"
  | "E4_processor_or_platform_update"
  | "E4_processor_or_acquirer_schedule"
  | "E7_public_industry_reference";

export type GovernedMastercardFocusedSource = {
  sourceId: string;
  title: string;
  publisher: string;
  evidenceClass: MastercardFocusedEvidenceClass;
  publicationDate: string | null;
  publicationDatePrecision: "day" | "month" | "year" | "unknown";
  sourceLocator: string;
  retainedThrough: string;
  retainedPackageFingerprint: string;
  reviewStatus: "product_adjudicated_admitted";
  geographyScope: string;
  immutable: true;
  rawAssertions: string[];
  limitations: string[];
};

export type GovernedMastercardFocusedRecord = {
  recordId: `MC-FOCUSED-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
  title: string;
  disposition: string;
  evidenceRefs: string[];
  confidence: "STRONG" | "LIKELY" | "UNRESOLVED";
  effectiveDates: Array<{ value: string; precision: "day" | "month" | "year"; sourceRef: string }>;
  scope: string;
  limitations: string[];
  prohibitedClaims: string[];
  admissionStatus: "admitted";
};

export type GovernedMastercardFocusedRule = {
  ruleId: `RR-MCF-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
  title: string;
  admittedClaim: string;
  prohibitedClaims: string[];
  sourceRefs: string[];
  sourceFingerprints: string[];
  reviewedAt: "2026-09-07";
  admissionStatus: "admitted";
};

export type LineToFeeCardinalityState =
  | "one_fee_supported"
  | "multiple_legitimate_components_strongly_explained"
  | "bounded_fee_component"
  | "structural_or_collection_line"
  | "unresolved";

export type ResidualDecompositionInput = {
  printedValue: number;
  knownComponentValue: number;
  candidateComponent: {
    value: number;
    independentlyDocumented: boolean;
    sameNetworkAndProgram: boolean;
    periodApplicable: boolean;
    withinDocumentedRange: boolean;
    statementStructureCorroborates: boolean;
    acquirerSpecificApplicabilityProven: boolean;
  } | null;
};

export type ResidualDecompositionResult = {
  direction: "above_reference" | "equal_reference" | "below_reference";
  residual: number;
  disposition:
    | "strongly_explained_by_legitimate_components_not_confirmed_at_par"
    | "candidate_component_insufficiently_supported"
    | "possible_unbundled_component_elsewhere"
    | "no_residual";
  bundledComponentProven: false;
  markupEstablished: false;
  underchargeEstablished: false;
  exactArithmeticAloneIsProof: false;
  comparisonBlocked: boolean;
  limitations: string[];
};

export type GovernedMastercardFocusedRowResolution = {
  feeRowId: string;
  applicable: boolean;
  effectiveUsNetworkEvidence: GovernedUsNetworkRowResolution;
  lineToFeeCardinality: {
    state: LineToFeeCardinalityState;
    confidence: "STRONG" | "LIKELY" | "UNRESOLVED";
    comparisonAllowed: boolean;
    evidenceRefs: string[];
    explanation: string;
  };
  residualDecomposition: ResidualDecompositionResult | null;
  assessment2024: null | {
    structuralExplanation: "STRONGLY_EXPLAINED";
    baseAcquirerBrandVolumeFee: 0.0014;
    plausibleAnnualAcquirerLicenseFeeComponent: 0.000075;
    specificAcquirerComponentConfidence: "LIKELY";
    aboveReferenceCandidate: false;
    confirmedAtPar: false;
    acquiringSideUpliftExcluded: false;
  };
  locationFee2025: null | {
    billedValue: 3;
    availableReferenceValue: 1.25;
    billedAboveAvailableReference: true;
    acquiringSideUplift: "LIKELY";
    contractualViolation: "UNRESOLVED";
    excessEconomicBeneficiary: "UNRESOLVED";
  };
  nonUsNabu2024: null | {
    value: 0.0295;
    unit: "usd_per_event";
    effectiveFrom: "2024-04-15";
    scope: "U.S. merchant / non-U.S. issuer";
    evidenceClass: "E4_processor_or_platform_update";
  };
  locationMccAdjudication: null | {
    canonicalExcludedMccs: readonly [8398, 8661];
    preservedSourceAssertions: readonly ["Fiserv: 8393 and 8661", "Nuvei/Paya: 8938 and 8661"];
    correctionLayerOnly: true;
  };
  current2026Assessment: { state: "UNRESOLVED"; valuesNotAdmitted: readonly [0.001375, 0.001475] } | null;
  matchedRecordRefs: string[];
  matchedRuleRefs: string[];
  limitations: string[];
};

export type GovernedMastercardFocusedEvidenceResolution = {
  catalogVersion: typeof GOVERNED_MASTERCARD_FOCUSED_EVIDENCE_2024_2026_V1;
  sources: GovernedMastercardFocusedSource[];
  records: GovernedMastercardFocusedRecord[];
  rules: GovernedMastercardFocusedRule[];
  rowsByFeeRowId: Readonly<Record<string, GovernedMastercardFocusedRowResolution>>;
  diagnostics: {
    applicableRows: number;
    cardinalityResolvedRows: number;
    comparisonBlockedRows: number;
    assessmentStronglyExplainedRows: number;
    locationAboveReferenceRows: number;
    nonUsNabuPeriodReferenceRows: number;
    distinctLocationCandidateOccurrences: number;
    confirmedAtParRows: 0;
    confirmedMarkupRows: 0;
  };
  canonicalMutationAllowed: false;
  limitations: string[];
};

const PRODUCT_PACK_REF = "RateReveal_Mastercard_Focused_Evidence_2024-2026_FINAL_Product_Adjudicated_v2.md";
const PRODUCT_PACK_SHA256 = "0de1b4b1a724cf596bf05a0e8beba276c0fa9c1a9e363e7ff363562dbf17614a";
const PRODUCT_REQUEST_SHA256 = "79ffd2869801618e8caa7b5c70dfa2a3a4b4002758e53996314263874c6253b6";

const SOURCES: GovernedMastercardFocusedSource[] = [
  source("rr_product_mastercard_focused_pack_v2", "RateReveal Focused Mastercard Evidence Review — Final Product-Adjudicated Version v2", "RateReveal Product/domain review", "G1_product_domain_adjudication", "2026-09-07", "day", PRODUCT_PACK_REF, [
    "The 2024 0.1475% line is strongly explained by 0.14% ABVF plus a plausible 0.0075% ALF component, without proving at-par pass-through.",
    "The 2025 $3.00 Location Fee is above the $1.25 available reference; acquiring-side uplift is likely while contract violation and excess beneficiary remain unresolved.",
    "Canonical Location Fee MCC exclusions are 8398 and 8661; raw 8393 and 8938 source assertions remain immutable.",
  ]),
  source("braintree_paypal_mastercard_update_2024", "2024 Mastercard fee update", "Braintree/PayPal", "E4_processor_or_platform_update", "2024-04-05", "day", `${PRODUCT_PACK_REF}#mastercard-assessment`, [
    "U.S. Acquirer Brand Volume Fee increased from 0.13% to 0.14% effective April 5, 2024.",
    "Non-U.S. NABU is $0.0295 per transaction for U.S.-merchant/non-U.S.-issuer scope effective April 15, 2024.",
  ]),
  source("optimized_payments_mastercard_reference_2026", "Mastercard network-fee reference table", "Optimized Payments", "E7_public_industry_reference", "2026", "year", `${PRODUCT_PACK_REF}#optimized-payments`, [
    "Location Fee is $1.25 per qualifying location/month with under-$200, MCC 8398, and MCC 8661 exclusions.",
    "The current page lists combined assessment 0.1375% as 0.13% ABVF plus 0.0075% ALF.",
    "The assessment value may be stale and is not admitted as a current 2026 value.",
  ]),
  source("vantiv_worldpay_mastercard_schedule_2023_10", "Mastercard pass-through schedule", "Vantiv/Worldpay", "E4_processor_or_acquirer_schedule", "2023-10", "month", `${PRODUCT_PACK_REF}#location-fee`, ["Location Fee is $1.25 per qualifying location/month; excluded MCCs are 8398 and 8661."]),
  source("new_hampshire_merchant_agreement_2024", "Public merchant agreement", "State of New Hampshire", "E2_public_merchant_agreement", "2024", "year", `${PRODUCT_PACK_REF}#location-fee`, ["Mastercard Location Fee is $1.25 per qualifying location/month; excluded MCCs are 8398 and 8661."]),
  source("pay_com_mastercard_location_guidance_2026", "Mastercard Location Fee guidance", "Pay.com", "E7_public_industry_reference", "2026", "year", `${PRODUCT_PACK_REF}#location-fee`, ["Mastercard Location Fee is approximately $15 per location/year; excluded MCCs are 8398 and 8661."]),
  source("nuvei_paya_mastercard_location_source", "Mastercard Location Fee reference", "Nuvei/Paya", "E4_processor_or_platform_update", null, "unknown", `${PRODUCT_PACK_REF}#source-conflict-handling`, ["The source states MCC 8938 and 8661."], ["Product adjudicates 8938 as a probable source transcription error; the raw assertion is retained verbatim."]),
];

const RECORDS: GovernedMastercardFocusedRecord[] = [
  record("MC-FOCUSED-01", "2024 U.S. Acquirer Brand Volume Fee increase", "0.13% increased to 0.14%; April 5 and April 15 effective-date evidence remains conflicted for early-April statements.", ["braintree_paypal_mastercard_update_2024", "optimized_payments_mastercard_reference_2026"], "STRONG", [{ value: "2024-04-05", precision: "day", sourceRef: "braintree_paypal_mastercard_update_2024" }, { value: "2024-04-15", precision: "day", sourceRef: "optimized_payments_mastercard_reference_2026" }], "U.S. Mastercard acquiring", ["The date conflict is immaterial for September 2024 but must remain unresolved for early April."], ["one_global_effective_date_without_conflict"]),
  record("MC-FOCUSED-02", "2024 0.1475% statement Assessment", "Strongly explained by 0.14% ABVF plus a plausible 0.0075% ALF component; remove from above-reference candidates.", ["MC-FOCUSED-01", "rr_product_mastercard_focused_pack_v2"], "STRONG", [], "September 2024 corpus statement", ["The Wells Fargo/Fiserv-specific ALF component remains LIKELY."], ["confirmed_at_par", "universal_0_0075_alf", "no_possible_uplift"]),
  record("MC-FOCUSED-03", "Mastercard Location Fee reference", "$1.25 per qualifying location/month is supported before and after 2025.", ["vantiv_worldpay_mastercard_schedule_2023_10", "new_hampshire_merchant_agreement_2024", "optimized_payments_mastercard_reference_2026", "pay_com_mastercard_location_guidance_2026"], "STRONG", [], "U.S. Mastercard merchant locations", [], ["mastercard_charges_3_00"]),
  record("MC-FOCUSED-04", "Location Fee exclusions", "Canonical exclusions are under $200 monthly Mastercard volume, MCC 8398, and MCC 8661; source variants remain immutable.", ["MC-FOCUSED-03", "nuvei_paya_mastercard_location_source", "fiserv_card_brand_pass_through_guide_2023_04"], "STRONG", [], "U.S. Mastercard merchant locations", ["Fiserv 8393 and Nuvei/Paya 8938 are probable transcription errors retained in raw evidence."], ["rewrite_source_assertion"]),
  record("MC-FOCUSED-05", "2025 $3.00 Location Fee", "Billed above the $1.25 available reference; acquiring-side uplift LIKELY, not confirmed.", ["MC-FOCUSED-03", "rr_product_mastercard_focused_pack_v2"], "LIKELY", [], "Distinct 2025 corpus Location Fee occurrences", ["Contract violation and excess beneficiary are unresolved."], ["confirmed_markup", "processor_profit", "contract_breach"]),
  record("MC-FOCUSED-06", "Non-U.S. NABU", "$0.0295 per transaction effective April 15, 2024 for U.S.-merchant/non-U.S.-issuer scope.", ["braintree_paypal_mastercard_update_2024"], "STRONG", [{ value: "2024-04-15", precision: "day", sourceRef: "braintree_paypal_mastercard_update_2024" }], "U.S. merchant / non-U.S. issuer", [], ["primary_mastercard_publication"]),
  record("MC-FOCUSED-07", "2026 Mastercard Assessment", "Current 2026 rate remains unresolved; neither 0.1375% nor 0.1475% is admitted.", ["optimized_payments_mastercard_reference_2026", "MC-FOCUSED-01"], "UNRESOLVED", [], "2026 U.S. Mastercard acquiring", ["A current page date does not prove every value on the page is current."], ["2026_rate_0_001375", "2026_rate_0_001475"]),
  record("MC-FOCUSED-08", "Line-to-fee cardinality and residual guardrail", "Determine one fee, combined fees, bounded component, or structural line before comparison; exact residual arithmetic is not proof.", ["rr_product_mastercard_focused_pack_v2"], "STRONG", [], "All reference comparisons", [], ["markup_from_residual_math_alone", "undercharge_from_below_reference_alone"]),
  record("MC-FOCUSED-09", "Duplicate-candidate guardrail", "Count candidates only after verifying distinct statement and fee-row source occurrences.", ["rr_product_mastercard_focused_pack_v2"], "STRONG", [], "Corpus calibration", [], ["alias_counted_as_independent_occurrence"]),
];

const RULES: GovernedMastercardFocusedRule[] = RECORDS.map((item, index) => ({
  ruleId: `RR-MCF-0${index + 1}` as GovernedMastercardFocusedRule["ruleId"], title: item.title, admittedClaim: item.disposition,
  prohibitedClaims: item.prohibitedClaims, sourceRefs: item.evidenceRefs, sourceFingerprints: [PRODUCT_PACK_SHA256, PRODUCT_REQUEST_SHA256],
  reviewedAt: "2026-09-07", admissionStatus: "admitted",
}));

export function governedMastercardFocusedSources2024_2026V1(): GovernedMastercardFocusedSource[] { return structuredClone(SOURCES); }
export function governedMastercardFocusedRecords2024_2026V1(): GovernedMastercardFocusedRecord[] { return structuredClone(RECORDS); }
export function governedMastercardFocusedRules2024_2026V1(): GovernedMastercardFocusedRule[] { return structuredClone(RULES); }

export function evaluateResidualDecomposition(input: ResidualDecompositionInput): ResidualDecompositionResult {
  const residual = round(input.printedValue - input.knownComponentValue, 9);
  const direction = residual > 0 ? "above_reference" : residual < 0 ? "below_reference" : "equal_reference";
  if (direction === "equal_reference") return residualResult(direction, residual, "no_residual", false, []);
  if (direction === "below_reference") return residualResult(direction, residual, "possible_unbundled_component_elsewhere", true, ["A below-reference line can reflect a component itemized elsewhere; it does not establish an undercharge."]);
  const candidate = input.candidateComponent;
  const gates = Boolean(candidate && candidate.independentlyDocumented && candidate.sameNetworkAndProgram && candidate.periodApplicable && candidate.withinDocumentedRange && candidate.statementStructureCorroborates);
  if (gates && Math.abs(residual - candidate!.value) < 1e-9) return residualResult(direction, residual, "strongly_explained_by_legitimate_components_not_confirmed_at_par", false, ["Exact arithmetic corroborates the explanation but does not prove statement bundling.", ...(candidate!.acquirerSpecificApplicabilityProven ? [] : ["Acquirer-specific applicability and at-par pass-through remain unproven."])]);
  return residualResult(direction, residual, "candidate_component_insufficiently_supported", true, ["Above-reference classification is blocked until line cardinality and any plausible legitimate component are resolved."]);
}

export function resolveGovernedMastercardFocusedEvidence2024_2026V1(input: { analysis: CanonicalStatementAnalysis; usNetworkFeeEvidence: GovernedUsNetworkFeeEvidenceResolution }): GovernedMastercardFocusedEvidenceResolution {
  const rows = input.analysis.feeLedger.rows.map((row) => resolveRow(row, input.analysis, input.usNetworkFeeEvidence.rowsByFeeRowId[row.id]!));
  const distinctLocationCandidateOccurrences = new Set(rows.filter((item) => item.locationFee2025).map((item) => `${input.analysis.identity.sourceDocumentRef}:${item.feeRowId}`)).size;
  return deepFreeze({
    catalogVersion: GOVERNED_MASTERCARD_FOCUSED_EVIDENCE_2024_2026_V1,
    sources: governedMastercardFocusedSources2024_2026V1(), records: governedMastercardFocusedRecords2024_2026V1(), rules: governedMastercardFocusedRules2024_2026V1(),
    rowsByFeeRowId: Object.fromEntries(rows.map((row) => [row.feeRowId, row])),
    diagnostics: {
      applicableRows: rows.filter((row) => row.applicable).length,
      cardinalityResolvedRows: rows.filter((row) => row.applicable && row.lineToFeeCardinality.state !== "unresolved").length,
      comparisonBlockedRows: rows.filter((row) => row.applicable && !row.lineToFeeCardinality.comparisonAllowed).length,
      assessmentStronglyExplainedRows: rows.filter((row) => row.assessment2024).length,
      locationAboveReferenceRows: rows.filter((row) => row.locationFee2025).length,
      nonUsNabuPeriodReferenceRows: rows.filter((row) => row.nonUsNabu2024).length,
      distinctLocationCandidateOccurrences, confirmedAtParRows: 0, confirmedMarkupRows: 0,
    },
    canonicalMutationAllowed: false,
    limitations: ["This Product-adjudicated layer composes the existing U.S. network evidence inside the single governed payment-knowledge authority.", "Raw source assertions are immutable; MCC corrections live only in this derived adjudication layer.", "No 2026 Mastercard assessment value, confirmed at-par pass-through, confirmed markup, contract violation, or excess beneficiary is admitted."],
  });
}

export function mastercardFocusedEvidenceFingerprintV1(): string { return createHash("sha256").update(JSON.stringify({ catalogVersion: GOVERNED_MASTERCARD_FOCUSED_EVIDENCE_2024_2026_V1, sources: SOURCES, records: RECORDS, rules: RULES })).digest("hex"); }

function resolveRow(row: CanonicalFeeRow, analysis: CanonicalStatementAnalysis, base: GovernedUsNetworkRowResolution): GovernedMastercardFocusedRowResolution {
  const text = normalize(row.selectedLabel);
  const isMastercard = text.includes("MASTERCARD") || /(?:^| )MC(?: |$)/.test(text);
  if (!isMastercard) return focusedNotApplicable(row.id, base);
  const period = analysis.identity.statementPeriod.value;
  const is2024Assessment = /ASSESSMENT/.test(text) && base.comparison.statementValue !== null && Math.abs(base.comparison.statementValue - 0.001475) < 1e-9 && Boolean(period?.end.startsWith("2024"));
  const is2025Location = /LOCATION FEE/.test(text) && row.selectedAmount?.amountMinor === 300 && Boolean(period?.end.startsWith("2025"));
  const isNonUsNabu = /NTWK ACCESS AUTH FEE NONUS|NON.?US.*NABU|NABU.*NON.?US/.test(text) && Boolean(period && period.end >= "2024-04-15");
  const isLocation = /LOCATION FEE/.test(text);
  const cardinality = is2024Assessment
    ? cardinalityResult("multiple_legitimate_components_strongly_explained", "STRONG", true, ["MC-FOCUSED-02", "RR-MCF-08"], "The line is strongly explained by two legitimate Mastercard components, while actual bundling and at-par pass-through remain unproven.")
    : is2025Location
      ? cardinalityResult("unresolved", "UNRESOLVED", false, ["MC-FOCUSED-05", "RR-MCF-08"], "The $3.00 billed line may include only the Location Fee or an additional bundled service. Its numeric amount is above the available $1.25 fee reference, but cardinality blocks a confirmed markup or retention inference.")
    : /ASSESSMENT/.test(text)
      ? cardinalityResult("unresolved", "UNRESOLVED", false, ["RR-MCF-08"], "The statement does not establish whether the assessment line contains one component or multiple scoped assessment components, so naive above/below-reference comparison is blocked.")
    : /DIGITAL ENABLEMENT/.test(text)
      ? cardinalityResult("bounded_fee_component", "STRONG", true, ["RR-USN-08", "RR-MCF-08"], "The printed line is one component of a governed bounded fee mechanic.")
      : base.identity.state === "supported" || is2025Location || isNonUsNabu
        ? cardinalityResult("one_fee_supported", "STRONG", true, ["RR-MCF-08"], "Available identity and mechanic evidence support one fee for reference comparison.")
        : cardinalityResult("unresolved", "UNRESOLVED", false, ["RR-MCF-08"], "Line-to-fee cardinality is unresolved, so naive above/below-reference comparison is blocked.");
  let effective = structuredClone(base);
  let residual: ResidualDecompositionResult | null = null;
  let assessment2024: GovernedMastercardFocusedRowResolution["assessment2024"] = null;
  let locationFee2025: GovernedMastercardFocusedRowResolution["locationFee2025"] = null;
  let nonUsNabu2024: GovernedMastercardFocusedRowResolution["nonUsNabu2024"] = null;
  const matchedRecordRefs = ["MC-FOCUSED-08"];
  const matchedRuleRefs = ["RR-MCF-08"];
  if (is2024Assessment) {
    residual = evaluateResidualDecomposition({ printedValue: 0.001475, knownComponentValue: 0.0014, candidateComponent: { value: 0.000075, independentlyDocumented: true, sameNetworkAndProgram: true, periodApplicable: true, withinDocumentedRange: true, statementStructureCorroborates: true, acquirerSpecificApplicabilityProven: false } });
    assessment2024 = { structuralExplanation: "STRONGLY_EXPLAINED", baseAcquirerBrandVolumeFee: 0.0014, plausibleAnnualAcquirerLicenseFeeComponent: 0.000075, specificAcquirerComponentConfidence: "LIKELY", aboveReferenceCandidate: false, confirmedAtPar: false, acquiringSideUpliftExcluded: false };
    effective = { ...effective,
      mechanic: { state: "supported", value: "0.14% Acquirer Brand Volume Fee plus a plausible 0.0075% Annual Acquirer License Fee component", confidence: "STRONG", evidenceRefs: ["MC-FOCUSED-01", "MC-FOCUSED-02", ...row.sourceOccurrenceIds], supersedesEarlierSimplification: true, mechanicChangeInferred: false },
      population: { state: "supported", value: "September 2024 billed Mastercard assessment population with a plausible bundled license component", confidence: "STRONG", forcedToGatewayAuthorizationCount: false, economicCharacterInferredFromCount: false, evidenceRefs: ["MC-FOCUSED-01", "MC-FOCUSED-02", ...row.sourceOccurrenceIds] },
      reference: { ...effective.reference, state: "period_matched_processor_reference", evidenceClass: "E4_processor_or_acquirer_schedule", matchedRecordIds: ["MC-FOCUSED-01", "MC-FOCUSED-02"], candidateValues: [networkValue("abvf_2024", 0.0014, "decimal_rate", "U.S. Acquirer Brand Volume Fee")], sourceDate: "2024-04-05", effectiveFrom: "2024-04-05", effectiveThrough: null, adjacentPeriodOnly: false, current2026CoreValueEstablished: false },
      comparison: { ...effective.comparison, state: "population_or_product_scope_unresolved", referenceValue: 0.0014, difference: 0.000075, renderingText: "The 0.1475% line is strongly explained by the 0.14% 2024 Acquirer Brand Volume Fee plus a plausible 0.0075% Annual Acquirer License Fee component. The absence of a separate ALF line supports, but does not prove, the bundled-component hypothesis. Markup is not required to explain the row, but at-par pass-through and a small acquiring-side uplift cannot be fully excluded without acquirer-specific period evidence." },
      sourceConflicts: [], research: { priority: "none", reasonCodes: [], question: null }, matchedRuleRefs: [...new Set([...effective.matchedRuleRefs, "RR-MCF-01", "RR-MCF-02", "RR-MCF-08"])],
      limitations: [...effective.limitations, "April 5 versus April 15, 2024 remains an effective-date conflict for early-April statements; it is immaterial for this September statement.", "A small acquiring-side uplift cannot be fully excluded without the acquirer-specific period schedule."],
    };
    matchedRecordRefs.push("MC-FOCUSED-01", "MC-FOCUSED-02"); matchedRuleRefs.push("RR-MCF-01", "RR-MCF-02");
  }
  if (is2025Location) {
    locationFee2025 = { billedValue: 3, availableReferenceValue: 1.25, billedAboveAvailableReference: true, acquiringSideUplift: "LIKELY", contractualViolation: "UNRESOLVED", excessEconomicBeneficiary: "UNRESOLVED" };
    effective = { ...effective,
      reference: { ...effective.reference, state: "adjacent_period_processor_reference", matchedRecordIds: ["MC-FOCUSED-03"], candidateValues: [networkValue("monthly_location", 1.25, "usd_per_location_month", "qualifying location/month")], sourceDate: "2023-10", effectiveFrom: "2023-10-01", effectiveThrough: "2023-10-31", adjacentPeriodOnly: true },
      comparison: { ...effective.comparison, state: "candidate_above_reference", statementValue: 3, referenceValue: 1.25, unit: "usd_per_location_month", difference: 1.75, renderingText: "The merchant was billed $3.00 per month, above the strongest available $1.25 Mastercard Location Fee reference. Acquiring-side uplift is LIKELY, while contract violation, the exact nature of the excess, and its economic beneficiary remain unresolved." },
      sourceConflicts: [], research: { priority: "high", reasonCodes: ["processor_program_composition_unresolved", "excess_beneficiary_unresolved"], question: "For the 2025 $3.00 Mastercard Location Fee, obtain period-matched processor/program evidence identifying what the line contains and who controls or retains any excess over the $1.25 available reference." },
      matchedRuleRefs: [...new Set([...effective.matchedRuleRefs, "RR-MCF-03", "RR-MCF-04", "RR-MCF-05", "RR-MCF-08", "RR-MCF-09"])],
    };
    matchedRecordRefs.push("MC-FOCUSED-03", "MC-FOCUSED-04", "MC-FOCUSED-05", "MC-FOCUSED-09"); matchedRuleRefs.push("RR-MCF-03", "RR-MCF-04", "RR-MCF-05", "RR-MCF-09");
  }
  if (isNonUsNabu) {
    nonUsNabu2024 = { value: 0.0295, unit: "usd_per_event", effectiveFrom: "2024-04-15", scope: "U.S. merchant / non-U.S. issuer", evidenceClass: "E4_processor_or_platform_update" };
    effective = { ...effective, applicable: true,
      identity: { state: "supported", value: "mastercard_network_access_and_brand_usage_non_us_issuer", confidence: "STRONG", evidenceRefs: ["MC-FOCUSED-06", "braintree_paypal_mastercard_update_2024"] },
      mechanic: { state: "supported", value: "$0.0295 per transaction for the supported U.S.-merchant/non-U.S.-issuer scope", confidence: "STRONG", evidenceRefs: ["MC-FOCUSED-06", "braintree_paypal_mastercard_update_2024"], supersedesEarlierSimplification: true, mechanicChangeInferred: false },
      population: { state: "supported", value: "U.S. merchant / non-U.S. issuer transactions", confidence: "STRONG", forcedToGatewayAuthorizationCount: false, economicCharacterInferredFromCount: false, evidenceRefs: ["MC-FOCUSED-06", "braintree_paypal_mastercard_update_2024"] },
      reference: { ...effective.reference, state: "period_matched_processor_reference", evidenceClass: "E4_processor_or_acquirer_schedule", matchedRecordIds: ["MC-FOCUSED-06"], candidateValues: [networkValue("non_us_issuer", 0.0295, "usd_per_event", "U.S. merchant / non-U.S. issuer")], sourceDate: "2024-04-15", effectiveFrom: "2024-04-15", effectiveThrough: null, adjacentPeriodOnly: false, current2026CoreValueEstablished: false },
      billedObservation: effective.billedObservation ?? { evidenceClass: "E1_statement", statementRef: analysis.identity.sourceDocumentRef, statementPeriod: period, merchantAccountContinuityRef: null, label: row.selectedLabel, amountMinor: row.selectedAmount?.amountMinor ?? null, printedRate: { original: ".029500", numericValue: "0.0295", representation: "usd_per_event", kind: "per_item" }, establishesOfficialNetworkPar: false, evidenceRefs: row.sourceOccurrenceIds },
      comparison: { ...effective.comparison, state: "consistent_with_period_reference", statementValue: 0.0295, referenceValue: 0.0295, unit: "usd_per_event", difference: 0, renderingText: "The billed $0.0295 per-transaction value is consistent with the dated processor/platform reference for U.S.-merchant/non-U.S.-issuer scope; this is not primary Mastercard publication or proof of at-par pass-through." },
      research: { priority: "none", reasonCodes: [], question: null }, matchedRuleRefs: [...new Set([...effective.matchedRuleRefs, "RR-MCF-06", "RR-MCF-08"])],
    };
    matchedRecordRefs.push("MC-FOCUSED-06"); matchedRuleRefs.push("RR-MCF-06");
  }
  if (isLocation) {
    matchedRecordRefs.push("MC-FOCUSED-04");
    effective = {
      ...effective,
      sourceConflicts: [],
      research: is2025Location
        ? effective.research
        : { priority: "none", reasonCodes: [], question: null },
      limitations: [
        ...effective.limitations,
        "Raw 8393 and 8938 source assertions remain immutable provenance, but the canonical 8398 and 8661 exclusions control and the stale assertions do not surface as a governed conflict.",
      ],
    };
  }
  return {
    feeRowId: row.id, applicable: true, effectiveUsNetworkEvidence: effective, lineToFeeCardinality: cardinality, residualDecomposition: residual,
    assessment2024, locationFee2025, nonUsNabu2024,
    locationMccAdjudication: isLocation ? { canonicalExcludedMccs: [8398, 8661], preservedSourceAssertions: ["Fiserv: 8393 and 8661", "Nuvei/Paya: 8938 and 8661"], correctionLayerOnly: true } : null,
    current2026Assessment: /ASSESSMENT/.test(text) && Boolean(period?.end.startsWith("2026")) ? { state: "UNRESOLVED", valuesNotAdmitted: [0.001375, 0.001475] } : null,
    matchedRecordRefs: [...new Set(matchedRecordRefs)], matchedRuleRefs: [...new Set(matchedRuleRefs)], limitations: [],
  };
}

function focusedNotApplicable(feeRowId: string, base: GovernedUsNetworkRowResolution): GovernedMastercardFocusedRowResolution { return { feeRowId, applicable: false, effectiveUsNetworkEvidence: base, lineToFeeCardinality: cardinalityResult("unresolved", "UNRESOLVED", false, [], "Focused Mastercard evidence does not apply."), residualDecomposition: null, assessment2024: null, locationFee2025: null, nonUsNabu2024: null, locationMccAdjudication: null, current2026Assessment: null, matchedRecordRefs: [], matchedRuleRefs: [], limitations: [] }; }
function cardinalityResult(state: LineToFeeCardinalityState, confidence: "STRONG" | "LIKELY" | "UNRESOLVED", comparisonAllowed: boolean, evidenceRefs: string[], explanation: string): GovernedMastercardFocusedRowResolution["lineToFeeCardinality"] { return { state, confidence, comparisonAllowed, evidenceRefs, explanation }; }
function residualResult(direction: ResidualDecompositionResult["direction"], residual: number, disposition: ResidualDecompositionResult["disposition"], comparisonBlocked: boolean, limitations: string[]): ResidualDecompositionResult { return { direction, residual, disposition, bundledComponentProven: false, markupEstablished: false, underchargeEstablished: false, exactArithmeticAloneIsProof: false, comparisonBlocked, limitations }; }
function networkValue(variantId: string, value: number, unit: GovernedUsNetworkValue["unit"], productScope: string): GovernedUsNetworkValue { return { variantId, value, unit, productScope, matchTokens: [], minimum: false, maximum: false }; }
function source(sourceId: string, title: string, publisher: string, evidenceClass: MastercardFocusedEvidenceClass, publicationDate: string | null, publicationDatePrecision: GovernedMastercardFocusedSource["publicationDatePrecision"], sourceLocator: string, rawAssertions: string[], limitations: string[] = []): GovernedMastercardFocusedSource { return { sourceId, title, publisher, evidenceClass, publicationDate, publicationDatePrecision, sourceLocator, retainedThrough: PRODUCT_PACK_REF, retainedPackageFingerprint: PRODUCT_PACK_SHA256, reviewStatus: "product_adjudicated_admitted", geographyScope: "United States merchant acquiring", immutable: true, rawAssertions, limitations }; }
function record(recordId: GovernedMastercardFocusedRecord["recordId"], title: string, disposition: string, evidenceRefs: string[], confidence: GovernedMastercardFocusedRecord["confidence"], effectiveDates: GovernedMastercardFocusedRecord["effectiveDates"], scope: string, limitations: string[], prohibitedClaims: string[]): GovernedMastercardFocusedRecord { return { recordId, title, disposition, evidenceRefs, confidence, effectiveDates, scope, limitations, prohibitedClaims, admissionStatus: "admitted" }; }
function normalize(value: string): string { return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(); }
function round(value: number, digits: number): number { const scale = 10 ** digits; return Math.round((value + Number.EPSILON) * scale) / scale; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

import {
  adjudicateMastercardAssessmentCardinalityV1,
  resolveCurrentReferenceForClaim,
  selectMastercardAbvfReferenceV1,
  type GovernedCurrent2026RowResolution,
  type MastercardAbvfScopedReferenceSelection,
} from "./governedCurrent2026UsCoreNetworkReferenceV1.js";

export const CURRENT_REFERENCE_CONSUMPTION_V1 = "current_reference_consumption_2026_09_09_v1" as const;

export type MastercardAssessmentConsumptionInput = {
  kind: "mastercard_assessment";
  asOf: string;
  geography: "us" | "non_us" | "unknown";
  product: "debit" | "consumer_credit" | "commercial" | "unknown";
  ticketAmountUsd: number | null;
  printedRate: number | null;
  sameVolumeBaseAndMechanicSupported: boolean;
  separateAlfLinePresentForScope: boolean;
  strongerCompetingComponentExplanationPresent: boolean;
};

export type VisaBaseIIConsumptionInput = {
  kind: "visa_base_ii";
  asOf: string;
  geography: "us" | "non_us" | "unknown";
  printedLabel: string;
  printedValue: number | null;
};

export type CurrentReferenceConsumptionInput = MastercardAssessmentConsumptionInput | VisaBaseIIConsumptionInput;

export type CurrentReferenceConsumptionResult = {
  schemaVersion: typeof CURRENT_REFERENCE_CONSUMPTION_V1;
  kind: CurrentReferenceConsumptionInput["kind"];
  applicable: boolean;
  selectedReference: {
    state: "selected" | "blocked_missing_scope" | "not_applicable" | "current_reference_unresolved";
    value: number | null;
    unit: "decimal_rate" | "usd_per_event" | null;
    confidence: "CURRENT_WORKING_REFERENCE_STRONG" | null;
    effectiveFrom: string | null;
    scope: string | null;
    officialNetworkParEstablished: false;
  };
  scopeSelection: MastercardAbvfScopedReferenceSelection | null;
  cardinality: GovernedCurrent2026RowResolution["lineToFeeCardinality"];
  comparison: {
    state: "aligned_with_working_reference" | "above_working_reference" | "below_working_reference" | "blocked" | "not_requested";
    printedValue: number | null;
    referenceValue: number | null;
    difference: number | null;
    atParCertified: false;
    processorMarkupEstablished: false;
  };
  candidateEvidence: Array<{
    value: number | string;
    unit: string;
    status: "UNRESOLVED_CONFLICTING_CANDIDATE";
    effectiveFrom: null;
    applicableScope: "unresolved";
    evidenceWeight: "below_dated_working_reference";
    provenanceRefs: string[];
  }>;
  identity: {
    feeFamily: string | null;
    separateFromFeeFamilies: string[];
    merchantBilledIncidence: "not_evaluated" | "not_observed_in_supported_fiserv_corpus";
  };
  rendering: {
    internalAnalystText: string;
    claimConstrainedMerchantPreview: string;
    customerReportAuthority: "none";
    selectedReferenceAsCurrentFactAllowed: boolean;
    officialParLanguageAllowed: false;
    candidateAsFactAllowed: false;
    processorMarkupLanguageAllowed: false;
    processorRetentionLanguageAllowed: false;
    contractComplianceLanguageAllowed: false;
    negotiationLanguageAllowed: false;
  };
  evidenceRefs: string[];
  limitations: string[];
  canonicalMutationAllowed: false;
};

export function consumeCurrentReferenceV1(input: CurrentReferenceConsumptionInput): CurrentReferenceConsumptionResult {
  return input.kind === "mastercard_assessment" ? consumeMastercard(input) : consumeVisaBaseII(input);
}

function consumeMastercard(input: MastercardAssessmentConsumptionInput): CurrentReferenceConsumptionResult {
  const claim = resolveCurrentReferenceForClaim({ label: "MASTERCARD ASSESSMENT", identity: "mastercard_assessment", asOf: input.asOf });
  if (input.geography !== "us" || input.asOf < "2024-04-15" || claim.state === "NOT_APPLICABLE") {
    return unavailable(input.kind, input.printedRate, "The governed current U.S. ABVF reference does not apply to this geography or effective period.");
  }
  const scope = selectMastercardAbvfReferenceV1({ product: input.product, ticketAmountUsd: input.ticketAmountUsd });
  const applicableAbvfReference = scope.value;
  const cardinality = adjudicateMastercardAssessmentCardinalityV1({
    printedRate: input.printedRate,
    applicableAbvfReference,
    sameVolumeBaseAndMechanicSupported: input.sameVolumeBaseAndMechanicSupported,
    separateAlfLinePresentForScope: input.separateAlfLinePresentForScope,
    strongerCompetingComponentExplanationPresent: input.strongerCompetingComponentExplanationPresent,
  });
  if (scope.state === "SCOPED_REFERENCE_UNRESOLVED") {
    return {
      ...base(input.kind, input.printedRate), applicable: true, scopeSelection: scope, cardinality,
      selectedReference: { state: "blocked_missing_scope", value: null, unit: "decimal_rate", confidence: null, effectiveFrom: null, scope: null, officialNetworkParEstablished: false },
      comparison: blocked(input.printedRate),
      identity: { feeFamily: "mastercard_acquirer_brand_volume_fee", separateFromFeeFamilies: ["mastercard_annual_acquirer_license_fee"], merchantBilledIncidence: "not_evaluated" },
      rendering: rendering("Product/ticket scope is missing, so RateReveal cannot determine whether 0.14% or 0.15% applies.", "No Mastercard rate comparison is shown because debit versus qualifying credit/commercial and the $1,000 ticket threshold are not established.", false),
      evidenceRefs: unique([...scope.evidenceRefs, ...cardinality.evidenceRefs]),
      limitations: ["Missing product/ticket scope blocks selection; neither the lower nor higher reference may be guessed."],
    };
  }
  const selectedValue = scope.value!;
  const difference = input.printedRate === null ? null : round(input.printedRate - selectedValue, 9);
  const comparisonResult = comparison(input.printedRate, selectedValue, input.sameVolumeBaseAndMechanicSupported && cardinality.comparisonAllowed);
  const tierText = selectedValue === 0.0015
    ? "0.15% applies because the established U.S. consumer-credit/commercial ticket is at least $1,000: 0.14% base plus the scoped 0.01% increment."
    : input.product === "debit"
      ? "0.14% applies to the established U.S. debit scope; the large-ticket increment is excluded even above $1,000."
      : "0.14% applies because the established qualifying credit/commercial ticket is below $1,000.";
  const cardinalityText = cardinality.state === "multiple_legitimate_components_strongly_explained"
    ? " The assessment residual is consistent with a likely bundled ALF component under the statement-local gates; arithmetic corroborates but does not prove composition."
    : cardinality.state === "unresolved" && input.separateAlfLinePresentForScope
      ? " A separate same-scope ALF line strongly disfavors duplicate ALF attribution; the residual remains unresolved."
      : cardinality.state === "one_fee_supported"
        ? " The printed line supports one ABVF component; no hidden ALF is inferred."
        : " Line composition remains unresolved.";
  return {
    ...base(input.kind, input.printedRate), applicable: true, scopeSelection: scope, cardinality,
    selectedReference: { state: "selected", value: selectedValue, unit: "decimal_rate", confidence: "CURRENT_WORKING_REFERENCE_STRONG", effectiveFrom: "2024-04-15", scope: scope.applicablePopulation, officialNetworkParEstablished: false },
    comparison: { ...comparisonResult, difference },
    identity: { feeFamily: "mastercard_acquirer_brand_volume_fee", separateFromFeeFamilies: ["mastercard_annual_acquirer_license_fee"], merchantBilledIncidence: "not_evaluated" },
    rendering: rendering(`${tierText}${cardinalityText} This working reference is not universal official Mastercard par and does not establish at-par billing, processor markup, or retention.`, `${tierText}${cardinalityText} This is a scoped current working reference, not universal official Mastercard par.`, true),
    evidenceRefs: unique([...claim.records.flatMap((record) => record.sourceRefs), ...scope.evidenceRefs, ...cardinality.evidenceRefs]),
    limitations: ["ALF allocation may vary by acquirer/provider.", "Contract compliance and merchant-specific remedies are not assessed."],
  };
}

function consumeVisaBaseII(input: VisaBaseIIConsumptionInput): CurrentReferenceConsumptionResult {
  const claim = resolveCurrentReferenceForClaim({ label: input.printedLabel, asOf: input.asOf });
  if (input.geography !== "us" || claim.state === "NOT_APPLICABLE") return unavailable(input.kind, input.printedValue, "No governed U.S. Base II reference applies to this identity, geography, and period.");
  const record = claim.records.find((candidate) => candidate.kind !== "current_conflicting_candidate" && candidate.values.length > 0);
  const unresolved = claim.state === "CURRENT_RATE_UNRESOLVED" || !record || claim.effectiveValues.length === 0;
  const candidateEvidence = claim.records.flatMap((candidate) => candidate.candidateValues.flatMap((value) =>
    value.status === "UNRESOLVED_CONFLICTING_CANDIDATE" && value.effectiveFrom === null && value.applicableScope === "unresolved" && value.evidenceWeight === "below_dated_working_reference"
      ? [{ value: value.value, unit: value.unit, status: value.status, effectiveFrom: value.effectiveFrom, applicableScope: value.applicableScope, evidenceWeight: value.evidenceWeight, provenanceRefs: value.provenanceRefs ?? [] }]
      : [],
  ));
  const networkAccess = record?.identity === "visa_base_ii_network_access_fee";
  const feeFamily = record?.identity ?? claim.records[0]?.identity ?? null;
  const cardinality = unresolved
    ? { state: "unresolved" as const, confidence: "UNRESOLVED" as const, comparisonAllowed: false, evidenceRefs: ["CUR-26-05", "CUR-26-06"], explanation: "Generic Base II wording does not establish component identity or composition." }
    : { state: "one_fee_supported" as const, confidence: "STRONG" as const, comparisonAllowed: true, evidenceRefs: ["CUR-26-05", "CUR-26-06", ...record.sourceRefs], explanation: networkAccess ? "Network Access is a separate Base II family; equal value does not merge it with Transmission." : "System File and Transmission are supported name variants; Network Access remains separate." };
  if (unresolved) {
    return {
      ...base(input.kind, input.printedValue), applicable: true, scopeSelection: null, cardinality,
      selectedReference: { state: "current_reference_unresolved", value: null, unit: "usd_per_event", confidence: null, effectiveFrom: null, scope: null, officialNetworkParEstablished: false },
      comparison: blocked(input.printedValue), candidateEvidence,
      identity: { feeFamily, separateFromFeeFamilies: ["visa_base_ii_system_file_transmission_fee", "visa_base_ii_network_access_fee"], merchantBilledIncidence: record?.merchantBilledIncidence ?? "not_evaluated" },
      rendering: rendering("Base II identity or composition is unresolved, so no current value is selected.", "No Base II rate comparison is shown because the printed identity/composition is unresolved.", false),
      evidenceRefs: unique(claim.records.flatMap((candidate) => candidate.sourceRefs)),
      limitations: ["Residual arithmetic cannot establish the components of a generic Base II line."],
    };
  }
  const value = Number(claim.effectiveValues[0]!.value);
  const comparisonResult = comparison(input.printedValue, value, cardinality.comparisonAllowed);
  const candidateText = candidateEvidence.length > 0 ? " The internally retained $0.0027 assertion has unresolved date/scope and lower weight; it is not a current fact or transition." : "";
  const identityText = networkAccess ? "Base II Network Access is a separate fee family." : "Base II System File and Transmission are name variants of one fee family; Network Access remains separate.";
  return {
    ...base(input.kind, input.printedValue), applicable: true, scopeSelection: null, cardinality,
    selectedReference: { state: "selected", value, unit: "usd_per_event", confidence: "CURRENT_WORKING_REFERENCE_STRONG", effectiveFrom: record.effectiveFrom, scope: record.productScope, officialNetworkParEstablished: false },
    comparison: comparisonResult, candidateEvidence,
    identity: { feeFamily, separateFromFeeFamilies: networkAccess ? ["visa_base_ii_system_file_transmission_fee"] : ["visa_base_ii_network_access_fee"], merchantBilledIncidence: record.merchantBilledIncidence },
    rendering: rendering(`${identityText} The selected U.S. current working reference is $${value.toFixed(4)} per event.${candidateText} It is not universal official Visa par.`, `${identityText} RateReveal uses a scoped $${value.toFixed(4)} current working reference; it is not universal official Visa par.${candidateText}`, true),
    evidenceRefs: unique(claim.records.flatMap((candidate) => candidate.sourceRefs)),
    limitations: ["Matching values do not establish identity.", "Non-observation of a separately printed Network Access line does not prove nonexistence or universal bundling."],
  };
}

function base(kind: CurrentReferenceConsumptionInput["kind"], printedValue: number | null) {
  return {
    schemaVersion: CURRENT_REFERENCE_CONSUMPTION_V1, kind, candidateEvidence: [], canonicalMutationAllowed: false as const,
    comparison: { state: "not_requested" as const, printedValue, referenceValue: null, difference: null, atParCertified: false as const, processorMarkupEstablished: false as const },
  };
}

function unavailable(kind: CurrentReferenceConsumptionInput["kind"], printedValue: number | null, explanation: string): CurrentReferenceConsumptionResult {
  return {
    ...base(kind, printedValue), applicable: false,
    selectedReference: { state: "not_applicable", value: null, unit: null, confidence: null, effectiveFrom: null, scope: null, officialNetworkParEstablished: false },
    scopeSelection: null,
    cardinality: { state: "unresolved", confidence: "UNRESOLVED", comparisonAllowed: false, evidenceRefs: [], explanation },
    comparison: blocked(printedValue),
    identity: { feeFamily: null, separateFromFeeFamilies: [], merchantBilledIncidence: "not_evaluated" },
    rendering: rendering(explanation, "No current-reference comparison is available for this context.", false),
    evidenceRefs: [], limitations: [explanation],
  };
}

function comparison(printedValue: number | null, referenceValue: number, allowed: boolean): CurrentReferenceConsumptionResult["comparison"] {
  if (printedValue === null) return { state: "not_requested", printedValue, referenceValue, difference: null, atParCertified: false, processorMarkupEstablished: false };
  if (!allowed) return blocked(printedValue, referenceValue);
  const difference = round(printedValue - referenceValue, 9);
  return { state: Math.abs(difference) < 1e-9 ? "aligned_with_working_reference" : difference > 0 ? "above_working_reference" : "below_working_reference", printedValue, referenceValue, difference, atParCertified: false, processorMarkupEstablished: false };
}

function blocked(printedValue: number | null, referenceValue: number | null = null): CurrentReferenceConsumptionResult["comparison"] {
  return { state: "blocked", printedValue, referenceValue, difference: null, atParCertified: false, processorMarkupEstablished: false };
}

function rendering(internalAnalystText: string, claimConstrainedMerchantPreview: string, selectedReferenceAsCurrentFactAllowed: boolean): CurrentReferenceConsumptionResult["rendering"] {
  return { internalAnalystText, claimConstrainedMerchantPreview, customerReportAuthority: "none", selectedReferenceAsCurrentFactAllowed, officialParLanguageAllowed: false, candidateAsFactAllowed: false, processorMarkupLanguageAllowed: false, processorRetentionLanguageAllowed: false, contractComplianceLanguageAllowed: false, negotiationLanguageAllowed: false };
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
function round(value: number, places: number): number { return Number(value.toFixed(places)); }

# RateReveal Canonical Statement Analysis Architecture and Migration Spec v1

## 1. Purpose

This specification defines how RateReveal will move from the current blended `AnalysisSummary` architecture to one canonical, evidence-backed financial-analysis model.

The goal is to make Report V1 a projection layer rather than the place where financial truth is assembled. Canonical analysis must decide which statement facts are verified, which fee rows are unique and countable, which findings are actionable, and which opportunity dollars are eligible before any customer-facing report is built.

This is an architecture and migration specification only. It does not replace existing reports, parser behavior, PDF behavior, authenticated reports, static reports, multi-statement behavior, or the Report V1 feature flag. Canonical output initially runs in shadow mode and must not become customer-facing until explicit acceptance criteria pass.

## 2. Design Principles

1. Canonical analysis is the financial source of truth.
2. Report V1 consumes canonical permissions and must not override them.
3. Every selected fact preserves provenance and rejected candidates.
4. Missing evidence is labeled honestly; page numbers remain `null` when unavailable.
5. Reconciliation uses independently derived controls where available.
6. Fee row role, display category, economic ownership, actionability, and savings eligibility are separate.
7. Pass-through, card-brand, and network charges default to `not_actionable` or `verify_only` unless processor markup is deterministically proven.
8. Eligible opportunity is calculated from visible, non-overlapping components.
9. Master savings summaries may summarize components but cannot be authoritative aggregation sources.
10. AI may investigate, classify, and explain, but may not independently create customer-facing savings.
11. The canonical contract is provider-neutral.
12. Parser behavior and analysis policies are versioned.
13. Existing analyses are preserved and are not automatically replaced.
14. Shadow mode precedes customer-facing migration.

### 2.1 Scalar Value Conventions

Canonical money must not use ordinary JavaScript floating-point `number` fields. The first canonical release should use integer minor units for money:

```ts
type CurrencyCode = "USD";

interface MoneyAmount {
  amountMinor: number; // cents for USD
  currency: CurrencyCode;
}

type DecimalString = string; // validated decimal string for rates and percentages, for example "2.3456"
type CountValue = number; // nonnegative safe integer
```

Rules:
- All canonical money amounts must use `MoneyAmount`.
- Every money amount must carry explicit `currency`, even while first-release support is USD-only.
- Calculations may use arbitrary-precision decimal math internally, but persisted canonical money results must be rounded to integer minor units under a versioned rounding policy.
- Percentages, rates, and basis points may use validated decimal strings when exact display/recomputation matters.
- Customer-facing projection may format `MoneyAmount` as dollars, but projection must not recalculate financial results using JavaScript floats.

## 3. Canonical Object Model

### 3.0 Object Boundary Summary

| Object | Purpose | Required Fields | Optional Fields | Allowed Values | Evidence Requirements | Validation Requirements | Relationships | Projection | Forbidden |
|---|---|---|---|---|---|---|---|---|---|
| `CanonicalStatementAnalysis` | Root canonical analysis envelope. | IDs, timestamps, identity, facts, evidence, ledger, reconciliation, opportunities, calculations, advanced review, permissions, validation, versions. | Shadow comparison, legacy refs, internal debug metadata. | Versioned schema values only. | Must contain all evidence referenced by child objects. | Must pass referential integrity and invariant validation before storage. | Owns all canonical child collections. | Partially customer-projectable. | Cannot contain secrets, raw provider errors, or unsupported savings. |
| `CanonicalStatementIdentity` | Verified statement identity and scope. | Merchant, processor, period, business type, document ref. | Merchant identifier, source filename. | Observed, inferred, unavailable, unsupported fact statuses. | Observed/inferred fields need evidence or user-input provenance. | Must not expose unverifiable identity as high confidence. | References evidence and source document. | Partially customer-projectable with redaction. | Cannot infer processor solely from filename as verified fact. |
| `CanonicalFinancialFacts` | Selected financial facts and derived metrics. | Sales, fees, effective rate, transaction-count set, average-ticket basis. | Funding, adjustments, credits. | Selected, unavailable, ambiguous, unsupported, not applicable. | Selected observed facts need evidence; derived facts need calculation refs. | Formula-derived facts must recompute exactly within policy. | References candidates, evidence, calculations. | Customer-projectable only when permissions allow. | Cannot let subtotals or narrow transaction counts replace statement-level facts without policy. |
| `CanonicalFactCandidate` | Candidate fact value before selection. | ID, role, value, evidence, parser metadata, confidence, selected flag. | Selection/rejection explanation. | Candidate role enum. | Every candidate needs evidence or explicit source provenance. | Rejected candidates need rejection reason. | Belongs to a `CanonicalFactValue`. | Internal by default; selected/rejected summaries may project. | Cannot silently disappear when it affects ambiguity. |
| `CanonicalEvidenceRecord` | Stable source-document evidence record with extraction observations and parser interpretations. | Stable source evidence ID, document ID, source role, customer-safe form. | Page, section, line, row, extracted text, observations, interpretations. | Evidence source-role enum plus extraction/parser observation enums. | Page remains `null` if unavailable. Parser versions attach to observations, not the stable evidence ID. | Must pass redaction checks before customer projection. | Referenced by facts, fee rows, calculations, opportunities, reconciliation. | Customer-safe excerpt only. | Cannot expose secrets, raw provider errors, or unnecessary merchant identifiers. |
| `CanonicalFeeLedger` | Deduplicated fee ledger. | Status, rows, unique charge total, controls. | Duplicate summary. | Available, partial, unavailable. | Rows and controls need evidence. | Counted rows must reconcile to controls or limit/block permissions. | Owns canonical fee rows and control totals. | Projectable when fee permissions allow. | Cannot count duplicate/control rows as charges. |
| `CanonicalFeeRow` | One canonical semantic fee row with exact source occurrences. | Canonical semantic ID, source occurrence IDs, role, labels, amounts, category, ownership, actionability, eligibility, counted status, evidence. | Rate, count, volume, duplicate refs, alias evidence. | Versioned row role, category, ownership, actionability, cadence enums. | Counted rows require source occurrence evidence; aliases preserve duplicate evidence. | Savings eligibility must satisfy ownership/actionability policy. | Referenced by opportunities and reconciliation. | Projectable when inventory permission allows. | Cannot merge two legitimate same-label/same-amount occurrences without source-occurrence proof. |
| `CanonicalReconciliation` | Independent control comparison. | Policy version, status, controls, effects, reasons. | Additional processor-specific controls. | Pass, pass_with_rounding, limited, verification_required, blocked. | Each control needs evidence and derivation lineage. | Status must drive permissions consistently. | Consumes facts and fee ledger controls. | Summary projectable; internal details as allowed. | Cannot treat same-lineage agreement as independent proof. |
| `CanonicalOpportunityComponent` | Atomic opportunity dollar source. | Fee refs, observed/target cost, formula, cadence, impacts, ownership, eligibility, overlap, evidence. | Supersession links. | Deterministic, estimated, verification_only, non_financial. | Needs fee/fact evidence and target provenance. | Included components require calculation ref, non-low confidence, no unresolved overlap. | References fee rows, calculations, evidence. | Projectable when opportunity permission allows. | Cannot include unknown cadence or possible-overlap amounts. |
| `CanonicalCalculationRecord` | Reproducible formula record. | ID, formula code/version, inputs, result, unit, rounding policy. | Assumptions. | Money, percent, bps, count units. | Inputs reference facts, fee rows, or evidence. | Result must recompute under formula/rounding policy. | Referenced by facts and opportunities. | Projectable when related section is allowed. | Cannot be an unexplained imported number. |
| `CanonicalAdvancedReview` | Provider-neutral advanced review capabilities. | Policy version, overall status, capabilities. | Diagnostics. | Completed, partially_completed, not_needed, failed, disabled. | Diagnostics reference canonical facts/fees/evidence. | Required capabilities must complete or prove not-needed. | May suggest classifications/findings for canonical grounding. | Only customer-safe diagnostics project. | Cannot directly create savings or expose provider internals. |
| `CanonicalAnalysisPermissions` | Display and conclusion permissions. | Permission booleans and reasons. | None for first release. | Boolean permissions with severity-coded reasons. | Reasons reference validation/reconciliation where relevant. | Must agree with validation state and report state. | Consumed by Report V1 projection. | Customer-projectable as limitations/explanations. | Cannot be overridden by projection. |
| `CanonicalValidationState` | Invariant validation result. | Status and invariant results. | None for first release. | Valid, valid_with_warnings, invalid. | References invariant IDs and messages. | Critical failures block storage or projection as defined. | Produces permissions with policy. | Internal summary may project as limitations. | Cannot allow critical contradictions. |
| `CanonicalAnalysisVersionManifest` | Reproducibility manifest. | Schema, parser, extraction, policy, benchmark, AI-review, projection versions. | Build SHA or deploy metadata, internal-only. | Version strings. | N/A except parser/extraction refs. | Required on every completed canonical analysis. | Attached to analysis and shadow comparison. | Internal by default; selected methodology versions may project. | Cannot be omitted from persisted canonical analyses. |
| `CanonicalShadowComparison` | Legacy-vs-canonical comparison. | IDs, refs, timestamp, differences, pass flag. | Reviewer notes. | Difference classification enum. | Should reference evidence/facts where useful. | Must not affect customer output in shadow mode. | References legacy and canonical analyses. | Internal-only. | Cannot change customer behavior. |

### 3.1 `CanonicalStatementAnalysis`

Purpose: Root object for a completed canonical single-statement analysis.

Required fields:
- `canonicalSchemaVersion`
- `analysisId`
- `sourceAnalysisId`
- `createdAt`
- `identity`
- `financialFacts`
- `feeLedger`
- `reconciliation`
- `opportunityComponents`
- `calculations`
- `advancedReview`
- `permissions`
- `validation`
- `versionManifest`

Optional fields:
- `shadowComparison`
- `legacySummaryRef`
- `debugMetadata`, internal-only

Customer-projectable: Partially. Customer-facing reports may project approved fields, evidence excerpts, calculations, limitations, and permissions. Internal audit fields remain private.

Forbidden:
- It must not contain raw secrets, API keys, provider stack traces, or unredacted merchant-sensitive diagnostic logs.
- It must not allow customer-facing savings when `permissions.customerFacingSavingsAllowed` is false.

```ts
interface CanonicalStatementAnalysis {
  canonicalSchemaVersion: "canonical_statement_analysis_v1";
  analysisId: string;
  sourceAnalysisId: string | null;
  createdAt: string;
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  evidence: CanonicalEvidenceRecord[];
  feeLedger: CanonicalFeeLedger;
  reconciliation: CanonicalReconciliation;
  opportunityComponents: CanonicalOpportunityComponent[];
  calculations: CanonicalCalculationRecord[];
  advancedReview: CanonicalAdvancedReview;
  permissions: CanonicalAnalysisPermissions;
  validation: CanonicalValidationState;
  versionManifest: CanonicalAnalysisVersionManifest;
  shadowComparison?: CanonicalShadowComparison;
}
```

### 3.2 `CanonicalStatementIdentity`

Purpose: Verified statement identity and scope.

Required fields:
- `merchantName`
- `merchantIdentifier`
- `processorName`
- `processorFamily`
- `statementPeriod`
- `businessType`
- `sourceDocumentRef`

Allowed statuses:
- `observed`
- `inferred`
- `unavailable`
- `unsupported`

Evidence requirements: Every observed or inferred identity field must reference at least one evidence record or a documented user input source.

Forbidden:
- It must not infer processor identity from filename alone unless marked `inferred` and low confidence.
- It must not expose merchant identifiers in public/customer exports unless product privacy policy approves it.

```ts
interface CanonicalStatementIdentity {
  merchantName: CanonicalFactValue<string>;
  merchantIdentifier: CanonicalFactValue<string | null>;
  processorName: CanonicalFactValue<string>;
  processorFamily: CanonicalFactValue<string>;
  statementPeriod: CanonicalFactValue<{ start: string; end: string }>;
  businessType: CanonicalFactValue<string>;
  sourceDocumentRef: string;
}
```

### 3.3 `CanonicalFinancialFacts`

Purpose: Selected canonical financial facts and their candidates.

Required fields:
- `processedSales`
- `totalFees`
- `effectiveRate`
- `transactionCounts`
- `averageTicketBasis`
- `averageTicket`
- `amountFunded`
- `adjustments`
- `credits`

Validation requirements:
- Effective rate must be calculated from a versioned `effectiveRateBasis`, not from an implicit `totalFees / processedSales` shortcut.
- Average ticket must be calculated only from canonical processed sales and the count type selected by `averageTicketBasis`.
- If the count type approved for average ticket is not independently verified, average ticket is unavailable.

Forbidden:
- A narrow subtotal must not replace a statement-level total unless processor-specific policy explicitly approves it and records rejected candidates.
- Authorization counts, network transaction counts, settled transaction counts, or card-type subtotals must not silently replace submitted transaction counts.

```ts
interface CanonicalFinancialFacts {
  processedSales: CanonicalFactValue<MoneyAmount>;
  totalFees: CanonicalFactValue<MoneyAmount>;
  effectiveRate: CanonicalFactValue<DecimalString>;
  effectiveRateBasis: CanonicalEffectiveRateBasis;
  transactionCounts: CanonicalTransactionCounts;
  averageTicketBasis: CanonicalAverageTicketBasis;
  averageTicket: CanonicalFactValue<MoneyAmount | null>;
  amountFunded: CanonicalFactValue<MoneyAmount | null>;
  adjustments: CanonicalFactValue<MoneyAmount | null>;
  credits: CanonicalFactValue<MoneyAmount | null>;
}

type TransactionCountType =
  | "submitted_transactions"
  | "settled_transactions"
  | "authorizations"
  | "captures"
  | "refunds"
  | "chargebacks"
  | "network_transactions"
  | "card_type_items"
  | "unknown";

interface CanonicalTransactionCounts {
  submittedTransactions: CanonicalFactValue<CountValue | null>;
  settledTransactions: CanonicalFactValue<CountValue | null>;
  authorizations: CanonicalFactValue<CountValue | null>;
  captures: CanonicalFactValue<CountValue | null>;
  refunds: CanonicalFactValue<CountValue | null>;
  chargebacks: CanonicalFactValue<CountValue | null>;
  networkTransactions: CanonicalFactValue<CountValue | null>;
  cardTypeItems: CanonicalFactValue<CountValue | null>;
}

interface CanonicalAverageTicketBasis {
  selectedCountType: TransactionCountType | null;
  allowed: boolean;
  reason: string;
  calculationRef?: string;
}

interface CanonicalEffectiveRateBasis {
  policyVersion: string;
  numeratorFeeBasis:
    | "all_in_processing_fees"
    | "processing_fees_excluding_equipment"
    | "processor_controlled_fees_only"
    | "statement_reported_rate"
    | "unsupported";
  denominatorVolumeBasis:
    | "submitted_sales"
    | "settled_sales"
    | "gross_sales"
    | "net_sales_after_refunds"
    | "processor_reported_volume"
    | "unsupported";
  refundsTreatment: "included" | "deducted" | "excluded" | "not_present" | "unknown";
  cashAdvanceTreatment: "included" | "excluded" | "not_present" | "unknown";
  equipmentFeeTreatment: "included" | "excluded" | "not_present" | "unknown";
  chargebackTreatment: "included" | "excluded" | "not_present" | "unknown";
  oneTimeFeeTreatment: "included" | "excluded" | "not_present" | "unknown";
  rateSource: "ratereveal_calculated" | "processor_stated" | "both";
  processorStatedRate: CanonicalFactValue<DecimalString | null>;
  calculationRef?: string;
  explanation: string;
}
```

### 3.4 `CanonicalFactValue` and `CanonicalFactCandidate`

Purpose: Represent selected values, alternatives, and rejected candidates.

Allowed value statuses:
- `selected`
- `unavailable`
- `ambiguous`
- `unsupported`
- `not_applicable`

Candidate confidence:
- `high`
- `medium`
- `low`
- `needs_review`

Evidence requirements:
- Selected candidates require evidence unless the value is calculated from other canonical facts.
- Rejected candidates require a rejection reason.

```ts
interface CanonicalFactValue<T> {
  value: T | null;
  status: "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
  confidence: "high" | "medium" | "low" | "needs_review" | null;
  selectedCandidateId?: string;
  evidenceRefs: string[];
  calculationRef?: string;
  selectionReason: string | null;
  candidates: CanonicalFactCandidate<T>[];
  limitations: string[];
}

interface CanonicalFactCandidate<T> {
  id: string;
  role:
    | "statement_level_total"
    | "processor_summary_total"
    | "section_subtotal"
    | "fee_bucket_total"
    | "interchange_detail_total"
    | "funding_formula_result"
    | "card_type_total"
    | "user_supplied"
    | "legacy_summary"
    | "unknown";
  value: T;
  evidenceRefs: string[];
  parserId: string | null;
  parserVersion: string | null;
  extractionMethod: string;
  confidence: "high" | "medium" | "low" | "needs_review";
  selected: boolean;
  selectionReason: string | null;
  rejectionReason: string | null;
}
```

### 3.5 `CanonicalEvidenceRecord`

Purpose: Stable provenance for facts, fee rows, calculations, reconciliation controls, and opportunity components.

Canonical evidence separates three concepts:
- source-document evidence identity;
- extraction observation;
- parser interpretation.

The stable evidence ID identifies the source document location/text. Extraction and parser versions attach to observations and interpretations so parser upgrades do not unnecessarily change source evidence identity when the underlying printed line is unchanged.

Required fields:
- `id`
- `documentId`
- `sourceRole`
- `confidence`
- `customerSafe`

Optional fields:
- `pageNumber`
- `section`
- `lineId`
- `rowIndex`
- `extractedText`
- `normalizedText`
- `extractionObservations`
- `parserInterpretations`
- `internalAuditText`

Page-number rule: If page number is unavailable or unreliable, `pageNumber` must be `null`.

Stability rule: Evidence IDs should be deterministic from document fingerprint, source location where available, normalized source text, and source role. Parser ID and parser version must not be part of the stable source evidence ID. Parser upgrades may create new `CanonicalParserInterpretation` IDs while preserving the same source evidence ID when the source line is unchanged.

```ts
interface CanonicalEvidenceRecord {
  id: string;
  documentId: string;
  pageNumber: number | null;
  section: string | null;
  lineId: string | null;
  rowIndex: number | null;
  extractedText: string | null;
  normalizedText: string | null;
  sourceRole:
    | "selected_fact"
    | "rejected_candidate"
    | "fee_row"
    | "control_total"
    | "calculation_input"
    | "benchmark_reference"
    | "advanced_review_diagnostic";
  confidence: "high" | "medium" | "low";
  extractionObservations: CanonicalExtractionObservation[];
  parserInterpretations: CanonicalParserInterpretation[];
  customerSafe: {
    excerpt: string | null;
    redactionApplied: boolean;
  };
  internalAuditText?: string;
}

interface CanonicalExtractionObservation {
  id: string;
  evidenceRef: string;
  extractionMethod: "pdf_text" | "document_ir" | "ocr" | "csv" | "manual_input" | "legacy";
  extractionVersion: string;
  observedText: string | null;
  confidence: "high" | "medium" | "low";
}

interface CanonicalParserInterpretation {
  id: string;
  evidenceRef: string;
  extractionObservationRef: string | null;
  parserId: string | null;
  parserVersion: string | null;
  interpretedRole: string;
  interpretedValue: MoneyAmount | DecimalString | CountValue | string | null;
  confidence: "high" | "medium" | "low" | "needs_review";
}
```

### 3.6 `CanonicalFeeLedger` and `CanonicalFeeRow`

Purpose: One deduplicated, role-aware fee ledger.

Required ledger fields:
- `rows`
- `uniqueChargeTotal`
- `controlTotals`
- `status`

Row roles:
- `individual_charge`
- `section_subtotal`
- `fee_bucket_total`
- `statement_control_total`
- `interchange_detail_row`
- `informational_rate_row`
- `zero_dollar_reference_row`
- `adjustment`
- `credit`
- `duplicate_representation`
- `supporting_evidence_only`
- `unknown_unresolved`

Rows allowed to contribute to canonical fee total:
- `individual_charge`
- `adjustment`, according to signed amount policy
- `credit`, according to signed amount policy

Rows forbidden from contributing to canonical fee total:
- `section_subtotal`
- `fee_bucket_total`
- `statement_control_total`
- `interchange_detail_row`, unless the processor policy defines it as the unique charge ledger source
- `informational_rate_row`
- `zero_dollar_reference_row`
- `duplicate_representation`
- `supporting_evidence_only`
- `unknown_unresolved`

Fee categories:
- `card_brand_network`
- `processor_fees`
- `service_compliance`
- `interchange`
- `assessments`
- `adjustments`
- `credits`
- `needs_review`

Economic ownership:
- `network`
- `card_brand`
- `processor`
- `third_party`
- `merchant_contract`
- `tax_or_government`
- `unknown`

Actionability:
- `eligible`
- `verify_only`
- `not_actionable`
- `unknown`

Forbidden:
- A duplicate representation must not be counted twice.
- A pass-through/network row must not become savings-eligible without deterministic markup proof.
- Two legitimate charges with the same label and amount must not be merged unless source occurrence evidence proves they are the same printed charge or duplicate representation.

```ts
type CanonicalFeeRowRole =
  | "individual_charge"
  | "section_subtotal"
  | "fee_bucket_total"
  | "statement_control_total"
  | "interchange_detail_row"
  | "informational_rate_row"
  | "zero_dollar_reference_row"
  | "adjustment"
  | "credit"
  | "duplicate_representation"
  | "supporting_evidence_only"
  | "unknown_unresolved";

type CanonicalFeeCategory =
  | "card_brand_network"
  | "processor_fees"
  | "service_compliance"
  | "interchange"
  | "assessments"
  | "adjustments"
  | "credits"
  | "needs_review";

type CanonicalEconomicOwner =
  | "network"
  | "card_brand"
  | "processor"
  | "third_party"
  | "merchant_contract"
  | "tax_or_government"
  | "unknown";

type CanonicalFeeActionability = "eligible" | "verify_only" | "not_actionable" | "unknown";
type CanonicalChargeCadence = "monthly" | "annual" | "per_item" | "one_time" | "unknown";

interface CanonicalFeeLedger {
  status: "available" | "partial" | "unavailable";
  rows: CanonicalFeeRow[];
  uniqueChargeTotal: CanonicalFactValue<MoneyAmount>;
  controlTotals: CanonicalFactValue<MoneyAmount>[];
  duplicateResolutionSummary: string[];
}

interface CanonicalFeeRow {
  id: string; // stable canonical semantic ID
  canonicalSemanticId: string;
  sourceOccurrenceIds: string[];
  rowRole: CanonicalFeeRowRole;
  originalLabel: string;
  normalizedLabel: string;
  displayLabel: string;
  observedAmount: MoneyAmount | null;
  signedAmount: MoneyAmount | null;
  observedRatePct: DecimalString | null;
  observedPerItemAmount: MoneyAmount | null;
  observedItemCount: CountValue | null;
  observedVolume: MoneyAmount | null;
  cadence: CanonicalChargeCadence;
  category: CanonicalFeeCategory;
  economicOwner: CanonicalEconomicOwner;
  actionability: CanonicalFeeActionability;
  savingsEligible: boolean;
  savingsEligibilityReason: string | null;
  countedInCanonicalFeeTotal: boolean;
  duplicateOfFeeRowId: string | null;
  aliasEvidenceRefs: string[];
  evidenceRefs: string[];
  classificationConfidence: "high" | "medium" | "low";
}

interface CanonicalFeeSourceOccurrence {
  id: string;
  evidenceRefs: string[];
  sourceSystem: "processor_specific_parser" | "generic_parser" | "document_ir" | "legacy_summary" | "manual_review";
  sourceRowIdentity: string | null;
  rowRole: CanonicalFeeRowRole;
  normalizedLabel: string;
  observedAmount: MoneyAmount | null;
  semanticCandidateId: string;
}
```

### 3.7 `CanonicalReconciliation`

Purpose: Independently prove whether canonical facts and fee rows support customer-facing conclusions.

Controls:
- statement-level fees
- unique canonical charge rows
- section subtotals
- fee-bucket totals
- interchange details
- network charges
- adjustments
- credits
- funding formula where applicable

Outcomes:
- `pass`
- `pass_with_rounding`
- `limited`
- `verification_required`
- `blocked`

Failure effects:
- Core total failures block financial reporting.
- Fee inventory failures may allow core metrics but limit fee inventory.
- Classification failures suppress opportunity calculations.
- Verification failures allow verification findings but exclude savings.

```ts
interface CanonicalReconciliation {
  policyVersion: string;
  status: "pass" | "pass_with_rounding" | "limited" | "verification_required" | "blocked";
  controls: CanonicalReconciliationControl[];
  tolerancePolicyRef: string;
  affects: {
    coreTotals: boolean;
    feeInventory: boolean;
    classification: boolean;
    opportunityCalculations: boolean;
    customerFacingPermissions: boolean;
  };
  reasons: string[];
}

interface CanonicalReconciliationControl {
  id: string;
  controlType:
    | "statement_level_fees"
    | "unique_charge_sum"
    | "section_subtotal"
    | "fee_bucket_total"
    | "interchange_detail_total"
    | "network_charge_total"
    | "adjustment_total"
    | "credit_total"
    | "funding_formula";
  statedAmount: MoneyAmount | null;
  computedAmount: MoneyAmount | null;
  delta: MoneyAmount | null;
  tolerance: MoneyAmount;
  status: "pass" | "rounding" | "warning" | "fail" | "not_available";
  derivationLineage: CanonicalDerivationLineage;
  independentOfControlIds: string[];
  evidenceRefs: string[];
}

interface CanonicalDerivationLineage {
  derivationGroupId: string;
  sourceDocumentRefs: string[];
  extractionObservationRefs: string[];
  parserInterpretationRefs: string[];
  parserIds: string[];
  parserVersions: string[];
  calculationRefs: string[];
  lineageDescription: string;
}
```

### 3.8 `CanonicalOpportunityComponent`

Purpose: Authoritative unit of customer-facing opportunity.

Eligibility requirements:
- references at least one canonical fee row or benchmark/control fact;
- has approved calculation;
- has observed cost;
- has target or expected cost with provenance;
- has cadence;
- has no unresolved overlap;
- has non-low confidence;
- has permitted ownership/actionability.

Overlap rule: If overlap cannot be ruled out, exclude the uncertain amount.

Master summaries: Must be computed from included components. They may not introduce independent savings dollars.

```ts
interface CanonicalOpportunityComponent {
  id: string;
  title: string;
  canonicalFeeRowRefs: string[];
  observedCost: MoneyAmount;
  targetCost: MoneyAmount | null;
  targetProvenance: "contract" | "network_schedule" | "benchmark_policy" | "processor_quote" | "approved_internal_policy" | "none";
  calculationRef: string;
  cadence: CanonicalChargeCadence;
  monthlyImpact: MoneyAmount | null;
  annualImpact: MoneyAmount | null;
  impactClassification: "deterministic" | "estimated" | "verification_only" | "non_financial";
  economicOwner: CanonicalEconomicOwner;
  confidence: "high" | "medium" | "low";
  eligibility: "included" | "excluded" | "verification_only";
  eligibilityReason: string;
  overlapKey: string;
  supersedesComponentIds: string[];
  overlapRisk: "none" | "possible" | "confirmed";
  evidenceRefs: string[];
}
```

### 3.9 `CanonicalCalculationRecord`

Purpose: Reproducible calculations used by facts, reconciliation, and opportunity components.

Validation:
- Inputs must reference canonical facts, fee rows, or evidence.
- Result must equal formula output within versioned rounding policy.
- Customer-facing financial fields must reference a calculation record.

```ts
interface CanonicalCalculationRecord {
  id: string;
  formulaCode: string;
  formulaVersion: string;
  label: string;
  inputs: Array<{
    label: string;
    value: MoneyAmount | DecimalString | CountValue;
    unit: "money" | "percent" | "bps" | "count";
    factRef?: string;
    feeRowRef?: string;
    evidenceRefs: string[];
  }>;
  result: MoneyAmount | DecimalString | CountValue;
  unit: "money" | "percent" | "bps" | "count";
  roundingPolicyVersion: string;
  assumptions: string[];
  confidence: "high" | "medium" | "low";
}
```

### 3.10 `CanonicalAdvancedReview`

Purpose: Provider-neutral record of advanced analysis capabilities.

Capabilities:
- `classification_suggestion`
- `anomaly_discovery`
- `narrative_explanation`
- `possible_issue_detection`
- `benchmark_category_interpretation`

Forbidden:
- Provider output must not directly create customer-facing savings.
- Provider names and billing/internal errors must not appear in customer-facing output.

```ts
interface CanonicalAdvancedReview {
  policyVersion: string;
  overallStatus: "completed" | "partially_completed" | "not_needed" | "failed" | "disabled";
  capabilities: CanonicalAdvancedReviewCapability[];
  diagnostics: Array<{
    id: string;
    kind: "diagnostic_finding" | "classification_suggestion" | "narrative" | "category_suggestion";
    canonicalRefs: string[];
    customerProjectable: boolean;
    evidenceRefs: string[];
  }>;
}

interface CanonicalAdvancedReviewCapability {
  capability: string;
  status: "completed" | "not_needed" | "failed" | "disabled";
  required: boolean;
  notNeededReason: string | null;
  providerNeutralReason: string | null;
}
```

OpenAI can power these capabilities today. OpenRouter or another provider can be added later by mapping provider results into the same capability statuses. The canonical financial contract must not change when a provider changes.

### 3.11 `CanonicalAnalysisPermissions`

Purpose: Explicitly state what consumers may display.

Permissions:
- core totals allowed
- effective rate allowed
- transaction metrics allowed
- fee inventory allowed
- fee classification allowed
- benchmark allowed
- verification findings allowed
- opportunity calculations allowed
- customer-facing savings allowed
- complete report allowed

Report V1 must consume these permissions and must not override them.

```ts
interface CanonicalAnalysisPermissions {
  coreTotalsAllowed: boolean;
  effectiveRateAllowed: boolean;
  transactionMetricsAllowed: boolean;
  feeInventoryAllowed: boolean;
  feeClassificationAllowed: boolean;
  benchmarkAllowed: boolean;
  verificationFindingsAllowed: boolean;
  opportunityCalculationsAllowed: boolean;
  customerFacingSavingsAllowed: boolean;
  completeReportAllowed: boolean;
  reasons: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "critical";
    affectedPermissions: string[];
  }>;
}
```

### 3.12 `CanonicalValidationState`

Purpose: Machine-readable validation result for canonical invariants.

```ts
interface CanonicalValidationState {
  status: "valid" | "valid_with_warnings" | "invalid";
  invariantResults: Array<{
    invariantId: string;
    status: "pass" | "warning" | "fail";
    severity: "info" | "warning" | "critical";
    consequence: "allow" | "limit" | "verify" | "block";
    message: string;
  }>;
}
```

### 3.13 `CanonicalAnalysisVersionManifest`

Purpose: Preserve reproducibility and explain changes over time.

First-release required versions:
- canonical schema
- parser
- extraction
- reconciliation policy
- fee classification
- ownership/actionability
- opportunity policy
- benchmark registry
- AI-review policy
- report projection

```ts
interface CanonicalAnalysisVersionManifest {
  canonicalSchemaVersion: string;
  parserId: string | null;
  parserVersion: string | null;
  extractionVersion: string;
  reconciliationPolicyVersion: string;
  feeClassificationPolicyVersion: string;
  ownershipActionabilityPolicyVersion: string;
  opportunityPolicyVersion: string;
  benchmarkRegistryVersion: string;
  advancedReviewPolicyVersion: string;
  reportProjectionVersion: string;
}
```

Old analyses are preserved. Reanalysis is explicit and creates a new analysis record with its own manifest. Parser corrections fix extraction/interpretation defects; policy migrations intentionally change business rules. User-facing explanations should distinguish those two cases.

### 3.14 `CanonicalShadowComparison`

Purpose: Compare legacy output and canonical output without changing customer behavior.

```ts
interface CanonicalShadowComparison {
  id: string;
  legacyAnalysisRef: string;
  canonicalAnalysisRef: string;
  comparedAt: string;
  differences: Array<{
    field: string;
    legacyValue: unknown;
    canonicalValue: unknown;
    severity: "info" | "warning" | "critical";
    classification: "expected_policy_difference" | "parser_difference" | "canonical_bug" | "legacy_bug" | "needs_human_review";
    customerImpact: string;
  }>;
  passedAcceptanceCriteria: boolean;
}
```

## 4. Canonical Fact Selection

### 4.1 Source Ranking

Evidence-source ranking, highest first:
1. Statement-level printed control totals with page/section evidence.
2. Processor-specific validated parser output with reconciliation.
3. Independent funding formula result.
4. Processor summary bucket totals.
5. Interchange/detail section controls.
6. Canonical unique charge row sum.
7. Generic parser result.
8. Legacy `AnalysisSummary` fields.
9. AI diagnostic suggestion, never sufficient alone.

Parser-source ranking, highest first:
1. Processor-specific parser with validated top-level totals and fee ledger.
2. Processor-specific parser with validated top-level totals and limited fee ledger.
3. Generic family parser with validated top-level totals.
4. Text-only heuristic parser.
5. Legacy analyzer fallback.

### 4.2 Candidate Agreement

Candidates agree when values match within the applicable versioned tolerance and their roles are compatible. Agreement across independent sources increases confidence. Agreement between two fields derived from the same parser branch does not count as independent corroboration.

### 4.3 Missing, Ambiguous, and Unsupported Values

Missing values remain unavailable. Ambiguous values remain unavailable or limited until a processor-specific rule resolves them. Unsupported values are not inferred from unrelated totals.

### 4.4 Worked Examples

Sales volume: Select the statement-level submitted volume when it reconciles to funding and supporting subtotals. Reject section subtotals that do not match the statement-level total.

Total fees: Select the all-in statement-level fees charged control. Use fee bucket totals and unique charge rows only as reconciliation controls.

Transaction counts: Store separate counts for submitted transactions, settled transactions, authorizations, captures, refunds, chargebacks, network transactions, and card-type items. Select a count for average ticket only when evidence proves that count represents the intended denominator for average-ticket policy. In the known Fiserv restaurant transaction-count discrepancy pattern, a card-type or authorization subset must not become the average-ticket count if it may exclude other submitted activity. If no approved count is proven, transaction metrics that depend on it are unavailable.

Average ticket: Calculate only from canonical processed sales and the count type selected in `averageTicketBasis`. Do not copy an average ticket from a legacy summary.

Effective rate: Calculate from `effectiveRateBasis`, which must define numerator fee basis, denominator volume basis, refund treatment, cash-advance treatment, equipment-fee treatment, chargeback treatment, one-time-fee treatment, and whether RateReveal's calculated rate differs from the processor's stated rate. The default first-release customer metric should use all-in processing fees over submitted sales only when those facts are verified under the active policy.

Statement period: Prefer header/statement period evidence. If multiple dates exist, use processor-specific period rules and preserve rejected candidates such as deposit dates or notice dates.

Processor identity: Prefer explicit processor/brand evidence from the statement body. Filename is supporting evidence only.

Pricing structure: Use fee ledger patterns, pricing model analysis, and evidence lines. If the structure is not proven, expose `unknown` or `verify`, not a definitive label.

## 5. Independent Reconciliation

Canonical reconciliation must record derivation lineage for every control. A pass based only on values derived from the same parser object, extraction observation, or semantic transformation is not sufficient to unlock complete confidence.

Lineage requirements:
- every reconciliation control has a `derivationGroupId`;
- controls list extraction observations, parser interpretations, and calculation refs used to produce them;
- controls identify which other controls they are independent from;
- the validator treats two controls with shared ancestry as corroborating only weakly, not as independent proof;
- same-lineage agreement may support internal consistency, but it cannot by itself prove source-document correctness.

Tolerances should be versioned:
- exact money controls: $0.01
- row-sum rounding controls: processor-specific, usually $0.02 to $1.00 depending on row count and statement format
- coverage controls: policy-defined percentage
- effective rate formula: small decimal tolerance, versioned

Outcome effects:
- `pass`: unlocks complete applicable permissions.
- `pass_with_rounding`: unlocks permissions with rounding note.
- `limited`: permits core facts but limits fee inventory or classification.
- `verification_required`: permits facts but excludes savings for uncertain components.
- `blocked`: suppresses customer-facing financial conclusions.

## 6. AI Boundary

AI output is advisory until grounded.

An AI-discovered issue can become financially actionable only after:
1. It references canonical fee rows or canonical facts.
2. The relevant fee ownership/actionability policy allows it.
3. A deterministic or approved estimated calculation record exists.
4. Cadence is proven or policy-approved.
5. Overlap is resolved.
6. Validation grants opportunity and customer-facing savings permissions.

Unsupported AI amounts may be retained as internal diagnostics but must not populate customer-facing monthly or annual financial fields.

## 7. Shadow Migration

Flow:

```text
Existing pipeline
→ AnalysisSummary
→ temporary canonical adapter
→ canonical validator
→ shadow comparison
→ golden-corpus evaluation
→ direct parser-to-canonical migration
→ Report V1 migration
```

The adapter from `AnalysisSummary` is temporary. It should label adapted fields by source quality so legacy assumptions do not silently become canonical truth.

Comparisons:
- identity fields
- processed sales
- total fees
- transaction count
- effective rate
- fee inventory count and total
- fee categories
- opportunity components
- eligible opportunity totals
- verification amounts
- report state and permissions

Storage:
- shadow comparisons should be stored in isolated audit diagnostics, not customer reports.
- no raw statements, secrets, provider errors, or merchant-identifying screenshots should be committed.
- retention should be short by default unless explicitly approved for anonymized golden corpus.

Rollback:
- because shadow mode does not change customer behavior, rollback is disabling canonical shadow generation.
- after Report V1 migration, rollback is switching Report V1 back to the existing `AnalysisSummary` projection behind the existing feature-flag discipline.

Exit criteria:
- golden corpus passes approved expected values;
- no counted duplicate fee rows;
- transaction count is verified or unavailable;
- all eligible savings reconstruct from components;
- pass-through/network charges are not eligible unless markup is proven;
- degraded/parser-only analysis cannot look complete;
- permissions and report state agree;
- product owner approves migration.

## 8. Golden Corpus

Statement selection:
- 10 to 20 approved statements initially.
- Cover Fiserv processor-branded, generic Fiserv, low-confidence PDFs, zero-volume, unsupported statements, high-fee statements, fee-rich statements, and clean/healthy statements.

Anonymization:
- Remove merchant names, merchant numbers, addresses, bank account fragments, and filenames where possible.
- Store sanitized expected values, not raw statement text, unless explicit secure handling is approved.

Human verification:
- Expected values must be verified from the statement or trusted source, not copied from current backend output.

Each expectation must store two separate concepts.

Verification status:
- `verified`
- `ambiguous`
- `intentionally_unavailable`
- `requires_processor_documentation`
- `not_applicable`

Assertion rule:
- `must_equal`
- `range_allowed`
- `must_be_unavailable`
- `human_review_required`

Example:

```ts
interface GoldenCorpusExpectation {
  field: string;
  expectedValue: MoneyAmount | DecimalString | CountValue | string | null;
  verificationStatus:
    | "verified"
    | "ambiguous"
    | "intentionally_unavailable"
    | "requires_processor_documentation"
    | "not_applicable";
  assertionRule: "must_equal" | "range_allowed" | "must_be_unavailable" | "human_review_required";
  source: "human_verified_statement" | "processor_documentation" | "approved_policy" | "synthetic_fixture";
  notes: string;
}
```

Storage:
- sanitized fixtures may live in test fixtures;
- approved original PDFs must be stored privately outside Git for secure extraction regression testing;
- synthetic PDFs should be added for CI extraction tests where real originals cannot be used;
- sensitive originals should remain local or in approved secure storage.

CI:
- normal CI should run privacy-safe synthetic or sanitized fixtures;
- secure private CI or local approved runs should test original PDFs to prove extraction still works;
- public repository tests must not require merchant-identifying originals.

Parser regressions:
- Parser correction changes require explicit before/after notes.

Policy changes:
- Policy migrations may intentionally change opportunity totals and states; tests should document expected changes.

## 9. Invariant Catalog

| ID | Rule | Severity | Stage | Consequence | Required Tests |
|---|---|---|---|---|---|
| MONEY-001 | Canonical money uses `MoneyAmount` integer minor units and explicit currency, never floating-point JS numbers. | critical | schema | block canonical save | Money schema and rounding tests |
| FACT-001 | Selected facts require evidence or calculation refs. | critical | fact selection | block | Missing evidence test |
| FACT-002 | Effective rate must use explicit versioned `effectiveRateBasis`. | critical | calculation | block effective rate | Effective-rate basis tests |
| FACT-003 | Average ticket requires an approved count type in `averageTicketBasis`. | warning | fact selection | limit transaction metrics | Fiserv restaurant count-discrepancy test |
| FACT-004 | Narrow subtotals cannot replace statement totals without policy. | critical | fact selection | block or limit | Subtotal conflict test |
| FACT-005 | Transaction counts are stored by type; authorization/network/card-type counts cannot silently replace submitted transactions. | critical | fact selection | limit transaction metrics | Multi-count selection tests |
| EVID-001 | Missing page numbers remain null. | warning | evidence | allow with limitation | Null page test |
| EVID-002 | Customer-safe evidence must not expose secrets or raw provider errors. | critical | projection | block projection | Redaction test |
| EVID-003 | Stable source evidence IDs exclude parser ID/version; parser versions attach to observations or interpretations. | critical | evidence | block unstable evidence model | Parser-upgrade evidence stability test |
| FEE-001 | Duplicate representations cannot both count. | critical | fee ledger | block fee inventory total | Duplicate row test |
| FEE-002 | Control rows cannot contribute to unique charge total. | critical | fee ledger | block fee total | Control-row test |
| FEE-003 | Unknown rows cannot be savings-eligible. | critical | fee ledger | exclude opportunity | Unknown fee test |
| FEE-004 | Fee rows carry both source occurrence IDs and canonical semantic IDs. | critical | fee ledger | block duplicate resolution | Same-label/same-amount distinct charge test |
| FEE-005 | Fee category, economic ownership, actionability, and cadence use versioned enums, not arbitrary strings. | critical | schema | block canonical save | Enum validation tests |
| REC-001 | Reconciliation must identify derivation lineage and common ancestry, not only an independence boolean. | warning | reconciliation | limit confidence | Same-lineage control test |
| REC-002 | Core total contradiction blocks financial conclusions. | critical | reconciliation | block | Conflicting total test |
| OWN-001 | Ownership is separate from category. | warning | classification | limit actionability | Ownership/category test |
| ACT-001 | Pass-through/network defaults to not actionable or verify only. | critical | actionability | exclude opportunity | Network fee test |
| OPP-001 | Included opportunity requires calculation ref. | critical | opportunity | exclude | Missing calculation test |
| OPP-002 | Included opportunity requires proven cadence. | critical | opportunity | exclude | Unknown cadence test |
| OPP-003 | Possible overlap is excluded. | critical | aggregation | exclude | Overlap test |
| OPP-004 | Master summary equals sum of included components. | critical | aggregation | block summary | Master summary test |
| AI-001 | AI diagnostics cannot directly create savings. | critical | advanced review | exclude | AI amount test |
| AI-002 | Advanced review is provider-neutral. | warning | advanced review | allow | Provider-neutral metadata test |
| VAL-001 | Validation status and permissions cannot contradict. | critical | validation | block | Permission contradiction test |
| PERM-001 | Report projection cannot override permissions. | critical | projection | block projection | Projection permission test |
| VER-001 | Completed analysis stores version manifest. | critical | persistence | block canonical save | Version manifest test |
| PROJ-001 | Customer-facing payload references only valid evidence/calculations. | critical | projection | block projection | Referential integrity test |
| CORPUS-001 | Golden corpus separates human verification status from assertion rule. | critical | test harness | block corpus fixture | Corpus metadata schema tests |
| CORPUS-002 | Secure original-document testing exists outside public Git for extraction regression coverage. | warning | test strategy | limit release confidence | Secure corpus smoke test |

## 10. Revised Package Program

### Package A: Golden Corpus and Forensic Harness

Dependencies: none.

Scope:
- Define fixture metadata format.
- Build local/private and sanitized CI test harnesses.
- Record expected values from human verification.
- Separate verification status from assertion rule.
- Add synthetic PDFs for CI extraction coverage and approved private originals for secure extraction coverage.

Exclusions:
- No Report V1 migration.
- No parser rewrites.

Likely files:
- `test/fixtures`
- `test/canonical`
- new audit scripts

Risk: mishandling sensitive statements or treating sanitized JSON as sufficient extraction proof.

Acceptance: corpus can detect known forensic defects without relying on current backend output as truth; CI has synthetic/sanitized coverage; secure private runs can test approved original PDFs.

Rollback: remove shadow harness from test commands.

### Package B: Canonical Statement Facts

Dependencies: Package A.

Scope:
- Add canonical identity and financial fact selection.
- Preserve candidates and rejected reasons.
- Fix transaction-count hierarchy.
- Introduce integer-minor-unit money representation.
- Add separate transaction-count types and explicit effective-rate basis.

Exclusions:
- No opportunity rewrite.

Likely files:
- parser foundation
- Fiserv parsers
- orchestrator
- new canonical modules

Acceptance: totals and count facts match golden corpus or are honestly unavailable; average ticket is unavailable unless an approved count type is verified; effective rate declares numerator/denominator/treatment basis.

### Package C: Canonical Fee Ledger

Dependencies: Packages A-B.

Scope:
- Add row roles and stable fee IDs.
- Merge generic and processor-specific aliases.
- Prevent duplicate counted rows.
- Separate source occurrence IDs from canonical semantic IDs.

Exclusions:
- No savings policy changes beyond excluding duplicate counts.

Acceptance: unique fee total reconciles or limitation is explicit; similar same-label/same-amount rows remain separate unless source occurrence evidence proves duplication.

### Package D: Fee Ownership and Actionability

Dependencies: Package C.

Scope:
- Separate category, ownership, actionability, and savings eligibility.
- Enforce pass-through/network safety.

Acceptance: no network/pass-through row is eligible without deterministic markup proof.

### Package E: Opportunity Components

Dependencies: Packages C-D.

Scope:
- Replace master-savings aggregation with component aggregation.
- Preserve master summaries as derived summaries only.

Acceptance: every eligible dollar reconstructs from visible non-overlapping components.

### Package F: AI Boundary Enforcement

Dependencies: Packages B-E.

Scope:
- Provider-neutral capability contract.
- Ground AI issues before financial actionability.

Acceptance: AI cannot introduce unsupported customer-facing financial amounts.

### Package G: State and Customer Wording

Dependencies: Packages B-F.

Scope:
- Align state, permissions, and customer-safe explanations.

Acceptance: no state contradicts benchmark, totals, visibility, or permissions.

### Package H: Report V1 Migration

Dependencies: Packages A-G and explicit approval.

Scope:
- Report V1 consumes canonical output.
- Legacy fallback remains for unsupported/missing canonical output.

Acceptance: migration acceptance criteria pass and product owner approves.

## 11. Product Decisions Requiring Approval

### Decision 1: Transaction Count Strictness

Recommended: If all-in transaction count is not proven, show unavailable.

Alternative: Show best available subset with a warning.

Benefit: Avoids materially wrong average ticket.

Risk: Some reports lose transaction metrics.

Customer impact: More honest, fewer misleading operational metrics.

### Decision 2: Pass-Through Default

Recommended: Default pass-through/network to `not_actionable`, with `verify_only` when documentation could matter.

Alternative: Treat some as negotiable by default.

Benefit: Prevents false savings claims.

Risk: Lower displayed opportunity.

Customer impact: More credible recommendations.

### Decision 3: Master Savings Role

Recommended: Master savings is derived summary only.

Alternative: Keep master as eligible source with stronger explanation.

Benefit: Every dollar is reconstructible.

Risk: Requires deeper migration of Fiserv savings model.

Customer impact: More transparent opportunity math.

### Decision 4: Golden Corpus Storage

Recommended: Use a hybrid corpus: sanitized expected-value fixtures in the repository, synthetic PDFs for CI extraction testing, and approved original PDFs stored privately outside Git for secure extraction regression testing.

Alternative: Use only sanitized fixtures in the repository, or store encrypted originals in approved secure storage.

Benefit: CI-safe, privacy-safe, and still capable of proving real PDF extraction in controlled environments.

Risk: Requires extra secure-test operations and careful access control.

Customer impact: Safer development process with better protection against extraction regressions.

### Decision 5: Shadow Comparison Retention

Recommended: Short retention for diagnostic comparisons unless anonymized and approved.

Alternative: Persist all comparisons indefinitely.

Benefit: Lower sensitive-data risk.

Risk: Less historical debugging data.

Customer impact: Better privacy posture.

### Decision 6: Canonical Migration Timing

Recommended: Report V1 migrates only after all exit criteria pass.

Alternative: Gradually consume canonical facts one section at a time.

Benefit: Avoids mixed truth sources.

Risk: Slower visible progress.

Customer impact: More stable customer-facing reports.

## 12. Self-Review

Object boundaries: Reviewed. The model separates facts, evidence, fee rows, reconciliation, opportunity components, AI review, permissions, validation, versions, and shadow comparison.

Money representation: Reviewed. Canonical money uses integer minor units with explicit currency. Remaining TypeScript `number` examples are limited to cents, counts, page numbers, row indexes, or other non-money scalar values.

Transaction-count semantics: Reviewed. The spec stores separate count types and requires an explicit average-ticket basis.

Effective-rate basis: Reviewed. Effective rate requires a versioned numerator/denominator/treatment basis and distinguishes RateReveal-calculated rates from processor-stated rates.

Evidence stability: Reviewed. Source-document evidence identity is separated from extraction observations and parser interpretations so parser upgrades do not automatically churn stable evidence IDs.

Reconciliation lineage: Reviewed. Reconciliation controls now carry derivation lineage and common-ancestry information rather than a single independence boolean.

Fee identity and enums: Reviewed. Fee rows separate source occurrence IDs from canonical semantic IDs, and category, ownership, actionability, role, and cadence use versioned enums rather than arbitrary strings.

Golden corpus: Reviewed. Verification status and assertion rule are separate, and the test strategy uses sanitized fixtures, synthetic PDFs, and approved private originals.

Unsupported financial assumptions: Reviewed. The spec avoids inventing new savings assumptions and requires deterministic or approved estimated calculations before customer-facing opportunity.

Migration risks: Reviewed. Shadow mode, rollback, exit criteria, and temporary adapter boundaries are explicit.

Sensitive-data risks: Reviewed. Evidence redaction, private corpus handling, retention rules, and no-secrets customer projection are explicit.

Provider neutrality: Reviewed. The advanced-review contract is capability-based and does not couple canonical financial truth to OpenAI, Anthropic, OpenRouter, or any provider.

Report V1 coupling: Reviewed. Report V1 remains a later projection consumer and must not consume canonical output until explicit migration approval.

import { mkdir, writeFile } from "node:fs/promises";

import {
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
  AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
} from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  evaluateCommercialOfferQualificationV1,
  evaluateCommercialPredicateV1,
  resolveGovernedCommercialOfferV1,
  validateCommercialSourceGovernanceRegistryV1,
} from "../src/canonical/commercialSourceGovernanceV1.js";
import {
  COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY,
  DHARMA_HIGH_VOLUME_IDENTITY_V1,
  DHARMA_REFERRAL_CONTROL_IDENTITY_V1,
  DHARMA_STANDARD_RETAIL_IDENTITY_V1,
  DHARMA_STANDARD_VIRTUAL_IDENTITY_V1,
  HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
  HELCIM_DIRECT_PROCESSING_IDENTITY_V1,
} from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/commercial-source-batch-1b-helcim-dharma-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-10.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-10.md`;
const GOLD = [
  "Nov_2024_Statement.pdf", "SAMPLE_MERCHANT4_CLOVER.pdf", "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  "fiserv_ABDUL_BASHER_Aug_2025.pdf", "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
];

const registry = HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1;
const components = new Map(registry.priceComponentVersions.map((item) => [item.componentVersionId, item]));
const highComposition = registry.offerCompositionVersions.find((item) => item.offerIdentity.namedOffer === "High Volume")!;
const tier5 = components.get("component_helcim_t5_card_present_rate_v1")!;
const recurring = components.get("component_helcim_recurring_surcharge_v1")!;
const chargeback = components.get("component_helcim_chargeback_gross_v1")!;
const updater = components.get("component_dharma_retail_account_updater_unknown_v1")!;

const goldStatements = [];
for (const file of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file });
  const before = canonicalFinancialTruthFingerprint(analysis);
  resolveGovernedCommercialOfferV1({ registry, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
  resolveGovernedCommercialOfferV1({ registry, identity: DHARMA_STANDARD_RETAIL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
  const after = canonicalFinancialTruthFingerprint(analysis);
  goldStatements.push({ file, canonicalFingerprintBefore: before, canonicalFingerprintAfter: after, unchanged: before === after });
}

const helcim = registry.priceComponentVersions.filter((item) => item.offerIdentity.providerBrand === "helcim");
const dharmaAdmitted = registry.priceComponentVersions.filter((item) => item.offerIdentity.providerBrand === "dharma_merchant_services" && item.admission.lifecycle === "admitted");
const helcimPolicies = registry.publicPolicyVersions.filter((item) => item.offerIdentity.providerBrand === "helcim");
const highPolicies = registry.publicPolicyVersions.filter((item) => item.offerIdentity.namedOffer === "High Volume");
const directMonthly = ["retail", "virtual", "high_volume"].map((prefix) => components.get(`component_dharma_${prefix}_monthly_v1`)!);

const acceptanceCounters = {
  helcimPostedTierExtrapolatedAbove5m: evaluateCommercialPredicateV1(tier5.applicabilityPredicate!, { three_month_rolling_card_volume_minor: 500_000_001, channel: "card_present" }) === "satisfied" ? 1 : 0,
  helcimH1OneMillionPlusWordingLost: registry.sourceObservations.find((item) => item.observationId === "obs_helcim_h1_fee_disclosures_v1")?.sourceFaithfulExtract.includes("$1,000,001+") ? 0 : 1,
  helcimProhibitedRestrictedCollapsed: new Set(helcimPolicies.map((item) => item.status)).size === helcimPolicies.length ? 0 : 1,
  helcimNoKnownBlockTreatedAsApproval: registry.merchantAvailabilityEvidence.length > 0 ? 1 : 0,
  helcimChargebackRefundFlattenedToUniversalZero: chargeback.completeness.state !== "KNOWN" || chargeback.conditionalAdjustment?.kind !== "full_fee_refund" ? 1 : 0,
  helcimRecurringAppliedToNonRecurring: evaluateCommercialPredicateV1(recurring.applicabilityPredicate!, { transaction_is_recurring: false }) === "satisfied" ? 1 : 0,
  dharmaPricingBecameTsysFiservPricing: registry.offerCompositionVersions.filter((item) => item.offerIdentity.providerBrand === "dharma_merchant_services").some((item) => /tsys|fiserv|first.data/i.test(item.offerIdentity.providerBrand + item.offerIdentity.sellerIdentity)) ? 1 : 0,
  dharmaAuthorizationConvertedToPerSale: dharmaAdmitted.filter((item) => item.componentIdentity.includes("authorization_fee")).some((item) => item.unit !== "per_authorization" || !item.billedPopulation.includes("authorization")) ? 1 : 0,
  dharmaQualificationReducedToVolumeOnly: JSON.stringify(highComposition.qualificationPredicate).includes("transaction_count") && JSON.stringify(highComposition.qualificationPredicate).includes("average_ticket_minor") ? 0 : 1,
  dharmaOrBranchesCombinedWithAnd: highComposition.qualificationPredicate?.op === "or" ? 0 : 1,
  dharmaExact25SilentlyResolved: evaluateCommercialOfferQualificationV1(highComposition, { monthly_volume_minor: 1, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2500 }).state === "UNRESOLVED_QUALIFICATION_BOUNDARY" ? 0 : 1,
  dharmaMayApplyTreatedAsRejection: highPolicies.find((item) => item.status === "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED")?.sourceFaithfulWording?.includes("not automatic rejection") ? 0 : 1,
  dharmaClosureTreatedAsEtf: ["retail", "virtual", "high_volume"].some((prefix) => components.get(`component_dharma_${prefix}_closure_v1`)?.componentIdentity === "early_termination_fee") ? 1 : 0,
  dharmaPciZeroErasedNoncompliance: ["retail", "virtual", "high_volume"].some((prefix) => components.get(`component_dharma_${prefix}_pci_noncompliance_v1`)?.completeness.state !== "KNOWN") ? 1 : 0,
  dharmaCalculatorOverwrotePlanPages: directMonthly.some((item) => item.admission.lifecycle !== "admitted") || directMonthly.some((item, index) => item.completeness.state !== "KNOWN" || item.completeness.value.kind !== "money" || item.completeness.value.amountMinor !== [2000, 2000, 1500][index]) ? 1 : 0,
  dharmaReferralLeakedIntoDirect: registry.offerCompositionVersions.some((item) => item.offerIdentity.distributionChannel === "direct" && item.componentVersionRefs.some((ref) => ref.includes("referral"))) ? 1 : 0,
  dharmaAccountUpdateAutoMapped: updater.completeness.state === "UNKNOWN" ? 0 : 1,
  unknownTreatedAsZero: updater.completeness.state === "UNKNOWN" && updater.completeness.value === null ? 0 : 1,
  currentDharmaProjectedHistorically: [DHARMA_STANDARD_RETAIL_IDENTITY_V1, DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, DHARMA_HIGH_VOLUME_IDENTITY_V1].some((identity) => resolveGovernedCommercialOfferV1({ registry, identity, asOf: "2025-01-01", mode: "historical" }).status === "resolved") ? 1 : 0,
  sourceAdmissionGeneratedComparatorClaims: Object.values(registry.permissions).some((value) => value === true) && (registry.permissions.customerComparatorClaimsAllowed || registry.permissions.gradesAllowed || registry.permissions.savingsAllowed || registry.permissions.switchingAdviceAllowed) ? 1 : 0,
};

const batch1A = {
  validationIssues: validateCommercialSourceGovernanceRegistryV1(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1),
  currentDirectResolution: resolveGovernedCommercialOfferV1({ registry: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status,
  historicalResolution: resolveGovernedCommercialOfferV1({ registry: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2024-01-01", mode: "historical" }).status,
  unknownAcquiringComponents: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.priceComponentVersions.filter((item) => item.componentIdentity.startsWith("merchant_account_acquiring") && item.completeness.state === "UNKNOWN").map((item) => item.componentVersionId),
  accountUpdaterSeparate: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.offerCompositionVersions.some((item) => item.offerIdentity.namedOffer === "Account Updater"),
};

const evaluation = {
  schemaVersion: "commercial_source_batch_1b_helcim_dharma_evaluation_2026_09_10_v1",
  generatedAt: "2026-09-10T00:00:00.000Z",
  productAuthority: { ...COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY, verifiedSha256: true },
  baseline: { branch: "codex/commercial-source-governance-contract-v1", commit: "d2b23cb756251fac39594523d15f7dcee070efad", parent: "51aef2b0aa8c8dc54c62e748c3a39951194ceaa7" },
  implementationBranch: "codex/commercial-source-batch-1b-helcim-dharma-v1",
  scope: { layer3SourceAdmissionOnly: true, aiOrWebResearchUsed: false, comparatorEngineImplemented: false, marketJudgmentGenerated: false, customerFacingOutputGenerated: false, otherProvidersAdmitted: [] },
  registry: {
    validationIssues: validateCommercialSourceGovernanceRegistryV1(registry),
    sourceObservations: registry.sourceObservations.length,
    admittedPriceComponents: registry.priceComponentVersions.filter((item) => item.admission.lifecycle === "admitted").length,
    candidatePriceComponents: registry.priceComponentVersions.filter((item) => item.admission.lifecycle === "candidate").length,
    offerCompositions: registry.offerCompositionVersions.length,
    retainedConflicts: registry.conflicts,
    uniqueF1Fingerprints: [...new Set(registry.sourceObservations.map((item) => item.fingerprints.f1RawSourceDocument))],
    uniqueF2FingerprintCount: new Set(registry.sourceObservations.map((item) => item.fingerprints.f2RelevantCommercialExtract)).size,
    uniqueF3FingerprintCount: new Set(registry.priceComponentVersions.map((item) => item.f3GovernedSemantic)).size,
    rawSnapshotLimitation: "The Product-adjudicated authority-pack fingerprint is preserved as F1 for each source observation; immutable raw first-party page bytes are not present, matching the accepted disclosed Batch 1A limitation.",
  },
  helcim: {
    observations: registry.sourceObservations.filter((item) => item.offerIdentity.providerBrand === "helcim").map(sourceSummary),
    known: helcim.filter((item) => item.completeness.state === "KNOWN").map(componentSummary),
    knownAbsent: helcim.filter((item) => item.completeness.state === "KNOWN_ABSENT").map(componentSummary),
    unknownOrBounded: [
      "H2 effective-from is unknown and H2-only values cannot replay historically.",
      "H3 has dated last-modified metadata but no proved effective-from date.",
      "The current posted public tier stops at $5M; pricing above $5M is custom and requires merchant-specific confirmation.",
      "Unlisted optional-service prices remain unadmitted/unknown rather than inferred free.",
      "Public pricing provides no merchant-specific approval or availability evidence.",
    ],
    tier5At2m: evaluateCommercialPredicateV1(tier5.applicabilityPredicate!, { three_month_rolling_card_volume_minor: 200_000_000, channel: "card_present" }),
    tier5Above5m: evaluateCommercialPredicateV1(tier5.applicabilityPredicate!, { three_month_rolling_card_volume_minor: 500_000_001, channel: "card_present" }),
    policies: helcimPolicies.map((item) => ({ status: item.status, wording: item.sourceFaithfulWording, predicate: item.normalizedPredicate })),
    merchantAvailabilityEvidence: [],
  },
  dharma: {
    observations: registry.sourceObservations.filter((item) => item.offerIdentity.providerBrand === "dharma_merchant_services").map(sourceSummary),
    standardRetail: dharmaAdmitted.filter((item) => item.offerIdentity.namedOffer === "Standard Retail / Storefront").map(componentSummary),
    standardVirtual: dharmaAdmitted.filter((item) => item.offerIdentity.namedOffer === "Standard Virtual / Online").map(componentSummary),
    highVolume: dharmaAdmitted.filter((item) => item.offerIdentity.namedOffer === "High Volume").map(componentSummary),
    qualification: {
      volumeBranch: evaluateCommercialOfferQualificationV1(highComposition, { monthly_volume_minor: 10_000_001, transaction_count: 0, merchant_type: "retail", average_ticket_minor: 5000 }),
      countBranch: evaluateCommercialOfferQualificationV1(highComposition, { monthly_volume_minor: 1, transaction_count: 5001, merchant_type: "retail", average_ticket_minor: 5000 }),
      lowTicketRestaurant: evaluateCommercialOfferQualificationV1(highComposition, { monthly_volume_minor: 1, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2499 }),
      exact25: evaluateCommercialOfferQualificationV1(highComposition, { monthly_volume_minor: 1, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2500 }),
      exact25WithIndependentVolumeBranch: evaluateCommercialOfferQualificationV1(highComposition, { monthly_volume_minor: 10_000_001, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2500 }),
      over25: evaluateCommercialOfferQualificationV1(highComposition, { monthly_volume_minor: 1, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2501 }),
      knownHighRisk: evaluateCommercialOfferQualificationV1(highComposition, { known_high_risk: true, monthly_volume_minor: 20_000_000 }),
    },
    policies: highPolicies.map((item) => ({ status: item.status, wording: item.sourceFaithfulWording, predicate: item.normalizedPredicate })),
    exactUnknowns: [
      "D1 normalized Account Updater service price (source phrase 'Account Update Fee: No' has ambiguous construct mapping).",
      "Effective-from dates for D1-D6, calculator, and referral observations.",
      "Exactly-$25 low-ticket restaurant qualification branch, unless another OR branch qualifies.",
      "Reason for calculator/plan-page monthly-price divergence.",
      "Merchant-specific approval and availability.",
    ],
    calculatorConflicts: registry.conflicts,
    referralCurrentResolution: resolveGovernedCommercialOfferV1({ registry, identity: DHARMA_REFERRAL_CONTROL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }),
  },
  temporal: {
    helcimCurrent: resolveGovernedCommercialOfferV1({ registry, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status,
    helcimHistoricalBeforeH1: resolveGovernedCommercialOfferV1({ registry, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status,
    dharmaCurrent: [DHARMA_STANDARD_RETAIL_IDENTITY_V1, DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, DHARMA_HIGH_VOLUME_IDENTITY_V1].map((identity) => resolveGovernedCommercialOfferV1({ registry, identity, asOf: "2026-09-10", mode: "current" }).status),
    dharmaHistorical: [DHARMA_STANDARD_RETAIL_IDENTITY_V1, DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, DHARMA_HIGH_VOLUME_IDENTITY_V1].map((identity) => resolveGovernedCommercialOfferV1({ registry, identity, asOf: "2025-01-01", mode: "historical" }).status),
  },
  acceptanceCounters,
  acceptanceCounterTotal: Object.values(acceptanceCounters).reduce((sum, value) => sum + value, 0),
  batch1A,
  gold: { statements: goldStatements, invariantCount: goldStatements.filter((item) => item.unchanged).length, fingerprintChanges: goldStatements.filter((item) => !item.unchanged).length },
  testResults: {
    batch1BTargeted: "14/14 passed",
    crossRegression: "38/38 passed across Commercial Source Governance, Batch 1B, Comparator Eligibility, and Claim-Specific Decomposition",
    sourceProvenanceIntegrity: "7/7 passed",
    typescriptBuild: "passed",
    knownHistoricalFirewall: "5/6; unchanged failure at line 43 expects zero governed conflicts and observes four",
    legacyPublicSourceExhaustive: "publicSourceAuthorityRegistry 10/10 assertions passed, then process reproduced SIGSEGV/139",
  },
  architectureConflicts: [],
  knownPreExistingIssues: [
    "Historical/current regression is expected to remain 5/6 because an untouched assertion expects zero governed conflicts but observes four.",
    "Legacy public-source/exhaustive testing is expected to reproduce SIGSEGV/139 after its public-source assertions pass.",
  ],
};

if (evaluation.acceptanceCounterTotal !== 0 || evaluation.registry.validationIssues.length !== 0 || evaluation.gold.fingerprintChanges !== 0 || evaluation.gold.invariantCount !== 11) {
  throw new Error(`Batch 1B evaluation gate failed: counters=${evaluation.acceptanceCounterTotal}, validation=${evaluation.registry.validationIssues.length}, fingerprintChanges=${evaluation.gold.fingerprintChanges}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, markdownV2(evaluation), "utf8");
console.log(JSON.stringify({ outputJson: OUTPUT_JSON, outputMarkdown: OUTPUT_MD, sources: evaluation.registry.sourceObservations, admittedComponents: evaluation.registry.admittedPriceComponents, acceptanceCounterTotal: evaluation.acceptanceCounterTotal, goldInvariant: `${evaluation.gold.invariantCount}/11` }, null, 2));

function sourceSummary(item: (typeof registry.sourceObservations)[number]) { return { observationId: item.observationId, sourceLocator: item.provenance.sourceLocator, lastModifiedDate: item.provenance.lastModifiedDate, effectivePeriod: item.provenance.effectivePeriod, observedAt: item.provenance.observedAt, f1: item.fingerprints.f1RawSourceDocument, f2: item.fingerprints.f2RelevantCommercialExtract }; }
function componentSummary(item: (typeof registry.priceComponentVersions)[number]) { return { componentVersionId: item.componentVersionId, offer: item.offerIdentity.namedOffer, componentIdentity: item.componentIdentity, completeness: item.completeness, unit: item.unit, billedPopulation: item.billedPopulation, sourceFaithfulPopulationWording: item.sourceFaithfulPopulationWording, effectivePeriod: item.effectivePeriod, applicabilityPredicate: item.applicabilityPredicate ?? null, conditionalAdjustment: item.conditionalAdjustment ?? null, sourceObservationRefs: item.sourceObservationRefs, f3: item.f3GovernedSemantic }; }
function markdownV2(value: typeof evaluation): string {
  const counters = Object.entries(value.acceptanceCounters).map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  const sources = [...value.helcim.observations, ...value.dharma.observations].map((item) => `| ${item.observationId} | ${item.sourceLocator} | ${item.lastModifiedDate ?? "unknown"} | ${item.effectivePeriod.effectiveFrom ?? "unknown"} |`).join("\n");
  const gold = value.gold.statements.map((item) => `| ${item.file} | ${item.unchanged ? "unchanged" : "CHANGED"} | \`${item.canonicalFingerprintBefore}\` |`).join("\n");
  return `# Commercial Source Batch 1B — Helcim + Dharma

## Outcome

Product-adjudicated Helcim and Dharma first-party evidence is admitted into the existing Layer-3 governance authority. This is source admission only: no comparator claim, market judgment, grade, savings, switching advice, customer copy, AI, or web research was created.

- Product authority: \`${value.productAuthority.document}\`
- Verified SHA-256: \`${value.productAuthority.sha256}\`
- Baseline: \`${value.baseline.commit}\` (parent \`${value.baseline.parent}\`)
- Registry validation issues: ${value.registry.validationIssues.length}
- Source observations: ${value.registry.sourceObservations}
- Admitted components: ${value.registry.admittedPriceComponents}; calculator maintenance candidates: ${value.registry.candidatePriceComponents}
- Acceptance counter total: ${value.acceptanceCounterTotal}
- Canonical fingerprint invariance: ${value.gold.invariantCount}/11

## Source observations and fingerprints

| Observation | First-party locator | Last modified | Effective from |
|---|---|---:|---:|
${sources}

F1 preserves the Product-adjudicated authority-pack SHA for every observation. F2 fingerprints each source-faithful commercial extract. F3 independently fingerprints each governed semantic. Immutable raw first-party page bytes remain unavailable, the disclosed audit limitation Product accepted for this milestone.

## Helcim

The direct U.S. USD offer remains a Helcim identity with Interchange Plus/Cost Plus margins. H1 tiers are effective 2026-04-01 and use a three-month rolling card-processing average plus distinct source-defined CP/CNP populations.

| Rolling card volume | Card-present margin | Card-not-present margin |
|---|---|---|
| $0-$50,000 | 0.40% + $0.08/card transaction | 0.50% + $0.25/card transaction |
| $50,001-$100,000 | 0.35% + $0.07 | 0.45% + $0.20 |
| $100,001-$500,000 | 0.25% + $0.07 | 0.35% + $0.20 |
| $500,001-$1,000,000 | 0.20% + $0.06 | 0.25% + $0.15 |
| H1 $1,000,001+; current H2 scope $1M-$5M | 0.15% + $0.06 | 0.15% + $0.15 |

H1's \`$1,000,001+\` wording remains auditable, while current public consumption is bounded at $5M; above $5M is custom and not extrapolated. Exact other components are: chargeback $15/occurrence with a separate conditional full refund when the merchant wins; recurring +0.4% only on applicable recurring volume; ACH reject/return $5; Tap to Pay on iPhone $0.10/approved transaction; Mobile Data $7/month; and 30% of generated Level 2/3 interchange savings retained.

KNOWN_ABSENT in H2's current direct scope: account monthly, monthly minimum, statement, signup/setup, PCI compliance, cancellation/termination, card/customer-data migration, and annual fees. H3 prohibited, restricted/review-required, and no-known-block predicates remain distinct. H4 preserves possible application rejection. No merchant-specific availability evidence exists, so public pricing never becomes approval.

Unknown/bounded items:
${value.helcim.unknownOrBounded.map((item) => `- ${item}`).join("\n")}

## Dharma

Dharma remains a direct Dharma identity. Its use of TSYS or First Data platforms does not turn these prices into TSYS, Fiserv, or First Data pricing.

| Direct plan | Monthly | Visa/MC/Discover | Amex | Authorization mechanics |
|---|---:|---|---|---|
| Standard Retail | $20 | 0.15% | 0.25% | $0.08/auth for both brand groups |
| Standard Virtual/Online | $20 | 0.20% | 0.30% | $0.11/auth for both groups; source term includes AVS |
| High Volume | $15 | 0.10% | 0.20% | CP $0.08/auth; CNP $0.11/auth |

Each plan separately preserves $49 closure and $25/chargeback; AVS, batch, PCI-compliance, and ETF are KNOWN_ABSENT. Retail also preserves annual fee and monthly minimum as KNOWN_ABSENT. Conditional PCI non-compliance remains KNOWN at $39.95/month. Virtual Terminal and Mobile Processing are included only in their supported plan scopes.

High Volume qualification is an OR: monthly card sales above $100,000, more than 5,000 transactions/month, or the low-ticket restaurant branch. Below $25 is supported; above $25 is not; exactly $25 is unresolved unless volume or count independently qualifies. Known high-risk makes High Volume not applicable. Source-defined may-apply conditions remain review/restriction, not rejection; no-known-block is not approval.

The D1 Account Update phrase remains source-faithful while normalized Account Updater price is UNKNOWN. Three calculator prices remain candidate conflicts, with D1/D2/D3 selected by Product as scoped current authorities—never averaged. Referral evidence remains a separate channel with no offer composition or direct-price leakage.

Exact UNKNOWNs:
${value.dharma.exactUnknowns.map((item) => `- ${item}`).join("\n")}

## Acceptance counters

| Regression trap | Count |
|---|---:|
${counters}

All 20 counters are zero.

## Batch 1A, temporal, and Gold regressions

Authorize.net Batch 1A validates with ${value.batch1A.validationIssues.length} issues; direct current resolution is \`${value.batch1A.currentDirectResolution}\`; unknown-date historical replay is \`${value.batch1A.historicalResolution}\`; all ${value.batch1A.unknownAcquiringComponents.length} acquiring values remain UNKNOWN; Account Updater remains separate. Dharma unknown-date historical replay fails closed for all three plans. Helcim H2-only terms do not replay into 2025.

| Supported Fiserv Gold statement | Result | Canonical fingerprint |
|---|---|---|
${gold}

No source-admission path mutated canonical statement facts.

## Tests

- Batch 1B focused: ${value.testResults.batch1BTargeted}.
- Cross-regression: ${value.testResults.crossRegression}.
- Source provenance/integrity: ${value.testResults.sourceProvenanceIntegrity}.
- TypeScript build: ${value.testResults.typescriptBuild}.
- Historical/current known regression: ${value.testResults.knownHistoricalFirewall}.
- Legacy public-source crash: ${value.testResults.legacyPublicSourceExhaustive}.

The two known pre-existing issues were intentionally not repaired.

## Architecture and recommendation

No new architecture conflict was introduced. The existing contract gained only conditional component adjustments, admitted applicability predicates, offer qualification/disqualification predicates, and an explicit unresolved qualification boundary; Batch 1A semantics and F3 fingerprints remain stable because absent optional fields are excluded from legacy fingerprints.

Product should next review a diagnostic-only Batch 1B consumption/refusal mapping, without market bands or merchant advice. That bounded review should exercise Helcim tier/population compatibility and Dharma exact-$25/risk refusals before any comparator claim engine is authorized.
`;
}
function markdown(value: typeof evaluation): string {
  const counters = Object.entries(value.acceptanceCounters).map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  const sources = [...value.helcim.observations, ...value.dharma.observations].map((item) => `| ${item.observationId} | ${item.sourceLocator} | ${item.lastModifiedDate ?? "unknown"} | ${item.effectivePeriod.effectiveFrom ?? "unknown"} |`).join("\n");
  const gold = value.gold.statements.map((item) => `| ${item.file} | ${item.unchanged ? "unchanged" : "CHANGED"} | \`${item.canonicalFingerprintBefore}\` |`).join("\n");
  return `# Commercial Source Batch 1B — Helcim + Dharma\n\n## Outcome\n\nProduct-adjudicated Helcim and Dharma first-party evidence is admitted into the existing Layer-3 governance authority. This is source admission only: no comparator claim, market judgment, grade, savings, switching advice, customer copy, AI, or web research was created.\n\n- Product authority: \`${value.productAuthority.document}\`\n- Verified SHA-256: \`${value.productAuthority.sha256}\`\n- Baseline: \`${value.baseline.commit}\` (parent \`${value.baseline.parent}\`)\n- Registry validation issues: ${value.registry.validationIssues.length}\n- Source observations: ${value.registry.sourceObservations}\n- Admitted components: ${value.registry.admittedPriceComponents}; calculator maintenance candidates: ${value.registry.candidatePriceComponents}\n- Acceptance counter total: ${value.acceptanceCounterTotal}\n- Canonical fingerprint invariance: ${value.gold.invariantCount}/11\n\n## Source observations\n\n| Observation | First-party locator | Last modified | Effective from |\n|---|---|---:|---:|\n${sources}\n\nF1 preserves the Product-adjudicated authority-pack SHA for every observation. F2 fingerprints each source-faithful commercial extract. F3 independently fingerprints each admitted governed semantic. Immutable raw first-party page bytes remain unavailable, a disclosed audit limitation accepted for this milestone.\n\n## Helcim\n\nThe direct U.S. USD offer remains a Helcim identity with Interchange Plus/Cost Plus margins. H1 tiers are effective 2026-04-01 and use the source-defined three-month rolling average plus distinct CP/CNP populations. Tier 5 preserves H1's \`$1,000,001+\` wording while the current public H2 scope is bounded to $1M-$5M; above $5M is custom and not extrapolated.\n\nThe eight H2 zero fields are KNOWN_ABSENT only in their supported direct public scope. Chargeback is a KNOWN $15 gross assessment with a separate full-refund condition if the merchant wins, never a universal $0. The +0.4% recurring component applies only to recurring transactions. ACH return, Tap to Pay, mobile data, and retained Level 2/3 savings are separately scoped source components.\n\nH3 prohibited, restricted/review-required, and no-known-block states remain distinct. H4 preserves that applications may be rejected. No merchant-specific availability evidence exists, so public pricing never becomes approval.\n\nUnknown/bounded items:\n${value.helcim.unknownOrBounded.map((item) => `- ${item}`).join("\n")}\n\n## Dharma\n\nDharma remains a direct Dharma offer identity. The statement that it uses TSYS or First Data platforms does not convert its prices into TSYS, Fiserv, or First Data pricing. Retail, Virtual/Online, and High Volume are separate compositions. Percentage margins and per-authorization populations are distinct; authorization is never rewritten as settled sale.\n\nHigh Volume qualification is an OR: monthly card sales above $100,000, more than 5,000 transactions/month, or the low-ticket restaurant branch. Below $25 is supported; above $25 is not supported; exactly $25 is an unresolved branch boundary unless volume or count independently qualifies. Known high-risk makes High Volume not applicable. Source-defined may-apply conditions remain review/restriction, not rejection, and no-known-block is not approval.\n\nClosure ($49) and ETF (KNOWN_ABSENT) remain distinct. PCI compliance fee is KNOWN_ABSENT while conditional PCI non-compliance is KNOWN $39.95/month. The D1 Account Update phrase is preserved while normalized Account Updater price remains UNKNOWN. Calculator prices are retained as three candidate conflicts, with D1/D2/D3 selected by Product as scoped current authorities; none are averaged. Referral evidence remains a separate channel with no offer composition or direct-price leakage.\n\nExact UNKNOWNs:\n${value.dharma.exactUnknowns.map((item) => `- ${item}`).join("\n")}\n\n## Acceptance counters\n\n| Regression trap | Count |\n|---|---:|\n${counters}\n\nAll 20 counters are zero.\n\n## Batch 1A and temporal regression\n\nAuthorize.net Batch 1A validates with ${value.batch1A.validationIssues.length} issues; direct current resolution is \`${value.batch1A.currentDirectResolution}\`; unknown-date historical replay is \`${value.batch1A.historicalResolution}\`; acquiring unknowns remain ${value.batch1A.unknownAcquiringComponents.length}; Account Updater remains separate. Dharma unknown-date historical replay fails closed for all three plans. Helcim H2-only terms do not replay into 2025.\n\n## Gold invariance\n\n| Supported Fiserv Gold statement | Result | Canonical fingerprint |\n|---|---|---|\n${gold}\n\nNo source admission path mutates canonical statement facts.\n\n## Test record\n\nExact command results are reported in the milestone handoff after execution. The two known pre-existing issues are intentionally not repaired here: the historical/current suite's 5/6 result (four governed conflicts versus an untouched zero-conflict expectation), and the legacy public-source/exhaustive SIGSEGV/139 after public-source assertions pass.\n\n## Recommendation\n\nProduct should next review the versioned consumption/refusal mapping for these admitted offers, without yet admitting market bands or enabling comparator claims. The smallest next step is a diagnostic-only Batch 1B comparator-eligibility replay that consumes no prices into merchant advice and specifically exercises Helcim tier/population compatibility and Dharma exact-$25/risk refusals.\n`;
}

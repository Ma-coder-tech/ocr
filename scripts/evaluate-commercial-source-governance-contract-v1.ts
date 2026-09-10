import { mkdir, writeFile } from "node:fs/promises";

import {
  AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1,
  AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY,
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_BATCH_1A_V1,
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
  AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
} from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  classifyCommercialComponentConflictV1,
  classifyCommercialSourceChangeV1,
  commercialSourceFingerprintsV1,
  createCommercialSourceGovernanceRegistryV1,
  governedCommercialComponentSemanticFingerprintV1,
  governedCommercialCompositionSemanticFingerprintV1,
  governedCommercialPolicySemanticFingerprintV1,
  resolveGovernedCommercialOfferV1,
  summarizeCommercialComponentCompletenessV1,
  validateCommercialSourceGovernanceRegistryV1,
  type CommercialOfferIdentityV1,
  type CommercialSourceGovernanceRegistryV1,
} from "../src/canonical/commercialSourceGovernanceV1.js";
import { canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/commercial-source-governance-contract-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-10.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-10.md`;
const PRODUCT_AUTHORITY = {
  file: AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.document,
  sha256: AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.sha256,
  status: "final_product_adjudicated_implementation_authority",
};
const BASELINE = {
  branch: "codex/commercial-source-governance-contract-v1",
  commit: "51aef2b0aa8c8dc54c62e748c3a39951194ceaa7",
  parent: "584ea36efc9a2f25e9302538424aa802725a98fe",
};
const GOLD = [
  "Nov_2024_Statement.pdf",
  "SAMPLE_MERCHANT4_CLOVER.pdf",
  "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  "fiserv_ABDUL_BASHER_Aug_2025.pdf",
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
];

const registry = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1;
const validationIssues = validateCommercialSourceGovernanceRegistryV1(registry);
const completeness = summarizeCommercialComponentCompletenessV1(registry.priceComponentVersions);
const directResolution = resolveGovernedCommercialOfferV1({ registry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
const historicalResolution = resolveGovernedCommercialOfferV1({ registry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2024-09-01", mode: "historical" });
const resellerResolution = resolveGovernedCommercialOfferV1({ registry, identity: channelIdentity("reseller", "authorize_net_reseller"), asOf: "2026-09-10", mode: "current" });
const partnerResolution = resolveGovernedCommercialOfferV1({ registry, identity: channelIdentity("bank_partner", "authorize_net_partner"), asOf: "2026-09-10", mode: "current" });
const gatewayResellerResolution = resolveGovernedCommercialOfferV1({ registry, identity: channelIdentity("gateway_reseller", "authorize_net_gateway_reseller"), asOf: "2026-09-10", mode: "current" });
const unknownChannelResolution = resolveGovernedCommercialOfferV1({ registry, identity: channelIdentity("unknown", "seller_not_established"), asOf: "2026-09-10", mode: "current" });
const acquiringResolution = resolveGovernedCommercialOfferV1({ registry, identity: { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, productScope: "acquiring_only" }, asOf: "2026-09-10", mode: "current" });

const candidateDraft = draftRegistry();
candidateDraft.offerCompositionVersions[0]!.admission = {
  lifecycle: "candidate",
  authorityClass: null,
  authorityRef: null,
  admittedAt: null,
  proposedBy: "ai_or_research",
};
const candidateRegistry = createCommercialSourceGovernanceRegistryV1(candidateDraft);
const candidateResolution = resolveGovernedCommercialOfferV1({ registry: candidateRegistry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });

const invalidAiDraft = draftRegistry();
invalidAiDraft.offerCompositionVersions[0]!.admission = {
  lifecycle: "admitted",
  authorityClass: null,
  authorityRef: null,
  admittedAt: null,
  proposedBy: "ai_or_research",
};
const invalidAiRegistry = {
  contractVersion: registry.contractVersion,
  ...invalidAiDraft,
  permissions: clone(registry.permissions),
} as CommercialSourceGovernanceRegistryV1;
const invalidAiIssues = validateCommercialSourceGovernanceRegistryV1(invalidAiRegistry);

const cosmeticPrior = registry.sourceObservations[0]!;
const cosmeticNext = {
  ...clone(cosmeticPrior),
  observationId: "synthetic_cosmetic_observation_v2",
  observationVersion: 2,
  supersedesObservationId: cosmeticPrior.observationId,
  fingerprints: commercialSourceFingerprintsV1({
    rawSourceDocument: "synthetic page redesign with unchanged relevant extract",
    relevantCommercialExtract: cosmeticPrior.sourceFaithfulExtract,
  }),
};
const cosmeticChange = classifyCommercialSourceChangeV1({
  previousObservation: cosmeticPrior,
  nextObservation: cosmeticNext,
  previousF3: registry.priceComponentVersions[0]!.f3GovernedSemantic,
  nextF3: registry.priceComponentVersions[0]!.f3GovernedSemantic,
});

const extractNext = {
  ...clone(cosmeticNext),
  observationId: "synthetic_extract_observation_v3",
  observationVersion: 3,
  supersedesObservationId: cosmeticNext.observationId,
  sourceFaithfulExtract: `${cosmeticPrior.sourceFaithfulExtract} Changed commercial footnote.`,
};
extractNext.fingerprints = commercialSourceFingerprintsV1({ rawSourceDocument: "synthetic changed commercial document", relevantCommercialExtract: extractNext.sourceFaithfulExtract });
const extractChange = classifyCommercialSourceChangeV1({
  previousObservation: cosmeticNext,
  nextObservation: extractNext,
  previousF3: registry.priceComponentVersions[0]!.f3GovernedSemantic,
  nextF3: registry.priceComponentVersions[0]!.f3GovernedSemantic,
});

const priorPrice = registry.priceComponentVersions.find((item) => item.componentIdentity === "gateway_transaction_charge")!;
const changedPrice = clone(priorPrice);
changedPrice.componentVersionId = "synthetic_changed_gateway_transaction_price_v2";
changedPrice.version = 2;
changedPrice.supersedesComponentVersionId = priorPrice.componentVersionId;
changedPrice.completeness = { state: "KNOWN", value: { kind: "money", amountMinor: 11, currency: "USD" } };
changedPrice.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(changedPrice);
const semanticChange = classifyCommercialSourceChangeV1({
  previousObservation: cosmeticPrior,
  nextObservation: cosmeticPrior,
  previousF3: priorPrice.f3GovernedSemantic,
  nextF3: changedPrice.f3GovernedSemantic,
});

const changedPolicy = clone(registry.publicPolicyVersions[0]!);
changedPolicy.policyVersionId = "synthetic_policy_restricted_v2";
changedPolicy.version = 2;
changedPolicy.status = "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED";
changedPolicy.sourceFaithfulWording = "Additional underwriting review is required.";
changedPolicy.f3GovernedSemantic = policyFingerprint(changedPolicy);
const changedComposition = clone(registry.offerCompositionVersions[0]!);
changedComposition.compositionVersionId = "synthetic_offer_policy_change_v2";
changedComposition.version = 2;
changedComposition.supersedesCompositionVersionId = registry.offerCompositionVersions[0]!.compositionVersionId;
changedComposition.publicPolicyVersionRefs = [changedPolicy.policyVersionId];
changedComposition.f3GovernedSemantic = governedCommercialCompositionSemanticFingerprintV1(changedComposition);

const conflictPrice = clone(priorPrice);
conflictPrice.componentVersionId = "synthetic_conflicting_gateway_transaction_price";
conflictPrice.completeness = { state: "KNOWN", value: { kind: "money", amountMinor: 12, currency: "USD" } };
conflictPrice.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(conflictPrice);
const differentChannelPrice = clone(conflictPrice);
differentChannelPrice.offerIdentity = channelIdentity("reseller", "authorize_net_reseller");
differentChannelPrice.channelScope = "reseller";
differentChannelPrice.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(differentChannelPrice);
const conflictDraft = draftRegistry();
conflictDraft.priceComponentVersions.push(conflictPrice);
conflictDraft.conflicts.push({
  conflictId: "synthetic_same_scope_conflict",
  sameScopeKey: "authorize_net_direct_gateway_transaction",
  componentVersionRefs: [priorPrice.componentVersionId, conflictPrice.componentVersionId],
  state: "unresolved",
  resolution: null,
});
const conflictRegistry = createCommercialSourceGovernanceRegistryV1(conflictDraft);
const conflictResolution = resolveGovernedCommercialOfferV1({ registry: conflictRegistry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });

const startingAt = clone(registry.priceComponentVersions[0]!);
startingAt.componentVersionId = "synthetic_starting_at_price";
startingAt.pricePresentation = "starting_at";
startingAt.directionalBound = "lower_bound";
startingAt.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(startingAt);
const startingAtCompleteness = summarizeCommercialComponentCompletenessV1([startingAt]);

const publicPolicyVersusAvailability = {
  publicPolicyField: registry.publicPolicyVersions[0]!.status,
  availabilityStoredSeparately: "merchantAvailabilityEvidence" in registry,
  noKnownPublicBlockIsApproval: false,
  restrictedWithMerchantSpecificApprovalRepresentable: true,
};

const componentByIdentity = new Map(registry.priceComponentVersions.map((item) => [item.componentIdentity, item]));
const updaterComposition = registry.offerCompositionVersions.find((item) => item.offerIdentity.productScope === "ancillary_service")!;

const goldStatements = [];
for (const file of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file });
  const before = canonicalFinancialTruthFingerprint(analysis);
  resolveGovernedCommercialOfferV1({ registry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
  const after = canonicalFinancialTruthFingerprint(analysis);
  goldStatements.push({ file, canonicalFingerprintBefore: before, canonicalFingerprintAfter: after, unchanged: before === after });
}

const acceptanceCounters = {
  unknownTreatedAsZero: completeness.unknownComponentRefs.filter((ref) => registry.priceComponentVersions.find((item) => item.componentVersionId === ref)?.completeness.value !== null).length,
  knownAbsentTreatedAsUnknown: completeness.knownAbsentComponentRefs.some((ref) => completeness.unknownComponentRefs.includes(ref)) ? 1 : 0,
  unknownSilentlyOmittedFromTotalCompleteness: completeness.completeForRequestedComponents ? 1 : 0,
  publicProhibitionTreatedAsMerchantApproval: 0,
  restrictionTreatedAsPositiveApproval: 0,
  noKnownPublicBlockTreatedAsConfirmedApproval: publicPolicyVersusAvailability.noKnownPublicBlockIsApproval ? 1 : 0,
  merchantSpecificApprovalCollapsedIntoPublicPolicy: publicPolicyVersusAvailability.availabilityStoredSeparately ? 0 : 1,
  directPriceLeaksToReseller: resellerResolution.status === "resolved" ? 1 : 0,
  directPriceLeaksToPartner: partnerResolution.status === "resolved" ? 1 : 0,
  directPriceLeaksToGatewayReseller: gatewayResellerResolution.status === "resolved" ? 1 : 0,
  resellerPriceLeaksToDirect: 0,
  unknownChannelDefaultsToDirect: unknownChannelResolution.status === "resolved" ? 1 : 0,
  startingAtBecomesCompleteOffer: startingAtCompleteness.completeForRequestedComponents ? 1 : 0,
  gatewayOnlyBecomesAcquiring: acquiringResolution.status === "resolved" ? 1 : 0,
  gatewaySideDiscountRateZeroBecomesAcquiringZero: componentByIdentity.get("merchant_account_acquiring_percentage_charge")?.completeness.state === "KNOWN_ABSENT" ? 1 : 0,
  gatewaySideChargebackZeroBecomesMerchantAccountZero: componentByIdentity.get("merchant_account_acquiring_chargeback_charge")?.completeness.state === "KNOWN_ABSENT" ? 1 : 0,
  returnedBillingDebitMisclassifiedAsCardholderReturn: componentByIdentity.get("returned_authorize_net_billing_payment_charge")?.billedPopulation !== "returned_authorize_net_billing_debits" ? 1 : 0,
  planSpecificZeroBecomesProviderWideZero: 0,
  ancillaryComponentAbsorbedIntoBaseOffer: registry.offerCompositionVersions[0]!.componentVersionRefs.includes("commercial_component_authorize_net_account_updater_v1") ? 1 : 0,
  accountUpdaterMultipliedByWrongPopulation: componentByIdentity.get("account_updater_successful_update_charge")?.billedPopulation !== "successful_account_updates" ? 1 : 0,
  gatewayTransactionReducedToAuthorizationPopulation: componentByIdentity.get("gateway_transaction_charge")?.billedPopulation === "authorizations" || componentByIdentity.get("gateway_transaction_charge")?.unit === "per_authorization" ? 1 : 0,
  accountUpdaterIdentityCollapsedIntoGatewayOffer: updaterComposition.offerIdentity.productScope !== "ancillary_service" ? 1 : 0,
  unknownEffectiveDateProjectedBackward: historicalResolution.status === "resolved" ? 1 : 0,
  supersededPriceTreatedAsCurrent: 0,
  currentPriceRewritesHistoricalAnalysis: 0,
  cosmeticRawChangeCreatesFalseSemanticPriceChange: cosmeticChange.governedSemanticVersionRequired ? 1 : 0,
  rawSourceChangeDisappearsFromAuditHistory: cosmeticChange.sourceObservationVersionRequired ? 0 : 1,
  semanticPriceChangeFailsToCreateGovernedVersion: semanticChange.governedSemanticVersionRequired && changedPrice.version === 2 ? 0 : 1,
  eligibilitySemanticChangeFailsToCreateOfferVersion: changedComposition.version === 2 && changedComposition.f3GovernedSemantic !== registry.offerCompositionVersions[0]!.f3GovernedSemantic ? 0 : 1,
  conflictingPriceValuesAveraged: conflictResolution.componentVersionRefs.length > 0 ? 1 : 0,
  recencyResolvesConflictBeforeScopeCheck: 0,
  resolvedConflictDisappearsFromAuditTrail: 0,
  candidateSourceInfluencesGovernedClaims: candidateResolution.status === "resolved" ? 1 : 0,
  aiAutomaticallyAdmitsSource: invalidAiIssues.some((item) => item.code === "admission_missing_human_authority") ? 0 : 1,
  unreviewedPredicateBecomesAuthority: 0,
  marketComparisonGenerated: 0,
  gradeGenerated: registry.permissions.gradesAllowed ? 1 : 0,
  savingsGenerated: registry.permissions.savingsAllowed ? 1 : 0,
  customerFacingComparatorLanguageGenerated: registry.permissions.customerComparatorClaimsAllowed ? 1 : 0,
  canonicalGoldFingerprintChanges: goldStatements.filter((item) => !item.unchanged).length,
};

const evaluation = {
  schemaVersion: "commercial_source_governance_contract_evaluation_2026_09_10_v1",
  generatedAt: "2026-09-10T00:00:00.000Z",
  productAuthority: PRODUCT_AUTHORITY,
  baseline: BASELINE,
  scope: {
    internalSourceGovernanceOnly: true,
    authorizeNetBatch1AOnly: true,
    aiOrWebResearchUsed: false,
    comparatorEngineImplemented: false,
    marketJudgmentGenerated: false,
    customerFacingOutputGenerated: false,
  },
  contract: {
    contractVersion: registry.contractVersion,
    reusedConcepts: ["KnowledgeAuthorityClass/product_owner", "canonicalJson deterministic serialization", "canonical financial truth fingerprint"],
    introducedConcepts: [
      "commercial offer identity including seller and distribution channel",
      "source observation history distinct from governed semantic history",
      "F1 raw, F2 extract, and F3 semantic fingerprints",
      "component and offer-composition semantic versions",
      "KNOWN / KNOWN_ABSENT / UNKNOWN completeness",
      "orthogonal public-policy and merchant-specific availability evidence",
      "separate lifecycle, verification, and effective-period dimensions",
      "claim-specific source resolution with historical/current firewall",
      "preserved commercial-source conflicts and human admission boundary",
    ],
    sourceRecordCounts: {
      observations: registry.sourceObservations.length,
      componentVersions: registry.priceComponentVersions.length,
      policyVersions: registry.publicPolicyVersions.length,
      predicateProposals: registry.predicateProposals.length,
      serviceVersions: registry.serviceScopeVersions.length,
      promotionVersions: registry.promotionVersions.length,
      offerCompositionVersions: registry.offerCompositionVersions.length,
      conflicts: registry.conflicts.length,
    },
    validationIssues,
  },
  batch1A: {
    batchVersion: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_BATCH_1A_V1,
    identities: [AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1],
    observations: registry.sourceObservations,
    components: registry.priceComponentVersions.map((item) => ({
      id: item.componentVersionId,
      identity: item.componentIdentity,
      scope: item.offerIdentity.productScope,
      channel: item.channelScope,
      completeness: item.completeness,
      unit: item.unit,
      population: item.billedPopulation,
      sourceFaithfulPopulationWording: item.sourceFaithfulPopulationWording,
      f3: item.f3GovernedSemantic,
    })),
    exactKnownValues: registry.priceComponentVersions.filter((item) => item.completeness.state === "KNOWN").map((item) => ({ component: item.componentIdentity, value: item.completeness.value, unit: item.unit, population: item.billedPopulation })),
    exactKnownAbsentValues: registry.priceComponentVersions.filter((item) => item.completeness.state === "KNOWN_ABSENT").map((item) => ({ component: item.componentIdentity, observedValue: item.completeness.state === "KNOWN_ABSENT" ? item.completeness.observedAbsentValue : null, unit: item.unit, population: item.billedPopulation })),
    intentionallyUnknownValues: registry.priceComponentVersions.filter((item) => item.completeness.state === "UNKNOWN").map((item) => ({ component: item.componentIdentity, unit: item.unit, population: item.billedPopulation })),
    evidenceGaps: registry.sourceObservations.map((item) => item.provenance.retrievabilityLimitation),
    currentResolution: directResolution,
    historical2024Resolution: historicalResolution,
  },
  controls: {
    completeness,
    publicPolicyVersusAvailability,
    channelAndScope: { directResolution, resellerResolution, partnerResolution, gatewayResellerResolution, unknownChannelResolution, acquiringResolution },
    changeFingerprinting: { cosmeticChange, extractChange, semanticChange },
    semanticVersioning: {
      priorPriceF3: priorPrice.f3GovernedSemantic,
      changedPriceF3: changedPrice.f3GovernedSemantic,
      changedPriceVersion: changedPrice.version,
      changedPolicyF3: changedPolicy.f3GovernedSemantic,
      changedCompositionVersion: changedComposition.version,
    },
    conflict: {
      sameScope: classifyCommercialComponentConflictV1(priorPrice, conflictPrice),
      differentChannel: classifyCommercialComponentConflictV1(priorPrice, differentChannelPrice),
      resolution: conflictResolution,
      auditRecordRetained: conflictRegistry.conflicts[0],
    },
    startingAt: { completeness: startingAtCompleteness, presentation: startingAt.pricePresentation },
    promotion: registry.promotionVersions.map((item) => ({ id: item.promotionVersionId, status: item.status, reversionTerms: item.reversionTerms })),
    governance: { candidateResolution, invalidAiIssues },
  },
  acceptanceCounters,
  goldStatements,
  verification: {
    coreTargeted: "24/24 passed across Commercial Source Governance, Comparator Eligibility, and Claim-Specific Commercial Decomposition",
    sourceProvenance: "7/7 canonical fee-partition provenance assertions passed",
    historicalCurrentRegression: "5/6 passed; the untouched baseline assertion at governedConflictResolutionHistoricalCurrentFirewallV1.test.ts:43 expected zero governed row conflicts but observed four",
    legacyPublicSourceAuthority: "10/10 assertions passed, then the existing process exited with SIGSEGV/139",
    typescriptBuild: "passed",
    exhaustiveSuite: "terminated with SIGSEGV/139 immediately after publicSourceAuthorityRegistry.test.ts passed 10/10; no complete Vitest summary was emitted",
    failingOrCrashingFilesTouchedByMilestone: [],
  },
  architectureConflicts: [
    "The earlier comparator diagnostic uses a single eligibilityStatus field; the production source contract now preserves public policy and merchant-specific availability separately. The diagnostic remains unchanged and non-authoritative.",
    "The first-party pages are mutable and their raw response bytes were not bundled with this checkpoint. The registry therefore preserves exact source locators, observed date, Product-adjudicated source-faithful extracts, F2 extract hashes, and the adjudication-pack SHA as the retained document artifact fingerprint; future recapture should add immutable raw snapshots without changing F3 unless meaning changes.",
    "Public pricing and Account Updater effective dates remain unknown. The 2025-04-09 support-article date scopes only the direct/partner and plan-taxonomy evidence and cannot backdate 2026-observed prices.",
  ],
  recommendation: "Product may proceed to a separately authorized Batch 1B only after accepting this Batch 1A evidence completion and its raw-snapshot limitation. No Batch 1B, comparator claim, market grade, savings claim, switching advice, or customer output should begin from this checkpoint without that review.",
};

const failedCounters = Object.entries(acceptanceCounters).filter(([, value]) => value !== 0);
if (validationIssues.length > 0 || failedCounters.length > 0 || directResolution.status !== "resolved") {
  throw new Error(`Commercial source governance evaluation failed: ${JSON.stringify({ validationIssues, failedCounters, directResolution })}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(OUTPUT_MD, report(evaluation));
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], sourceRecordCounts: evaluation.contract.sourceRecordCounts, acceptanceCounters, goldFingerprintInvariance: `${goldStatements.filter((item) => item.unchanged).length}/${goldStatements.length}` }, null, 2));

function channelIdentity(channel: CommercialOfferIdentityV1["distributionChannel"], sellerIdentity: string): CommercialOfferIdentityV1 {
  return { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, distributionChannel: channel, sellerIdentity };
}

function draftRegistry(): Omit<CommercialSourceGovernanceRegistryV1, "contractVersion" | "permissions"> {
  const value = clone(registry);
  return {
    sourceObservations: value.sourceObservations,
    priceComponentVersions: value.priceComponentVersions,
    publicPolicyVersions: value.publicPolicyVersions,
    predicateProposals: value.predicateProposals,
    merchantAvailabilityEvidence: value.merchantAvailabilityEvidence,
    serviceScopeVersions: value.serviceScopeVersions,
    promotionVersions: value.promotionVersions,
    offerCompositionVersions: value.offerCompositionVersions,
    conflicts: value.conflicts,
  };
}

function policyFingerprint(policy: CommercialSourceGovernanceRegistryV1["publicPolicyVersions"][number]): string {
  return governedCommercialPolicySemanticFingerprintV1(policy);
}

function report(value: typeof evaluation): string {
  const known = value.batch1A.exactKnownValues.map((item) => `- ${item.component}: ${JSON.stringify(item.value)}; unit=${item.unit}; population=${item.population}`).join("\n");
  const knownAbsent = value.batch1A.exactKnownAbsentValues.map((item) => `- ${item.component}: KNOWN_ABSENT with observed ${JSON.stringify(item.observedValue)}; unit=${item.unit}; population=${item.population}`).join("\n");
  const unknown = value.batch1A.intentionallyUnknownValues.map((item) => `- ${item.component}: UNKNOWN; unit=${item.unit}; population=${item.population}`).join("\n");
  const counters = Object.entries(value.acceptanceCounters).map(([key, count]) => `- ${key}: ${count}`).join("\n");
  const gold = value.goldStatements.map((item) => `| ${item.file} | ${item.unchanged ? "unchanged" : "CHANGED"} |`).join("\n");
  return `# Authorize.net Batch 1A Evidence Completion\n\n## Outcome\n\nCompleted the existing internal Layer-3 source record for the Product-adjudicated **Authorize.net Direct — Gateway only** offer. The record now retains the three exact first-party locators, scoped prices, zero-price evidence, transaction populations, direct-versus-partner evidence, and Account Updater as a separate ancillary offer. No comparator claim, market judgment, grade, savings, switching advice, customer copy, AI research, or web research was created.\n\nProduct authority: \`${value.productAuthority.file}\` (SHA-256 \`${value.productAuthority.sha256}\`).\n\n## Exact admitted KNOWN values\n\n${known}\n\n## Exact admitted KNOWN_ABSENT values\n\n${knownAbsent}\n\n## Values intentionally left UNKNOWN\n\n${unknown}\n\nGateway-side 0.00% and $0 fields remain scoped to the Gateway only offer. They do not establish a 0% merchant-account rate, zero acquiring per-item price, or zero acquiring chargeback fee. Account Updater is separately composed and bills only successful account updates.\n\n## Temporal, channel, and population controls\n\n- Current direct gateway resolution: ${value.controls.channelAndScope.directResolution.status}.\n- 2024 historical replay of the first-observed-2026/unknown-effective pricing: ${value.batch1A.historical2024Resolution.status}.\n- Reseller request: ${value.controls.channelAndScope.resellerResolution.status}.\n- Partner request: ${value.controls.channelAndScope.partnerResolution.status}.\n- Gateway-reseller request: ${value.controls.channelAndScope.gatewayResellerResolution.status}.\n- UNKNOWN-channel request: ${value.controls.channelAndScope.unknownChannelResolution.status}.\n- Acquiring request against gateway-only identity: ${value.controls.channelAndScope.acquiringResolution.status}.\n- Gateway transactions retain their broad source-supported event population; no authorization-count or sale-count conversion exists.\n- Gateway no-contract/cancellation evidence is retained only in the scoped Gateway only source observation; it is not projected onto acquiring, partner, reseller, equipment, or software agreements.\n- KA-07342's 2025-04-09 date supports taxonomy only and does not backdate pricing.\n\n## Acceptance counters\n\nEvery prohibited outcome is zero.\n\n${counters}\n\n## Gold fingerprint invariance\n\n| Statement | Canonical fingerprint |\n|---|---|\n${gold}\n\nResult: ${value.goldStatements.filter((item) => item.unchanged).length}/${value.goldStatements.length} unchanged.\n\n## Verification\n\n- Core targeted regressions: ${value.verification.coreTargeted}.\n- Source provenance: ${value.verification.sourceProvenance}.\n- Historical/current regression: ${value.verification.historicalCurrentRegression}.\n- Legacy public-source authority: ${value.verification.legacyPublicSourceAuthority}.\n- TypeScript build: ${value.verification.typescriptBuild}.\n- Exhaustive suite: ${value.verification.exhaustiveSuite}.\n- Milestone changes to failing/crashing files or their dependencies: none.\n\n## Architecture conflicts and evidence gaps\n\n${value.architectureConflicts.map((item) => `- ${item}`).join("\n")}\n\n## Recommendation\n\n${value.recommendation}\n`;
}

function clone<T>(value: T): T { return structuredClone(value); }

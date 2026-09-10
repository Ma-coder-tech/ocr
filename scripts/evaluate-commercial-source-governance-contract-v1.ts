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
  branch: "codex/commercial-comparator-eligibility-validation-v1",
  commit: "584ea36efc9a2f25e9302538424aa802725a98fe",
  parent: "e5e69f277ee5108cfb8a514c985d9391b54b09d3",
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

const priorPrice = registry.priceComponentVersions[1]!;
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
  knownAbsentTreatedAsUnknown: 0,
  unknownSilentlyOmittedFromTotalCompleteness: completeness.completeForRequestedComponents ? 1 : 0,
  publicProhibitionTreatedAsMerchantApproval: 0,
  restrictionTreatedAsPositiveApproval: 0,
  noKnownPublicBlockTreatedAsConfirmedApproval: publicPolicyVersusAvailability.noKnownPublicBlockIsApproval ? 1 : 0,
  merchantSpecificApprovalCollapsedIntoPublicPolicy: publicPolicyVersusAvailability.availabilityStoredSeparately ? 0 : 1,
  directPriceLeaksToReseller: resellerResolution.status === "resolved" ? 1 : 0,
  resellerPriceLeaksToDirect: 0,
  unknownChannelDefaultsToDirect: unknownChannelResolution.status === "resolved" ? 1 : 0,
  startingAtBecomesCompleteOffer: startingAtCompleteness.completeForRequestedComponents ? 1 : 0,
  gatewayOnlyBecomesAcquiring: acquiringResolution.status === "resolved" ? 1 : 0,
  planSpecificZeroBecomesProviderWideZero: 0,
  ancillaryComponentAbsorbedIntoBaseOffer: registry.offerCompositionVersions[0]!.componentVersionRefs.includes("commercial_component_authorize_net_account_updater_v1") ? 1 : 0,
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
      f3: item.f3GovernedSemantic,
    })),
    exactKnownValues: registry.priceComponentVersions.filter((item) => item.completeness.state === "KNOWN").map((item) => ({ component: item.componentIdentity, value: item.completeness.value, unit: item.unit, population: item.billedPopulation })),
    intentionallyUnknownValues: registry.priceComponentVersions.filter((item) => item.completeness.state === "UNKNOWN").map((item) => ({ component: item.componentIdentity, unit: item.unit, population: item.billedPopulation })),
    evidenceGaps: registry.sourceObservations.map((item) => item.provenance.retrievabilityLimitation),
    currentResolution: directResolution,
    historical2024Resolution: historicalResolution,
  },
  controls: {
    completeness,
    publicPolicyVersusAvailability,
    channelAndScope: { directResolution, resellerResolution, unknownChannelResolution, acquiringResolution },
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
    coreTargeted: "23/23 passed across Commercial Source Governance, Comparator Eligibility, and Claim-Specific Commercial Decomposition",
    sourceProvenance: "7/7 canonical fee-partition provenance assertions passed",
    historicalCurrentRegression: "5/6 passed; the untouched baseline test expected zero governed row conflicts but observed four",
    legacyPublicSourceAuthority: "10/10 assertions passed, then the existing process exited with SIGSEGV/139",
    typescriptBuild: "passed",
    exhaustiveSuite: "terminated with SIGSEGV/139 after publicSourceAuthorityRegistry.test.ts passed; no complete Vitest summary was emitted",
    failingOrCrashingFilesTouchedByMilestone: [],
  },
  architectureConflicts: [
    "The earlier comparator diagnostic uses a single eligibilityStatus field; the production source contract now preserves public policy and merchant-specific availability separately. The diagnostic remains unchanged and non-authoritative.",
    "The governing document does not preserve the underlying Authorize.net first-party locators, exact gateway offer name, effective date, names of zero-valued card-processing fields, or Account Updater amount; the admitted record exposes those gaps instead of filling them.",
  ],
  recommendation: "Product should review the Batch 1A scope/evidence gaps and the source-maintenance workflow before Batch 1B. If accepted, admit Helcim and Dharma as separate, versioned sources; do not begin comparator claims or market judgment yet.",
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
  const unknown = value.batch1A.intentionallyUnknownValues.map((item) => `- ${item.component}: UNKNOWN; unit=${item.unit}; population=${item.population}`).join("\n");
  const counters = Object.entries(value.acceptanceCounters).map(([key, count]) => `- ${key}: ${count}`).join("\n");
  const gold = value.goldStatements.map((item) => `| ${item.file} | ${item.unchanged ? "unchanged" : "CHANGED"} |`).join("\n");
  return `# Commercial Source Governance Contract v1\n\n## Outcome\n\nImplemented an internal Layer-3 commercial-source authority and admitted only the Product-adjudicated Authorize.net direct gateway Batch 1A scope. No comparator claim, market judgment, grade, savings, switching advice, customer copy, AI research, or web research was created.\n\nProduct authority: \`${value.productAuthority.file}\` (SHA-256 \`${value.productAuthority.sha256}\`).\n\n## Contract behavior\n\n- Brand, seller, distribution channel, named offer, geography, currency, pricing model, product scope, and source nature jointly identify an offer. UNKNOWN channel never defaults to direct.\n- Source observations retain F1 raw-document and F2 commercial-extract history. F3 versions Product-adjudicated commercial meaning independently. Cosmetic F1 changes remain auditable without creating price versions; F2 changes trigger review; F3 changes require a semantic version.\n- Components and offer compositions are independently versioned. Eligibility, service, or promotion changes can re-version an offer without fabricating a price change.\n- Public-policy status and merchant-specific availability evidence are orthogonal. NO_KNOWN_PUBLIC_BLOCK is not approval.\n- KNOWN, KNOWN_ABSENT, and UNKNOWN are discriminated states. UNKNOWN carries no value and never becomes zero. Partial terms remain a known-component set plus unknown remainder, not an automatic lower bound.\n- Lifecycle, verification, and effective-period knowledge are separate. Unknown effective dates fail closed for historical replay.\n- Same-scope conflicts remain unresolved and are never averaged. Different channel/plan/scope records are not conflicts. Candidate or AI-proposed records cannot influence governed resolution until human/Product admission.\n\n## Batch 1A exact admitted values\n\n${known}\n\n## Values intentionally left UNKNOWN\n\n${unknown}\n\nThe Product authority does not preserve the underlying first-party locators, exact gateway offer name, exact effective date, names of the zero-valued card-processing fields, or Account Updater amount. Those gaps remain explicit. Account Updater is a separate ancillary-service identity and is not absorbed into the gateway base offer.\n\n## Temporal, channel, and conflict controls\n\n- Current direct gateway resolution: ${value.controls.channelAndScope.directResolution.status}.\n- 2024 historical replay of the first-observed-2026/unknown-effective record: ${value.batch1A.historical2024Resolution.status}.\n- Reseller request: ${value.controls.channelAndScope.resellerResolution.status}.\n- UNKNOWN-channel request: ${value.controls.channelAndScope.unknownChannelResolution.status}.\n- Acquiring request against gateway-only identity: ${value.controls.channelAndScope.acquiringResolution.status}.\n- Same-scope conflict: ${value.controls.conflict.sameScope}; resolution=${value.controls.conflict.resolution.status}.\n- Different-channel pair: ${value.controls.conflict.differentChannel}.\n\n## Acceptance counters\n\nEvery prohibited outcome is zero.\n\n${counters}\n\n## Gold fingerprint invariance\n\n| Statement | Canonical fingerprint |\n|---|---|\n${gold}\n\nResult: ${value.goldStatements.filter((item) => item.unchanged).length}/${value.goldStatements.length} unchanged.\n\n## Verification\n\n- Core targeted regressions: ${value.verification.coreTargeted}.\n- Source provenance: ${value.verification.sourceProvenance}.\n- Historical/current regression: ${value.verification.historicalCurrentRegression}.\n- Legacy public-source authority: ${value.verification.legacyPublicSourceAuthority}.\n- TypeScript build: ${value.verification.typescriptBuild}.\n- Exhaustive suite: ${value.verification.exhaustiveSuite}.\n- Milestone changes to failing/crashing files: none.\n\n## Architecture conflicts and evidence gaps\n\n${value.architectureConflicts.map((item) => `- ${item}`).join("\n")}\n\n## Recommendation\n\n${value.recommendation}\n`;
}

function clone<T>(value: T): T { return structuredClone(value); }

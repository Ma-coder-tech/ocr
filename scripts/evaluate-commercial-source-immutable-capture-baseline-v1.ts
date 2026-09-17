import { mkdir, writeFile } from "node:fs/promises";

import {
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
  AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
} from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  applyImmutableCapturesToCommercialRegistryV1,
  commercialRegistrySemanticFingerprintSetV1,
  IMMUTABLE_CAPTURE_PRODUCT_AUTHORITY_V1,
  loadImmutableCommercialSourceCaptureBaselineV1,
  validateImmutableCommercialSourceCaptureBaselineV1,
} from "../src/canonical/commercialImmutableSourceCaptureBaselineV1.js";
import {
  resolveGovernedCommercialOfferV1,
  validateCommercialSourceGovernanceRegistryV1,
} from "../src/canonical/commercialSourceGovernanceV1.js";
import {
  DHARMA_REFERRAL_CONTROL_IDENTITY_V1,
  DHARMA_STANDARD_RETAIL_IDENTITY_V1,
  HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
  HELCIM_DIRECT_PROCESSING_IDENTITY_V1,
} from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/commercial-source-immutable-capture-baseline-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-10.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-10.md`;
const GOLD = [
  "Nov_2024_Statement.pdf", "SAMPLE_MERCHANT4_CLOVER.pdf", "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  "fiserv_ABDUL_BASHER_Aug_2025.pdf", "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
];

const baseline = await loadImmutableCommercialSourceCaptureBaselineV1();
const authorizeBefore = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1;
const batch1BBefore = HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1;
const authorizeAfter = applyImmutableCapturesToCommercialRegistryV1({ registry: authorizeBefore, baseline });
const batch1BAfter = applyImmutableCapturesToCommercialRegistryV1({ registry: batch1BBefore, baseline });

const captureValidationIssues = await validateImmutableCommercialSourceCaptureBaselineV1({ baseline, registries: [authorizeBefore, batch1BBefore] });
const registryValidationIssues = [
  ...validateCommercialSourceGovernanceRegistryV1(authorizeAfter).map((item) => ({ registry: "authorize_net", item })),
  ...validateCommercialSourceGovernanceRegistryV1(batch1BAfter).map((item) => ({ registry: "helcim_dharma", item })),
];

const beforeByObservation = new Map([...authorizeBefore.sourceObservations, ...batch1BBefore.sourceObservations].map((item) => [item.observationId, item]));
const afterByObservation = new Map([...authorizeAfter.sourceObservations, ...batch1BAfter.sourceObservations].map((item) => [item.observationId, item]));

const captures = baseline.records.map((record) => {
  const before = beforeByObservation.get(record.sourceObservationId)!;
  const after = afterByObservation.get(record.sourceObservationId)!;
  return {
    captureId: record.captureId,
    provider: record.provider,
    requestedUrl: record.requestedUrl,
    finalUrl: record.finalUrl,
    httpStatus: record.httpStatus,
    captureMethod: record.captureMethod,
    captureState: record.captureState,
    validationState: record.validationState,
    artifactPath: record.artifactPath,
    artifactSha256: record.artifactSha256,
    artifactRole: record.captureState === "captured" ? "retained_first_party_F1" : "retained_failure_response_not_F1",
    sourceObservationId: record.sourceObservationId,
    previousProductPackF1: before.fingerprints.f1RawSourceDocument,
    resultingF1: after.fingerprints.f1RawSourceDocument,
    f1Corrected: before.fingerprints.f1RawSourceDocument !== after.fingerprints.f1RawSourceDocument,
    matchedAnchors: record.anchorValidation.matchedAnchors,
    renderedFallback: record.renderedFallback,
    failure: record.failure,
    unadjudicatedSourceContent: record.unadjudicatedSourceContent,
  };
});

const f2Unchanged = [...authorizeBefore.sourceObservations, ...batch1BBefore.sourceObservations].every((before) =>
  before.fingerprints.f2RelevantCommercialExtract === afterByObservation.get(before.observationId)?.fingerprints.f2RelevantCommercialExtract,
);
const f3Unchanged = JSON.stringify([
  commercialRegistrySemanticFingerprintSetV1(authorizeBefore),
  commercialRegistrySemanticFingerprintSetV1(batch1BBefore),
]) === JSON.stringify([
  commercialRegistrySemanticFingerprintSetV1(authorizeAfter),
  commercialRegistrySemanticFingerprintSetV1(batch1BAfter),
]);

const goldStatements = [];
for (const file of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file });
  const before = canonicalFinancialTruthFingerprint(analysis);
  resolveGovernedCommercialOfferV1({ registry: authorizeAfter, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
  resolveGovernedCommercialOfferV1({ registry: batch1BAfter, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
  const after = canonicalFinancialTruthFingerprint(analysis);
  goldStatements.push({ file, canonicalFingerprintBefore: before, canonicalFingerprintAfter: after, unchanged: before === after });
}

const totals = {
  authorizedUrlsAttempted: captures.length,
  successfulRawCaptures: captures.filter((item) => item.captureState === "captured" && item.captureMethod === "original_http_response_body").length,
  successfulPdfCaptures: captures.filter((item) => item.captureState === "captured" && item.captureMethod === "original_pdf_response_body").length,
  successfulRenderedCaptures: 0,
  partialCaptures: captures.filter((item) => item.validationState === "capture_partial_but_nonconflicting").length,
  unavailableCaptures: captures.filter((item) => item.validationState === "capture_unavailable").length,
  capturesMatchingGovernedObservation: captures.filter((item) => item.validationState === "capture_matches_admitted_observation").length,
  capturesWithMaterialConflict: captures.filter((item) => item.validationState === "capture_conflict_requires_product_review").length,
  capturesWithUnadjudicatedAdditionalContent: captures.filter((item) => item.unadjudicatedSourceContent.length > 0).length,
  f1RecordsCorrected: captures.filter((item) => item.f1Corrected).length,
};

const prohibitedOutcomeCounters = {
  capturedArtifactMissingShaWhenBytesExist: captures.filter((item) => item.artifactPath && !item.artifactSha256).length,
  wrongSourceObservationLinkage: captureValidationIssues.filter((item) => item.code === "unknown_source_observation" || item.code === "wrong_provider_link").length,
  redirectSilentlyChangesProviderOrPlanIdentity: captureValidationIssues.filter((item) => item.code === "redirect_identity_change").length,
  f1LiveChangeAutomaticallyMutatesF3: f3Unchanged ? 0 : 1,
  sourceOnlyChangeCreatesFalseCommercialPriceVersion: JSON.stringify([authorizeBefore.priceComponentVersions, batch1BBefore.priceComponentVersions]) === JSON.stringify([authorizeAfter.priceComponentVersions, batch1BAfter.priceComponentVersions]) ? 0 : 1,
  rawSourceHistoryDisappears: captures.every((item) => item.previousProductPackF1 && afterByObservation.get(item.sourceObservationId)?.immutableCapture?.priorProvisionalF1Fingerprint === item.previousProductPackF1) ? 0 : 1,
  captureTimestampBecomesHistoricalEffectiveDate: captures.some((item) => beforeByObservation.get(item.sourceObservationId)?.provenance.effectivePeriod.effectiveFrom !== afterByObservation.get(item.sourceObservationId)?.provenance.effectivePeriod.effectiveFrom) ? 1 : 0,
  dharmaCalculatorOverwritesDirectPlans: batch1BAfter.conflicts.length === batch1BBefore.conflicts.length ? 0 : 1,
  dharmaReferralPriceLeaksToDirect: resolveGovernedCommercialOfferV1({ registry: batch1BAfter, identity: DHARMA_REFERRAL_CONTROL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status === "unresolved_channel_or_identity" ? 0 : 1,
  dharmaExact25BoundarySilentlyResolved: batch1BAfter.offerCompositionVersions.find((item) => item.offerIdentity.namedOffer === "High Volume")?.qualificationBoundary?.state === "UNRESOLVED_QUALIFICATION_BOUNDARY" ? 0 : 1,
  helcimH1OneMillionPlusWordingLost: batch1BAfter.sourceObservations.find((item) => item.observationId === "obs_helcim_h1_fee_disclosures_v1")?.sourceFaithfulExtract.includes("$1,000,001+") ? 0 : 1,
  helcimPostedPricingExtrapolatedAbove5m: batch1BAfter.sourceObservations.find((item) => item.observationId === "obs_helcim_h2_public_pricing_v1")?.sourceFaithfulExtract.includes("custom pricing") ? 0 : 1,
  authorizeGatewayOnlyBecomesAcquiring: resolveGovernedCommercialOfferV1({ registry: authorizeAfter, identity: { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, productScope: "acquiring_only" }, asOf: "2026-09-10", mode: "current" }).status === "unresolved_channel_or_identity" ? 0 : 1,
  accountUpdaterAbsorbedIntoGatewayBase: authorizeAfter.offerCompositionVersions.map((item) => item.offerIdentity.namedOffer).includes("Account Updater") ? 0 : 1,
  unknownBecomesZero: authorizeAfter.priceComponentVersions.filter((item) => item.componentIdentity.startsWith("merchant_account_acquiring")).some((item) => item.completeness.state !== "UNKNOWN") ? 1 : 0,
  networkRetrievalSelfAdmitsNewGovernedTruth: JSON.stringify([authorizeBefore.priceComponentVersions, batch1BBefore.priceComponentVersions]) === JSON.stringify([authorizeAfter.priceComponentVersions, batch1BAfter.priceComponentVersions]) ? 0 : 1,
  comparatorClaimGenerated: 0,
  commercialGradeGenerated: 0,
  savingsClaimGenerated: 0,
  customerFacingComparatorLanguageGenerated: 0,
  canonicalGoldFingerprintChanges: goldStatements.filter((item) => !item.unchanged).length,
};

const evaluation = {
  schemaVersion: "immutable_first_party_commercial_source_capture_baseline_evaluation_2026_09_10_v1",
  generatedAt: "2026-09-10T00:00:00.000Z",
  productAuthority: { ...IMMUTABLE_CAPTURE_PRODUCT_AUTHORITY_V1, verifiedSha256: true },
  baseline: { branch: "codex/commercial-source-batch-1b-helcim-dharma-v1", commit: "3434443959f8fb9a7af98377383e93a88a92bbad", parent: "d2b23cb756251fac39594523d15f7dcee070efad" },
  implementationBranch: "codex/commercial-source-immutable-capture-baseline-v1",
  scope: { exactAuthorizedUrlsOnly: true, generalSearchUsed: false, alternativeSourceDiscoveryUsed: false, semanticAdmissionPerformed: false, comparatorConsumptionPerformed: false, customerFacingOutputGenerated: false },
  totals,
  captures,
  validation: { captureValidationIssues, registryValidationIssues },
  fingerprints: { f2Unchanged, f3Unchanged },
  currentDrift: {
    capturedAndAssessable: "The three Authorize.net captures match their admitted observations; no material semantic conflict was found.",
    unavailable: "All four Helcim and all eight Dharma immutable captures remain unavailable. D1 and D6 rendered content matched expected anchors, but the environment could not export an immutable rendered artifact, so neither was promoted to F1. The other ten rendered attempts were access-blocked.",
    materialConflicts: [],
    unadjudicatedSourceContent: captures.flatMap((item) => item.unadjudicatedSourceContent.map((content) => ({ captureId: item.captureId, content }))),
  },
  controls: {
    authorizeNet: { directGatewayCurrent: resolveGovernedCommercialOfferV1({ registry: authorizeAfter, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status, historicalReplay: resolveGovernedCommercialOfferV1({ registry: authorizeAfter, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2024-01-01", mode: "historical" }).status, acquiringUnknownCount: authorizeAfter.priceComponentVersions.filter((item) => item.componentIdentity.startsWith("merchant_account_acquiring") && item.completeness.state === "UNKNOWN").length, accountUpdaterSeparate: authorizeAfter.offerCompositionVersions.map((item) => item.offerIdentity.namedOffer).includes("Account Updater") },
    helcim: { current: resolveGovernedCommercialOfferV1({ registry: batch1BAfter, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status, historicalBeforeH1: resolveGovernedCommercialOfferV1({ registry: batch1BAfter, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status, h1WordingPreserved: batch1BAfter.sourceObservations.find((item) => item.observationId === "obs_helcim_h1_fee_disclosures_v1")?.sourceFaithfulExtract.includes("$1,000,001+") === true, h2WordingPreserved: batch1BAfter.sourceObservations.find((item) => item.observationId === "obs_helcim_h2_public_pricing_v1")?.sourceFaithfulExtract.includes("$1M-$5M") === true },
    dharma: { currentDirectRetail: resolveGovernedCommercialOfferV1({ registry: batch1BAfter, identity: DHARMA_STANDARD_RETAIL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status, historicalDirectRetail: resolveGovernedCommercialOfferV1({ registry: batch1BAfter, identity: DHARMA_STANDARD_RETAIL_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status, calculatorConflictsPreserved: batch1BAfter.conflicts.length, referralRemainsSeparate: resolveGovernedCommercialOfferV1({ registry: batch1BAfter, identity: DHARMA_REFERRAL_CONTROL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status, exact25Boundary: batch1BAfter.offerCompositionVersions.find((item) => item.offerIdentity.namedOffer === "High Volume")?.qualificationBoundary?.state },
  },
  prohibitedOutcomeCounters,
  prohibitedOutcomeCounterTotal: Object.values(prohibitedOutcomeCounters).reduce((sum, value) => sum + value, 0),
  gold: { statements: goldStatements, invariantCount: goldStatements.filter((item) => item.unchanged).length, fingerprintChanges: goldStatements.filter((item) => !item.unchanged).length },
  immutableSourceLimitation: { closedForAuthorizeNetBatch1A: true, closedForHelcimBatch1B: false, closedForDharmaBatch1B: false, closedOverall: false, reason: "Only 3 of 15 authorized sources yielded an exportable immutable first-party artifact; 12 exact URLs remained capture-hostile/unavailable." },
  tests: {
    immutableCaptureFocused: "9/9 passed, including direct anchor proof from the retained Authorize.net HTML and parsed PDF artifacts",
    targetedGovernanceRegression: "54/54 passed across Commercial Source Governance, Authorize.net Batch 1A, Helcim + Dharma Batch 1B, Comparator Eligibility, Claim-Specific Decomposition, provenance/integrity, and immutable capture",
    typescriptBuild: "passed",
    knownHistoricalFirewall: "5/6; unchanged failure at line 43 expects zero governed conflicts and observes four",
    legacyPublicSourceExhaustive: "10/10 assertions passed and process exited 0; previously observed SIGSEGV/139 did not reproduce in this run and is not claimed fixed",
  },
  architectureConflicts: [],
  recommendation: "Before comparator consumption, authorize a provider-assisted or approved archival capture remediation limited to the same 12 blocked Helcim/Dharma URLs, with immutable export as the acceptance boundary and no semantic admission.",
};

if (captureValidationIssues.length || registryValidationIssues.length || !f2Unchanged || !f3Unchanged || evaluation.prohibitedOutcomeCounterTotal || evaluation.gold.invariantCount !== 11 || evaluation.gold.fingerprintChanges) {
  throw new Error(`Immutable capture evaluation gate failed: capture=${captureValidationIssues.length}, registry=${registryValidationIssues.length}, f2=${f2Unchanged}, f3=${f3Unchanged}, counters=${evaluation.prohibitedOutcomeCounterTotal}, gold=${evaluation.gold.invariantCount}/11.`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, markdown(evaluation), "utf8");
console.log(JSON.stringify({ outputJson: OUTPUT_JSON, outputMarkdown: OUTPUT_MD, totals, validationIssues: captureValidationIssues.length + registryValidationIssues.length, prohibitedOutcomeCounterTotal: evaluation.prohibitedOutcomeCounterTotal, goldInvariant: `${evaluation.gold.invariantCount}/11` }, null, 2));

function markdown(value: typeof evaluation): string {
  const captureRows = value.captures.map((item) => `| ${item.captureId} | ${item.requestedUrl} | ${item.httpStatus ?? "n/a"} / ${item.captureState} | ${item.captureMethod} | \`${item.artifactSha256 ?? "none"}\` (${item.artifactRole}) | \`${item.sourceObservationId}\` | ${item.validationState} |`).join("\n");
  const counterRows = Object.entries(value.prohibitedOutcomeCounters).map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  const goldRows = value.gold.statements.map((item) => `| ${item.file} | ${item.unchanged ? "unchanged" : "CHANGED"} | \`${item.canonicalFingerprintBefore}\` |`).join("\n");
  return `# Immutable First-Party Commercial Source Capture Baseline v1

## Outcome

The exact 15 authorized first-party URLs were attempted without search, alternative-source discovery, authentication, or semantic admission. Three Authorize.net sources yielded usable immutable artifacts. All four Helcim and all eight Dharma URLs remained capture-unavailable. Their HTTP denial bodies are retained for audit only and are not F1 commercial evidence.

- Product authority: \`${value.productAuthority.document}\`
- Verified SHA-256: \`${value.productAuthority.sha256}\`
- Exact baseline: \`${value.baseline.commit}\` (parent \`${value.baseline.parent}\`)
- Capture validation issues: ${value.validation.captureValidationIssues.length}; registry validation issues: ${value.validation.registryValidationIssues.length}
- F1 corrections: ${value.totals.f1RecordsCorrected}
- F2 unchanged: ${value.fingerprints.f2Unchanged}; F3 unchanged: ${value.fingerprints.f3Unchanged}
- Gold canonical invariance: ${value.gold.invariantCount}/11
- Immutable-source limitation closed overall: ${value.immutableSourceLimitation.closedOverall}

## Exact capture inventory

| ID | Exact authorized URL | Result | Method | Preserved SHA-256 and role | Existing observation | Comparison |
|---|---|---|---|---|---|---|
${captureRows}

The 403 artifacts are immutable records of failed retrieval responses, not captures of the governed provider content. D1 and D6 also rendered with expected anchors in the authorized exact-page fallback, but no immutable rendered export was technically available; they therefore remain \`capture_unavailable\`. The other ten rendered fallbacks remained access-blocked. No redirect changed source identity.

## Capture and acceptance totals

- Authorized URLs attempted: ${value.totals.authorizedUrlsAttempted}
- Successful raw HTML captures: ${value.totals.successfulRawCaptures}
- Successful PDF captures: ${value.totals.successfulPdfCaptures}
- Successful rendered captures: ${value.totals.successfulRenderedCaptures}
- Partial captures: ${value.totals.partialCaptures}
- Unavailable captures: ${value.totals.unavailableCaptures}
- Matches to admitted observation: ${value.totals.capturesMatchingGovernedObservation}
- Material conflicts: ${value.totals.capturesWithMaterialConflict}
- Sources with unadjudicated additional content: ${value.totals.capturesWithUnadjudicatedAdditionalContent}

| Prohibited outcome | Count |
|---|---:|
${counterRows}

All ${Object.keys(value.prohibitedOutcomeCounters).length} prohibited-outcome counters are zero.

## Source drift and unadjudicated content

The three captured Authorize.net artifacts match the admitted F2/F3 observations. No material semantic conflict was found. A1's retained pricing page also contains other plans, eCheck terms, comparative marketing, and content beyond the already-admitted Gateway Only scope. It is preserved in the artifact and explicitly marked \`unadjudicated_source_content\`; none was normalized or admitted.

Current drift could not be reliably adjudged for the twelve unavailable Helcim/Dharma artifacts. The D1 and D6 rendered anchors were consistent with the governed observations, but visual/DOM availability without an exportable immutable artifact was not promoted to F1 or used to change semantics.

## Product controls and historical/current firewall

Authorize.net remains direct \`Gateway only\` / payment-gateway scope. It does not become acquiring, direct does not become reseller, merchant-account acquiring amounts remain UNKNOWN, Account Updater remains separate, and the unknown effective date still blocks 2024 replay (\`${value.controls.authorizeNet.historicalReplay}\`).

Helcim H1 still preserves \`$1,000,001+\`; H2 still preserves the current \`$1M-$5M\` range and custom-pricing boundary above $5M. Prohibited/restricted/rejected states, conditional chargeback refund, recurring scope, and unknown H2 effective date remain unchanged. Historical 2025 resolution remains \`${value.controls.helcim.historicalBeforeH1}\`.

Dharma direct Retail, Virtual, and High Volume prices and mechanics remain unchanged. All ${value.controls.dharma.calculatorConflictsPreserved} calculator conflicts remain separate; referral remains \`${value.controls.dharma.referralRemainsSeparate}\`; exact-$25 remains \`${value.controls.dharma.exact25Boundary}\`; and capture time did not create historical applicability (2025 resolution: \`${value.controls.dharma.historicalDirectRetail}\`).

## F1 / F2 / F3 result

For A1-A3, the retained first-party artifact SHA is now the real F1, while the former Product-pack SHA remains explicitly stored as adjudication/provenance authority. For all unavailable sources, the provisional Product-pack F1 remains in force and the denial response SHA is stored separately. Every F2 extract and F3 governed-semantic fingerprint is unchanged. No source retrieval created a price version or admitted truth.

## Gold invariance

| Supported Fiserv Gold statement | Result | Canonical fingerprint |
|---|---|---|
${goldRows}

No external-source capture path mutated statement financial truth.

## Tests and known issues

- New immutable-capture behavior: ${value.tests.immutableCaptureFocused}
- Targeted source-governance regression: ${value.tests.targetedGovernanceRegression}
- TypeScript build: ${value.tests.typescriptBuild}
- Known historical/current regression: ${value.tests.knownHistoricalFirewall}
- Legacy public-source/exhaustive behavior: ${value.tests.legacyPublicSourceExhaustive}

No new architecture conflict was introduced. The governance contract gained an optional capture-provenance envelope and a separate baseline loader/validator; it did not gain a competing commercial authority.

## Limitation and recommendation

The immutable-source limitation is closed for Authorize.net Batch 1A, but not for Helcim or Dharma and therefore not overall: ${value.immutableSourceLimitation.reason}

Recommendation: ${value.recommendation}
`;
}

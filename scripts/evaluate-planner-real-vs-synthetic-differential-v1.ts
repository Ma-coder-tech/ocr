import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { ShadowAiEconomicResolutionPacketV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import {
  inspectPayloadStructuralHazardsV1,
  pathLevelDifferentialV1,
  providerVisibleIdentifierAuditV1,
  reconstructRealVsSyntheticPlannerRequestsV1,
  safeRequestComparisonViewV1,
  validateRealAuthorizationRequestConsistencyV1,
} from "../src/evaluationIntegrity/plannerRealVsSyntheticDifferentialV1.js";

const PARENT = "374dcb8753742bc62f411e5a12685f55314cbf55";
const BRANCH = "codex/planner-real-vs-synthetic-differential-v1";
const HISTORICAL_PATH = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const SYNTHETIC_ISOLATION_PATH = "evaluations/planner-synthetic-compatibility-isolation-v1/evaluation-2026-09-16.json";
const REJECTED_REAL_PATH = "evaluations/planner-stable-schema-live-compatibility-check-v1/evaluation-2026-09-15.json";

const historical = JSON.parse(readFileSync(HISTORICAL_PATH, "utf8"));
const isolation = JSON.parse(readFileSync(SYNTHETIC_ISOLATION_PATH, "utf8"));
const rejectedLive = JSON.parse(readFileSync(REJECTED_REAL_PATH, "utf8"));
const historicalAuthorization = historical.executions.find((execution: any) => execution.family === "AUTHORIZATION_ECONOMICS");
const rejectedAuthorization = rejectedLive.results.find((result: any) => result.family === "AUTHORIZATION_ECONOMICS");
const acceptedSynthetic = isolation.results.find((result: any) => result.ordinal === 3);
if (!historicalAuthorization || !rejectedAuthorization || !acceptedSynthetic) throw new Error("real_vs_synthetic_anchor_missing");

const internalPacket = historicalAuthorization.packet.transmitted as ShadowAiEconomicResolutionPacketV1;
const requests = reconstructRealVsSyntheticPlannerRequestsV1(internalPacket);
const syntheticDiagnostic = inspectPlannerProviderCompatibilityV1(requests.syntheticCall3);
const realDiagnostic = inspectPlannerProviderCompatibilityV1(requests.realAuthorization);
assertIdentity(syntheticDiagnostic, acceptedSynthetic.requestIntegrity, "synthetic_call_3");
assertIdentity(realDiagnostic, rejectedAuthorization.requestIntegrity, "rejected_real_authorization");

const syntheticView = safeRequestComparisonViewV1(requests.syntheticCall3);
const realView = safeRequestComparisonViewV1(requests.realAuthorization);
const differential = pathLevelDifferentialV1(syntheticView, realView);
const realBody = JSON.parse(requests.realAuthorization.body) as Record<string, any>;
const syntheticBody = JSON.parse(requests.syntheticCall3.body) as Record<string, any>;
const realPayloadText = realBody.messages[1].content as string;
const syntheticPayloadText = syntheticBody.messages[1].content as string;
const realPayload = JSON.parse(realPayloadText) as Record<string, any>;
const syntheticPayload = JSON.parse(syntheticPayloadText) as Record<string, any>;
const consistency = validateRealAuthorizationRequestConsistencyV1(requests.realAuthorization, internalPacket);
const schemaRows = differential.filter((row) => row.path.startsWith("$.body.response_format"));
const payloadRows = differential.filter((row) => row.path.startsWith("$.body.messages"));
const requestRows = differential.filter((row) => !row.path.startsWith("$.body.response_format") && !row.path.startsWith("$.body.messages"));

const artifact = {
  schemaVersion: "planner_real_vs_synthetic_request_differential_2026_09_16_v1",
  parent: PARENT,
  branch: BRANCH,
  purpose: "OFFLINE_REAL_VS_SYNTHETIC_REQUEST_DIFFERENTIAL_ONLY",
  anchors: {
    successfulSyntheticCall3: requestSummary(requests.syntheticCall3, syntheticDiagnostic, {
      sourceCommit: PARENT,
      sourceArtifact: SYNTHETIC_ISOLATION_PATH,
      httpStatus: acceptedSynthetic.provider.httpStatus,
      accepted: acceptedSynthetic.accepted,
    }),
    rejectedRealAuthorizationEconomics: requestSummary(requests.realAuthorization, realDiagnostic, {
      sourceCommit: "0b969b5647ae77749a68fdea9d9830903ba79cfb",
      sourceArtifact: REJECTED_REAL_PATH,
      httpStatus: rejectedAuthorization.provider.httpStatus,
      accepted: rejectedAuthorization.validation.accepted,
    }),
  },
  differentialSummary: {
    totalLeafPaths: differential.length,
    classifications: countClassifications(differential),
    schemaPathCount: schemaRows.length,
    payloadMessagePathCount: payloadRows.length,
    otherRequestPathCount: requestRows.length,
  },
  exactPathLevelDifferential: differential,
  groupedDifferential: {
    providerFacingSchema: schemaRows,
    providerFacingPayloadAndMessages: payloadRows,
    otherRequestAndTransport: requestRows,
  },
  exactSchemaDifferences: {
    schemaBytesDiffer: syntheticDiagnostic.providerSchemaBytes !== realDiagnostic.providerSchemaBytes,
    schemaShaDiffer: syntheticDiagnostic.providerSchemaSha256 !== realDiagnostic.providerSchemaSha256,
    schemaName: {
      synthetic: syntheticBody.response_format.json_schema.name,
      real: realBody.response_format.json_schema.name,
      syntheticLength: syntheticBody.response_format.json_schema.name.length,
      realLength: realBody.response_format.json_schema.name.length,
      bothSimpleIdentifierCharacters: [syntheticBody.response_format.json_schema.name, realBody.response_format.json_schema.name]
        .every((value: string) => /^[A-Za-z0-9_-]+$/.test(value)),
    },
    syntheticMetrics: schemaMetrics(syntheticDiagnostic),
    realMetrics: schemaMetrics(realDiagnostic),
    semanticDelta: [
      { path: "schema.properties.issueId", synthetic: "packet-specific const", real: "stable identifier pattern", classification: "CHANGED" },
      { path: "schema.properties.inputHash.const", synthetic: "packet-specific const", real: null, classification: "SYNTHETIC_ONLY" },
      { path: "schema.properties.inputHash.pattern", synthetic: "64-hex pattern", real: "64-hex pattern", classification: "UNCHANGED" },
      { path: "schema.properties.requiredEvidenceClasses.items.enum", synthetic: "synthetic packet subset; cardinality 3", real: "complete Product set; cardinality 8", classification: "CHANGED" },
      { path: "response_format.json_schema.name", synthetic: syntheticBody.response_format.json_schema.name,
        real: realBody.response_format.json_schema.name, classification: "CHANGED" },
    ],
    typedReferencePatternsIdentical: referencePatterns(syntheticBody) === referencePatterns(realBody),
    requiredPathsIdentical: canonicalJson(syntheticBody.response_format.json_schema.schema.required)
      === canonicalJson(realBody.response_format.json_schema.schema.required),
    additionalPropertiesPolicyIdentical: syntheticBody.response_format.json_schema.schema.additionalProperties
      === realBody.response_format.json_schema.schema.additionalProperties,
    realOnlySchemaSpecialization: "No packet-derived enum or const remains. Real-only constructs are the stable issueId pattern and full Product evidence-class enum; inputHash retains the same hex pattern but drops the synthetic const.",
  },
  exactPayloadMessageDifferences: {
    systemMessage: compareMessage(syntheticBody.messages[0].content, realBody.messages[0].content),
    userMessage: compareMessage(syntheticPayloadText, realPayloadText),
    userPayloadRootKeys: { synthetic: Object.keys(syntheticPayload).sort(), real: Object.keys(realPayload).sort() },
    packetFieldNamesIdentical: canonicalJson(Object.keys(syntheticPayload.packet).sort()) === canonicalJson(Object.keys(realPayload.packet).sort()),
    syntheticPacketStructure: packetStructureSummary(syntheticPayload.packet),
    realProviderPacketStructure: packetStructureSummary(realPayload.packet),
    realOnlyIssueContext: realPayload.issueContext ? issueContextStructure(realPayload.issueContext) : null,
    keyDifference: "Synthetic Call 3 transmits a synthetic raw-reference packet under {packet}; the real request transmits a Package B request-scoped alias packet under {issueContext,packet}.",
  },
  identifierAndNamingAudit: {
    real: providerVisibleIdentifierAuditV1(requests.realAuthorization),
    synthetic: syntheticIdentifierAudit(syntheticBody, syntheticPayload),
    finding: "All provider-visible names and identifiers use ASCII, contain no whitespace/control characters, and satisfy their locally expected patterns. No duplicate real alias exists.",
  },
  issueAndInputBindingDifferences: {
    synthetic: {
      issueIdProviderConstraint: "const",
      inputHashProviderConstraint: "const plus 64-hex pattern",
      localReferenceMapBinding: false,
      payloadEnvelope: ["packet"],
    },
    real: {
      issueIdProviderConstraint: "stable identifier pattern",
      inputHashProviderConstraint: "64-hex pattern only",
      localReferenceMapBinding: true,
      payloadEnvelope: ["issueContext", "packet"],
      deterministicBindingChecksPass: consistency.checks.issueContextMatchesProviderPacket
        && consistency.checks.referenceMapIssueBindingMatches && consistency.checks.referenceMapInputHashBindingMatches,
    },
  },
  aliasContentDifferences: {
    synthetic: {
      requestScopedAliasesInPacket: false,
      referenceRepresentation: "synthetic descriptive reference strings",
      outputSchemaReferenceConstraint: "typed alias patterns",
      packetAndOutputReferenceConstraintSemanticallyAligned: false,
    },
    real: {
      requestScopedAliasesInPacket: true,
      referenceRepresentation: "typed request-scoped opaque aliases",
      outputSchemaReferenceConstraint: "same typed alias patterns as synthetic Call 3",
      packetAndOutputReferenceConstraintSemanticallyAligned: true,
      summary: consistency.aliasSummary,
    },
    finding: "The schema patterns are identical. Only the real payload actually contains matching request-scoped alias values and a local reverse map; the reverse map is not serialized.",
  },
  evidenceClassDifferences: {
    syntheticPacketCount: syntheticPayload.packet.allowedEvidenceClasses.length,
    realPacketCount: realPayload.packet.allowedEvidenceClasses.length,
    syntheticProviderSchemaEnumCount: syntheticBody.response_format.json_schema.schema.properties.requiredEvidenceClasses.items.enum.length,
    realProviderSchemaEnumCount: realBody.response_format.json_schema.schema.properties.requiredEvidenceClasses.items.enum.length,
    realPacketValuesKnownAndSchemaContained: consistency.evidenceClassSummary.packetValuesAreKnownAndSchemaContained,
    finding: "The real packet uses two valid classes, both contained in the real schema's fixed eight-class Product enum. No packet/schema disagreement exists.",
  },
  payloadStructuralHazards: {
    synthetic: inspectPayloadStructuralHazardsV1(syntheticPayloadText),
    real: inspectPayloadStructuralHazardsV1(realPayloadText),
    finding: "Both payloads parse. The real payload has no control characters, malformed Unicode replacements, or duplicate array values; no concrete content-serialization hazard was found.",
  },
  localValidationSimulation: consistency,
  failureLayerAssessment: {
    schemaCandidates: [
      "ninth issueId pattern replacing a packet-specific const",
      "inputHash const removal",
      "schema-name change",
      "requiredEvidenceClasses enum expansion from 3 to 8",
    ],
    payloadMessageCandidates: [
      "real issueContext envelope", "Package B request-scoped alias content", "real issue/reason/business-context values",
    ],
    requestRejectionPlausibility: "Provider-facing schema metadata/keywords remain the more direct HTTP 400 candidates. Message content is valid JSON and structurally safe; no repository evidence shows OpenRouter semantically cross-validating message packet references against response_format before generation.",
  },
  rankedRemainingHypotheses: [
    {
      rank: 1,
      code: "ISSUE_ID_PATTERN_BINDING_INTERACTION",
      exactConstruct: "response_format.json_schema.schema.properties.issueId: synthetic const -> real stable pattern",
      syntheticShape: "const-bound synthetic issue identifier; total schema pattern count 8",
      realShape: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$; total schema pattern count 9",
      whyPlausible: "It is the only additional pattern not exercised by successful Call 3 and changes request binding under strict structured output.",
      evidenceSupporting: "Call 3 proved the seven typed-reference patterns but retained the historical issueId const.",
      evidenceAgainst: "The regex is locally valid, the real issue ID matches it, and replacing const with a broader pattern simplifies rather than specializes output generation.",
      eliminatedOffline: false,
      smallestFutureLiveTest: "Starting from successful synthetic Call 3, replace only issueId const with the real stable issueId pattern; keep schema name, inputHash const, evidence enum, messages, and packet unchanged.",
    },
    {
      rank: 2,
      code: "SCHEMA_METADATA_AND_REMAINING_BINDING_DELTA",
      exactConstruct: "schema name, inputHash const removal, and evidence-class enum expansion",
      syntheticShape: "historical synthetic schema name; inputHash const+pattern; three-class evidence enum",
      realShape: "stable schema name; inputHash pattern only; fixed eight-class Product enum",
      whyPlausible: "All are inside response_format and therefore visible to request/schema validation before model output.",
      evidenceSupporting: "They are exact residual schema differences after typed-reference patterns were held equal.",
      evidenceAgainst: "Both schema names are simple identifiers, inputHash const removal weakens a constraint, and the real evidence enum values are valid and modest in cardinality.",
      eliminatedOffline: false,
      smallestFutureLiveTest: "Only after the issueId-pattern test succeeds, change one residual construct per synthetic call in this order: inputHash const removal, evidence enum expansion, schema name.",
    },
    {
      rank: 3,
      code: "REAL_PAYLOAD_ALIAS_ENVELOPE_INTERACTION",
      exactConstruct: "messages[1] {packet} -> {issueContext,packet} with Package B aliases and real bounded context",
      syntheticShape: "synthetic descriptive references; no issueContext; no serialized binding map",
      realShape: "typed request-scoped aliases; issueContext; provider-bound packet hash",
      whyPlausible: "It is the largest real-only request content difference after schema deltas.",
      evidenceSupporting: "Only the rejected real request combines typed patterns with matching alias content and request binding.",
      evidenceAgainst: "The real payload is valid, privacy-contained, pattern-conforming, bounded, and free of structural hazards; ordinary message content is less likely to produce request-parameter HTTP 400.",
      eliminatedOffline: false,
      smallestFutureLiveTest: "Defer until all residual schema-only deltas succeed; then use a fully synthetic Package B alias packet while keeping the successful schema fixed.",
    },
  ],
  eliminatedOffline: [
    "typed-reference patterns as a sufficient cause",
    "broad provider/model transport drift",
    "request JSON parse failure",
    "invalid schema-name character set",
    "issue ID failing its real pattern",
    "input hash failing its hexadecimal pattern",
    "malformed, duplicate, whitespace-bearing, or non-pattern alias tokens",
    "unknown or schema-excluded real evidence classes",
    "raw internal-reference or source-identity leakage",
    "control characters, malformed Unicode replacement, or invalid JSON escaping in the real user payload",
    "request-size growth as the distinguishing mechanism",
  ],
  minimalFutureExperiment: {
    authorizedNow: false,
    providerCalls: 1,
    request: "successful synthetic Call 3 with only issueId const replaced by Package C's stable issueId pattern",
    data: "synthetic only",
    retries: 0,
    purpose: "isolate the ninth issueId pattern/request-binding change",
    stopAfterResult: true,
  },
  architecture: {
    conflictFound: false,
    packageBPrivacyPreserved: true,
    packageCStableSchemaPreserved: true,
    fixImplemented: false,
  },
  executionBoundary: {
    offlineOnly: true, providerCalls: 0, networkCalls: 0, researchOperations: 0, evidenceAdmissions: 0,
    truthMutations: 0, customerOutputs: 0, productionRoutingChanges: 0, compatibilityFixes: 0,
  },
  recommendation: "Accept the offline elimination. If Product authorizes another live diagnostic, use one synthetic call that changes only issueId const to the stable issueId pattern; do not change the real planner or run a real packet.",
};

const serialized = JSON.stringify(artifact, null, 2);
assertArtifactSafe(serialized, internalPacket);
console.log(serialized);

function requestSummary(request: any, diagnostic: any, source: any) {
  const body = JSON.parse(request.body);
  return {
    ...source,
    endpoint: request.endpoint,
    method: request.method,
    safeHeaderNames: Object.keys(request.headers).sort(),
    requestBodyBytes: diagnostic.requestBodyBytes,
    requestBodySha256: diagnostic.requestBodySha256,
    providerSchemaBytes: diagnostic.providerSchemaBytes,
    providerSchemaSha256: diagnostic.providerSchemaSha256,
    schemaName: body.response_format.json_schema.name,
    model: body.model,
    routing: body.provider,
    generation: { store: body.store, stream: body.stream, temperature: body.temperature, maxTokens: body.max_tokens },
    responseFormat: { type: body.response_format.type, strict: body.response_format.json_schema.strict },
    messageRoles: body.messages.map((message: any) => message.role),
    messageBytes: body.messages.map((message: any) => Buffer.byteLength(message.content, "utf8")),
  };
}

function schemaMetrics(value: any) {
  return {
    bytes: value.providerSchemaBytes, sha256: value.providerSchemaSha256, depth: value.schemaDepth,
    nodes: value.schemaNodeCount, patterns: value.patternCount, enums: value.enumNodeCount,
    enumLiterals: value.totalEnumLiteralCount, consts: value.constCount, arrays: value.arraySchemaNodeCount,
    minItems: value.minimumItemsConstraintCount, requiredLiterals: value.requiredFieldLiteralCount,
  };
}

function referencePatterns(body: any): string {
  const schema = body.response_format.json_schema.schema;
  return canonicalJson([
    schema.properties.exactCitedFactRefs.items.pattern,
    schema.properties.primaryHypothesis.properties.supportingFactRefs.items.pattern,
    schema.properties.primaryHypothesis.properties.contradictingFactRefs.items.pattern,
    schema.properties.alternativeHypotheses.items.properties.supportingFactRefs.items.pattern,
    schema.properties.alternativeHypotheses.items.properties.contradictingFactRefs.items.pattern,
    schema.properties.reconstructionSuspicions.items.properties.exactAcceptedFactOrOccurrenceRefs.items.pattern,
    schema.properties.reconstructionSuspicions.items.properties.conflictingEvidenceRefs.items.pattern,
  ]);
}

function compareMessage(synthetic: string, real: string) {
  return {
    syntheticBytes: Buffer.byteLength(synthetic, "utf8"), realBytes: Buffer.byteLength(real, "utf8"),
    syntheticSha256: sha256(synthetic), realSha256: sha256(real), identical: synthetic === real,
  };
}

function packetStructureSummary(packet: Record<string, any>) {
  return {
    fieldNames: Object.keys(packet).sort(),
    activityFactCount: packet.acceptedIssueRelevantActivityFacts.length,
    rdChargeReferenceCount: packet.selectedRdChargeRefs.length,
    feeLabelCount: packet.sanitizedFeeLabels.length,
    economicCategoryCount: packet.acceptedEconomicCategories.length,
    sensitivityStateCount: packet.acceptedSensitivityStates.length,
    participantControlStateCount: packet.acceptedParticipantControlStates.length,
    unresolvedFacetCount: packet.unresolvedClaimFacets.length,
    unresolvedReasonCodeCount: packet.unresolvedReasonCodes.length,
    acceptedFactReferenceCount: packet.acceptedFactRefs.length,
    governedEvidenceReferenceCount: packet.currentGovernedEvidenceRefs.length,
    allowedEvidenceClassCount: packet.allowedEvidenceClasses.length,
    prohibitedConclusionCount: packet.prohibitedConclusions.length,
    businessContextNull: packet.merchantBusinessContext === null,
    inputHashShapeValid: typeof packet.immutableInputHash === "string" && /^[a-f0-9]{64}$/.test(packet.immutableInputHash),
  };
}

function issueContextStructure(value: Record<string, any>) {
  return {
    fieldNames: Object.keys(value).sort(),
    unresolvedFacetCount: value.unresolvedFacets.length,
    unresolvedReasonCodeCount: value.unresolvedReasonCodes.length,
    issueIdStatistics: safeString(value.issueId),
    issueClassStatistics: safeString(value.issueClass),
    unresolvedQuestionStatistics: safeString(value.unresolvedQuestion),
  };
}

function syntheticIdentifierAudit(body: any, payload: any) {
  const schemaName = body.response_format.json_schema.name as string;
  const issueId = payload.packet.issueId as string;
  const inputHash = payload.packet.immutableInputHash as string;
  return {
    schemaName: { ...safeString(schemaName), matchesSimpleNameCharacters: /^[A-Za-z0-9_-]+$/.test(schemaName) },
    issueId: { ...safeString(issueId), constrainedByConst: body.response_format.json_schema.schema.properties.issueId.const === issueId },
    inputHash: { ...safeString(inputHash), matchesHexPattern: /^[a-f0-9]{64}$/.test(inputHash),
      constrainedByConst: body.response_format.json_schema.schema.properties.inputHash.const === inputHash },
  };
}

function safeString(value: string) {
  return { characters: [...value].length, bytes: Buffer.byteLength(value, "utf8"), sha256: sha256(value),
    asciiOnly: /^[\x20-\x7E]+$/.test(value), containsWhitespace: /\s/.test(value),
    containsControlCharacters: /[\u0000-\u001F\u007F]/.test(value) };
}

function countClassifications(rows: readonly { classification: string }[]) {
  return rows.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.classification]: (counts[row.classification] ?? 0) + 1 }),
    { UNCHANGED: 0, CHANGED: 0, SYNTHETIC_ONLY: 0, REAL_ONLY: 0 });
}

function assertIdentity(actual: any, recorded: any, name: string) {
  const valid = actual.requestBodyBytes === recorded.requestBodyBytes && actual.requestBodySha256 === recorded.requestBodySha256
    && actual.providerSchemaBytes === recorded.providerSchemaBytes && actual.providerSchemaSha256 === recorded.providerSchemaSha256;
  if (!valid) throw new Error(`${name}_identity_mismatch`);
}

function assertArtifactSafe(value: string, packet: ShadowAiEconomicResolutionPacketV1) {
  const prohibited = [
    packet.merchantBusinessContext?.businessName,
    ...packet.sanitizedFeeLabels,
    ...packet.acceptedFactRefs,
    ...packet.currentGovernedEvidenceRefs,
    ...packet.selectedRdChargeRefs,
    ...packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => [fact.factRef, ...fact.evidenceRefs]),
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  if (prohibited.some((item) => value.includes(item))) throw new Error("real_vs_synthetic_artifact_sensitive_value_leak");
  if (/Bearer\s|sk-or-v1-|OPENROUTER_API_KEY|"Authorization"\s*:/i.test(value)) throw new Error("real_vs_synthetic_artifact_secret_leak");
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

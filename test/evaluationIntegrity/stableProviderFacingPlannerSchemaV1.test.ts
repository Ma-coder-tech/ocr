import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  inspectShadowAiProviderBoundRequestPrivacyV1,
  providerAliasForInternalReferenceV1,
  restoreShadowAiProviderReferencesV1,
} from "../../src/canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import type { ShadowAiEconomicResolutionPacketV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import {
  STABLE_PROVIDER_FACT_REFERENCE_PATTERN_V1,
  STABLE_PROVIDER_FACING_PLANNER_SCHEMA_VERSION_V1,
  STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1,
  buildOpenRouterFullPlannerSchemaPreflightRequestV1,
  createSyntheticFullPlannerPacketV1,
} from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";

describe("Package C stable provider-facing planner schema v1", () => {
  it("is byte-identical across issue, evidence-class, and reference-cardinality changes", () => {
    const packets = [
      variantPacket(0, "stable_zero", ["ACCEPTED_STATEMENT_FACT"]),
      variantPacket(1, "stable_one", ["MERCHANT_ATTESTATION"]),
      variantPacket(8, "stable_small", ["MERCHANT_CONTRACT_OR_SCHEDULE"]),
      variantPacket(128, "stable_large", ["GOVERNED_PUBLIC_SOURCE", "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"]),
      variantPacket(300, "stable_very_large", ["ADDITIONAL_COMPATIBLE_STATEMENT"]),
    ];
    const requests = packets.map((packet) => buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", packet));
    const diagnostics = requests.map(inspectPlannerProviderCompatibilityV1);

    expect(STABLE_PROVIDER_FACING_PLANNER_SCHEMA_VERSION_V1).toBe("shadow_ai_economic_resolution_provider_schema_2026_09_15_v1");
    expect(new Set(diagnostics.map((item) => item.providerSchemaSha256)).size).toBe(1);
    expect(new Set(diagnostics.map((item) => item.providerSchemaBytes)).size).toBe(1);
    expect(new Set(diagnostics.map((item) => schemaSignature(item)))).toEqual(new Set([schemaSignature(diagnostics[0] as any)]));
    expect(diagnostics.at(-1)!.requestBodyBytes).toBeGreaterThan(diagnostics[0]!.requestBodyBytes);
  });

  it("contains only stable token patterns and fixed Product-domain enums", () => {
    const packet = variantPacket(12, "stable_inventory", ["MERCHANT_ATTESTATION"]);
    const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", packet);
    const schemaText = canonicalJson(request.providerSchema);
    const enums = collectKeywordArrays(request.providerSchema, "enum");
    const consts = collectKeywordValues(request.providerSchema, "const");

    expect(schemaText).not.toContain(packet.issueId);
    expect(schemaText).not.toContain(request.referenceMap.providerInputHash);
    expect((request.providerSchema as any).properties.issueId).toEqual({ type: "string" });
    for (const entry of request.referenceMap.entries) expect(schemaText).not.toContain(entry.alias);
    expect(schemaText).toContain(STABLE_PROVIDER_FACT_REFERENCE_PATTERN_V1);
    expect(schemaText).toContain(STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1);
    expect(enums.flat()).not.toContain("MERCHANT_ATTESTATION_ONLY_FOR_THIS_PACKET");
    expect(enums.flat().some((value) => typeof value === "string" && value.startsWith("prv_"))).toBe(false);
    expect(consts).toEqual(expect.arrayContaining(["AI_INFERENCE_ONLY", "NON_AUTHORITATIVE", "NOT_ADMITTED", "NONE", false, true]));
  });

  it("keeps issued aliases request-bound and class-bound after structural schema acceptance", () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", packet);
    const output = minimalBoundOutput(request.referenceMap);
    const fact = alias(request, "FACT");
    const statementEvidence = alias(request, "STATEMENT_EVIDENCE");
    const governed = alias(request, "GOVERNED_EVIDENCE");
    const charge = alias(request, "ECONOMIC_CHARGE");

    expect(fact).toMatch(new RegExp(STABLE_PROVIDER_FACT_REFERENCE_PATTERN_V1));
    for (const value of [fact, governed, charge]) expect(value).toMatch(new RegExp(STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1));
    expect(request.body).toContain(statementEvidence);
    expect(inspectShadowAiProviderBoundRequestPrivacyV1(request.body, request.referenceMap).valid).toBe(true);
    expect(restoreShadowAiProviderReferencesV1(output, request.referenceMap).ok).toBe(true);
    expect(restoreShadowAiProviderReferencesV1({ ...output, exactCitedFactRefs: [statementEvidence] }, request.referenceMap)).toMatchObject({
      ok: false,
      errorCodes: ["shadow_planner_provider_reference_alias_wrong_class"],
    });
  });

  it("rejects syntactically valid unissued, cross-request, wrong-class, malformed, mixed, and overlong tokens", () => {
    const first = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", variantPacket(3, "stable_first", ["ACCEPTED_STATEMENT_FACT"]));
    const second = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", variantPacket(3, "stable_second", ["ACCEPTED_STATEMENT_FACT"]));
    const output = minimalBoundOutput(first.referenceMap);
    const fact = alias(first, "FACT");
    const wrongClass = alias(first, "GOVERNED_EVIDENCE");
    const crossRequest = alias(second, "FACT");
    const unissued = `prv_${first.referenceMap.scopeToken}_f_9999`;
    const cases = [
      [unissued, "shadow_planner_provider_reference_alias_unknown"],
      [crossRequest, "shadow_planner_provider_reference_alias_cross_packet"],
      [wrongClass, "shadow_planner_provider_reference_alias_wrong_class"],
      ["not-an-alias", "shadow_planner_provider_reference_alias_malformed"],
      [`prv_${first.referenceMap.scopeToken}_f_${"9".repeat(20_000)}`, "shadow_planner_provider_reference_alias_malformed"],
    ] as const;
    for (const [candidate, error] of cases) {
      expect(restoreShadowAiProviderReferencesV1({ ...output, exactCitedFactRefs: [candidate] }, first.referenceMap)).toMatchObject({ ok: false, errorCodes: [error] });
    }
    expect(restoreShadowAiProviderReferencesV1({ ...output, exactCitedFactRefs: [fact, unissued] }, first.referenceMap)).toMatchObject({
      ok: false,
      errorCodes: ["shadow_planner_provider_reference_alias_unknown"],
    });
  });

  it("rejects raw internal/source identities and alias tokens embedded in prose", () => {
    const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", createSyntheticFullPlannerPacketV1());
    const output = minimalBoundOutput(request.referenceMap);
    const fact = alias(request, "FACT");
    const internalFact = request.referenceMap.entries.find((entry) => entry.referenceClass === "FACT")!.internalReference;
    const mutations = [
      { ...output, exactCitedFactRefs: [internalFact] },
      { ...output, internalExplanationDraft: "Inspect document-ir:block-9 before accepting this." },
      { ...output, internalExplanationDraft: "Inspect invented-source.md before accepting this." },
      { ...output, internalExplanationDraft: `The token ${fact} is asserted here instead of a citation field.` },
      { ...output, internalExplanationDraft: `Embedded raw support ${internalFact} must not be accepted.` },
    ];
    for (const mutation of mutations) expect(restoreShadowAiProviderReferencesV1(mutation, request.referenceMap).ok).toBe(false);
  });

  it("keeps schema-level structural acceptance separate from local evidence authority", () => {
    const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", createSyntheticFullPlannerPacketV1());
    const syntacticallyValidButUnissued = `prv_${request.referenceMap.scopeToken}_f_9999`;
    expect(syntacticallyValidButUnissued).toMatch(new RegExp(STABLE_PROVIDER_FACT_REFERENCE_PATTERN_V1));
    expect(restoreShadowAiProviderReferencesV1({
      ...minimalBoundOutput(request.referenceMap),
      exactCitedFactRefs: [syntacticallyValidButUnissued],
    }, request.referenceMap).ok).toBe(false);
  });

  it("records six-request, stress, and full-Gold stability without merchant payloads or live claims", () => {
    const historicalPath = "evaluations/planner-stable-provider-facing-schema-v1/historical-six-comparison-2026-09-15.json";
    const goldPath = "evaluations/planner-stable-provider-facing-schema-v1/gold-offline-validation-2026-09-15.json";
    const historicalText = readFileSync(historicalPath, "utf8");
    const goldText = readFileSync(goldPath, "utf8");
    const historical = JSON.parse(historicalText);
    const gold = JSON.parse(goldText);

    expect(historical.reconstructedHistoricalRequestCount).toBe(6);
    expect(historical.aggregate).toMatchObject({ identicalProviderSchemaAcrossSix: true, uniqueProviderSchemaShaCount: 1,
      uniqueProviderSchemaByteCount: 1, exactLocalRoundTripCount: 6, acceptedPlannerValidationCount: 6,
      rawInternalReferenceLeakageCount: 0, sourceIdentityLeakageCount: 0, reverseMapMaterialLeakageCount: 0 });
    expect(historical.stress).toMatchObject({ referenceCounts: [0, 1, 8, 64, 128, 256, 512], identicalSchemaBytesShaAndMetrics: true });
    expect(gold).toMatchObject({ providerCalls: 0, statementCount: 11, issueCount: 60,
      stableSchema: { uniqueProviderSchemaShaCount: 1, uniqueProviderSchemaByteCount: 1, packetSpecificReferenceEnumCount: 0 },
      grounding: { exactReferenceRoundTripCount: 60, acceptedPlannerValidationCount: 60, plannerSemanticInvarianceCount: 60 } });
    expect(Object.values(gold.privacy)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    for (const text of [historicalText, goldText]) {
      expect(text).not.toMatch(/(?:\/Users\/|\/private\/|document-ir:|pdfjs-line-|srcocc_|fact_v2_|accepted_profile_fact:|economic_charge_)/i);
      expect(text).not.toContain('"referenceMap"');
      expect(text).not.toContain('"internalReference"');
    }
  });
});

function variantPacket(referenceCount: number, issueId: string, evidenceClasses: string[]): ShadowAiEconomicResolutionPacketV1 {
  const base = JSON.parse(JSON.stringify(createSyntheticFullPlannerPacketV1())) as Record<string, any>;
  base.issueId = issueId;
  base.opaqueRunRef = `shadow-run-${createHash("sha256").update(issueId).digest("hex").slice(0, 24)}`;
  base.acceptedIssueRelevantActivityFacts = referenceCount === 0 ? [] : [{
    factRef: "synthetic_stable_fact_0001",
    field: "synthetic_stable_field",
    state: "KNOWN",
    value: "SYNTHETIC_VALUE",
    population: "SYNTHETIC_POPULATION",
    evidenceRefs: Array.from({ length: referenceCount }, (_, index) => `synthetic_statement_ref_${index}`),
  }];
  base.acceptedFactRefs = referenceCount === 0 ? [] : ["synthetic_stable_fact_0001"];
  base.currentGovernedEvidenceRefs = Array.from({ length: referenceCount }, (_, index) => `synthetic_governed_ref_${index}`);
  base.selectedRdChargeRefs = referenceCount === 0 ? [] : ["synthetic_charge_0001"];
  base.acceptedParticipantControlStates = [];
  base.allowedEvidenceClasses = evidenceClasses;
  delete base.immutableInputHash;
  return Object.freeze({ ...base, immutableInputHash: createHash("sha256").update(canonicalJson(base)).digest("hex") }) as ShadowAiEconomicResolutionPacketV1;
}

function minimalBoundOutput(referenceMap: any) {
  const fact = providerAliasForInternalReferenceV1(referenceMap, "FACT", referenceMap.entries.find((entry: any) => entry.referenceClass === "FACT")!.internalReference)!;
  return {
    issueId: referenceMap.issueId,
    inputHash: referenceMap.providerInputHash,
    exactCitedFactRefs: [fact],
    primaryHypothesis: { supportingFactRefs: [fact], contradictingFactRefs: [] },
    alternativeHypotheses: [],
    reconstructionSuspicions: [],
    internalExplanationDraft: "Synthetic unresolved reasoning only.",
  };
}

function alias(request: any, referenceClass: "FACT" | "STATEMENT_EVIDENCE" | "GOVERNED_EVIDENCE" | "ECONOMIC_CHARGE") {
  const value = request.referenceMap.entries.find((entry: any) => entry.referenceClass === referenceClass)?.alias;
  if (!value) throw new Error(`test_alias_missing:${referenceClass}`);
  return value as string;
}

function collectKeywordArrays(value: unknown, keyword: string): unknown[][] {
  if (Array.isArray(value)) return value.flatMap((item) => collectKeywordArrays(item, keyword));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [...(Array.isArray(record[keyword]) ? [record[keyword] as unknown[]] : []),
    ...Object.values(record).flatMap((item) => collectKeywordArrays(item, keyword))];
}

function collectKeywordValues(value: unknown, keyword: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectKeywordValues(item, keyword));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [...(Object.hasOwn(record, keyword) ? [record[keyword]] : []),
    ...Object.values(record).flatMap((item) => collectKeywordValues(item, keyword))];
}

function schemaSignature(value: any): string {
  return canonicalJson({ providerSchemaBytes: value.providerSchemaBytes, schemaDepth: value.schemaDepth,
    schemaNodeCount: value.schemaNodeCount, enumNodeCount: value.enumNodeCount,
    maximumEnumCardinality: value.maximumEnumCardinality, totalEnumLiteralCount: value.totalEnumLiteralCount,
    totalEnumLiteralBytes: value.totalEnumLiteralBytes, constCount: value.constCount,
    arraySchemaNodeCount: value.arraySchemaNodeCount, patternCount: value.patternCount });
}

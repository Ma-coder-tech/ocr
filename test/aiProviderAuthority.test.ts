import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_AUTHORITY_CLASSES,
  canonicalV2RgAuthorityTelemetry,
  evaluationOnlyAiTelemetry,
  isSupportedFiservParserDriverId,
  normalMultiStatementAiContainmentTelemetry,
  shouldRunLegacyAiRefinement,
  supportedFiservLegacyAiContainmentTelemetry,
} from "../src/aiProviderAuthority.js";

describe("AI provider authority telemetry", () => {
  it("publishes the three bounded authority classes", () => {
    expect(AI_PROVIDER_AUTHORITY_CLASSES).toEqual([
      "CANONICAL_V2_GOVERNED_RESEARCH",
      "LEGACY_AI_PROHIBITED_SUPPORTED_FISERV",
      "EVALUATION_ONLY",
    ]);
  });

  it("reports supported-Fiserv legacy AI as blocked before dispatch with zero attempts", () => {
    expect(supportedFiservLegacyAiContainmentTelemetry()).toMatchObject({
      authority: "LEGACY_AI_PROHIBITED_SUPPORTED_FISERV",
      scope: "supported_fiserv_single_statement",
      providerCallAttempts: 0,
      disposition: "blocked_before_dispatch",
      operations: [
        "statement_notice_ai_extraction",
        "benchmark_category_ai_inference",
        "processor_fee_ai_classification",
        "fiserv_v2_fee_analysis_ai_classification",
        "full_statement_anomaly_ai_review",
        "single_statement_merchant_narrative_ai",
        "ai_fallback_refinement",
      ],
    });
    expect(normalMultiStatementAiContainmentTelemetry()).toMatchObject({
      authority: "LEGACY_AI_PROHIBITED_SUPPORTED_FISERV",
      scope: "normal_multi_statement",
      providerCallAttempts: 0,
      operations: ["multi_statement_narrative_ai"],
    });
  });

  it("keeps canonical-v2 RG governed and marks injected legacy dependencies evaluation-only", () => {
    expect(canonicalV2RgAuthorityTelemetry(2)).toMatchObject({
      authority: "CANONICAL_V2_GOVERNED_RESEARCH",
      providerCallAttempts: 2,
      disposition: "conditionally_available",
    });
    expect(evaluationOnlyAiTelemetry("package_f_whole_statement_fee_intelligence")).toMatchObject({
      authority: "EVALUATION_ONLY",
      scope: "evaluation",
      providerCallAttempts: 0,
      disposition: "evaluation_dependency_only",
    });
  });

  it("recognizes only the supported Fiserv driver set for legacy containment", () => {
    for (const driverId of [
      "fiserv_first_data_full_statement",
      "fiserv_first_data_short_statement",
      "fiserv_first_data_processor_statement",
      "generic_fiserv_family_statement",
    ]) {
      expect(isSupportedFiservParserDriverId(driverId), driverId).toBe(true);
      expect(shouldRunLegacyAiRefinement({ parserSource: { driverId } } as any), driverId).toBe(false);
    }
    expect(isSupportedFiservParserDriverId("unrelated_parser")).toBe(false);
    expect(shouldRunLegacyAiRefinement({ parserSource: { driverId: "unrelated_parser" } } as any)).toBe(true);
  });
});

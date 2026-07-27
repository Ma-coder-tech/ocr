import fs from "node:fs/promises";
import path from "node:path";
import { parsePdf } from "../src/parser.js";
import { buildCanonicalStatementFactsFromParsedDocument, canonicalActualValues } from "../src/canonical/buildCanonicalFacts.js";
import { z } from "zod";

export const corpusRunOutcomeValues = [
  "pass",
  "known_failure",
  "new_regression",
  "unexpected_improvement",
  "human_review_required",
] as const;

const currencyCodeSchema = z.literal("USD");

export const moneyAmountSchema = z
  .object({
    amountMinor: z.number().int(),
    currency: currencyCodeSchema,
  })
  .strict();

const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const countValueSchema = z.number().int().nonnegative();
const expectedScalarSchema = z.union([moneyAmountSchema, decimalStringSchema, countValueSchema, z.string(), z.boolean(), z.null(), z.array(z.string())]);

const expectedRangeSchema = z
  .object({
    min: expectedScalarSchema,
    max: expectedScalarSchema,
  })
  .strict();

const knownFailureSchema = z
  .object({
    defectId: z.string().min(1),
    expectedGroundTruthValue: expectedScalarSchema,
    currentIncorrectResult: expectedScalarSchema,
    severity: z.enum(["low", "medium", "high", "critical"]),
    customerImpact: z.string().min(1),
    evidenceNote: z.string().min(1),
    targetCorrectionPackage: z.enum(["Package B", "Package C", "Package D", "Package E", "Package F", "Package G", "Package H"]),
    status: z.enum(["open", "in_progress", "fixed_pending_verification", "closed"]),
    dateRecorded: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const goldenCorpusExpectationSchema = z
  .object({
    field: z.string().min(1),
    expectedValue: expectedScalarSchema.optional(),
    expectedRange: expectedRangeSchema.optional(),
    verificationStatus: z.enum([
      "verified",
      "ambiguous",
      "intentionally_unavailable",
      "requires_processor_documentation",
      "not_applicable",
    ]),
    assertionRule: z.enum(["must_equal", "range_allowed", "must_be_unavailable", "human_review_required"]),
    source: z.enum(["human_verified_statement", "processor_documentation", "approved_policy", "synthetic_fixture", "candidate_codex_prepared"]),
    evidenceNote: z.string().min(1),
    reviewer: z
      .object({
        role: z.enum(["human_owner", "human_reviewer", "codex_candidate"]),
        reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        approvalStatus: z.enum(["approved", "candidate_only", "needs_review"]),
      })
      .strict(),
    knownFailure: knownFailureSchema.optional(),
  })
  .strict()
  .superRefine((expectation, ctx) => {
    if (expectation.verificationStatus === "verified" && expectation.reviewer.approvalStatus !== "approved") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewer", "approvalStatus"],
        message: "Verified expectations require human approval metadata.",
      });
    }
    if (expectation.source === "candidate_codex_prepared" && expectation.verificationStatus === "verified") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "Codex-prepared candidates cannot become verified ground truth without human approval.",
      });
    }
    if (expectation.assertionRule === "range_allowed" && !expectation.expectedRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedRange"],
        message: "Range assertions require expectedRange.",
      });
    }
    if (expectation.assertionRule !== "range_allowed" && expectation.expectedRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedRange"],
        message: "expectedRange is only valid for range_allowed assertions.",
      });
    }
    if (expectation.assertionRule === "must_equal" && !("expectedValue" in expectation)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedValue"],
        message: "must_equal assertions require expectedValue.",
      });
    }
    if (expectation.knownFailure && expectation.verificationStatus !== "verified") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["knownFailure"],
        message: "Known failures require verified ground truth.",
      });
    }
  });

const sourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("synthetic_pdf"),
      publicFixturePath: z.string().startsWith("test/fixtures/canonical/synthetic-pdfs/"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sanitized_json"),
      publicFixturePath: z.string().startsWith("test/fixtures/canonical/golden-corpus/"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("private_original"),
      privateCorpusCaseId: z.string().min(1),
      privateManifestName: z.string().regex(/^[a-z0-9_.-]+\.json$/i),
    })
    .strict(),
]);

export const goldenCorpusCaseSchema = z
  .object({
    schemaVersion: z.literal("golden_corpus_case_v1"),
    caseId: z.string().regex(/^GC-[A-Z0-9-]+$/),
    title: z.string().min(1),
    statementClass: z.string().min(1),
    source: sourceSchema,
    privacy: z
      .object({
        containsRealMerchantInformation: z.literal(false),
        containsRawStatementText: z.literal(false),
        containsPrivateDocumentPath: z.literal(false),
        containsPrivateDocumentHash: z.literal(false),
        redactionNotes: z.array(z.string()),
      })
      .strict(),
    humanVerification: z
      .object({
        status: z.enum(["approved", "candidate_only", "needs_review"]),
        verifiedBy: z.enum(["human_owner", "human_reviewer", "not_verified"]),
        verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        notes: z.string(),
      })
      .strict(),
    expectedProcessorFamily: z.string().nullable(),
    expectedReportState: z.string().nullable(),
    expectations: z.array(goldenCorpusExpectationSchema).min(1),
    tags: z.array(z.string()),
  })
  .strict()
  .superRefine((corpusCase, ctx) => {
    const text = JSON.stringify(corpusCase);
    const forbiddenPatterns = [
      /\/Users\//i,
      /data\/uploads/i,
      /\.sqlite/i,
      /\bsk-[A-Za-z0-9_-]+/i,
      /API_KEY/i,
      /EL\s+NUEVO/i,
      /TEQUILA/i,
    ];
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Corpus metadata contains forbidden sensitive pattern: ${pattern.source}`,
        });
      }
    }
  });

export type GoldenCorpusCase = z.infer<typeof goldenCorpusCaseSchema>;
export type GoldenCorpusExpectation = z.infer<typeof goldenCorpusExpectationSchema>;
export type CorpusRunOutcome = (typeof corpusRunOutcomeValues)[number];

export const privateCorpusManifestSchema = z
  .object({
    schemaVersion: z.literal("private_corpus_manifest_v1"),
    privateCorpusCaseId: z.string().min(1),
    documentFile: z.string().min(1),
    actualValueExtractors: z
      .array(
        z
          .object({
            field: z.string().min(1),
            source: z.literal("pdf_text"),
            pattern: z.string().min(1),
            valueType: z.enum(["integer", "money_usd", "string"]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type PrivateCorpusManifest = z.infer<typeof privateCorpusManifestSchema>;

export type CorpusExpectationResult = {
  caseId: string;
  field: string;
  outcome: CorpusRunOutcome;
  expectedValue: unknown;
  actualValue: unknown;
  defectId?: string;
  targetCorrectionPackage?: string;
  message: string;
};

export type CorpusCaseRunResult = {
  caseId: string;
  title: string;
  sourceKind: GoldenCorpusCase["source"]["kind"];
  outcome: CorpusRunOutcome;
  expectationResults: CorpusExpectationResult[];
};

export async function loadGoldenCorpusCases(
  corpusDir = path.resolve(process.cwd(), "test/fixtures/canonical/golden-corpus"),
): Promise<GoldenCorpusCase[]> {
  const entries = await fs.readdir(corpusDir, { withFileTypes: true });
  const cases: GoldenCorpusCase[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(corpusDir, entry.name);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    cases.push(goldenCorpusCaseSchema.parse(parsed));
  }
  return cases.sort((left, right) => left.caseId.localeCompare(right.caseId));
}

export async function loadPrivateCorpusManifest(privateCorpusDir: string, manifestName: string): Promise<PrivateCorpusManifest | null> {
  const manifestPath = path.join(privateCorpusDir, manifestName);
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return privateCorpusManifestSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function actualValuesFromPrivateCorpusManifest(
  privateCorpusDir: string,
  manifest: PrivateCorpusManifest,
): Promise<Record<string, unknown>> {
  const documentPath = path.join(privateCorpusDir, manifest.documentFile);
  const document = await parsePdf(documentPath);
  const canonicalValues = canonicalActualValues(
    buildCanonicalStatementFactsFromParsedDocument(document, {
      sourceFileName: manifest.documentFile,
      sourceAnalysisId: manifest.privateCorpusCaseId,
    }),
  );
  const text = document.rows.map((row) => String(row.content)).join(" ");
  const extractedValues = Object.fromEntries(
    manifest.actualValueExtractors
      .filter((extractor) => !isCanonicalField(extractor.field) || !(extractor.field in canonicalValues))
      .map((extractor) => [extractor.field, extractValueFromText(text, extractor.pattern, extractor.valueType)]),
  );
  return { ...extractedValues, ...canonicalValues };
}

export async function actualValuesFromSyntheticPdf(publicFixturePath: string): Promise<Record<string, unknown>> {
  const document = await parsePdf(path.resolve(process.cwd(), publicFixturePath));
  return canonicalActualValues(
    buildCanonicalStatementFactsFromParsedDocument(document, {
      sourceFileName: path.basename(publicFixturePath),
      sourceAnalysisId: publicFixturePath,
      preferExtractedRows: true,
    }),
  );
}

export function legacyKnownFailureActualValues(corpusCase: GoldenCorpusCase): Record<string, unknown> {
  return Object.fromEntries(
    corpusCase.expectations
      .filter((expectation) => expectation.field.startsWith("legacy.") && expectation.knownFailure)
      .map((expectation) => [expectation.field, expectation.knownFailure!.currentIncorrectResult]),
  );
}

export function evaluateCorpusCase(
  corpusCase: GoldenCorpusCase,
  actualValues: Record<string, unknown>,
): CorpusCaseRunResult {
  const expectationResults = corpusCase.expectations.map((expectation) =>
    evaluateExpectation(corpusCase.caseId, expectation, actualValues[expectation.field]),
  );
  return {
    caseId: corpusCase.caseId,
    title: corpusCase.title,
    sourceKind: corpusCase.source.kind,
    outcome: summarizeOutcomes(expectationResults.map((result) => result.outcome)),
    expectationResults,
  };
}

export function evaluateExpectation(
  caseId: string,
  expectation: GoldenCorpusExpectation,
  actualValue: unknown,
): CorpusExpectationResult {
  if (expectation.assertionRule === "human_review_required" || expectation.verificationStatus === "ambiguous") {
    return result(caseId, expectation, actualValue, "human_review_required", "Expectation requires human review before pass/fail classification.");
  }
  const passed = expectationMatches(expectation, actualValue);
  if (expectation.knownFailure) {
    if (passed) {
      return result(caseId, expectation, actualValue, "unexpected_improvement", "Known failure now matches ground truth and needs human confirmation.");
    }
    if (sameValue(actualValue, expectation.knownFailure.currentIncorrectResult)) {
      return result(caseId, expectation, actualValue, "known_failure", "Current result matches the recorded known backend defect.");
    }
    return result(caseId, expectation, actualValue, "new_regression", "Current result no longer matches the recorded defect or ground truth.");
  }
  return result(caseId, expectation, actualValue, passed ? "pass" : "new_regression", passed ? "Expectation passed." : "Expectation failed.");
}

export function privateCorpusDirectoryFromEnv(env: NodeJS.ProcessEnv = process.env): { status: "configured"; dir: string } | { status: "skipped"; reason: string } {
  const dir = env.RATEREVEAL_PRIVATE_CORPUS_DIR?.trim();
  if (!dir) {
    return { status: "skipped", reason: "RATEREVEAL_PRIVATE_CORPUS_DIR is not set." };
  }
  if (path.isAbsolute(dir)) return { status: "configured", dir };
  return { status: "configured", dir: path.resolve(process.cwd(), dir) };
}

function extractValueFromText(text: string, pattern: string, valueType: PrivateCorpusManifest["actualValueExtractors"][number]["valueType"]): unknown {
  const match = text.match(new RegExp(pattern, "i"));
  const rawValue = match?.[1]?.trim();
  if (!rawValue) return null;
  if (valueType === "integer") return Number.parseInt(rawValue.replace(/,/g, ""), 10);
  if (valueType === "money_usd") {
    return {
      amountMinor: Math.round(Number(rawValue.replace(/[$,]/g, "")) * 100),
      currency: "USD",
    };
  }
  return rawValue;
}

function isCanonicalField(field: string): boolean {
  return (
    field.startsWith("financialFacts.") ||
    field.startsWith("identity.") ||
    field.startsWith("feeLedger.") ||
    field.startsWith("feeOwnershipActionability.") ||
    field.startsWith("opportunityEngine.") ||
    field.startsWith("aiCapabilities.") ||
    field.startsWith("customerState.") ||
    field.startsWith("validation.")
  );
}

function expectationMatches(expectation: GoldenCorpusExpectation, actualValue: unknown): boolean {
  if (expectation.assertionRule === "must_be_unavailable") return actualValue === null || actualValue === undefined;
  if (expectation.assertionRule === "must_equal") return sameValue(actualValue, expectation.expectedValue);
  if (expectation.assertionRule === "range_allowed" && expectation.expectedRange) return valueInRange(actualValue, expectation.expectedRange.min, expectation.expectedRange.max);
  return false;
}

function valueInRange(actualValue: unknown, min: unknown, max: unknown): boolean {
  const actual = comparableNumber(actualValue);
  const left = comparableNumber(min);
  const right = comparableNumber(max);
  return actual !== null && left !== null && right !== null && actual >= left && actual <= right;
}

function comparableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value && typeof value === "object" && "amountMinor" in value) {
    const amount = Number((value as { amountMinor?: unknown }).amountMinor);
    return Number.isFinite(amount) ? amount : null;
  }
  return null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function result(
  caseId: string,
  expectation: GoldenCorpusExpectation,
  actualValue: unknown,
  outcome: CorpusRunOutcome,
  message: string,
): CorpusExpectationResult {
  return {
    caseId,
    field: expectation.field,
    outcome,
    expectedValue: expectation.expectedValue ?? expectation.expectedRange ?? null,
    actualValue: actualValue ?? null,
    defectId: expectation.knownFailure?.defectId,
    targetCorrectionPackage: expectation.knownFailure?.targetCorrectionPackage,
    message,
  };
}

function summarizeOutcomes(outcomes: CorpusRunOutcome[]): CorpusRunOutcome {
  if (outcomes.includes("new_regression")) return "new_regression";
  if (outcomes.includes("human_review_required")) return "human_review_required";
  if (outcomes.includes("unexpected_improvement")) return "unexpected_improvement";
  if (outcomes.includes("known_failure")) return "known_failure";
  return "pass";
}

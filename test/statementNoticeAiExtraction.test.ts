import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  maybeRunStatementNoticeAiExtractionForParserOutput,
} from "../src/statementNoticeAiExtraction.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
} from "../src/fiservFirstDataParser.js";
import { parsePdf } from "../src/parser.js";

const ABDUL_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_ABDUL_BASHER_Aug_2025.pdf");
const PEPE_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "SAMPLE_MERCHANT4_CLOVER.pdf");
const EL_NUEVO_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");
const NXGEN_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf");

function mockedNoticeResponse(prompt: string) {
  if (prompt.includes("Interlink System Integrity") || prompt.includes("EMV Fallback")) {
    return {
      object: {
        notices: [
          {
            feeName: "STAR PIN DEBIT NETWORK ANNUAL FEE",
            amount: { value: 16, valueType: "money", cadence: "annual", raw: "$16.00" },
            noticeType: "fee_increase",
            effectiveDate: "November 2022",
            condition: "per participating location or website enabled with or accepting STAR transactions in June, July, and August 2022",
            acceptanceClause: "Continuing your merchant account after the effective date will constitute acceptance.",
            actionDeadline: null,
            isFeeChange: true,
            confidence: "high",
            evidence: ["EFFECTIVE NOVEMBER 2022", "STAR NETWORK ANNUAL FEE IN THE AMOUNT OF $16.00"],
          },
          {
            feeName: "ACCEL PIN DEBIT NETWORK ANNUAL FEE",
            amount: { value: 16, valueType: "money", cadence: "annual", raw: "$16.00" },
            noticeType: "fee_increase",
            effectiveDate: "December 2022",
            condition: "per participating location or website enabled with or accepting ACCEL transactions in June, July, or August 2022",
            acceptanceClause: "Continuing your merchant account after the effective date will constitute acceptance.",
            actionDeadline: null,
            isFeeChange: true,
            confidence: "high",
            evidence: ["EFFECTIVE DECEMBER 2022", "ACCEL NETWORK ANNUAL FEE IN THE AMOUNT OF $16.00"],
          },
          {
            feeName: "Interlink System Integrity and EMV Fallback Fees",
            amount: null,
            noticeType: "fee_delay",
            effectiveDate: "future release date",
            condition: "updated release date will be communicated when details become available",
            acceptanceClause: null,
            actionDeadline: null,
            isFeeChange: true,
            confidence: "high",
            evidence: ["Interlink System Integrity and EMV Fallback Fee(s) have been postponed", "future release date"],
          },
        ],
        notes: [],
      },
    };
  }
  if (prompt.includes("STAR PIN DEBIT NETWORK") || prompt.includes("ACCEL PIN DEBIT NETWORK")) {
    return {
      object: {
        notices: [
          {
            feeName: "STAR PIN DEBIT NETWORK ANNUAL FEE",
            amount: { value: 20.95, valueType: "money", cadence: "annual", raw: "$20.95" },
            noticeType: "fee_increase",
            effectiveDate: "October 2025 statement",
            condition: "per active location",
            acceptanceClause: "Continuing your merchant services after 30 days is deemed acceptance.",
            actionDeadline: "30 days",
            isFeeChange: true,
            confidence: "high",
            evidence: ["$20.95 STAR PIN DEBIT NETWORK ANNUAL FEE", "EFFECTIVE WITH YOUR OCTOBER 2025 STATEMENT"],
          },
          {
            feeName: "ACCEL PIN DEBIT NETWORK ANNUAL FEE",
            amount: { value: 21.95, valueType: "money", cadence: "annual", raw: "$21.95" },
            noticeType: "fee_increase",
            effectiveDate: "October 2025 statement",
            condition: "per active location",
            acceptanceClause: "Continuing your merchant services after 30 days is deemed acceptance.",
            actionDeadline: "30 days",
            isFeeChange: true,
            confidence: "high",
            evidence: ["$21.95 ACCEL PIN DEBIT NETWORK ANNUAL FEE", "INCREASING BY $2.00"],
          },
        ],
        notes: [],
      },
    };
  }
  if (prompt.includes("SHAZAM") || prompt.includes("CLX")) {
    return {
      object: {
        notices: [
          {
            feeName: "SHAZAM interchange category change",
            amount: null,
            noticeType: "informational",
            effectiveDate: null,
            condition: null,
            acceptanceClause: null,
            actionDeadline: null,
            isFeeChange: false,
            confidence: "medium",
            evidence: ["SHAZAM", "interchange category"],
          },
          {
            feeName: "CLX UI migration",
            amount: null,
            noticeType: "informational",
            effectiveDate: null,
            condition: null,
            acceptanceClause: null,
            actionDeadline: null,
            isFeeChange: false,
            confidence: "medium",
            evidence: ["CLX"],
          },
        ],
        notes: ["No fee changes announced in this statement period."],
      },
    };
  }
  return {
    object: {
      notices: [
        {
          feeName: "Wells Fargo informational statement notice",
          amount: null,
          noticeType: "informational",
          effectiveDate: null,
          condition: null,
          acceptanceClause: null,
          actionDeadline: null,
          isFeeChange: false,
          confidence: "medium",
          evidence: ["Important Information"],
        },
      ],
      notes: ["No fee changes announced in this statement period."],
    },
  };
}

describe("AI statement notice extraction", () => {
  it("extracts Abdul Basher annual PIN debit fee changes from statement notices", async () => {
    const doc = await parsePdf(ABDUL_PDF_PATH);
    const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, { sourceFileName: "fiserv_ABDUL_BASHER_Aug_2025.pdf" });
    let prompt = "";

    const result = await maybeRunStatementNoticeAiExtractionForParserOutput(parsed, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "notice-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          prompt = String(options.prompt ?? "");
          return mockedNoticeResponse(prompt);
        },
      },
    });

    expect(prompt).toContain("Raw notice block");
    expect(prompt).toContain("fee_increase, fee_decrease, fee_delay, informational");
    expect(prompt).toContain("STAR PIN DEBIT NETWORK");
    expect(result.aiNoticeExtraction).toMatchObject({
      status: "applied",
      provider: "anthropic",
      model: "notice-test-model",
      noticeCount: 2,
      feeChangeCount: 2,
    });
    expect(result.output.fiservFeeAnalysisV2.aiNoticeExtraction?.notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeName: "STAR PIN DEBIT NETWORK ANNUAL FEE",
          isFeeChange: true,
          effectiveDate: "October 2025 statement",
          actionDeadline: "30 days",
          amount: expect.objectContaining({ value: 20.95, cadence: "annual" }),
        }),
        expect.objectContaining({
          feeName: "ACCEL PIN DEBIT NETWORK ANNUAL FEE",
          isFeeChange: true,
          amount: expect.objectContaining({ value: 21.95, cadence: "annual" }),
        }),
      ]),
    );
  });

  it("attempts notice extraction by default when a provider is configured", async () => {
    const doc = await parsePdf(ABDUL_PDF_PATH);
    const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, { sourceFileName: "fiserv_ABDUL_BASHER_Aug_2025.pdf" });
    let called = false;

    const result = await maybeRunStatementNoticeAiExtractionForParserOutput(parsed, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "notice-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          called = true;
          return mockedNoticeResponse(String(options.prompt ?? ""));
        },
      },
    });

    expect(called).toBe(true);
    expect(result.aiNoticeExtraction.status).toBe("applied");
    expect(result.aiNoticeExtraction.feeChangeCount).toBe(2);
  });

  it("records a clear disabled status when notice extraction is attempted without credentials", async () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const doc = await parsePdf(ABDUL_PDF_PATH);
      const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, { sourceFileName: "fiserv_ABDUL_BASHER_Aug_2025.pdf" });

      const result = await maybeRunStatementNoticeAiExtractionForParserOutput(parsed);

      expect(result.aiNoticeExtraction).toMatchObject({
        status: "disabled",
        provider: null,
        model: null,
        noticeCount: 0,
        feeChangeCount: 0,
      });
      expect(result.aiNoticeExtraction.notes).toContain("AI notice extraction requires ANTHROPIC_API_KEY or OPENAI_API_KEY.");
      expect(result.output.fiservFeeAnalysisV2.aiNoticeExtraction).toMatchObject(result.aiNoticeExtraction);
    } finally {
      if (originalAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      }
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });

  it("keeps Pepe Clover informational notices separate from fee-change notices", async () => {
    const doc = await parsePdf(PEPE_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, { sourceFileName: "SAMPLE_MERCHANT4_CLOVER.pdf" });

    const result = await maybeRunStatementNoticeAiExtractionForParserOutput(parsed, {
      enabled: true,
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "notice-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => mockedNoticeResponse(String(options.prompt ?? "")),
      },
    });

    expect(result.aiNoticeExtraction.status).toBe("no_fee_changes");
    expect(result.aiNoticeExtraction.feeChangeCount).toBe(0);
    expect(result.aiNoticeExtraction.notes).toContain("No fee changes announced in this statement period.");
    expect(result.aiNoticeExtraction.notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feeName: "SHAZAM interchange category change", isFeeChange: false }),
        expect.objectContaining({ feeName: "CLX UI migration", isFeeChange: false }),
      ]),
    );
  });

  it("keeps Wells Fargo informational notices separate from fee-change notices", async () => {
    const doc = await parsePdf(EL_NUEVO_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, { sourceFileName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf" });

    const result = await maybeRunStatementNoticeAiExtractionForParserOutput(parsed, {
      enabled: true,
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "notice-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => mockedNoticeResponse(String(options.prompt ?? "")),
      },
    });

    expect(result.aiNoticeExtraction).toMatchObject({
      status: "no_fee_changes",
      feeChangeCount: 0,
    });
    expect(result.aiNoticeExtraction.noticeCount).toBeGreaterThan(0);
    expect(result.aiNoticeExtraction.notices.every((notice) => notice.isFeeChange === false)).toBe(true);
    expect(result.output.fiservFeeAnalysisV2.aiNoticeExtraction?.notices[0]).toMatchObject({
      isFeeChange: false,
    });
  });

  it("extracts Vortax fee increases and delayed Interlink/EMV notice", async () => {
    const doc = await parsePdf(NXGEN_PDF_PATH);
    const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, { sourceFileName: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf" });
    expect(parsed.fiservFeeAnalysisV2.noticeText).toContain("Interlink System Integrity and EMV Fallback Fee");

    const result = await maybeRunStatementNoticeAiExtractionForParserOutput(parsed, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "notice-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => mockedNoticeResponse(String(options.prompt ?? "")),
      },
    });

    expect(result.aiNoticeExtraction).toMatchObject({
      status: "applied",
      noticeCount: 3,
      feeChangeCount: 3,
    });
    expect(result.aiNoticeExtraction.notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feeName: "STAR PIN DEBIT NETWORK ANNUAL FEE", noticeType: "fee_increase", effectiveDate: "November 2022" }),
        expect.objectContaining({ feeName: "ACCEL PIN DEBIT NETWORK ANNUAL FEE", noticeType: "fee_increase", effectiveDate: "December 2022" }),
        expect.objectContaining({ feeName: "Interlink System Integrity and EMV Fallback Fees", noticeType: "fee_delay", effectiveDate: "future release date" }),
      ]),
    );
  });
});

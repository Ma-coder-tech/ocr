import { describe, expect, it } from "vitest";
import { classifyFeeRow, isProcessorCoreFee } from "../src/feeClassification.js";

describe("fee classification", () => {
  it("maps service charges to processor markup instead of service/compliance", () => {
    const classification = classifyFeeRow({
      label: "Total Service Charges",
      sourceSection: "Service Charges",
      evidenceLine: "Total Service Charges 357.35",
      processorName: "Fiserv / First Data (Interchange-Plus)",
    });

    expect(classification.broadType).toBe("Processor");
    expect(classification.feeClass).toBe("processor_markup");
    expect(classification.classificationRule).toContain("E042");
  });

  it("maps card-brand evidence to pass-through", () => {
    const classification = classifyFeeRow({
      label: "Total Interchange Charges/Program Fees",
      sourceSection: "Interchange Charges/Program Fees",
      evidenceLine: "Total Interchange Charges/Program Fees 955.20",
    });

    expect(classification.broadType).toBe("Pass-through");
    expect(classification.feeClass).toBe("card_brand_pass_through");
  });

  it("does not fabricate a type for ambiguous total fees", () => {
    const classification = classifyFeeRow({
      label: "Total Fees",
      evidenceLine: "Total Fees 82.62",
    });

    expect(classification.broadType).toBe("Unknown");
    expect(classification.feeClass).toBe("unknown");
  });

  it("keeps processor-owned add-ons out of core markup totals", () => {
    const classification = classifyFeeRow({
      label: "Commercial Card Interchange Savings Adjustment",
      evidenceLine: "Commercial Card Interchange Savings Adjustment 18.00",
    });

    expect(classification.broadType).toBe("Processor");
    expect(classification.feeClass).toBe("processor_service_add_on");
    expect(
      isProcessorCoreFee({
        label: "Commercial Card Interchange Savings Adjustment",
        amount: 18,
        sharePct: 10,
        ...classification,
      }),
    ).toBe(false);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase2FeeFactResult } from "./Phase2FeeFactResult";
import type { PublicPhase2FeeFact } from "./reportAdapter";

const fact: PublicPhase2FeeFact = {
  kind: "printed_processing_fee_charge_aggregate_v1",
  permissionVersion: "phase2_printed_fee_charge_permission_v1",
  displayChargeMagnitudeMinor: 133096,
  printedCurrencySymbol: "$",
  printedStatementPeriod: { start: "2024-11-01", end: "2024-11-30" },
  scope: "bounded_declared_processing_fee_charge_aggregate",
  completeFeeOccurrenceInventory: false,
};

describe("single fee fact presentation", () => {
  it("shows charge magnitude as one verified statement fact without a report claim", () => {
    const html = renderToStaticMarkup(createElement(Phase2FeeFactResult, { fact, onStartOver: () => {} }));
    expect(html).toContain("$1,330.96");
    expect(html).toContain("One fact verified");
    expect(html).toContain("Full analysis unavailable");
    expect(html).toContain("dates when individual fees were earned or posted are not established");
    expect(html).not.toMatch(/effective rate|savings|overpayment|markup|processor charged|all fees/i);
    expect(html).not.toContain("neutral-proof");
  });
});

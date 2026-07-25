// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ReportV1Gate } from "./ReportV1Gate";
import { ReportV1Screen } from "./ReportV1Screen";
import { malformedReportV1Fixture, reportV1Fixtures, unsupportedReportV1Fixture } from "./reportV1Fixtures";
import type { SingleStatementReportV1 } from "./reportV1Types";

afterEach(() => {
  cleanup();
  document.body.removeAttribute("data-scroll-locked");
  document.body.removeAttribute("style");
});

describe("ReportV1Gate", () => {
  it("renders v1 for a valid supported report", () => {
    render(
      <ReportV1Gate reportV1={reportV1Fixtures.material_overpayment} onStartOver={() => {}}>
        <div>Legacy fallback</div>
      </ReportV1Gate>,
    );

    expect(screen.getByRole("heading", { name: /processing costs appear materially/i })).toBeInTheDocument();
    expect(screen.queryByText("Legacy fallback")).not.toBeInTheDocument();
  });

  it("preserves the legacy fallback for missing, malformed, and unsupported reportV1", () => {
    const { rerender } = render(
      <ReportV1Gate reportV1={null} onStartOver={() => {}}>
        <div>Legacy fallback</div>
      </ReportV1Gate>,
    );
    expect(screen.getByText("Legacy fallback")).toBeInTheDocument();

    rerender(
      <ReportV1Gate reportV1={malformedReportV1Fixture} onStartOver={() => {}}>
        <div>Legacy fallback</div>
      </ReportV1Gate>,
    );
    expect(screen.getByText("Legacy fallback")).toBeInTheDocument();

    rerender(
      <ReportV1Gate reportV1={unsupportedReportV1Fixture} onStartOver={() => {}}>
        <div>Legacy fallback</div>
      </ReportV1Gate>,
    );
    expect(screen.getByText("Legacy fallback")).toBeInTheDocument();
  });
});

describe("ReportV1Screen state rendering", () => {
  it("renders all eight supplied report states", () => {
    for (const report of Object.values(reportV1Fixtures)) {
      const { unmount } = render(<ReportV1Screen report={report} onStartOver={() => {}} />);
      expect(screen.getByRole("heading", { name: report.verdict.title })).toBeInTheDocument();
      expect(document.querySelectorAll(".rr-v1")).toHaveLength(1);
      unmount();
    }
  });

  it("routes verdict actions to state-appropriate report sections", () => {
    const { rerender } = render(<ReportV1Screen report={reportV1Fixtures.material_overpayment} onStartOver={() => {}} />);
    expect(screen.getByRole("link", { name: /view prioritized findings/i })).toHaveAttribute("href", "#rr-v1-findings");
    expect(screen.queryByText("Analyze another month")).not.toBeInTheDocument();

    rerender(<ReportV1Screen report={reportV1Fixtures.above_benchmark_review} onStartOver={() => {}} />);
    expect(screen.getByRole("link", { name: /review pricing details/i })).toHaveAttribute("href", "#rr-v1-pricing");

    rerender(<ReportV1Screen report={reportV1Fixtures.verification_required} onStartOver={() => {}} />);
    expect(screen.getByRole("link", { name: /review verification findings/i })).toHaveAttribute("href", "#rr-v1-findings");

    rerender(<ReportV1Screen report={reportV1Fixtures.reconciliation_failure} onStartOver={() => {}} />);
    expect(screen.getByRole("link", { name: /review data-quality note/i })).toHaveAttribute("href", "#rr-v1-data-quality");

    rerender(<ReportV1Screen report={reportV1Fixtures.unable_to_analyze} onStartOver={() => {}} />);
    expect(screen.getByRole("button", { name: /upload complete statement/i })).toBeInTheDocument();
  });

  it("honors hidden opportunity visibility and avoids fake healthy savings", () => {
    render(<ReportV1Screen report={reportV1Fixtures.healthy} onStartOver={() => {}} />);

    expect(screen.getByText("No material cost-reduction opportunity identified in this statement.")).toBeInTheDocument();
    expect(screen.queryByText(/\$0 savings/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /start with these opportunities/i })).not.toBeInTheDocument();
  });

  it("keeps verification amounts separate from opportunity language", () => {
    render(<ReportV1Screen report={reportV1Fixtures.verification_required} onStartOver={() => {}} />);

    expect(screen.getAllByText(/amount to verify/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/not treated as savings/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/guaranteed savings/i)).not.toBeInTheDocument();
  });

  it("uses neutral mixed-findings copy and scoped sequence labels", () => {
    render(<ReportV1Screen report={reportV1Fixtures.healthy_with_opportunities} onStartOver={() => {}} />);

    const findings = document.querySelector("#rr-v1-findings") as HTMLElement;
    expect(within(findings).getByRole("heading", { name: "Start with these findings" })).toBeInTheDocument();
    expect(within(findings).queryByRole("heading", { name: "Start with these opportunities" })).not.toBeInTheDocument();
    expect(within(findings).getByText(/Actionable opportunities and verification items are shown together/i)).toBeInTheDocument();
    expect(within(findings).getByText("Request Removal #1")).toBeInTheDocument();
    expect(within(findings).getByText("Verify #1")).toBeInTheDocument();
    expect(within(findings).queryByText("Rank 1")).not.toBeInTheDocument();
  });

  it("omits zero opportunity portions and keeps above-benchmark totals internally consistent", () => {
    const above = reportV1Fixtures.above_benchmark_review.opportunitySummary;
    expect(above.totalEligibleAnnualOpportunityUsd).toBeCloseTo(above.deterministicAnnualImpactUsd + above.estimatedAnnualOpportunityUsd);

    render(<ReportV1Screen report={reportV1Fixtures.above_benchmark_review} onStartOver={() => {}} />);

    expect(screen.getByText("Estimated portion")).toBeInTheDocument();
    expect(screen.queryByText("Deterministic portion")).not.toBeInTheDocument();
    expect(screen.getAllByText("$1,710").length).toBeGreaterThan(0);
    expect(screen.getByText(/actual outcomes can vary/i)).toBeInTheDocument();
  });

  it("does not surface the deferred Action Toolkit as a report limitation", () => {
    render(<ReportV1Screen report={reportV1Fixtures.unable_to_analyze} onStartOver={() => {}} />);

    expect(screen.queryByText(/Action Toolkit/i)).not.toBeInTheDocument();
  });

  it("keeps report section navigation from widening mobile pages", () => {
    const styles = readFileSync(`${process.cwd()}/web/src/styles.css`, "utf8");

    expect(styles).toMatch(/\.rr-v1-nav-rail\s*\{[^}]*max-width:\s*100%/s);
    expect(styles).toMatch(/\.rr-v1-nav-rail\s*\{[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.rr-v1-nav-rail\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.rr-v1-nav\s*\{[^}]*overflow-x:\s*auto/s);
    expect(styles).toMatch(/\.rr-v1-nav a\s*\{[^}]*flex:\s*0 0 auto/s);
    expect(styles).toMatch(/@media \(max-width:\s*520px\)\s*\{[\s\S]*\.rr-v1-nav\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(styles).toMatch(/@media \(max-width:\s*520px\)\s*\{[\s\S]*\.rr-v1-nav a\s*\{[^}]*flex:\s*1 1 calc\(50% - 6px\)/s);
    expect(styles).toMatch(/\.rr-v1\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  });

  it("keeps fee inventory table headings and numeric values readable", () => {
    const styles = readFileSync(`${process.cwd()}/web/src/styles.css`, "utf8");
    render(<ReportV1Screen report={reportV1Fixtures.healthy_with_opportunities} onStartOver={() => {}} />);

    const allCharges = document.querySelector("#rr-v1-all-charges") as HTMLElement;
    const desktopTable = allCharges.querySelector(".rr-v1-table") as HTMLElement;
    expect(within(allCharges).getByRole("columnheader", { name: "Charged" })).toHaveClass("rr-v1-col-money");
    expect(within(allCharges).getByRole("columnheader", { name: "Rate/count" })).toHaveClass("rr-v1-col-rate");
    expect(within(desktopTable).getByText("$418.22")).toHaveClass("rr-v1-col-money");
    expect(within(desktopTable).getByText("$622.34")).toHaveClass("rr-v1-col-money");
    expect(within(desktopTable).getByText("$39.95")).toHaveClass("rr-v1-col-money");

    expect(styles).toMatch(/\.rr-v1-table\s*\{[^}]*min-width:\s*1040px/s);
    expect(styles).toMatch(/\.rr-v1-table\s*\{[^}]*table-layout:\s*fixed/s);
    expect(styles).toMatch(/\.rr-v1-table-head\s*\{[^}]*white-space:\s*nowrap/s);
    expect(styles).toMatch(/\.rr-v1-col-money\s*\{[^}]*white-space:\s*nowrap/s);
    expect(styles).toMatch(/\.rr-v1-col-rate\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it("displays backend opportunity totals without recomputing from findings", () => {
    const report: SingleStatementReportV1 = {
      ...reportV1Fixtures.material_overpayment,
      opportunitySummary: {
        ...reportV1Fixtures.material_overpayment.opportunitySummary,
        totalEligibleAnnualOpportunityUsd: 1234,
      },
      findings: reportV1Fixtures.material_overpayment.findings.map((finding) => ({
        ...finding,
        estimatedAnnualImpactUsd: 999999,
      })),
    };

    render(<ReportV1Screen report={report} onStartOver={() => {}} />);

    const summary = document.querySelector("#rr-v1-summary") as HTMLElement;
    expect(within(summary).getAllByText("$1,234").length).toBeGreaterThan(0);
    expect(within(summary).queryByText("$999,999")).not.toBeInTheDocument();
  });
});

describe("ReportV1Screen findings, inventory, and details", () => {
  it("preserves backend fee order and filters without changing displayed totals", async () => {
    const user = userEvent.setup();
    render(<ReportV1Screen report={reportV1Fixtures.material_overpayment} onStartOver={() => {}} />);

    const allCharges = screen.getByRole("heading", { name: /every usable charge/i }).closest("section")!;
    const firstRows = within(allCharges).getAllByRole("row");
    expect(firstRows[1]).toHaveTextContent("Visa assessment");

    await user.click(screen.getByRole("button", { name: "Actionable" }));

    expect(screen.getAllByText("$4,790").length).toBeGreaterThan(0);
    expect(screen.queryByText("Visa assessment")).not.toBeInTheDocument();
    expect(screen.getAllByText("Processor discount").length).toBeGreaterThan(0);
  });

  it("opens evidence-only details and omits null page numbers", async () => {
    const user = userEvent.setup();
    render(<ReportV1Screen report={reportV1Fixtures.verification_required} onStartOver={() => {}} />);

    const findingCard = screen.getByText("Transaction integrity fee needs documentation").closest(".rr-v1-card") as HTMLElement;
    await user.click(within(findingCard).getByRole("button", { name: /review details/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Transaction integrity fee needs documentation")).toBeInTheDocument();
    expect(await within(dialog).findByText("Transaction Integrity Fee 219.40")).toBeInTheDocument();
    expect(screen.queryByText("Statement page")).not.toBeInTheDocument();
  });

  it("opens calculation details and shows the referenced calculation result", async () => {
    const user = userEvent.setup();
    render(<ReportV1Screen report={reportV1Fixtures.material_overpayment} onStartOver={() => {}} />);

    await user.click(screen.getAllByRole("button", { name: /view calculation/i })[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Observed processor pricing versus target")).toBeInTheDocument();
    expect(within(dialog).getByText("$184.22")).toBeInTheDocument();
  });

  it("returns focus to the details trigger when the sheet closes", async () => {
    const user = userEvent.setup();
    render(<ReportV1Screen report={reportV1Fixtures.material_overpayment} onStartOver={() => {}} />);

    const trigger = screen.getAllByRole("button", { name: /view calculation/i })[0];
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: /close details/i }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

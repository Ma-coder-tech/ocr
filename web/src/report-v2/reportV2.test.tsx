// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportV2Gate } from "./ReportV2Gate";
import { ReportV2Screen } from "./ReportV2Screen";
import { malformedReportV2Fixture, reportV2Fixtures, unsupportedReportV2Fixture } from "./reportV2Fixtures";
import { guardProductionReportV2 } from "./reportV2Guard";
import type { ProductionReportV2 } from "./reportV2Types";

afterEach(() => {
  cleanup();
  document.body.removeAttribute("data-scroll-locked");
  document.body.removeAttribute("style");
});

const clone = (report: ProductionReportV2): ProductionReportV2 => structuredClone(report);

describe("ReportV2 transport gate", () => {
  it("admits every synthetic gallery scenario through the production transport guard", () => {
    for (const report of Object.values(reportV2Fixtures)) expect(guardProductionReportV2(report)).toMatchObject({ ok: true });
  });

  it("renders V2 only when enabled and valid", () => {
    const fallback = <div>Report V1 fallback</div>;
    const { rerender } = render(<ReportV2Gate enabled productionReportV2={reportV2Fixtures.above_reference_findings} onStartOver={() => {}}>{fallback}</ReportV2Gate>);
    expect(screen.getByRole("heading", { name: "Synthetic Harbor Café" })).toBeInTheDocument();
    expect(screen.queryByText("Report V1 fallback")).not.toBeInTheDocument();

    rerender(<ReportV2Gate enabled={false} productionReportV2={reportV2Fixtures.above_reference_findings} onStartOver={() => {}}>{fallback}</ReportV2Gate>);
    expect(screen.getByText("Report V1 fallback")).toBeInTheDocument();
  });

  it("fails safely to the existing surface for missing, malformed, or unsupported transport data", () => {
    const fallback = <div>Existing report fallback</div>;
    const { rerender } = render(<ReportV2Gate enabled productionReportV2={null} onStartOver={() => {}}>{fallback}</ReportV2Gate>);
    expect(screen.getByText("Existing report fallback")).toBeInTheDocument();
    rerender(<ReportV2Gate enabled productionReportV2={malformedReportV2Fixture} onStartOver={() => {}}>{fallback}</ReportV2Gate>);
    expect(screen.getByText("Existing report fallback")).toBeInTheDocument();
    rerender(<ReportV2Gate enabled productionReportV2={unsupportedReportV2Fixture} onStartOver={() => {}}>{fallback}</ReportV2Gate>);
    expect(screen.getByText("Existing report fallback")).toBeInTheDocument();
  });
});

describe("ReportV2 public experiences", () => {
  it("renders completed, open-question, and unable public experiences", () => {
    const reports = [reportV2Fixtures.within_reference_clean, reportV2Fixtures.above_reference_findings, reportV2Fixtures.unable_to_complete];
    for (const report of reports) {
      const { unmount, container } = render(<ReportV2Screen report={report} onStartOver={() => {}} />);
      expect(container.querySelector(".rr-v2")).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps unable-to-complete recovery-only", () => {
    render(<ReportV2Screen report={reportV2Fixtures.unable_to_complete} onStartOver={() => {}} />);
    expect(screen.getByRole("heading", { name: /couldn't complete this statement review/i })).toBeInTheDocument();
    expect(screen.queryByText("Your effective rate")).not.toBeInTheDocument();
    expect(screen.queryByText("Processed sales")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare 3–6 more months/i })).not.toBeInTheDocument();
  });

  it("puts the planned continuation at the true end of every reportable experience", () => {
    for (const report of [reportV2Fixtures.above_reference_findings, reportV2Fixtures.within_reference_clean]) {
      const { container, unmount } = render(<ReportV2Screen report={report} onStartOver={() => {}} />);
      const content = container.querySelector(".rr-v2-content")!;
      expect(content.lastElementChild).toHaveClass("rr-v2-continuation");
      expect(within(content as HTMLElement).getByRole("button", { name: /compare 3–6 more months/i })).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the effective rate when benchmark comparison is unavailable", () => {
    render(<ReportV2Screen report={reportV2Fixtures.comparison_unavailable} onStartOver={() => {}} />);
    expect(screen.getByText("2.94%")).toBeInTheDocument();
    expect(screen.getByText(/qualified reference range is not available for this statement/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /start with these findings/i })).toBeInTheDocument();
  });

  it("keeps clean reports light while retaining monitoring and transparent charge access", async () => {
    const user = userEvent.setup();
    render(<ReportV2Screen report={reportV2Fixtures.within_reference_clean} onStartOver={() => {}} />);
    expect(screen.getByRole("heading", { name: /nothing urgent found/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /start with these findings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /what still needs checking/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what to watch next/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /view all charges on this statement/i }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("VISA INTERCHANGE")).toBeInTheDocument();
  });

  it("does not duplicate effective rate in the statement snapshot and omits a missing transaction count", () => {
    const report = clone(reportV2Fixtures.above_reference_findings);
    if (report.report) report.report.snapshot.transactionCount = undefined;
    render(<ReportV2Screen report={report} onStartOver={() => {}} />);
    expect(screen.getAllByText("2.94%")).toHaveLength(1);
    const snapshot = document.querySelector(".rr-v2-snapshot") as HTMLElement;
    expect(within(snapshot).queryByText(/effective rate/i)).not.toBeInTheDocument();
    expect(within(snapshot).queryByText(/transactions/i)).not.toBeInTheDocument();
  });

  it("renders projected finding and question meaning without treating review amounts as savings", () => {
    const report = clone(reportV2Fixtures.above_reference_findings);
    report.report!.priorityFindings.items[0]!.merchantTitle = "Projected merchant title only";
    report.report!.priorityFindings.items[0]!.whatThisLikelyMeans = "Projected qualified explanation only.";
    render(<ReportV2Screen report={report} onStartOver={() => {}} />);
    expect(screen.getByRole("heading", { name: "Projected merchant title only" })).toBeInTheDocument();
    expect(screen.getByText("Projected qualified explanation only.")).toBeInTheDocument();
    expect(screen.getByText("This is not a savings amount.")).toBeInTheDocument();
  });

  it("uses the projected inventory default and keeps routine charges available", async () => {
    const user = userEvent.setup();
    render(<ReportV2Screen report={reportV2Fixtures.above_reference_findings} onStartOver={() => {}} />);
    expect(screen.getByRole("button", { name: /needs attention1/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("PROCESSOR MARKUP")).toBeInTheDocument();
    expect(screen.queryByText("VISA INTERCHANGE")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /routine2/i }));
    expect(screen.getByText("VISA INTERCHANGE")).toBeInTheDocument();
    expect(screen.getByText("MONTHLY SERVICE FEE")).toBeInTheDocument();
  });

  it("shows planned Save report choices without fake download or email behavior", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ReportV2Screen report={reportV2Fixtures.above_reference_findings} onStartOver={() => {}} />);
    await user.click(screen.getByRole("button", { name: /save report/i }));
    expect(screen.getByRole("dialog", { name: /save your report/i })).toBeInTheDocument();
    expect(screen.getByText("Download PDF")).toBeInTheDocument();
    expect(screen.getByText("Email me a copy")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps the multi-statement CTA honest and non-operative", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ReportV2Screen report={reportV2Fixtures.above_reference_findings} onStartOver={() => {}} />);
    await user.click(screen.getByRole("button", { name: /compare 3–6 more months/i }));
    expect(screen.getByRole("dialog", { name: /multi-statement comparison is coming next/i })).toBeInTheDocument();
    expect(screen.getByText(/does not start an upload or paid workflow/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("omits absent identity and DTO-omitted sections", () => {
    const report = clone(reportV2Fixtures.above_reference_findings);
    report.header.merchantName = null;
    report.header.processor = null;
    report.header.statementPeriod = null;
    report.report!.composition = { ...report.report!.composition, status: "omitted", categories: [] };
    report.report!.trustStrip = { status: "omitted", items: [] };
    render(<ReportV2Screen report={report} onStartOver={() => {}} />);
    const identity = document.querySelector(".rr-v2-identity") as HTMLElement;
    expect(within(identity).queryByText("Synthetic Harbor Café")).not.toBeInTheDocument();
    expect(within(identity).queryByText("Fiserv")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /where your fees went/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Processed sales verified")).not.toBeInTheDocument();
  });

  it("does not expose internal or explicitly deferred merchant language", () => {
    const { container } = render(<ReportV2Screen report={reportV2Fixtures.above_reference_findings} onStartOver={() => {}} />);
    const text = container.textContent ?? "";
    for (const forbidden of ["itemization", "Copy question", "evidence boundary", "Package 2", "policy version", "provider", "model name", "prompt"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

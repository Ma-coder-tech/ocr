// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { reportV1Fixtures } from "./report-v1/reportV1Fixtures";
import { malformedReportV2Fixture, reportV2Fixtures } from "./report-v2/reportV2Fixtures";

function completedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "completed-v2-job",
    fileName: "statement.pdf",
    businessType: "restaurant_food_beverage",
    status: "completed",
    progress: 100,
    error: null,
    summary: null,
    customerReport: null,
    reportV1: null,
    productionReportV2: reportV2Fixtures.above_reference_findings,
    ...overrides,
  };
}

describe("merchant upload transport recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("VITE_RATEREVEAL_REPORT_V2_ENABLED", "true");
    window.history.replaceState({}, "", "/");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("renders normal safe recovery when the serverless boundary returns non-JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("An error occurred", {
      status: 504,
      headers: { "content-type": "text/plain" },
    }));
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /Restaurant \/ F&B/i }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["safe fixture bytes"], "statement.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /^Analyze/i }));

    expect(await screen.findByText("Needs another file")).toBeInTheDocument();
    expect(screen.getByText(/analysis service stopped unexpectedly/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected token/i)).not.toBeInTheDocument();
  });
});

describe("persisted Report V2 continuity", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("VITE_RATEREVEAL_REPORT_V2_ENABLED", "true");
    window.history.replaceState({}, "", "/");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("rehydrates a completed V2 job through one read-only job lookup", async () => {
    window.history.replaceState({}, "", "/?job=completed-v2-job");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(completedJob()));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Your effective rate" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/jobs/completed-v2-job");
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init || !init.method || init.method === "GET")).toBe(true);
    expect(screen.queryByRole("heading", { name: /what kind of business/i })).not.toBeInTheDocument();
  });

  it("retrieves the same persisted projection again after reopen without any mutation request", async () => {
    window.history.replaceState({}, "", "/?job=completed-v2-job");
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(completedJob()))
      .mockResolvedValueOnce(Response.json(completedJob()));

    const first = render(<App />);
    expect(await screen.findByRole("heading", { name: "Your effective rate" })).toBeInTheDocument();
    first.unmount();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Your effective rate" })).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.every(([url, init]) =>
      url === "/api/jobs/completed-v2-job" && (!init || !init.method || init.method === "GET")
    )).toBe(true);
  });

  it("preserves the existing V1 fallback for a completed non-V2 job", async () => {
    window.history.replaceState({}, "", "/?job=legacy-job");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(completedJob({
      id: "legacy-job",
      reportV1: reportV1Fixtures.healthy,
      productionReportV2: null,
    })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: /statement looks healthy this month/i })).toBeInTheDocument();
    expect(screen.queryByText("Report unavailable")).not.toBeInTheDocument();
  });

  it("rejects an invalid persisted V2 projection when no safe legacy report exists", async () => {
    window.history.replaceState({}, "", "/?job=invalid-v2-job");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(completedJob({
      id: "invalid-v2-job",
      productionReportV2: malformedReportV2Fixture,
    })));

    render(<App />);

    expect(await screen.findByText("Report unavailable")).toBeInTheDocument();
    expect(screen.getByText(/does not contain a supported merchant report/i)).toBeInTheDocument();
    expect(screen.queryByText("Your effective rate")).not.toBeInTheDocument();
  });

  it("fails safely for missing or unauthorized jobs without exposing a new upload path", async () => {
    window.history.replaceState({}, "", "/?job=private-job");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Job not found" }, { status: 404 }));

    render(<App />);

    expect(await screen.findByText("Report unavailable")).toBeInTheDocument();
    expect(screen.getByText(/unavailable, expired, or require the account/i)).toBeInTheDocument();
    expect(screen.queryByText("Job not found")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Analyze/i })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init || !init.method || init.method === "GET")).toBe(true);
  });
});

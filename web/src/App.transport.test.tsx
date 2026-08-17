// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("merchant upload transport recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

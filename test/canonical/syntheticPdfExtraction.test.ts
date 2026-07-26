import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf } from "../../src/parser.js";

const SYNTHETIC_PDF_PATH = path.resolve(process.cwd(), "test/fixtures/canonical/synthetic-pdfs/fiserv-summary-synthetic.pdf");

describe("canonical synthetic PDF fixtures", () => {
  it("extracts text from a synthetic CI-safe PDF without real merchant data", async () => {
    const doc = await parsePdf(SYNTHETIC_PDF_PATH);
    const text = doc.rows.map((row) => String(row.content)).join(" ");

    expect(doc.sourceType).toBe("pdf");
    expect(text).toContain("SYNTHETIC STATEMENT");
    expect(text).toContain("Total Amount Submitted");
    expect(text).toContain("$1,234.56");
    expect(text).toContain("Fees Charged");
    expect(text).toContain("$43.21");
    expect(text).not.toMatch(/EL\s+NUEVO|TEQUILA|data\/uploads|\/Users\//i);
  });
});

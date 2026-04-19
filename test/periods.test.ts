import { describe, expect, it } from "vitest";
import {
  detectPeriodKeyFromFileName,
  formatPeriodKey,
  parsePeriodKey,
  toPeriodLabel,
} from "../src/periods.js";

describe("period helpers", () => {
  it("parses valid period keys from multiple formats", () => {
    expect(parsePeriodKey("2024-2")).toBe("2024-02");
    expect(parsePeriodKey("2024/02/29")).toBe("2024-02");
    expect(parsePeriodKey("February 2024")).toBe("2024-02");
    expect(parsePeriodKey("Feb-24")).toBe("2024-02");
  });

  it("returns null for invalid period inputs", () => {
    expect(parsePeriodKey("2024-13")).toBeNull();
    expect(parsePeriodKey("not a date")).toBeNull();
    expect(parsePeriodKey("")).toBeNull();
  });

  it("formats valid keys and preserves invalid ones", () => {
    expect(formatPeriodKey("2024-02")).toBe("February 2024");
    expect(formatPeriodKey("invalid")).toBe("invalid");
  });

  it("produces labels from period-like inputs", () => {
    expect(toPeriodLabel("2024-11")).toBe("November 2024");
    expect(toPeriodLabel("Nov 2024")).toBe("November 2024");
    expect(toPeriodLabel("bad input")).toBeNull();
  });

  it("detects period keys from filenames", () => {
    expect(detectPeriodKeyFromFileName("statement-Nov-2024.pdf")).toBe("2024-11");
    expect(detectPeriodKeyFromFileName("2024_02_processor.pdf")).toBe("2024-02");
    expect(detectPeriodKeyFromFileName("no-period-here.pdf")).toBeNull();
  });
});

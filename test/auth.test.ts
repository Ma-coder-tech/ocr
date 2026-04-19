import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, parseCookies, verifyPassword } from "../src/auth.js";

describe("auth helpers", () => {
  it("hashes and verifies a password round-trip", () => {
    const password = "CorrectHorseBatteryStaple!";
    const stored = hashPassword(password);

    expect(verifyPassword(password, stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("does not verify two different passwords even when the salt is the same", () => {
    const original = hashPassword("first-password");
    const [salt] = original.split(":");
    const secondDerived = scryptSync("second-password", salt, 64).toString("hex");
    const secondStored = `${salt}:${secondDerived}`;

    expect(verifyPassword("first-password", secondStored)).toBe(false);
    expect(verifyPassword("second-password", secondStored)).toBe(true);
  });

  it("parses empty, single, multiple, encoded, and malformed cookie headers", () => {
    expect(parseCookies("")).toEqual({});
    expect(parseCookies("session=abc123")).toEqual({ session: "abc123" });
    expect(parseCookies("session=abc123; theme=dark")).toEqual({ session: "abc123", theme: "dark" });
    expect(parseCookies("encoded%20key=encoded%20value")).toEqual({ "encoded key": "encoded value" });
    expect(parseCookies("missingEquals")).toEqual({ missingEquals: "" });
  });
});

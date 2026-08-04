import { createHash } from "node:crypto";

export function stableCanonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableCanonicalSerialize(value)).digest("hex")}`;
}

export function normalizeSha256(value: string): string {
  const normalized = value.toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("SHA-256 must contain exactly 64 hexadecimal characters.");
  }
  return `sha256:${normalized}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Canonical serialization rejects non-finite numbers.");
  }
  return value;
}

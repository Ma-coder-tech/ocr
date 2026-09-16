export class ShadowAiPlannerStrictJsonErrorV1 extends Error {
  constructor(public readonly safeCode:
    | "shadow_planner_provider_json_invalid"
    | "shadow_planner_provider_json_duplicate_key"
    | "shadow_planner_provider_json_root_not_object") {
    super(safeCode);
  }
}

/**
 * JSON.parse silently accepts duplicate object keys and keeps the last value.
 * Provider drafts cross an authority boundary, so inspect the original bytes
 * with a small grammar parser before materializing the object.
 */
export function parseShadowAiPlannerStrictJsonObjectV1(text: string): Record<string, unknown> {
  try {
    const scanner = new JsonDuplicateKeyScanner(text);
    scanner.inspect();
  } catch (error) {
    if (error instanceof ShadowAiPlannerStrictJsonErrorV1) throw error;
    throw new ShadowAiPlannerStrictJsonErrorV1("shadow_planner_provider_json_invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ShadowAiPlannerStrictJsonErrorV1("shadow_planner_provider_json_invalid");
  }
  if (!isRecord(value)) {
    throw new ShadowAiPlannerStrictJsonErrorV1("shadow_planner_provider_json_root_not_object");
  }
  return value;
}

class JsonDuplicateKeyScanner {
  private index = 0;

  constructor(private readonly source: string) {}

  inspect(): void {
    this.skipWhitespace();
    this.value();
    this.skipWhitespace();
    if (this.index !== this.source.length) this.invalid();
  }

  private value(): void {
    this.skipWhitespace();
    const current = this.source[this.index];
    if (current === "{") this.object();
    else if (current === "[") this.array();
    else if (current === "\"") void this.string();
    else if (current === "t") this.literal("true");
    else if (current === "f") this.literal("false");
    else if (current === "n") this.literal("null");
    else this.number();
  }

  private object(): void {
    this.expect("{");
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.peek("}")) { this.index += 1; return; }
    for (;;) {
      this.skipWhitespace();
      if (!this.peek("\"")) this.invalid();
      const key = this.string();
      if (keys.has(key)) {
        throw new ShadowAiPlannerStrictJsonErrorV1("shadow_planner_provider_json_duplicate_key");
      }
      keys.add(key);
      this.skipWhitespace();
      this.expect(":");
      this.value();
      this.skipWhitespace();
      if (this.peek("}")) { this.index += 1; return; }
      this.expect(",");
    }
  }

  private array(): void {
    this.expect("[");
    this.skipWhitespace();
    if (this.peek("]")) { this.index += 1; return; }
    for (;;) {
      this.value();
      this.skipWhitespace();
      if (this.peek("]")) { this.index += 1; return; }
      this.expect(",");
    }
  }

  private string(): string {
    const start = this.index;
    this.expect("\"");
    while (this.index < this.source.length) {
      const current = this.source[this.index++];
      if (current === "\"") {
        try { return JSON.parse(this.source.slice(start, this.index)) as string; }
        catch { this.invalid(); }
      }
      if (current === "\\") {
        const escaped = this.source[this.index++];
        if (escaped === "u") {
          const hex = this.source.slice(this.index, this.index + 4);
          if (!/^[a-f0-9]{4}$/i.test(hex)) this.invalid();
          this.index += 4;
        } else if (!/["\\/bfnrt]/.test(escaped ?? "")) this.invalid();
      } else if (current.charCodeAt(0) < 0x20) this.invalid();
    }
    return this.invalid();
  }

  private number(): void {
    const match = this.source.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) this.invalid();
    this.index += match[0].length;
  }

  private literal(expected: "true" | "false" | "null"): void {
    if (!this.source.startsWith(expected, this.index)) this.invalid();
    this.index += expected.length;
  }

  private expect(expected: string): void {
    if (!this.peek(expected)) this.invalid();
    this.index += expected.length;
  }

  private peek(expected: string): boolean {
    return this.source.startsWith(expected, this.index);
  }

  private skipWhitespace(): void {
    while (/[\t\n\r ]/.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private invalid(): never {
    throw new ShadowAiPlannerStrictJsonErrorV1("shadow_planner_provider_json_invalid");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

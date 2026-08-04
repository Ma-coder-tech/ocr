import type { IntegrityFailureCode } from "./types.js";

export class EvaluationIntegrityError extends Error {
  readonly code: IntegrityFailureCode;
  readonly details: Record<string, unknown>;

  constructor(code: IntegrityFailureCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "EvaluationIntegrityError";
    this.code = code;
    this.details = details;
  }
}

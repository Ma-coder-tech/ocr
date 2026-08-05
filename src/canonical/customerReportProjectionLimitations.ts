import type {
  CanonicalProjectionLimitationCode,
  CanonicalProjectionLimitationParameters,
  CanonicalProjectionLimitationRecord,
  CustomerLimitationProjection,
  CustomerProjectionAffectedSection,
  CustomerVisibleLimitationCode,
} from "./customerReportProjectionTypes.js";

type LimitationDefinition = {
  audience: CanonicalProjectionLimitationRecord["audience"];
  severity: CanonicalProjectionLimitationRecord["severity"];
  affectedSections: readonly CustomerProjectionAffectedSection[];
  customerVisibility: CanonicalProjectionLimitationRecord["customerVisibility"];
  allowedParameters: readonly (keyof CanonicalProjectionLimitationParameters)[];
  title?: string;
  body?: string;
};

const LIMITATION_DEFINITIONS: Record<CanonicalProjectionLimitationCode, LimitationDefinition> = {
  narrative_content_unsafe: {
    audience: "internal",
    severity: "review",
    affectedSections: ["explanation"],
    customerVisibility: "hidden",
    allowedParameters: [],
  },
  opportunity_support_unavailable: {
    audience: "customer",
    severity: "review",
    affectedSections: ["opportunities", "actions"],
    customerVisibility: "visible",
    allowedParameters: [],
    title: "Opportunity details unavailable",
    body: "Opportunity amounts and suggested actions are not shown because their supporting details are incomplete.",
  },
  fee_reconciliation_incomplete: {
    audience: "customer",
    severity: "review",
    affectedSections: ["fee_inventory"],
    customerVisibility: "visible",
    allowedParameters: ["unresolvedRowCount"],
    title: "Fee details need review",
    body: "Some fee details are limited because the available fee records do not fully reconcile.",
  },
  fee_section_content_unsafe: {
    audience: "customer",
    severity: "review",
    affectedSections: ["fee_inventory"],
    customerVisibility: "visible",
    allowedParameters: [],
    title: "Fee details limited",
    body: "Some fee descriptions are not shown because they are not ready for customer display.",
  },
  benchmark_unavailable: {
    audience: "customer",
    severity: "info",
    affectedSections: ["benchmark", "headline", "opportunities", "actions"],
    customerVisibility: "visible",
    allowedParameters: [],
    title: "Rate comparison unavailable",
    body: "A supported rate comparison is not available for this statement.",
  },
  core_facts_unsafe: {
    audience: "internal",
    severity: "blocked",
    affectedSections: ["projection"],
    customerVisibility: "hidden",
    allowedParameters: [],
  },
  identity_unsafe: {
    audience: "internal",
    severity: "blocked",
    affectedSections: ["projection"],
    customerVisibility: "hidden",
    allowedParameters: [],
  },
  core_reconciliation_missing: {
    audience: "internal",
    severity: "blocked",
    affectedSections: ["projection"],
    customerVisibility: "hidden",
    allowedParameters: [],
  },
  internal_runtime_detail: {
    audience: "internal",
    severity: "info",
    affectedSections: [],
    customerVisibility: "hidden",
    allowedParameters: [],
  },
};

export const APPROVED_CUSTOMER_LIMITATION_COPY: Readonly<
  Record<CustomerVisibleLimitationCode, { title: string; body: string }>
> = Object.freeze({
  opportunity_support_unavailable: {
    title: LIMITATION_DEFINITIONS.opportunity_support_unavailable.title!,
    body: LIMITATION_DEFINITIONS.opportunity_support_unavailable.body!,
  },
  fee_reconciliation_incomplete: {
    title: LIMITATION_DEFINITIONS.fee_reconciliation_incomplete.title!,
    body: LIMITATION_DEFINITIONS.fee_reconciliation_incomplete.body!,
  },
  fee_section_content_unsafe: {
    title: LIMITATION_DEFINITIONS.fee_section_content_unsafe.title!,
    body: LIMITATION_DEFINITIONS.fee_section_content_unsafe.body!,
  },
  benchmark_unavailable: {
    title: LIMITATION_DEFINITIONS.benchmark_unavailable.title!,
    body: LIMITATION_DEFINITIONS.benchmark_unavailable.body!,
  },
});

export function canonicalProjectionLimitation(
  code: CanonicalProjectionLimitationCode,
  parameters: CanonicalProjectionLimitationParameters = {},
): CanonicalProjectionLimitationRecord {
  const definition = LIMITATION_DEFINITIONS[code];
  return {
    code,
    parameters: { ...parameters },
    audience: definition.audience,
    severity: definition.severity,
    affectedSections: [...definition.affectedSections],
    customerVisibility: definition.customerVisibility,
  };
}

export function validateCanonicalProjectionLimitations(records: readonly unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();

  records.forEach((value, index) => {
    const path = `limitation_records[${index}]`;
    if (!isPlainObject(value)) {
      errors.push(`${path}_not_object`);
      return;
    }
    const keys = Object.keys(value).sort();
    const expectedKeys = ["affectedSections", "audience", "code", "customerVisibility", "parameters", "severity"];
    if (keys.join("|") !== expectedKeys.join("|")) errors.push(`${path}_unexpected_shape`);

    const code = value.code;
    if (typeof code !== "string" || !(code in LIMITATION_DEFINITIONS)) {
      errors.push(`${path}_unknown_code`);
      return;
    }
    const definition = LIMITATION_DEFINITIONS[code as CanonicalProjectionLimitationCode];
    if (value.audience !== definition.audience) errors.push(`${path}_audience_mismatch`);
    if (value.severity !== definition.severity) errors.push(`${path}_severity_mismatch`);
    if (value.customerVisibility !== definition.customerVisibility) errors.push(`${path}_visibility_mismatch`);
    if (!sameStringArray(value.affectedSections, definition.affectedSections)) errors.push(`${path}_affected_sections_mismatch`);

    if (!isPlainObject(value.parameters)) {
      errors.push(`${path}_parameters_not_object`);
    } else {
      const parameterKeys = Object.keys(value.parameters);
      if (parameterKeys.some((key) => !definition.allowedParameters.includes(key as keyof CanonicalProjectionLimitationParameters))) {
        errors.push(`${path}_unexpected_parameter`);
      }
      if ("unresolvedRowCount" in value.parameters) {
        const count = value.parameters.unresolvedRowCount;
        if (!Number.isInteger(count) || Number(count) < 0 || Number(count) > 100_000) errors.push(`${path}_unsafe_parameter`);
      }
      if (Object.values(value.parameters).some((parameter) => typeof parameter === "string" || (typeof parameter === "object" && parameter !== null))) {
        errors.push(`${path}_unsafe_parameter`);
      }
    }

    const fingerprint = JSON.stringify(value);
    const previous = seen.get(code);
    if (previous && previous !== fingerprint) errors.push(`${path}_conflicting_duplicate`);
    seen.set(code, fingerprint);
  });

  return [...new Set(errors)].sort();
}

export function customerLimitationsFor(
  records: readonly CanonicalProjectionLimitationRecord[],
): CustomerLimitationProjection[] {
  const visible = new Map<CustomerVisibleLimitationCode, CustomerLimitationProjection>();
  for (const record of records) {
    if (record.audience !== "customer" || record.customerVisibility !== "visible") continue;
    const code = record.code as CustomerVisibleLimitationCode;
    const copy = APPROVED_CUSTOMER_LIMITATION_COPY[code];
    if (!copy) continue;
    visible.set(code, {
      code,
      title: copy.title,
      body: copy.body,
      severity: record.severity as CustomerLimitationProjection["severity"],
      affectedSections: [...record.affectedSections],
    });
  }
  return [...visible.values()].sort((left, right) => left.code.localeCompare(right.code));
}

export function isApprovedCustomerLimitation(value: unknown): value is CustomerLimitationProjection {
  if (!isPlainObject(value)) return false;
  const code = value.code;
  if (typeof code !== "string" || !(code in APPROVED_CUSTOMER_LIMITATION_COPY)) return false;
  const definition = LIMITATION_DEFINITIONS[code as CustomerVisibleLimitationCode];
  const copy = APPROVED_CUSTOMER_LIMITATION_COPY[code as CustomerVisibleLimitationCode];
  return (
    value.title === copy.title &&
    value.body === copy.body &&
    value.severity === definition.severity &&
    sameStringArray(value.affectedSections, definition.affectedSections) &&
    Object.keys(value).sort().join("|") === "affectedSections|body|code|severity|title"
  );
}

export function hasLimitation(
  records: readonly CanonicalProjectionLimitationRecord[],
  code: CanonicalProjectionLimitationCode,
): boolean {
  return records.some((record) => record.code === code);
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

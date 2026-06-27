import fs from "node:fs";
import path from "node:path";

export type FiservFeeReferenceCategory =
  | "interchange"
  | "card_brand_network"
  | "processor_markup"
  | "processor_misc"
  | "pin_debit_network";

export type FiservFeeReferenceRateType =
  | "per_auth"
  | "pct_volume"
  | "per_location_monthly"
  | "variable"
  | "per_transaction"
  | "per_batch"
  | "flat_monthly"
  | "flat_monthly_or_annual"
  | "flat_annual"
  | "one_time";

export type FiservFeeReferenceEntry = {
  id: string;
  network: string;
  canonical_name: string;
  fiserv_labels: string[];
  reference_rate: number | null;
  rate_type: FiservFeeReferenceRateType;
  rate_unit: string;
  applies_to: string;
  category: FiservFeeReferenceCategory;
  negotiable: boolean;
  paid_to: string;
  effective_date: string;
  last_verified: string;
  notes: string;
  verification_formula: string;
  tolerance_pct: number | null;
};

export type FiservFeeReference = {
  document_type: string;
  version: string;
  created: string;
  last_verified: string;
  description: string;
  fees: FiservFeeReferenceEntry[];
};

let cachedReference: FiservFeeReference | null = null;

export function normalizeFiservFeeReferenceText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[–—-]/g, " ")
    .replace(/[^A-Z0-9/&]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function loadFiservFeeReference(): FiservFeeReference {
  if (cachedReference) return cachedReference;
  const referencePath = path.resolve(process.cwd(), "data", "fiserv-fee-analysis", "fiserv_fee_reference.json");
  const parsed = JSON.parse(fs.readFileSync(referencePath, "utf8")) as FiservFeeReference;
  if (!Array.isArray(parsed.fees)) {
    throw new Error("Fiserv fee reference is missing fees array.");
  }
  cachedReference = parsed;
  return parsed;
}

function networkFromSection(section: string | null | undefined): string | null {
  const normalized = normalizeFiservFeeReferenceText(section);
  if (!normalized) return null;
  if (normalized.includes("MASTERCARD") || normalized.startsWith("MC ")) return "Mastercard";
  if (normalized.includes("VISA") || normalized.startsWith("VS ")) return "Visa";
  if (normalized.includes("AMEX")) return "Amex";
  if (normalized.includes("DISCOVER") || normalized.includes("DCVR")) return "Discover";
  return null;
}

function sectionPrefersDebit(section: string | null | undefined): boolean {
  const normalized = normalizeFiservFeeReferenceText(section);
  return normalized.includes("OFLN DB") || normalized.includes("DEBIT");
}

function sectionSpecificityScore(entry: FiservFeeReferenceEntry, section: string | null | undefined): number {
  const name = normalizeFiservFeeReferenceText(entry.canonical_name);
  const debit = sectionPrefersDebit(section);
  if (debit && name.includes("DEBIT")) return 3;
  if (!debit && name.includes("CREDIT")) return 3;
  if (debit && name.includes("CREDIT")) return -3;
  if (!debit && name.includes("DEBIT")) return -1;
  return 0;
}

export function findFiservFeeReferenceEntry(params: {
  section: string | null | undefined;
  description: string;
  reference?: FiservFeeReference;
}): FiservFeeReferenceEntry | null {
  const reference = params.reference ?? loadFiservFeeReference();
  const description = normalizeFiservFeeReferenceText(params.description);
  const sectionNetwork = networkFromSection(params.section);
  const candidates = reference.fees.filter((entry) => {
    if (sectionNetwork && entry.network !== "All" && entry.network !== "Processor" && entry.network !== sectionNetwork) {
      return false;
    }
    return entry.fiserv_labels.some((label) => normalizeFiservFeeReferenceText(label) === description);
  });
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => sectionSpecificityScore(right, params.section) - sectionSpecificityScore(left, params.section))[0] ?? null;
}

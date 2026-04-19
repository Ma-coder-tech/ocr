export const BUSINESS_TYPES = [
  {
    id: "restaurant_food_beverage",
    selectorLabel: "Restaurant / Food & Beverage",
    reportLabel: "Restaurant / F&B",
    note: null,
    benchmark: { lowerRate: 2.2, upperRate: 3.8 },
  },
  {
    id: "retail",
    selectorLabel: "Retail",
    reportLabel: "Retail",
    note: null,
    benchmark: { lowerRate: 1.8, upperRate: 3.2 },
  },
  {
    id: "ecommerce",
    selectorLabel: "E-commerce",
    reportLabel: "E-commerce",
    note: null,
    benchmark: { lowerRate: 2.5, upperRate: 4.0 },
  },
  {
    id: "healthcare",
    selectorLabel: "Healthcare",
    reportLabel: "Healthcare",
    note: null,
    benchmark: { lowerRate: 2.0, upperRate: 3.5 },
  },
  {
    id: "hospitality",
    selectorLabel: "Hospitality",
    reportLabel: "Hospitality",
    note: null,
    benchmark: { lowerRate: 2.2, upperRate: 3.8 },
  },
  {
    id: "high_risk",
    selectorLabel: "High-risk",
    reportLabel: "High-risk",
    note: "covers CBD, dispensaries, adult, firearms",
    benchmark: { lowerRate: 3.5, upperRate: 6.0 },
  },
  {
    id: "professional_services",
    selectorLabel: "Professional services",
    reportLabel: "Professional services",
    note: null,
    benchmark: { lowerRate: 2.0, upperRate: 3.5 },
  },
  {
    id: "other",
    selectorLabel: "Other",
    reportLabel: "Other",
    note: null,
    benchmark: { lowerRate: 2.0, upperRate: 4.0 },
  },
] as const;

export type BusinessTypeId = (typeof BUSINESS_TYPES)[number]["id"];
export const BUSINESS_TYPE_IDS = BUSINESS_TYPES.map((entry) => entry.id) as readonly BusinessTypeId[];

const BUSINESS_TYPE_MAP = new Map(BUSINESS_TYPES.map((entry) => [entry.id, entry]));

export function isBusinessTypeId(value: string): value is BusinessTypeId {
  return BUSINESS_TYPE_MAP.has(value as BusinessTypeId);
}

export function getBusinessTypeConfig(businessType: BusinessTypeId) {
  return BUSINESS_TYPE_MAP.get(businessType)!;
}

export function getBusinessTypeReportLabel(businessType: BusinessTypeId): string {
  return getBusinessTypeConfig(businessType).reportLabel;
}

export function getBusinessTypeSelectorLabel(businessType: BusinessTypeId): string {
  return getBusinessTypeConfig(businessType).selectorLabel;
}

export function getBusinessTypeBenchmark(businessType: BusinessTypeId) {
  return getBusinessTypeConfig(businessType).benchmark;
}

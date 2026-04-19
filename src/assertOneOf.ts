export function assertOneOf<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid value for ${field}: ${value}`);
  }
  return value as T;
}

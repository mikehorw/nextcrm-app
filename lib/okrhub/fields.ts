// OKR Hub fork (OKR-170): fixed option lists carried over from Capsule CRM.
// Kept in one file so upstream merges never touch them. Order = display order.

export const BRANDS = ["Mikehorw Consulting", "The OKR Hub"] as const;

export const SERVICE_LINES = [
  "OKR Training – Teams",
  "OKR Training – Managers",
  "OKR Operations",
  "OKR Consulting / Advisory",
  "Online course",
  "Agile Consulting / Advisory",
  "OKR Facilitation / Away Days",
] as const;

export const VALUE_TYPES = [
  "Fixed price",
  "Day rate / T&M",
  "Retainer",
  "Other",
] as const;

export const LOST_REASONS = [
  "Abandoned",
  "Became Stale",
  "Competition",
  "No Authority",
  "Poor Qualification",
  "Price too high",
  "Wrong time",
] as const;

/** Suggested account tags; free text is also allowed. */
export const ACCOUNT_TAG_SUGGESTIONS = [
  "Mikehorw Consulting",
  "The OKR Hub",
  "Partner Business",
  "LinkedIn",
] as const;

export type Brand = (typeof BRANDS)[number];

/** Keep only values from an allowed list (drops anything unknown). */
export function pickAllowed<T extends readonly string[]>(
  allowed: T,
  values: readonly string[] | null | undefined,
): string[] {
  if (!values) return [];
  const set = new Set<string>(allowed);
  return Array.from(new Set(values.filter((v) => set.has(v))));
}

export type OkrhubOpportunityInput = {
  brand?: string | null;
  service_lines?: string[] | null;
  value_types?: string[] | null;
  lost_reason?: string | null;
};

/**
 * Validated Prisma data for the OKR Hub opportunity fields.
 * Keys that are absent from the input are left out (so updates don't wipe them);
 * unknown option values are dropped; null/"" clears a single-choice field.
 */
export function okrhubOpportunityData(input: OkrhubOpportunityInput) {
  const out: {
    brand?: string | null;
    service_lines?: string[];
    value_types?: string[];
    lost_reason?: string | null;
  } = {};
  if ("brand" in input) {
    out.brand = input.brand && (BRANDS as readonly string[]).includes(input.brand) ? input.brand : null;
  }
  if ("service_lines" in input) out.service_lines = pickAllowed(SERVICE_LINES, input.service_lines);
  if ("value_types" in input) out.value_types = pickAllowed(VALUE_TYPES, input.value_types);
  if ("lost_reason" in input) {
    out.lost_reason =
      input.lost_reason && (LOST_REASONS as readonly string[]).includes(input.lost_reason)
        ? input.lost_reason
        : null;
  }
  return out;
}

/** Normalise free-form tags: trim, drop empties, de-duplicate (case-insensitive). */
export function normaliseTags(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Keys of OkrhubOpportunityInput, for splitting them out of a larger args object. */
export const OKRHUB_OPPORTUNITY_KEYS = [
  "brand",
  "service_lines",
  "value_types",
  "lost_reason",
] as const;

/** Split OKR Hub fields off an args object: [okrhubInput, everythingElse]. */
export function splitOkrhubOpportunity<T extends Record<string, unknown>>(
  args: T,
): [OkrhubOpportunityInput, Omit<T, (typeof OKRHUB_OPPORTUNITY_KEYS)[number]>] {
  const okr: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if ((OKRHUB_OPPORTUNITY_KEYS as readonly string[]).includes(k)) {
      if (v !== undefined) okr[k] = v;
    } else rest[k] = v;
  }
  return [okr as OkrhubOpportunityInput, rest as Omit<T, (typeof OKRHUB_OPPORTUNITY_KEYS)[number]>];
}

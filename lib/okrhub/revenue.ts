// OKR Hub fork (OKR-174): revenue from FreeAgent, pure helpers (no I/O).
//
// Revenue = sales invoices dated in a period, excluding drafts and cancelled,
// minus credit notes, net of VAT, in GBP. Brand comes from the client: a hand-set
// brand on the FreeAgent client wins, otherwise the NextCRM account with the same
// name supplies it (its brand tag, or the brand all its opportunities share).

import { Decimal } from "@prisma/client/runtime/client";
import { BRANDS } from "@/lib/okrhub/fields";

export type RevenueDoc = {
  kind: string; // "invoice" | "credit_note"
  contact_url: string | null;
  dated_on: Date;
  status: string;
  currency: string;
  net_value: Decimal | number | string;
  exchange_rate: Decimal | number | string | null;
};

export type AccountBrandInfo = { id?: string; name: string; tags: string[]; opportunityBrands: (string | null)[] };

const EXCLUDED = new Set(["draft", "cancelled"]);

/** "Acme Ltd." / "ACME LIMITED" / " acme " all match. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(ltd|limited|plc|llp|inc|llc|co|company|the|uk)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The brand an account implies: its single brand tag, else the one brand all its deals share. */
export function brandOfAccount(a: AccountBrandInfo): string | null {
  const tagBrands = a.tags.filter((t) => (BRANDS as readonly string[]).includes(t));
  if (tagBrands.length === 1) return tagBrands[0];
  const oppBrands = Array.from(new Set(a.opportunityBrands.filter((b): b is string => !!b)));
  if (tagBrands.length === 0 && oppBrands.length === 1) return oppBrands[0];
  return null;
}

/**
 * OKR-175: FreeAgent contact URL -> the CRM account it is (hand-set, else the one
 * account with the same normalised name) and its brand (hand-set brand first).
 */
export function resolveClients(
  contacts: { url: string; name: string; brand_override: string | null; account_override?: string | null }[],
  accounts: AccountBrandInfo[],
): Map<string, { accountId: string | null; brand: string | null }> {
  const byId = new Map(accounts.filter((a) => a.id).map((a) => [a.id as string, a]));
  // Same-named accounts (duplicates): prefer the one with deals; still tied -> no match.
  const byName = new Map<string, AccountBrandInfo | null>();
  const groups = new Map<string, AccountBrandInfo[]>();
  for (const a of accounts) {
    const key = normaliseName(a.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  for (const [key, list] of Array.from(groups)) {
    const withDeals = list.filter((a) => a.opportunityBrands.length > 0);
    const pick = list.length === 1 ? list[0] : withDeals.length === 1 ? withDeals[0] : null;
    byName.set(key, pick);
  }
  const brands = resolveBrands(contacts, accounts);
  const out = new Map<string, { accountId: string | null; brand: string | null }>();
  for (const c of contacts) {
    const account = (c.account_override ? byId.get(c.account_override) : undefined) ?? byName.get(normaliseName(c.name)) ?? null;
    const override = c.brand_override && (BRANDS as readonly string[]).includes(c.brand_override) ? c.brand_override : null;
    const brand = override ?? (c.account_override && account ? brandOfAccount(account) : null) ?? brands.get(c.url) ?? null;
    out.set(c.url, { accountId: account?.id ?? null, brand });
  }
  return out;
}

/** Map of FreeAgent contact URL -> brand (or null when it can't be told). */
export function resolveBrands(
  contacts: { url: string; name: string; brand_override: string | null }[],
  accounts: AccountBrandInfo[],
): Map<string, string | null> {
  const byName = new Map<string, string | null>();
  for (const a of accounts) {
    const key = normaliseName(a.name);
    if (!key) continue;
    // Two accounts normalising to the same name with different brands: can't tell.
    const brand = brandOfAccount(a);
    byName.set(key, byName.has(key) && byName.get(key) !== brand ? null : brand);
  }
  const out = new Map<string, string | null>();
  for (const c of contacts) {
    const override = c.brand_override && (BRANDS as readonly string[]).includes(c.brand_override) ? c.brand_override : null;
    out.set(c.url, override ?? byName.get(normaliseName(c.name)) ?? null);
  }
  return out;
}

/** Net value in GBP: as-is for GBP, else multiplied by FreeAgent's exchange rate when given. */
export function netInGBP(d: Pick<RevenueDoc, "currency" | "net_value" | "exchange_rate">): Decimal {
  const net = new Decimal(d.net_value.toString());
  if (d.currency === "GBP" || d.exchange_rate == null) return net;
  return net.mul(new Decimal(d.exchange_rate.toString())).toDecimalPlaces(2);
}

export function countsAsRevenue(d: Pick<RevenueDoc, "status">): boolean {
  return !EXCLUDED.has(d.status.trim().toLowerCase());
}

/**
 * Revenue for one goal. `brand` null means all brands. Documents whose client has
 * no brand only count towards all-brands goals (and are reported as unassigned).
 */
export function revenueFor(
  docs: RevenueDoc[],
  brands: Map<string, string | null>,
  window: { gte: Date; lt: Date },
  brand: string | null,
): { revenue: Decimal; invoices: number; unassigned: Decimal } {
  let revenue = new Decimal(0);
  let unassigned = new Decimal(0);
  let invoices = 0;
  for (const d of docs) {
    if (!countsAsRevenue(d)) continue;
    if (d.dated_on < window.gte || d.dated_on >= window.lt) continue;
    const docBrand = d.contact_url ? (brands.get(d.contact_url) ?? null) : null;
    if (brand && docBrand !== brand) continue;
    const value = netInGBP(d).abs();
    const signed = d.kind === "credit_note" ? value.neg() : value;
    revenue = revenue.add(signed);
    if (d.kind === "invoice") invoices += 1;
    if (!docBrand) unassigned = unassigned.add(signed);
  }
  return { revenue, invoices, unassigned };
}

/**
 * Invoices not yet paid (FreeAgent due_value > 0), including VAT, in GBP.
 * Drafts, cancelled and written-off invoices are not owed.
 */
export function outstandingInvoices(
  docs: { kind: string; status: string; currency: string; exchange_rate: Decimal | number | string | null; due_value: Decimal | number | string | null; due_on: Date | null }[],
  now: Date = new Date(),
): { total: number; count: number; overdue: number; overdueTotal: number } {
  let total = new Decimal(0);
  let overdueTotal = new Decimal(0);
  let count = 0;
  let overdue = 0;
  for (const d of docs) {
    if (d.kind !== "invoice" || d.due_value == null) continue;
    const status = d.status.trim().toLowerCase();
    if (EXCLUDED.has(status) || status.startsWith("written")) continue;
    const due = netInGBP({ currency: d.currency, net_value: d.due_value, exchange_rate: d.exchange_rate });
    if (due.lte(0)) continue;
    total = total.add(due);
    count += 1;
    if (status === "overdue" || (d.due_on && d.due_on < now)) {
      overdue += 1;
      overdueTotal = overdueTotal.add(due);
    }
  }
  return { total: total.toNumber(), count, overdue, overdueTotal: overdueTotal.toNumber() };
}

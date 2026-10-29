// OKR Hub fork (OKR-175): pipeline and revenue forecast maths. Pure, no I/O.
//
// Revenue is recognised on invoice (FreeAgent, net, GBP). The forecast for the
// rest of an accounting year (Aug to Jul) is:
//   committed = won value not yet invoiced, per CRM account, projected forward at
//               the rate that account is actually being invoiced
//   likely    = open deals' weighted value (value x stage probability), landing
//               in the month of their expected close date

import { BRANDS } from "@/lib/okrhub/fields";

export type Brand = string | null; // null = all brands

/** Brand filter options on the Goals charts ("all" = both brands). */
export const BRAND_OPTIONS = ["all", ...BRANDS] as const;

export type StageInfo = { id: string; name: string; probability: number; order: number };
export type OpenDeal = { stageId: string | null; value: number; brand: string | null; closeDate: Date | null; probability: number };
export type WonDeal = { accountId: string | null; value: number; brand: string | null; wonAt: Date };
export type Invoice = { date: Date; value: number; brand: string | null; accountId: string | null }; // value signed (credit notes negative)

const MS_DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
const fromKey = (k: number) => new Date(Date.UTC(Math.floor(k / 12), k % 12, 1));
const round = (n: number) => Math.round(n * 100) / 100;
const brandMatch = (want: Brand, have: string | null) => !want || want === have;

// ---- Pipeline by stage -------------------------------------------------------

export function pipelineByStage(stages: StageInfo[], deals: OpenDeal[], brand: Brand) {
  const rows = [...stages]
    .filter((s) => s.probability < 100) // Won is not pipeline
    .sort((a, b) => a.order - b.order || a.probability - b.probability)
    .map((s) => ({ stage: s.name, probability: s.probability, full: 0, weighted: 0, deals: 0 }));
  const byId = new Map(stages.map((s) => [s.id, s.name]));
  for (const d of deals) {
    if (!brandMatch(brand, d.brand)) continue;
    const row = rows.find((r) => r.stage === byId.get(d.stageId ?? ""));
    if (!row) continue;
    row.full += d.value;
    row.weighted += (d.value * d.probability) / 100;
    row.deals += 1;
  }
  return rows.map((r) => ({ ...r, full: round(r.full), weighted: round(r.weighted) }));
}

// ---- Revenue for the year ----------------------------------------------------

/** Accounting year containing `d`: start = 1 Aug. */
export function accountingYearStart(d: Date): Date {
  const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 7, 1));
}

/** A won account stops counting as committed when it hasn't been invoiced (or, never invoiced, won) for this long. */
export const STALE_MONTHS = 3;

/**
 * Committed income per month, keyed by month number (monthKey). One stream per
 * CRM account with deals won in the last 12 months:
 *   remaining = value won - net invoiced to that account since the first of those wins
 *   rate      = invoiced since then / completed months since the first invoice
 * Never invoiced yet: the remainder lands next month. Stale accounts are dropped.
 */
export function committedByMonth(won: WonDeal[], invoices: Invoice[], brand: Brand, now: Date) {
  const nowKey = monthKey(now);
  const out = new Map<number, number>();
  const streams: { accountId: string; won: number; invoiced: number; remaining: number; perMonth: number }[] = [];
  const recent = won.filter((w) => w.accountId && brandMatch(brand, w.brand) && now.getTime() - w.wonAt.getTime() <= 366 * MS_DAY);
  const accounts = Array.from(new Set(recent.map((w) => w.accountId as string)));
  for (const accountId of accounts) {
    const deals = recent.filter((w) => w.accountId === accountId);
    const since = new Date(Math.min(...deals.map((d) => d.wonAt.getTime())));
    const value = deals.reduce((s, d) => s + d.value, 0);
    const inv = invoices.filter((i) => i.accountId === accountId && i.date >= since);
    const invoiced = inv.reduce((s, i) => s + i.value, 0);
    const remaining = value - invoiced;
    if (remaining <= 0.5) continue;
    let perMonth: number;
    let startKey = nowKey + 1;
    if (inv.length) {
      const first = Math.min(...inv.map((i) => monthKey(i.date)));
      const last = Math.max(...inv.map((i) => monthKey(i.date)));
      if (nowKey - last > STALE_MONTHS) continue;
      // Months since the first invoice, counting this month only once it has been invoiced.
      const months = Math.max(1, nowKey - first + (last === nowKey ? 1 : 0));
      perMonth = Math.max(invoiced / months, 1);
    } else {
      if (nowKey - monthKey(since) > STALE_MONTHS) continue;
      perMonth = remaining; // not invoiced yet: all next month
    }
    let left = remaining;
    for (let k = startKey; left > 0.5 && k < startKey + 36; k++) {
      const amount = Math.min(perMonth, left);
      out.set(k, (out.get(k) ?? 0) + amount);
      left -= amount;
    }
    streams.push({ accountId, won: round(value), invoiced: round(invoiced), remaining: round(remaining), perMonth: round(perMonth) });
  }
  return { byMonth: out, streams };
}

/** Likely income per month: open deals' weighted value at their expected close (past dates -> next month). */
export function likelyByMonth(deals: OpenDeal[], brand: Brand, now: Date) {
  const out = new Map<number, number>();
  const nowKey = monthKey(now);
  for (const d of deals) {
    if (!brandMatch(brand, d.brand)) continue;
    const k = Math.max(d.closeDate ? monthKey(d.closeDate) : nowKey + 1, nowKey + 1);
    out.set(k, (out.get(k) ?? 0) + (d.value * d.probability) / 100);
  }
  return out;
}

export type YearPoint = {
  month: string; // "Aug"
  actual: number | null; // cumulative invoiced, to the current month
  forecast: number | null; // cumulative actual + committed + likely, from the current month
  committed: number | null; // cumulative actual + committed only (for the tooltip)
};

export function revenueYear(opts: {
  yearStart: Date;
  now: Date;
  brand: Brand;
  invoices: Invoice[];
  won: WonDeal[];
  open: OpenDeal[];
}) {
  const { yearStart, now, brand } = opts;
  const startKey = monthKey(yearStart);
  const endKey = startKey + 11;
  const nowKey = monthKey(now);
  const isPast = nowKey > endKey;
  const isFuture = nowKey < startKey;

  const actualByMonth = new Map<number, number>();
  for (const i of opts.invoices) {
    if (!brandMatch(brand, i.brand)) continue;
    const k = monthKey(i.date);
    if (k < startKey || k > endKey) continue;
    actualByMonth.set(k, (actualByMonth.get(k) ?? 0) + i.value);
  }
  const committed = isPast ? { byMonth: new Map<number, number>(), streams: [] } : committedByMonth(opts.won, opts.invoices, brand, now);
  const likely = isPast ? new Map<number, number>() : likelyByMonth(opts.open, brand, now);

  const points: YearPoint[] = [];
  let actual = 0;
  let fc = 0;
  let cm = 0;
  let committedInYear = 0;
  let likelyInYear = 0;
  for (let k = startKey; k <= endKey; k++) {
    const label = MONTHS[fromKey(k).getUTCMonth()];
    if (k <= nowKey || isPast) {
      actual += actualByMonth.get(k) ?? 0;
      fc = actual;
      cm = actual;
      const showForecast = !isPast && k === nowKey;
      points.push({ month: label, actual: round(actual), forecast: showForecast ? round(fc) : null, committed: showForecast ? round(cm) : null });
    } else {
      const c = committed.byMonth.get(k) ?? 0;
      const l = likely.get(k) ?? 0;
      committedInYear += c;
      likelyInYear += l;
      cm += c;
      fc += c + l;
      points.push({ month: label, actual: null, forecast: round(fc), committed: round(cm) });
    }
  }
  if (isFuture) {
    // Year not started: forecast from zero.
    for (const p of points) p.actual = null;
  }
  return {
    points,
    isPast,
    actual: round(actual),
    committed: round(committedInYear),
    likely: round(likelyInYear),
    forecast: round(actual + committedInYear + likelyInYear),
    streams: committed.streams,
  };
}

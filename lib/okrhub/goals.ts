// OKR Hub fork (OKR-171): revenue goals.
// Progress = value (budget) of opportunities won (status CLOSED, won_at in the
// goal's period), filtered by Brand when the goal has one. Values in another
// currency are converted to the goal currency when a rate exists.

import { Decimal } from "@prisma/client/runtime/client";
import { convertAmount, type Rate } from "@/lib/currency-format";
import { BRANDS } from "@/lib/okrhub/fields";

export type GoalInput = {
  name: string;
  amount: number | string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  brand?: string | null;
};

export type WonDeal = {
  budget: Decimal | number | string | null;
  currency: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of a YYYY-MM-DD date, or null if it isn't one. */
export function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/** The won_at window for a goal: start of start day up to (not incl.) the day after end. */
export function goalWindow(start: Date, end: Date) {
  return { gte: start, lt: new Date(end.getTime() + DAY_MS) };
}

/** Validates and normalises goal input. Returns an error string or the data to store. */
export function validateGoal(
  input: GoalInput,
): { error: string } | { data: { name: string; amount: number; start_date: Date; end_date: Date; brand: string | null } } {
  const name = (input.name ?? "").trim();
  if (!name) return { error: "Give the goal a name" };
  const amount = typeof input.amount === "number" ? input.amount : parseFloat(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be more than 0" };
  const start = parseDay(input.start_date);
  const end = parseDay(input.end_date);
  if (!start || !end) return { error: "Choose a start and end date" };
  if (end < start) return { error: "End date must be on or after the start date" };
  const brand =
    input.brand && (BRANDS as readonly string[]).includes(input.brand) ? input.brand : null;
  if (input.brand && !brand) return { error: "Unknown brand" };
  return { data: { name, amount: Math.round(amount * 100) / 100, start_date: start, end_date: end, brand } };
}

/** Total won value in the goal currency. */
export function sumWon(deals: WonDeal[], goalCurrency: string, rates: Rate[]): Decimal {
  let total = new Decimal(0);
  for (const d of deals) {
    const value = new Decimal(d.budget?.toString() ?? "0");
    const from = d.currency || goalCurrency;
    total = total.add(convertAmount(value, from, goalCurrency, rates) ?? value);
  }
  return total;
}

/** Whole-number percentage of target achieved (can exceed 100). */
export function percentOf(achieved: Decimal | number, target: Decimal | number): number {
  const t = new Decimal(target.toString());
  if (t.lte(0)) return 0;
  return new Decimal(achieved.toString()).div(t).mul(100).toDecimalPlaces(0).toNumber();
}

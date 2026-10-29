"use server";
// OKR Hub fork (OKR-171): revenue goals. Reading needs a signed-in (non-partner)
// user; creating, editing and deleting needs a manager or admin.

import { revalidatePath } from "next/cache";
import { prismadb } from "@/lib/prisma";
import { getExchangeRates, getDefaultCurrency } from "@/lib/currency";
import {
  requireAuthenticated,
  requireRole,
  opportunityReadScopeWhere,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/authz";
import {
  goalWindow,
  percentOf,
  sumWon,
  validateGoal,
  type GoalInput,
} from "@/lib/okrhub/goals";
import { revenueFor, resolveBrands } from "@/lib/okrhub/revenue";
import { isManagerOrAdmin } from "@/lib/authz";

export type GoalWithProgress = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  brand: string | null;
  achieved: number;
  percent: number;
  wonCount: number;
  /** OKR-174: FreeAgent revenue (net, GBP). null when FreeAgent isn't connected or the viewer can't see it. */
  revenue: number | null;
  revenuePercent: number | null;
  invoiceCount: number;
  /** Revenue from clients with no brand yet (all-brands goals only). */
  unassignedRevenue: number;
};

/** OKR-174: everything needed to compute revenue, loaded once per page. */
async function loadRevenueInputs() {
  const connection = await prismadb.okrhub_FreeAgentConnection.findUnique({ where: { id: "freeagent" } });
  if (!connection) return null;
  const [docs, contacts, accounts] = await Promise.all([
    prismadb.okrhub_FreeAgentDocument.findMany(),
    prismadb.okrhub_FreeAgentContact.findMany({ select: { url: true, name: true, brand_override: true } }),
    prismadb.crm_Accounts.findMany({
      where: { deletedAt: null },
      select: { name: true, tags: true, opportunities: { where: { deletedAt: null }, select: { brand: true } } },
    }),
  ]);
  const brands = resolveBrands(
    contacts,
    accounts.map((a) => ({ name: a.name, tags: a.tags, opportunityBrands: a.opportunities.map((o) => o.brand) })),
  );
  return { docs, brands };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function getGoalsWithProgress(): Promise<GoalWithProgress[]> {
  let user;
  try {
    user = await requireAuthenticated();
  } catch (e) {
    if (e instanceof AuthenticationError) return [];
    throw e;
  }

  const [goals, rates] = await Promise.all([
    prismadb.crm_Goals.findMany({
      where: { deletedAt: null },
      orderBy: [{ start_date: "desc" }, { brand: "asc" }, { name: "asc" }],
    }),
    getExchangeRates(),
  ]);
  const scope = opportunityReadScopeWhere(user);
  // Revenue is company-wide financial data: managers and admins only.
  const rev = isManagerOrAdmin(user) ? await loadRevenueInputs() : null;

  return Promise.all(
    goals.map(async (g) => {
      const deals = await prismadb.crm_Opportunities.findMany({
        where: {
          ...scope,
          status: "CLOSED",
          won_at: goalWindow(g.start_date, g.end_date),
          ...(g.brand ? { brand: g.brand } : {}),
        },
        select: { budget: true, currency: true },
      });
      const achieved = sumWon(deals, g.currency, rates);
      const r = rev ? revenueFor(rev.docs, rev.brands, goalWindow(g.start_date, g.end_date), g.brand) : null;
      return {
        id: g.id,
        name: g.name,
        amount: Number(g.amount),
        currency: g.currency,
        start_date: day(g.start_date),
        end_date: day(g.end_date),
        brand: g.brand,
        achieved: achieved.toNumber(),
        percent: percentOf(achieved, g.amount),
        wonCount: deals.length,
        revenue: r ? r.revenue.toNumber() : null,
        revenuePercent: r ? percentOf(r.revenue, g.amount) : null,
        invoiceCount: r?.invoices ?? 0,
        unassignedRevenue: r && !g.brand ? r.unassigned.toNumber() : 0,
      };
    }),
  );
}

async function requireGoalWriter() {
  try {
    return { user: await requireRole(["manager", "admin"]) };
  } catch (e) {
    if (e instanceof AuthenticationError) return { error: "Unauthorized" };
    if (e instanceof AuthorizationError) return { error: "Only managers and admins can change goals" };
    throw e;
  }
}

const revalidate = () => revalidatePath("/[locale]/(routes)/crm/goals", "page");

export async function createGoal(input: GoalInput) {
  const auth = await requireGoalWriter();
  if ("error" in auth) return { error: auth.error };
  const v = validateGoal(input);
  if ("error" in v) return v;
  const goal = await prismadb.crm_Goals.create({
    data: { ...v.data, currency: await getDefaultCurrency(), createdBy: auth.user!.id },
  });
  revalidate();
  return { data: { id: goal.id } };
}

export async function updateGoal(id: string, input: GoalInput) {
  if (!id) return { error: "id is required" };
  const auth = await requireGoalWriter();
  if ("error" in auth) return { error: auth.error };
  const v = validateGoal(input);
  if ("error" in v) return v;
  const existing = await prismadb.crm_Goals.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return { error: "Goal not found" };
  await prismadb.crm_Goals.update({ where: { id }, data: v.data });
  revalidate();
  return { data: { id } };
}

export async function deleteGoal(id: string) {
  if (!id) return { error: "id is required" };
  const auth = await requireGoalWriter();
  if ("error" in auth) return { error: auth.error };
  await prismadb.crm_Goals.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidate();
  return { data: { id } };
}

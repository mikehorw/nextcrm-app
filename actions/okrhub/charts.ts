"use server";
// OKR Hub fork (OKR-175): data for the Goals page charts. Managers and admins only
// (it includes company revenue). Everything is computed for each brand option so
// the brand filter switches instantly in the browser.

import { Decimal } from "@prisma/client/runtime/client";
import { prismadb } from "@/lib/prisma";
import { getExchangeRates, getDefaultCurrency, convertAmount } from "@/lib/currency";
import { requireRole, AuthenticationError, AuthorizationError } from "@/lib/authz";
import { countsAsRevenue, netInGBP, resolveClients } from "@/lib/okrhub/revenue";
import {
  accountingYearStart,
  BRAND_OPTIONS,
  pipelineByStage,
  revenueYear,
  type Invoice,
  type OpenDeal,
  type WonDeal,
} from "@/lib/okrhub/forecast";


export type ChartsData = {
  freeAgentConnected: boolean;
  pipeline: Record<string, ReturnType<typeof pipelineByStage>>;
  years: {
    label: string; // "2026/27"
    byBrand: Record<string, ReturnType<typeof revenueYear> & { target: number | null }>;
  }[];
  accountNames: Record<string, string>;
};

export async function getGoalsCharts(): Promise<ChartsData | null> {
  try {
    await requireRole(["manager", "admin"]);
  } catch (e) {
    if (e instanceof AuthenticationError || e instanceof AuthorizationError) return null;
    throw e;
  }
  const now = new Date();
  const [stagesRaw, opps, goals, connection, docs, contacts, accounts, rates, home] = await Promise.all([
    prismadb.crm_Opportunities_Sales_Stages.findMany({ select: { id: true, name: true, probability: true, order: true } }),
    prismadb.crm_Opportunities.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "CLOSED"] } },
      select: { status: true, budget: true, currency: true, brand: true, account: true, sales_stage: true, close_date: true, won_at: true },
    }),
    prismadb.crm_Goals.findMany({ where: { deletedAt: null } }),
    prismadb.okrhub_FreeAgentConnection.findUnique({ where: { id: "freeagent" } }),
    prismadb.okrhub_FreeAgentDocument.findMany(),
    prismadb.okrhub_FreeAgentContact.findMany({ select: { url: true, name: true, brand_override: true, account_override: true } }),
    prismadb.crm_Accounts.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, tags: true, opportunities: { where: { deletedAt: null }, select: { brand: true } } },
    }),
    getExchangeRates(),
    getDefaultCurrency(),
  ]);

  const stages = stagesRaw.map((s) => ({ id: s.id, name: s.name, probability: s.probability ?? 0, order: s.order ?? 0 }));
  const prob = new Map(stages.map((s) => [s.id, s.probability]));
  const gbp = (v: Decimal | number | null, cur: string | null) => {
    const d = new Decimal((v ?? 0).toString());
    return (convertAmount(d, cur || home, home, rates) ?? d).toNumber();
  };

  const open: OpenDeal[] = opps
    .filter((o) => o.status === "ACTIVE")
    .map((o) => ({
      stageId: o.sales_stage,
      value: gbp(o.budget, o.currency),
      brand: o.brand,
      closeDate: o.close_date,
      probability: prob.get(o.sales_stage ?? "") ?? 0,
    }));
  const won: WonDeal[] = opps
    .filter((o) => o.status === "CLOSED" && o.won_at)
    .map((o) => ({ accountId: o.account, value: gbp(o.budget, o.currency), brand: o.brand, wonAt: o.won_at as Date }));

  const clients = resolveClients(
    contacts,
    accounts.map((a) => ({ id: a.id, name: a.name, tags: a.tags, opportunityBrands: a.opportunities.map((o) => o.brand) })),
  );
  const invoices: Invoice[] = connection
    ? docs
        .filter((d) => countsAsRevenue(d))
        .map((d) => {
          const c = d.contact_url ? clients.get(d.contact_url) : undefined;
          const v = netInGBP(d).abs().toNumber();
          return { date: d.dated_on, value: d.kind === "credit_note" ? -v : v, brand: c?.brand ?? null, accountId: c?.accountId ?? null };
        })
    : [];

  const brandOf = (b: string) => (b === "all" ? null : b);
  const pipeline: ChartsData["pipeline"] = {};
  for (const b of BRAND_OPTIONS) pipeline[b] = pipelineByStage(stages, open, brandOf(b));

  // Years: every accounting year with a goal, plus the current one.
  const starts = new Set<number>([accountingYearStart(now).getTime()]);
  for (const g of goals) starts.add(accountingYearStart(g.start_date).getTime());
  const years = Array.from(starts)
    .sort((a, b) => b - a)
    .map((t) => {
      const yearStart = new Date(t);
      const y = yearStart.getUTCFullYear();
      const label = `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
      const byBrand: ChartsData["years"][number]["byBrand"] = {};
      for (const b of BRAND_OPTIONS) {
        const brand = brandOf(b);
        const goal = goals.find((g) => accountingYearStart(g.start_date).getTime() === t && (g.brand ?? null) === brand);
        byBrand[b] = { ...revenueYear({ yearStart, now, brand, invoices, won, open }), target: goal ? Number(goal.amount) : null };
      }
      return { label, byBrand };
    });

  return {
    freeAgentConnected: !!connection,
    pipeline,
    years,
    accountNames: Object.fromEntries(accounts.map((a) => [a.id, a.name])),
  };
}

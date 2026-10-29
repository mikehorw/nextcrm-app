"use server";
// OKR Hub fork (OKR-174): FreeAgent panel on the Goals page. Managers and admins only.

import { revalidatePath } from "next/cache";
import { prismadb } from "@/lib/prisma";
import { requireRole, AuthenticationError, AuthorizationError } from "@/lib/authz";
import { BRANDS } from "@/lib/okrhub/fields";
import { disconnect, freeAgentConfigured, getConnection, syncFreeAgent } from "@/lib/okrhub/freeagent";
import { countsAsRevenue, netInGBP, resolveBrands } from "@/lib/okrhub/revenue";

async function guard() {
  try {
    await requireRole(["manager", "admin"]);
    return null;
  } catch (e) {
    if (e instanceof AuthenticationError) return { error: "Unauthorized" };
    if (e instanceof AuthorizationError) return { error: "Only managers and admins can do this" };
    throw e;
  }
}

const revalidate = () => revalidatePath("/[locale]/(routes)/crm/goals", "page");

export type FreeAgentClientRow = {
  url: string;
  name: string;
  brand: string | null; // resolved
  override: string | null;
  revenue: number; // net GBP, all synced invoices less credit notes
};

export type FreeAgentStatus = {
  configured: boolean;
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  clients: FreeAgentClientRow[];
};

export async function getFreeAgentStatus(): Promise<FreeAgentStatus | null> {
  if (await guard()) return null;
  const c = await getConnection();
  const base = {
    configured: freeAgentConfigured(),
    connected: !!c,
    lastSyncAt: c?.last_sync_at?.toISOString() ?? null,
    lastSyncError: c?.last_sync_error ?? null,
  };
  if (!c) return { ...base, clients: [] };

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
  const revenueByClient = new Map<string, number>();
  for (const d of docs) {
    if (!d.contact_url || !countsAsRevenue(d)) continue;
    const v = netInGBP(d).abs().toNumber() * (d.kind === "credit_note" ? -1 : 1);
    revenueByClient.set(d.contact_url, (revenueByClient.get(d.contact_url) ?? 0) + v);
  }
  const clients = contacts
    .filter((x) => revenueByClient.has(x.url))
    .map((x) => ({
      url: x.url,
      name: x.name,
      brand: brands.get(x.url) ?? null,
      override: x.brand_override,
      revenue: Math.round((revenueByClient.get(x.url) ?? 0) * 100) / 100,
    }))
    // Unassigned first, then biggest clients.
    .sort((a, b) => Number(!!a.brand) - Number(!!b.brand) || b.revenue - a.revenue);
  return { ...base, clients };
}

export async function syncFreeAgentNow() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const result = await syncFreeAgent();
    revalidate();
    return { data: result };
  } catch (e) {
    revalidate();
    return { error: e instanceof Error ? e.message : "Sync failed" };
  }
}

/** Set (or clear, with null) the brand for a FreeAgent client. */
export async function setFreeAgentClientBrand(url: string, brand: string | null) {
  const denied = await guard();
  if (denied) return denied;
  if (brand !== null && !(BRANDS as readonly string[]).includes(brand)) return { error: "Unknown brand" };
  await prismadb.okrhub_FreeAgentContact.update({ where: { url }, data: { brand_override: brand } });
  revalidate();
  return { data: { url } };
}

export async function disconnectFreeAgent() {
  const denied = await guard();
  if (denied) return denied;
  await disconnect();
  revalidate();
  return { data: true };
}

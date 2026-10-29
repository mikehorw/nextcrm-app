// OKR Hub fork (OKR-174): FreeAgent API client and sync. Server only, read-only.
//
// OAuth 2.0: Mike approves the CRM once; tokens are stored encrypted (same key
// as mailbox passwords) and the access token (1 hour) is refreshed as needed.
// App credentials: FREEAGENT_CLIENT_ID / FREEAGENT_CLIENT_SECRET (Vercel, Sensitive).

import { prismadb } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/email-crypto";

const API = process.env.FREEAGENT_API_URL ?? "https://api.freeagent.com/v2";
const ID = "freeagent";

export function freeAgentConfigured(): boolean {
  return !!(process.env.FREEAGENT_CLIENT_ID && process.env.FREEAGENT_CLIENT_SECRET);
}

export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "";
  return `${base.replace(/\/$/, "")}/api/okrhub/freeagent/callback`;
}

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.FREEAGENT_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: redirectUri(),
    state,
  });
  return `${API}/approve_app?${q}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const id = process.env.FREEAGENT_CLIENT_ID ?? "";
  const secret = process.env.FREEAGENT_CLIENT_SECRET ?? "";
  const send = (withBasic: boolean) =>
    fetch(`${API}/token_endpoint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...(withBasic ? { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } : {}),
      },
      body: new URLSearchParams(withBasic ? params : { ...params, client_id: id, client_secret: secret }),
    });
  let res = await send(true);
  if (res.status === 401) res = await send(false);
  if (!res.ok) throw new Error(`FreeAgent token request failed (HTTP ${res.status})`);
  return (await res.json()) as TokenResponse;
}

async function saveTokens(t: TokenResponse, refreshToken: string, userId?: string) {
  const data = {
    access_token_enc: encrypt(t.access_token),
    refresh_token_enc: encrypt(t.refresh_token ?? refreshToken),
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
  };
  await prismadb.okrhub_FreeAgentConnection.upsert({
    where: { id: ID },
    create: { id: ID, ...data, connected_by: userId ?? null },
    update: { ...data, ...(userId ? { connected_by: userId, connected_at: new Date() } : {}) },
  });
}

export async function exchangeCode(code: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("FreeAgent did not return a refresh token");
  await saveTokens(t, t.refresh_token, userId);
}

export async function getConnection() {
  return prismadb.okrhub_FreeAgentConnection.findUnique({ where: { id: ID } });
}

export async function disconnect() {
  await prismadb.okrhub_FreeAgentConnection.deleteMany({ where: { id: ID } });
}

async function accessToken(): Promise<string> {
  const c = await getConnection();
  if (!c) throw new Error("FreeAgent is not connected");
  if (c.expires_at.getTime() - Date.now() > 60_000) return decrypt(c.access_token_enc);
  const refresh = decrypt(c.refresh_token_enc);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  await saveTokens(t, refresh);
  return t.access_token;
}

/** GET every page of a list endpoint (per_page 100, following the Link header). */
async function getAll<T>(path: string, key: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${API}${path}${path.includes("?") ? "&" : "?"}per_page=100`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "OKR Hub CRM" },
    });
    if (res.status === 404) return out;
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 5) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`FreeAgent ${path}: HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, T[]>;
    out.push(...(body[key] ?? []));
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "");
    url = next ? next[1] : null;
  }
  return out;
}

type FAContact = { url: string; organisation_name?: string | null; first_name?: string | null; last_name?: string | null };
type FADoc = {
  url: string;
  contact?: string | null;
  reference?: string | null;
  dated_on: string;
  status?: string | null;
  currency?: string | null;
  net_value?: string | number | null;
  exchange_rate?: string | number | null;
};

/** 1 Aug of the accounting year before the current one (Aug to Jul years). */
export function syncFromDate(now = new Date()): string {
  const startYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${startYear - 1}-08-01`;
}

export async function syncFreeAgent(): Promise<{ contacts: number; invoices: number; creditNotes: number }> {
  try {
    const token = await accessToken();
    const from = syncFromDate();
    const [contacts, invoices, creditNotes] = await Promise.all([
      getAll<FAContact>("/contacts?view=all", "contacts", token),
      getAll<FADoc>("/invoices?view=all", "invoices", token),
      getAll<FADoc>("/credit_notes?view=all", "credit_notes", token),
    ]);

    for (const c of contacts) {
      const name =
        (c.organisation_name ?? "").trim() || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.url;
      await prismadb.okrhub_FreeAgentContact.upsert({
        where: { url: c.url },
        create: { url: c.url, name },
        update: { name, synced_at: new Date() },
      });
    }

    const docs = [
      ...invoices.map((d) => ({ d, kind: "invoice" })),
      ...creditNotes.map((d) => ({ d, kind: "credit_note" })),
    ].filter(({ d }) => d.dated_on >= from);
    for (const { d, kind } of docs) {
      const data = {
        kind,
        contact_url: d.contact ?? null,
        reference: d.reference ?? null,
        dated_on: new Date(`${d.dated_on}T00:00:00.000Z`),
        status: d.status ?? "Unknown",
        currency: (d.currency ?? "GBP").slice(0, 3),
        net_value: Number(d.net_value ?? 0),
        exchange_rate: d.exchange_rate == null ? null : Number(d.exchange_rate),
        synced_at: new Date(),
      };
      await prismadb.okrhub_FreeAgentDocument.upsert({ where: { url: d.url }, create: { url: d.url, ...data }, update: data });
    }
    // Remove local copies of documents FreeAgent no longer returns (deleted there).
    await prismadb.okrhub_FreeAgentDocument.deleteMany({
      where: { dated_on: { gte: new Date(`${from}T00:00:00.000Z`) }, url: { notIn: docs.map(({ d }) => d.url) } },
    });

    await prismadb.okrhub_FreeAgentConnection.update({
      where: { id: ID },
      data: { last_sync_at: new Date(), last_sync_error: null },
    });
    return { contacts: contacts.length, invoices: invoices.length, creditNotes: creditNotes.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prismadb.okrhub_FreeAgentConnection
      .update({ where: { id: ID }, data: { last_sync_error: message } })
      .catch(() => undefined);
    throw e;
  }
}

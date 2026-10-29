"use client";

// OKR Hub fork (OKR-174): FreeAgent connection, sync and client brands, on the Goals page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRANDS } from "@/lib/okrhub/fields";
import {
  disconnectFreeAgent,
  setFreeAgentClientAccount,
  setFreeAgentClientBrand,
  syncFreeAgentNow,
  type FreeAgentStatus,
} from "@/actions/okrhub/freeagent";

const AUTO = "__auto__";
const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function FreeAgentPanel({ status, notice }: { status: FreeAgentStatus; notice?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const run = async (fn: () => Promise<{ error?: string } | unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = (await fn()) as { error?: string };
      if (r?.error) toast.error(r.error);
      else toast.success(ok);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const unassigned = status.clients.filter((c) => !c.brand);
  const rows = showAll ? status.clients : unassigned;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">FreeAgent revenue</CardTitle>
            <CardDescription>
              {status.connected
                ? status.lastSyncAt
                  ? `Last synced ${when(status.lastSyncAt)}. Updates daily.`
                  : "Connected. Not synced yet."
                : "Connect FreeAgent to show invoiced revenue (net of VAT) on each goal. Read-only."}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {status.connected ? (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(syncFreeAgentNow, "FreeAgent synced")}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                  Sync now
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(disconnectFreeAgent, "FreeAgent disconnected")}>
                  Disconnect
                </Button>
              </>
            ) : status.configured ? (
              <Button size="sm" onClick={() => window.location.assign("/api/okrhub/freeagent/connect")}>
                Connect FreeAgent
              </Button>
            ) : (
              <Badge variant="secondary">App credentials not set</Badge>
            )}
          </div>
        </div>
        {notice === "failed" && <p className="text-sm text-destructive">Connecting to FreeAgent failed. Try again.</p>}
        {status.lastSyncError && <p className="text-sm text-destructive">Last sync failed: {status.lastSyncError}</p>}
      </CardHeader>

      {status.connected && status.clients.length > 0 && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {unassigned.length === 0
                ? "Every invoiced client has a brand."
                : `${unassigned.length} invoiced ${unassigned.length === 1 ? "client has" : "clients have"} no brand yet. Their revenue counts in all-brands goals only.`}
            </p>
            <Button size="sm" variant="link" className="h-auto p-0" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show clients without a brand" : "Show all clients"}
            </Button>
          </div>
          {rows.length > 0 && (
            <div className="divide-y rounded-md border">
              {rows.map((c) => (
                <div key={c.url} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {gbp(c.revenue)} invoiced{c.brand && !c.override ? " · brand from CRM account" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                  <Select
                    value={c.accountOverride ?? AUTO}
                    disabled={busy}
                    onValueChange={(v) =>
                      run(() => setFreeAgentClientAccount(c.url, v === AUTO ? null : v), "CRM account saved")
                    }
                  >
                    <SelectTrigger className="h-8 w-[230px]" aria-label={`CRM account for ${c.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>
                        {c.accountId && !c.accountOverride
                          ? `Account: auto (${status.accounts.find((a) => a.id === c.accountId)?.name ?? "match"})`
                          : "Account: auto (no match)"}
                      </SelectItem>
                      {status.accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={c.override ?? AUTO}
                    disabled={busy}
                    onValueChange={(v) =>
                      run(() => setFreeAgentClientBrand(c.url, v === AUTO ? null : v), "Brand saved")
                    }
                  >
                    <SelectTrigger className="h-8 w-[210px]" aria-label={`Brand for ${c.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>{c.brand && !c.override ? `Brand: auto (${c.brand})` : "Brand: auto (none)"}</SelectItem>
                      {BRANDS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

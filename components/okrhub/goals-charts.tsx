"use client";

// OKR Hub fork (OKR-175): pipeline by stage and revenue for the year (actual + forecast).

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRAND_OPTIONS } from "@/lib/okrhub/forecast";
import type { ChartsData } from "@/actions/okrhub/charts";

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
const short = (n: number) => (Math.abs(n) >= 1000 ? `£${Math.round(n / 1000)}k` : `£${Math.round(n)}`);
const brandLabel = (b: string) => (b === "all" ? "All brands" : b);

const pipelineConfig = {
  weighted: { label: "Weighted (value x probability)", color: "hsl(var(--chart-1))" },
  rest: { label: "Rest of deal value", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const revenueConfig = {
  actual: { label: "Actual (invoiced)", color: "hsl(var(--chart-1))" },
  committed: { label: "Actual + committed", color: "hsl(var(--chart-3))" },
  forecast: { label: "Forecast (+ likely pipeline)", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={emphasis ? "text-lg font-semibold" : "text-base font-medium"}>{value}</p>
    </div>
  );
}

export function GoalsCharts({ data }: { data: ChartsData }) {
  const [brand, setBrand] = useState<string>("all");
  const [yearIdx, setYearIdx] = useState(0);
  const year = data.years[yearIdx];
  const rev = year?.byBrand[brand];

  const pipeline = (data.pipeline[brand] ?? []).map((r) => ({ ...r, rest: Math.max(r.full - r.weighted, 0) }));
  const pipeFull = pipeline.reduce((s, r) => s + r.full, 0);
  const pipeWeighted = pipeline.reduce((s, r) => s + r.weighted, 0);
  const pipeDeals = pipeline.reduce((s, r) => s + r.deals, 0);

  return (
    <div className="space-y-4">
      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Brand filter">
          {BRAND_OPTIONS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrand(b)}
              aria-pressed={brand === b}
              className={`rounded px-3 py-1 text-sm ${brand === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {brandLabel(b)}
            </button>
          ))}
        </div>
        {data.years.length > 1 && (
          <Select value={String(yearIdx)} onValueChange={(v) => setYearIdx(Number(v))}>
            <SelectTrigger className="h-8 w-[130px]" aria-label="Accounting year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.years.map((y, i) => (
                <SelectItem key={y.label} value={String(i)}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Revenue for the year */}
        {year && rev && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue {year.label}: actual and forecast</CardTitle>
              <CardDescription>Cumulative, net of VAT, {brandLabel(brand).toLowerCase()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!data.freeAgentConnected ? (
                <p className="text-sm text-muted-foreground">Connect FreeAgent to see revenue.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Stat label={rev.isPast ? "Invoiced" : "Invoiced to date"} value={gbp(rev.actual)} emphasis />
                    {!rev.isPast && <Stat label="+ Committed" value={gbp(rev.committed)} />}
                    {!rev.isPast && <Stat label="+ Likely" value={gbp(rev.likely)} />}
                    {!rev.isPast && <Stat label="= Forecast" value={gbp(rev.forecast)} emphasis />}
                    {rev.target !== null && <Stat label="Target" value={gbp(rev.target)} />}
                    {rev.target !== null && (
                      <Stat
                        label={(rev.isPast ? rev.actual : rev.forecast) >= rev.target ? "Over target" : "Gap to target"}
                        value={gbp(Math.abs(rev.target - (rev.isPast ? rev.actual : rev.forecast)))}
                      />
                    )}
                  </div>
                  <ChartContainer config={revenueConfig} className="aspect-auto h-[260px] w-full">
                    <LineChart data={rev.points} margin={{ left: 4, right: 12, top: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={short}
                        domain={[0, (max: number) => Math.max(max, rev.target ?? 0) * 1.05]}
                      />
                      {rev.target !== null && (
                        <ReferenceLine
                          y={rev.target}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="2 4"
                          label={{ value: `Target ${short(rev.target)}`, position: "insideTopLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        />
                      )}
                      <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${revenueConfig[n as keyof typeof revenueConfig]?.label ?? n}: ${gbp(Number(v))}`} />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                      {!rev.isPast && (
                        <Line dataKey="committed" type="monotone" stroke="var(--color-committed)" strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
                      )}
                      {!rev.isPast && (
                        <Line dataKey="forecast" type="monotone" stroke="var(--color-forecast)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                      )}
                    </LineChart>
                  </ChartContainer>
                  {!rev.isPast && rev.streams.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {rev.streams.map((s) => (
                        <li key={s.accountId}>
                          Committed: {data.accountNames[s.accountId] ?? "Account"} {gbp(s.won)} won, {gbp(s.invoiced)} invoiced, {gbp(s.remaining)} to come at about {gbp(s.perMonth)}/month
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {rev.isPast
                      ? "Revenue = invoices dated in the year, net of VAT, less credit notes."
                      : "Revenue counts when invoiced. Committed = won value not yet invoiced, at the rate the client is being invoiced (not yet invoiced: next month). Likely = open deals x stage probability, at their expected close month."}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pipeline by stage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline by stage</CardTitle>
            <CardDescription>Open deals, {brandLabel(brand).toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Stat label="Open deals" value={String(pipeDeals)} />
              <Stat label="Pipeline value" value={gbp(pipeFull)} emphasis />
              <Stat label="Weighted" value={gbp(pipeWeighted)} emphasis />
            </div>
            {pipeDeals === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No open deals{brand === "all" ? "" : ` for ${brand}`}.</p>
            ) : (
              <ChartContainer config={pipelineConfig} className="aspect-auto h-[260px] w-full">
                <BarChart data={pipeline} margin={{ left: 4, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="stage"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={0}
                    tickFormatter={(s: string) => {
                      const r = pipeline.find((p) => p.stage === s);
                      return `${s.length > 14 ? `${s.slice(0, 13)}…` : s} (${r?.probability ?? 0}%)`;
                    }}
                    height={36}
                    fontSize={11}
                  />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={short} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(v, n, item) => {
                          const row = item.payload as (typeof pipeline)[number];
                          return n === "weighted"
                            ? `Weighted: ${gbp(row.weighted)}`
                            : `Full value: ${gbp(row.full)} (${row.deals} ${row.deals === 1 ? "deal" : "deals"})`;
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="weighted" stackId="a" fill="var(--color-weighted)" radius={[0, 0, 4, 4]} isAnimationActive={false} />
                  <Bar dataKey="rest" stackId="a" fill="var(--color-rest)" fillOpacity={0.45} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// OKR Hub fork (OKR-175): pipeline and forecast maths.
import { accountingYearStart, committedByMonth, likelyByMonth, pipelineByStage, revenueYear } from "@/lib/okrhub/forecast";
import { resolveClients } from "@/lib/okrhub/revenue";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const NOW = d("2026-10-29");
const MC = "Mikehorw Consulting";
const HUB = "The OKR Hub";

const stages = [
  { id: "q", name: "Qualification", probability: 10, order: 1 },
  { id: "p", name: "Initial Pitch", probability: 30, order: 3 },
  { id: "n", name: "Negotiation/Review", probability: 85, order: 6 },
  { id: "w", name: "Won", probability: 100, order: 7 },
];

describe("pipelineByStage", () => {
  const deals = [
    { stageId: "q", value: 10000, brand: HUB, closeDate: null, probability: 10 },
    { stageId: "n", value: 20000, brand: MC, closeDate: null, probability: 85 },
    { stageId: "n", value: 1000, brand: HUB, closeDate: null, probability: 85 },
  ];
  it("totals full and weighted value per stage, Won excluded, in stage order", () => {
    const rows = pipelineByStage(stages, deals, null);
    expect(rows.map((r) => r.stage)).toEqual(["Qualification", "Initial Pitch", "Negotiation/Review"]);
    expect(rows[2]).toMatchObject({ full: 21000, weighted: 17850, deals: 2 });
  });
  it("filters by brand", () => {
    expect(pipelineByStage(stages, deals, HUB).find((r) => r.stage === "Negotiation/Review")).toMatchObject({ full: 1000, deals: 1 });
  });
});

describe("committed (i.AI case)", () => {
  // Won 5 Jul 2026 for £118,615; invoiced net £16,000 in Aug and £12,000 in Sep.
  const won = [{ accountId: "lorien", value: 118615, brand: MC, wonAt: d("2026-07-05") }];
  const invoices = [
    { date: d("2026-08-03"), value: 12000, brand: MC, accountId: "lorien" },
    { date: d("2026-08-05"), value: 4000, brand: MC, accountId: "lorien" },
    { date: d("2026-09-01"), value: 12000, brand: MC, accountId: "lorien" },
    { date: d("2026-02-01"), value: 5000, brand: MC, accountId: "lorien" }, // before the win: ignored
  ];
  it("projects the remainder at the invoiced monthly rate from next month", () => {
    const c = committedByMonth(won, invoices, null, NOW);
    expect(c.streams[0]).toMatchObject({ invoiced: 28000, remaining: 90615, perMonth: 14000 });
    const total = Array.from(c.byMonth.values()).reduce((a, b) => a + b, 0);
    expect(Math.round(total)).toBe(90615);
    const months = Array.from(c.byMonth.keys()).sort();
    expect(months[0]).toBe(2026 * 12 + 10); // November 2026
  });
  it("drops an account not invoiced for more than 3 months", () => {
    expect(committedByMonth(won, invoices, null, d("2027-02-15")).streams).toHaveLength(0);
  });
  it("a win not yet invoiced lands next month", () => {
    const c = committedByMonth([{ accountId: "x", value: 2000, brand: HUB, wonAt: d("2026-10-10") }], [], null, NOW);
    expect(c.byMonth.get(2026 * 12 + 10)).toBe(2000);
  });
  it("respects the brand filter", () => {
    expect(committedByMonth(won, invoices, HUB, NOW).streams).toHaveLength(0);
  });
});

describe("likely", () => {
  it("weighted value at expected close; past dates move to next month", () => {
    const m = likelyByMonth(
      [
        { stageId: "n", value: 10000, brand: HUB, closeDate: d("2027-01-15"), probability: 85 },
        { stageId: "q", value: 10000, brand: HUB, closeDate: d("2026-09-01"), probability: 10 },
      ],
      null,
      NOW,
    );
    expect(m.get(2027 * 12 + 0)).toBe(8500);
    expect(m.get(2026 * 12 + 10)).toBe(1000);
  });
});

describe("revenueYear", () => {
  const invoices = [
    { date: d("2026-08-03"), value: 16000, brand: MC, accountId: "lorien" },
    { date: d("2026-09-01"), value: 12000, brand: MC, accountId: "lorien" },
    { date: d("2026-03-01"), value: 1000, brand: HUB, accountId: "jf" },
  ];
  const won = [{ accountId: "lorien", value: 118615, brand: MC, wonAt: d("2026-07-05") }];
  it("current year: actual to October, then committed and likely to July", () => {
    const r = revenueYear({ yearStart: d("2026-08-01"), now: NOW, brand: null, invoices, won, open: [] });
    expect(r.actual).toBe(28000);
    expect(r.points.map((p) => p.month)).toEqual(["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"]);
    expect(r.points[2]).toMatchObject({ actual: 28000, forecast: 28000 });
    expect(r.points[3].actual).toBeNull();
    expect(Math.round(r.committed)).toBe(90615);
    expect(Math.round(r.forecast)).toBe(118615);
  });
  it("past year: actual only", () => {
    const r = revenueYear({ yearStart: d("2025-08-01"), now: NOW, brand: null, invoices, won, open: [] });
    expect(r.isPast).toBe(true);
    expect(r.actual).toBe(1000);
    expect(r.points.every((p) => p.forecast === null)).toBe(true);
  });
  it("accounting year starts 1 Aug", () => {
    expect(accountingYearStart(d("2026-07-31")).toISOString().slice(0, 10)).toBe("2025-08-01");
    expect(accountingYearStart(d("2026-08-01")).toISOString().slice(0, 10)).toBe("2026-08-01");
  });
});

describe("resolveClients", () => {
  it("a hand-linked account beats the name match and supplies the brand", () => {
    const m = resolveClients(
      [{ url: "c/lorien", name: "Lorien Resourcing Limited", brand_override: null, account_override: "lsm" }],
      [
        { id: "lrl", name: "Lorien Resourcing Limited", tags: [], opportunityBrands: [] },
        { id: "lsm", name: "Lorien Specialist Markets", tags: [], opportunityBrands: [MC] },
      ],
    );
    expect(m.get("c/lorien")).toEqual({ accountId: "lsm", brand: MC });
  });
});

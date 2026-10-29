// OKR Hub fork (OKR-174): revenue rules.
import { normaliseName, brandOfAccount, resolveBrands, revenueFor, netInGBP } from "@/lib/okrhub/revenue";
import { syncFromDate } from "@/lib/okrhub/freeagent";

jest.mock("@/lib/prisma", () => ({ prismadb: {} }));
jest.mock("@/lib/email-crypto", () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }));

const W = { gte: new Date("2025-08-01T00:00:00Z"), lt: new Date("2026-08-01T00:00:00Z") };
const doc = (o: Partial<Parameters<typeof revenueFor>[0][number]>) => ({
  kind: "invoice", contact_url: "c/okr", dated_on: new Date("2025-09-01T00:00:00Z"),
  status: "Paid", currency: "GBP", net_value: "1000", exchange_rate: null, ...o,
});

describe("client names and brands", () => {
  it("normalises company names", () => {
    expect(normaliseName("Acme Ltd.")).toBe(normaliseName(" ACME LIMITED "));
    expect(normaliseName("Smith & Sons plc")).toBe("smith and sons");
  });
  it("takes the brand tag, else the one brand all deals share", () => {
    expect(brandOfAccount({ name: "A", tags: ["The OKR Hub", "LinkedIn"], opportunityBrands: [] })).toBe("The OKR Hub");
    expect(brandOfAccount({ name: "A", tags: [], opportunityBrands: ["Mikehorw Consulting", null] })).toBe("Mikehorw Consulting");
    expect(brandOfAccount({ name: "A", tags: [], opportunityBrands: ["Mikehorw Consulting", "The OKR Hub"] })).toBeNull();
  });
  it("a hand-set brand beats the CRM match; unmatched clients have no brand", () => {
    const m = resolveBrands(
      [
        { url: "c/okr", name: "OKR Client Ltd", brand_override: null },
        { url: "c/over", name: "OKR Client Ltd", brand_override: "Mikehorw Consulting" },
        { url: "c/none", name: "Nobody", brand_override: null },
      ],
      [{ name: "OKR Client Limited", tags: ["The OKR Hub"], opportunityBrands: [] }],
    );
    expect(m.get("c/okr")).toBe("The OKR Hub");
    expect(m.get("c/over")).toBe("Mikehorw Consulting");
    expect(m.get("c/none")).toBeNull();
  });
});

describe("revenueFor", () => {
  const brands = new Map<string, string | null>([["c/okr", "The OKR Hub"], ["c/mc", "Mikehorw Consulting"], ["c/x", null]]);
  const docs = [
    doc({}),
    doc({ contact_url: "c/mc", net_value: "5000" }),
    doc({ contact_url: "c/x", net_value: "200" }),
    doc({ kind: "credit_note", net_value: "-100" }),
    doc({ status: "Draft", net_value: "9999" }),
    doc({ status: "Cancelled", net_value: "9999" }),
    doc({ dated_on: new Date("2026-08-01T00:00:00Z"), net_value: "9999" }),
    doc({ dated_on: new Date("2026-07-31T00:00:00Z"), net_value: "50" }),
  ];
  it("all brands: invoices in the year, less credit notes, no drafts or cancelled", () => {
    const r = revenueFor(docs, brands, W, null);
    expect(r.revenue.toNumber()).toBe(1000 + 5000 + 200 - 100 + 50);
    expect(r.invoices).toBe(4);
    expect(r.unassigned.toNumber()).toBe(200);
  });
  it("a brand goal counts only that brand's clients", () => {
    expect(revenueFor(docs, brands, W, "The OKR Hub").revenue.toNumber()).toBe(1000 - 100 + 50);
    expect(revenueFor(docs, brands, W, "Mikehorw Consulting").revenue.toNumber()).toBe(5000);
  });
  it("converts non-GBP with the exchange rate", () => {
    expect(netInGBP({ currency: "EUR", net_value: "100", exchange_rate: "0.85" }).toNumber()).toBe(85);
    expect(netInGBP({ currency: "GBP", net_value: "100", exchange_rate: "2" }).toNumber()).toBe(100);
  });
});

describe("syncFromDate", () => {
  it("starts at 1 Aug of the previous accounting year", () => {
    expect(syncFromDate(new Date("2026-10-29T00:00:00Z"))).toBe("2025-08-01");
    expect(syncFromDate(new Date("2026-07-15T00:00:00Z"))).toBe("2024-08-01");
  });
});

describe("nextLink", () => {
  const { nextLink } = jest.requireActual("@/lib/okrhub/freeagent");
  it("reads FreeAgent's single-quoted rel and the usual double-quoted form", () => {
    expect(nextLink("<https://api.freeagent.com/v2/invoices?page=2>; rel='next', <https://x?page=5>; rel='last'")).toBe(
      "https://api.freeagent.com/v2/invoices?page=2",
    );
    expect(nextLink('<https://x?page=1>; rel="prev", <https://x?page=3>; rel="next"')).toBe("https://x?page=3");
    expect(nextLink("<https://x?page=1>; rel='prev'")).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});

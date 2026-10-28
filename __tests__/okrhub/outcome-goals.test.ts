// OKR Hub fork (OKR-171): won/lost rules and goal maths.
import { Decimal } from "@prisma/client/runtime/client";

jest.mock("@/lib/prisma", () => ({ prismadb: {} }));

import { isWonStage, outcomeForStageMove, lostData, STALE_LOST_REASON } from "@/lib/okrhub/outcome";
import { validateGoal, goalWindow, parseDay, sumWon, percentOf } from "@/lib/okrhub/goals";

const NOW = new Date("2026-10-28T12:00:00Z");

describe("isWonStage", () => {
  it("matches the Won stage by name or 100%", () => {
    expect(isWonStage({ name: "Won", probability: 100 })).toBe(true);
    expect(isWonStage({ name: " won ", probability: null })).toBe(true);
    expect(isWonStage({ name: "Closed deal", probability: 100 })).toBe(true);
    expect(isWonStage({ name: "Negotiation/Review", probability: 85 })).toBe(false);
    expect(isWonStage(null)).toBe(false);
  });
});

describe("outcomeForStageMove", () => {
  it("marks an open deal won on entering Won, setting won and close dates", () => {
    expect(outcomeForStageMove({ status: "ACTIVE", won_at: null }, false, true, NOW)).toEqual({
      status: "CLOSED",
      won_at: NOW,
      close_date: NOW,
      lost_at: null,
      lost_reason: null,
    });
  });
  it("leaves an already-won deal alone", () => {
    expect(outcomeForStageMove({ status: "CLOSED", won_at: NOW }, true, true)).toBeNull();
  });
  it("reopens a won deal moved out of Won", () => {
    expect(outcomeForStageMove({ status: "CLOSED", won_at: NOW }, true, false)).toEqual({
      status: "ACTIVE",
      won_at: null,
      lost_at: null,
      lost_reason: null,
    });
  });
  it("reopens a lost deal moved to another stage", () => {
    expect(outcomeForStageMove({ status: "INACTIVE" }, false, false)?.status).toBe("ACTIVE");
  });
  it("does nothing for an open deal moving between open stages", () => {
    expect(outcomeForStageMove({ status: "ACTIVE" }, false, false)).toBeNull();
  });
});

describe("lostData", () => {
  it("marks lost with a valid reason and clears won", () => {
    expect(lostData(STALE_LOST_REASON, NOW)).toEqual({
      status: "INACTIVE",
      lost_at: NOW,
      lost_reason: "Became Stale",
      won_at: null,
    });
  });
  it("drops an unknown reason", () => {
    expect(lostData("Because", NOW).lost_reason).toBeNull();
  });
});

describe("validateGoal", () => {
  const ok = { name: "2026/27 revenue", amount: "180000", start_date: "2026-08-01", end_date: "2027-07-31" };
  it("accepts an overall goal", () => {
    const r = validateGoal(ok);
    expect("data" in r && r.data).toMatchObject({ name: "2026/27 revenue", amount: 180000, brand: null });
  });
  it("accepts a known brand and rejects an unknown one", () => {
    expect("data" in validateGoal({ ...ok, brand: "The OKR Hub" })).toBe(true);
    expect(validateGoal({ ...ok, brand: "Acme" })).toEqual({ error: "Unknown brand" });
  });
  it("rejects bad amounts, dates and empty names", () => {
    expect("error" in validateGoal({ ...ok, amount: "0" })).toBe(true);
    expect("error" in validateGoal({ ...ok, start_date: "2026-02-30" })).toBe(true);
    expect("error" in validateGoal({ ...ok, end_date: "2026-07-31" })).toBe(true);
    expect("error" in validateGoal({ ...ok, name: "  " })).toBe(true);
  });
});

describe("goalWindow", () => {
  it("includes the whole end day", () => {
    const w = goalWindow(parseDay("2026-08-01")!, parseDay("2027-07-31")!);
    expect(w.gte.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(w.lt.toISOString()).toBe("2027-08-01T00:00:00.000Z");
  });
});

describe("sumWon and percentOf", () => {
  const rates = [{ fromCurrency: "EUR", toCurrency: "GBP", rate: new Decimal("0.5") }];
  it("sums won value, converting where a rate exists", () => {
    const total = sumWon(
      [
        { budget: new Decimal("100000"), currency: "GBP" },
        { budget: "20000", currency: "EUR" },
        { budget: 5000, currency: null },
      ],
      "GBP",
      rates,
    );
    expect(total.toNumber()).toBe(115000);
    expect(percentOf(total, 180000)).toBe(64);
    expect(percentOf(230945, 176000)).toBe(131);
    expect(percentOf(10, 0)).toBe(0);
  });
});

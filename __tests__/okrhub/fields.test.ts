// OKR Hub fork (OKR-170)
import {
  normaliseTags,
  okrhubOpportunityData,
  pickAllowed,
  splitOkrhubOpportunity,
  SERVICE_LINES,
} from "@/lib/okrhub/fields";

describe("okrhubOpportunityData", () => {
  it("leaves out keys that were not sent, so partial updates don't wipe fields", () => {
    expect(okrhubOpportunityData({})).toEqual({});
    expect(okrhubOpportunityData({ brand: "The OKR Hub" })).toEqual({ brand: "The OKR Hub" });
  });

  it("clears single-choice fields on empty string or null", () => {
    expect(okrhubOpportunityData({ brand: "", lost_reason: null })).toEqual({
      brand: null,
      lost_reason: null,
    });
  });

  it("drops unknown values", () => {
    expect(
      okrhubOpportunityData({
        brand: "Acme",
        lost_reason: "Because",
        service_lines: ["Online course", "Bogus"],
        value_types: ["Retainer", "Retainer"],
      }),
    ).toEqual({
      brand: null,
      lost_reason: null,
      service_lines: ["Online course"],
      value_types: ["Retainer"],
    });
  });
});

describe("pickAllowed", () => {
  it("handles null and keeps first-seen order", () => {
    expect(pickAllowed(SERVICE_LINES, null)).toEqual([]);
    expect(pickAllowed(SERVICE_LINES, ["Online course", "OKR Operations"])).toEqual([
      "Online course",
      "OKR Operations",
    ]);
  });
});

describe("normaliseTags", () => {
  it("trims, drops empties and de-duplicates case-insensitively", () => {
    expect(normaliseTags([" The OKR Hub ", "", "the okr hub", "LinkedIn"])).toEqual([
      "The OKR Hub",
      "LinkedIn",
    ]);
    expect(normaliseTags(undefined)).toEqual([]);
  });
});

describe("splitOkrhubOpportunity", () => {
  it("separates OKR Hub keys from the rest and skips undefined", () => {
    const [okr, rest] = splitOkrhubOpportunity({
      id: "x",
      name: "Deal",
      brand: "The OKR Hub",
      lost_reason: undefined,
    });
    expect(okr).toEqual({ brand: "The OKR Hub" });
    expect(rest).toEqual({ id: "x", name: "Deal" });
  });
});

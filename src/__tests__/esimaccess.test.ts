import { describe, it, expect } from "vitest";
import { applyMarkup, type MarkupRule } from "../services/esimaccess";

describe("applyMarkup", () => {
  it("applies percentage markup correctly", () => {
    const rule: MarkupRule = { type: "PERCENTAGE", value: 20 };
    expect(applyMarkup(10, rule)).toBe(12);
    expect(applyMarkup(4.5, rule)).toBe(5.4);
    expect(applyMarkup(0, rule)).toBe(0);
  });

  it("applies fixed markup correctly", () => {
    const rule: MarkupRule = { type: "FIXED", value: 3 };
    expect(applyMarkup(10, rule)).toBe(13);
    expect(applyMarkup(4.5, rule)).toBe(7.5);
    expect(applyMarkup(0, rule)).toBe(3);
  });

  it("rounds to 2 decimal places", () => {
    const rule: MarkupRule = { type: "PERCENTAGE", value: 33 };
    const result = applyMarkup(10.99, rule);
    // 10.99 * 1.33 = 14.6167 → 14.62
    expect(result).toBe(14.62);
  });
});

import { describe, it, expect } from "vitest";
import { formatData, formatUsd, formatLocal, type Package } from "./packages";

// ---------------------------------------------------------------------------
// formatData
// ---------------------------------------------------------------------------

describe("formatData", () => {
  it("returns MB for values under 1024", () => {
    expect(formatData(500)).toBe("500 MB");
  });

  it("returns GB for exactly 1024 MB", () => {
    expect(formatData(1024)).toBe("1 GB");
  });

  it("rounds GB for large values", () => {
    expect(formatData(3072)).toBe("3 GB");
  });

  it("handles 20 GB boundary", () => {
    expect(formatData(20480)).toBe("20 GB");
  });

  it("handles very large values", () => {
    expect(formatData(51200)).toBe("50 GB");
  });
});

// ---------------------------------------------------------------------------
// formatUsd
// ---------------------------------------------------------------------------

describe("formatUsd", () => {
  it("formats whole dollars", () => {
    expect(formatUsd(5)).toBe("$5.00");
  });

  it("formats cents correctly", () => {
    expect(formatUsd(12.5)).toBe("$12.50");
  });

  it("formats zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("rounds to two decimals", () => {
    expect(formatUsd(9.999)).toBe("$10.00");
  });
});

// ---------------------------------------------------------------------------
// formatLocal
// ---------------------------------------------------------------------------

const basePkg: Package = {
  id: "1",
  code: "pkg-001",
  location_code: "US",
  location_name: "United States",
  flag_emoji: "🇺🇸",
  name: "USA 5GB",
  region_type: "country",
  data_mb: 5120,
  validity_days: 30,
  retail_price_usd: 12.99,
  local_currency: null,
  local_price: null,
  networks: ["AT&T", "T-Mobile"],
  is_popular: false,
};

describe("formatLocal", () => {
  it("returns null when local_currency is missing", () => {
    expect(formatLocal(basePkg)).toBeNull();
  });

  it("returns null when local_price is null", () => {
    expect(formatLocal({ ...basePkg, local_currency: "EUR" })).toBeNull();
  });

  it("formats small amounts with two decimals", () => {
    const pkg = { ...basePkg, local_currency: "EUR", local_price: 11.5 };
    expect(formatLocal(pkg)).toBe("EUR 11.50");
  });

  it("rounds large amounts and adds locale separators", () => {
    const pkg = { ...basePkg, local_currency: "JPY", local_price: 1500.4 };
    const result = formatLocal(pkg);
    // Should be rounded integer with locale separators
    expect(result).toMatch(/^JPY 1,?500$/);
  });

  it("formats amounts exactly at 100 as rounded", () => {
    const pkg = { ...basePkg, local_currency: "MXN", local_price: 100 };
    expect(formatLocal(pkg)).toBe("MXN 100");
  });

  it("formats amounts just below 100 with decimals", () => {
    const pkg = { ...basePkg, local_currency: "BRL", local_price: 99.9 };
    expect(formatLocal(pkg)).toBe("BRL 99.90");
  });
});

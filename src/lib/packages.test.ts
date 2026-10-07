import { describe, it, expect } from "vitest";
import {
  africanDevelopmentPackages,
  filterPackages,
  formatData,
  formatUsd,
  formatLocal,
  type Package,
} from "./packages";

describe("formatData", () => {
  it("returns MB for values under 1024", () => expect(formatData(500)).toBe("500 MB"));
  it("returns GB for exactly 1024 MB", () => expect(formatData(1024)).toBe("1 GB"));
  it("rounds GB for large values", () => expect(formatData(3072)).toBe("3 GB"));
  it("handles 20 GB boundary", () => expect(formatData(20480)).toBe("20 GB"));
  it("handles very large values", () => expect(formatData(51200)).toBe("50 GB"));
});

describe("formatUsd", () => {
  it("formats whole dollars", () => expect(formatUsd(5)).toBe("$5.00"));
  it("formats cents correctly", () => expect(formatUsd(12.5)).toBe("$12.50"));
  it("formats zero", () => expect(formatUsd(0)).toBe("$0.00"));
  it("rounds to two decimals", () => expect(formatUsd(9.999)).toBe("$10.00"));
});

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
  it("returns null when local_currency is missing", () => expect(formatLocal(basePkg)).toBeNull());
  it("returns null when local_price is null", () =>
    expect(formatLocal({ ...basePkg, local_currency: "EUR" })).toBeNull());
  it("formats small amounts with two decimals", () =>
    expect(formatLocal({ ...basePkg, local_currency: "EUR", local_price: 11.5 })).toBe(
      "EUR 11.50",
    ));
  it("rounds large amounts and adds locale separators", () =>
    expect(formatLocal({ ...basePkg, local_currency: "JPY", local_price: 1500.4 })).toMatch(
      /^JPY 1,?500$/,
    ));
  it("formats amounts exactly at 100 as rounded", () =>
    expect(formatLocal({ ...basePkg, local_currency: "MXN", local_price: 100 })).toBe("MXN 100"));
  it("formats amounts just below 100 with decimals", () =>
    expect(formatLocal({ ...basePkg, local_currency: "BRL", local_price: 99.9 })).toBe(
      "BRL 99.90",
    ));
});

const searchPackages: Package[] = [
  {
    ...basePkg,
    id: "kenya-1",
    code: "ke-1gb-7",
    location_code: "KE",
    location_name: "Kenya",
    name: "Kenya Data Pass",
  },
  {
    ...basePkg,
    id: "nigeria-3",
    code: "ng-3gb-15",
    location_code: "NG",
    location_name: "Nigeria",
    name: "Nigeria Data Pass",
  },
];

describe("filterPackages", () => {
  it("returns the full catalog when search is empty", () => {
    expect(filterPackages(searchPackages, "")).toEqual(searchPackages);
    expect(filterPackages(searchPackages, "   ")).toEqual(searchPackages);
  });
  it("filters by destination, package name, or location code", () => {
    expect(filterPackages(searchPackages, "kenya")).toHaveLength(1);
    expect(filterPackages(searchPackages, "ng")).toHaveLength(1);
    expect(filterPackages(searchPackages, "data pass")).toHaveLength(2);
  });
});

describe("africanDevelopmentPackages", () => {
  it("contains African country and regional plans for local development", () => {
    expect(africanDevelopmentPackages.length).toBeGreaterThanOrEqual(10);
    expect(africanDevelopmentPackages.some((pkg) => pkg.location_code === "KE")).toBe(true);
    expect(africanDevelopmentPackages.some((pkg) => pkg.location_code === "NG")).toBe(true);
    expect(africanDevelopmentPackages.some((pkg) => pkg.region_type === "regional")).toBe(true);
  });
});

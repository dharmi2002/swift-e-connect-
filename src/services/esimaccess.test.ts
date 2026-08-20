import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyMarkup, priceToUsd, type MarkupRule } from "./esimaccess";

// ---------------------------------------------------------------------------
// priceToUsd — converts API price (×10,000) to USD dollars
// ---------------------------------------------------------------------------

describe("priceToUsd", () => {
  it("converts 10000 to $1.00", () => {
    expect(priceToUsd(10000)).toBe(1);
  });

  it("converts 112500 to $11.25", () => {
    expect(priceToUsd(112500)).toBe(11.25);
  });

  it("converts 0 to $0.00", () => {
    expect(priceToUsd(0)).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    expect(priceToUsd(33333)).toBe(3.33);
  });

  it("handles large values", () => {
    expect(priceToUsd(1000000)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// applyMarkup
// ---------------------------------------------------------------------------

describe("applyMarkup", () => {
  it("applies percentage markup", () => {
    const rule: MarkupRule = { type: "PERCENTAGE", value: 20 };
    // $10 + 20% = $12.00
    expect(applyMarkup(10, rule)).toBe(12);
  });

  it("applies percentage markup with rounding to 2 decimals", () => {
    const rule: MarkupRule = { type: "PERCENTAGE", value: 15 };
    // $7.33 + 15% = $8.4295 → $8.43
    expect(applyMarkup(7.33, rule)).toBe(8.43);
  });

  it("applies zero percentage markup", () => {
    const rule: MarkupRule = { type: "PERCENTAGE", value: 0 };
    expect(applyMarkup(5.5, rule)).toBe(5.5);
  });

  it("applies fixed markup", () => {
    const rule: MarkupRule = { type: "FIXED", value: 2.5 };
    // $10 + $2.50 = $12.50
    expect(applyMarkup(10, rule)).toBe(12.5);
  });

  it("applies fixed markup with rounding", () => {
    const rule: MarkupRule = { type: "FIXED", value: 1.333 };
    // $5 + $1.333 = $6.333 → $6.33
    expect(applyMarkup(5, rule)).toBe(6.33);
  });

  it("applies zero fixed markup", () => {
    const rule: MarkupRule = { type: "FIXED", value: 0 };
    expect(applyMarkup(9.99, rule)).toBe(9.99);
  });

  it("handles zero wholesale price with percentage", () => {
    const rule: MarkupRule = { type: "PERCENTAGE", value: 50 };
    expect(applyMarkup(0, rule)).toBe(0);
  });

  it("handles zero wholesale price with fixed", () => {
    const rule: MarkupRule = { type: "FIXED", value: 3 };
    expect(applyMarkup(0, rule)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// API integration tests (mocked fetch)
// ---------------------------------------------------------------------------

describe("eSIMAccess API client", () => {
  beforeEach(() => {
    vi.stubEnv("ESIM_ACCESS_API_KEY", "test-key-123");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("fetchPackages sends POST to /package/list with correct headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        errorCode: null,
        errorMsg: null,
        obj: { packageList: [] },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchPackages } = await import("./esimaccess");
    await fetchPackages();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/api/v1/open/package/list");
    expect(opts.method).toBe("POST");
    expect(opts.headers["RT-AccessCode"]).toBe("test-key-123");
  });

  it("createOrder sends correct packageInfoList body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        errorCode: null,
        errorMsg: null,
        obj: { orderNo: "B23051616050537", transactionId: "txn-1" },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { createOrder } = await import("./esimaccess");
    const result = await createOrder("JC016", "txn-1");

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/esim/order");
    const body = JSON.parse(opts.body);
    expect(body.transactionId).toBe("txn-1");
    expect(body.packageInfoList).toEqual([{ packageCode: "JC016", count: 1 }]);
    expect(result.orderNo).toBe("B23051616050537");
  });

  it("queryProfiles sends POST to /esim/query", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        errorCode: null,
        errorMsg: null,
        obj: {
          esimList: [
            {
              iccid: "8985224528000113",
              esimTranNo: "24111319542101",
              ac: "K2-XXX",
              qrCodeUrl: "https://example.com/qr.png",
              smdpAddress: "smdp.example.com",
              esimStatus: "GOT_RESOURCE",
              smdpStatus: "RELEASED",
              orderNo: "B23051616050537",
              transactionId: "txn-1",
              packageCode: "JC016",
              orderUsage: 0,
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { queryProfiles } = await import("./esimaccess");
    const profiles = await queryProfiles("B23051616050537");

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/esim/query");
    expect(opts.method).toBe("POST");
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.iccid).toBe("8985224528000113");
  });

  it("queryProfiles returns empty array on error 200010 (profiles still allocating)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        errorCode: "200010",
        errorMsg: "Profile is being downloaded for the order.",
        obj: null,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { queryProfiles } = await import("./esimaccess");
    const profiles = await queryProfiles("B23051616050537");
    expect(profiles).toEqual([]);
  });

  it("checkBalance converts ×10,000 to dollars", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        errorCode: "0",
        errorMsg: null,
        obj: { balance: 940000 },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { checkBalance } = await import("./esimaccess");
    const balance = await checkBalance();

    expect(balance).toBe(94); // 940000 / 10000 = $94.00
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { allowRequest, clearRateLimitBucketsForTests } from "./rate-limit";

describe("rate limiting", () => {
  afterEach(clearRateLimitBucketsForTests);

  it("allows up to the configured limit and blocks the next request", () => {
    expect(allowRequest("phone:+254700000000", 2, 60_000, 1000)).toBe(true);
    expect(allowRequest("phone:+254700000000", 2, 60_000, 1001)).toBe(true);
    expect(allowRequest("phone:+254700000000", 2, 60_000, 1002)).toBe(false);
  });

  it("resets after the window", () => {
    expect(allowRequest("email:a@example.com", 1, 100, 1000)).toBe(true);
    expect(allowRequest("email:a@example.com", 1, 100, 1099)).toBe(false);
    expect(allowRequest("email:a@example.com", 1, 100, 1100)).toBe(true);
  });
});

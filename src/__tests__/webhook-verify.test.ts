import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "../services/webhook-verify";

const TEST_SECRET = "test-webhook-secret-abc123";

function sign(body: string, secret = TEST_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifySignature", () => {
  const originalEnv = process.env["ESIM_ACCESS_WEBHOOK_SECRET"];

  beforeEach(() => {
    process.env["ESIM_ACCESS_WEBHOOK_SECRET"] = TEST_SECRET;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["ESIM_ACCESS_WEBHOOK_SECRET"] = originalEnv;
    } else {
      delete process.env["ESIM_ACCESS_WEBHOOK_SECRET"];
    }
  });

  it("returns true for a valid signature", () => {
    const body = '{"eventType":"ORDER_STATUS","orderNo":"ORD-123"}';
    const sig = sign(body);
    expect(verifySignature(body, sig)).toBe(true);
  });

  it("returns false for a tampered body", () => {
    const body = '{"eventType":"ORDER_STATUS","orderNo":"ORD-123"}';
    const sig = sign(body);
    expect(verifySignature(body + "x", sig)).toBe(false);
  });

  it("returns false for a wrong signature", () => {
    const body = '{"test":true}';
    expect(verifySignature(body, "deadbeef".repeat(8))).toBe(false);
  });

  it("returns false for mismatched signature length", () => {
    const body = '{"test":true}';
    expect(verifySignature(body, "short")).toBe(false);
  });

  it("throws when ESIM_ACCESS_WEBHOOK_SECRET is missing", () => {
    delete process.env["ESIM_ACCESS_WEBHOOK_SECRET"];
    expect(() => verifySignature("{}", "abc")).toThrow("Missing ESIM_ACCESS_WEBHOOK_SECRET");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

describe("verifySignature", () => {
  const TEST_SECRET = "test-webhook-secret-42";

  beforeEach(() => {
    vi.stubEnv("ESIM_ACCESS_WEBHOOK_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function sign(body: string): string {
    return createHmac("sha256", TEST_SECRET).update(body).digest("hex");
  }

  it("returns true for a valid signature", async () => {
    const { verifySignature } = await import("./webhook-verify");
    const body = '{"orderNo":"ORD-123","status":"completed"}';
    const sig = sign(body);
    expect(verifySignature(body, sig)).toBe(true);
  });

  it("returns false for a tampered body", async () => {
    const { verifySignature } = await import("./webhook-verify");
    const body = '{"orderNo":"ORD-123","status":"completed"}';
    const sig = sign(body);
    expect(verifySignature(body + "x", sig)).toBe(false);
  });

  it("returns false for a wrong signature", async () => {
    const { verifySignature } = await import("./webhook-verify");
    const body = '{"orderNo":"ORD-123"}';
    const wrongSig = createHmac("sha256", "wrong-secret").update(body).digest("hex");
    expect(verifySignature(body, wrongSig)).toBe(false);
  });

  it("returns false for mismatched-length signature", async () => {
    const { verifySignature } = await import("./webhook-verify");
    expect(verifySignature("body", "short")).toBe(false);
  });

  it("throws when ESIM_ACCESS_WEBHOOK_SECRET is missing", async () => {
    vi.stubEnv("ESIM_ACCESS_WEBHOOK_SECRET", "");
    vi.resetModules();
    // Re-import to get the fresh module with missing env var
    const mod = await import("./webhook-verify");
    expect(() => mod.verifySignature("body", "sig")).toThrow("Missing ESIM_ACCESS_WEBHOOK_SECRET");
  });
});

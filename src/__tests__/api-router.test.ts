import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { handleApiRoute } from "../api-router";

const TEST_SECRET = "test-webhook-secret-abc123";
const CRON_SECRET = "cron-test-secret";

function sign(body: string): string {
  return createHmac("sha256", TEST_SECRET).update(body).digest("hex");
}

function makeRequest(
  method: string,
  path: string,
  opts?: { body?: string; headers?: Record<string, string> },
): Request {
  const url = `http://localhost:8080${path}`;
  const init: RequestInit = { method, headers: opts?.headers ?? {} };
  if (opts?.body) init.body = opts.body;
  return new Request(url, init);
}

describe("handleApiRoute", () => {
  const origWebhookSecret = process.env["ESIM_ACCESS_WEBHOOK_SECRET"];
  const origCronSecret = process.env["CRON_SECRET"];
  const origAllowUnsignedWebhook = process.env["ALLOW_UNSIGNED_ESIM_WEBHOOKS"];

  beforeEach(() => {
    process.env["ESIM_ACCESS_WEBHOOK_SECRET"] = TEST_SECRET;
    process.env["CRON_SECRET"] = CRON_SECRET;
  });

  afterEach(() => {
    process.env["ESIM_ACCESS_WEBHOOK_SECRET"] = origWebhookSecret;
    process.env["CRON_SECRET"] = origCronSecret;
    if (origAllowUnsignedWebhook === undefined) delete process.env["ALLOW_UNSIGNED_ESIM_WEBHOOKS"];
    else process.env["ALLOW_UNSIGNED_ESIM_WEBHOOKS"] = origAllowUnsignedWebhook;
  });

  it("returns null for non-API routes", async () => {
    const req = makeRequest("GET", "/about");
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).toBeNull();
  });

  it("returns null for /some/other/path", async () => {
    const req = makeRequest("GET", "/");
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).toBeNull();
  });

  // --- Webhook ---

  it("rejects webhook without signature", async () => {
    const req = makeRequest("POST", "/api/webhooks/esim-access", {
      body: '{"eventType":"test"}',
    });
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("fails closed when webhook signing is not configured", async () => {
    delete process.env["ESIM_ACCESS_WEBHOOK_SECRET"];
    delete process.env["ALLOW_UNSIGNED_ESIM_WEBHOOKS"];
    const req = makeRequest("POST", "/api/webhooks/esim-access", {
      body: JSON.stringify({ notifyType: "CHECK_HEALTH", content: {} }),
    });
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res!.status).toBe(503);
  });

  it("rejects webhook with invalid signature", async () => {
    const body = '{"eventType":"test","orderNo":"123"}';
    const req = makeRequest("POST", "/api/webhooks/esim-access", {
      body,
      headers: { "RT-Signature": "0".repeat(64) },
    });
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects webhook with valid sig but missing fields", async () => {
    const body = '{"noEventType":true}';
    const sig = sign(body);
    const req = makeRequest("POST", "/api/webhooks/esim-access", {
      body,
      headers: { "RT-Signature": sig },
    });
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it("rejects webhook envelopes without a notify id", async () => {
    const body = JSON.stringify({ notifyType: "CHECK_HEALTH", content: {} });
    const sig = sign(body);
    const req = makeRequest("POST", "/api/webhooks/esim-access", {
      body,
      headers: { "RT-Signature": sig },
    });
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res!.status).toBe(400);
  });

  // --- Cron auth ---

  it("rejects balance check without cron secret", async () => {
    const req = makeRequest("GET", "/api/health/balance");
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects sync without cron secret", async () => {
    const req = makeRequest("POST", "/api/packages/sync");
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects poll without cron secret", async () => {
    const req = makeRequest("POST", "/api/orders/poll");
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("fails closed when cron secret is missing", async () => {
    delete process.env["CRON_SECRET"];
    process.env["ALLOW_UNAUTHENTICATED_CRON"] = "false";
    const req = makeRequest("GET", "/api/health/balance");
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res!.status).toBe(401);
    delete process.env["ALLOW_UNAUTHENTICATED_CRON"];
  });

  it("rejects Paystack webhooks without a valid signature", async () => {
    process.env["PAYSTACK_SECRET_KEY"] = "paystack-test-secret";
    const body = JSON.stringify({ event: "charge.success", data: { reference: "EL-123" } });
    const req = makeRequest("POST", "/api/webhooks/paystack", {
      body,
      headers: { "x-paystack-signature": "bad" },
    });
    const res = await handleApiRoute(req, new URL(req.url));
    expect(res!.status).toBe(401);
    delete process.env["PAYSTACK_SECRET_KEY"];
  });
});

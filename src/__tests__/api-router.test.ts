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

  beforeEach(() => {
    process.env["ESIM_ACCESS_WEBHOOK_SECRET"] = TEST_SECRET;
    process.env["CRON_SECRET"] = CRON_SECRET;
  });

  afterEach(() => {
    process.env["ESIM_ACCESS_WEBHOOK_SECRET"] = origWebhookSecret;
    process.env["CRON_SECRET"] = origCronSecret;
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
});

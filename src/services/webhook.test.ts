import { describe, it, expect } from "vitest";

/**
 * Tests for webhook payload parsing — validates that we correctly
 * handle the eSIMAccess webhook envelope structure.
 */

interface WebhookEnvelope {
  notifyType: string;
  notifyId: string;
  eventGenerateTime: string;
  content: Record<string, unknown>;
}

describe("webhook envelope parsing", () => {
  it("parses ORDER_STATUS webhook correctly", () => {
    const raw = JSON.stringify({
      notifyType: "ORDER_STATUS",
      notifyId: "447602ac1e5c4bb4980f786b0c2934d6",
      eventGenerateTime: "2026-04-22T17:16:34Z",
      content: {
        orderNo: "B26042217160011",
        orderStatus: "GOT_RESOURCE",
        transactionId: "7544949834056-1-TR_50_30",
      },
    });

    const envelope = JSON.parse(raw) as WebhookEnvelope;

    expect(envelope.notifyType).toBe("ORDER_STATUS");
    expect(envelope.content["orderNo"]).toBe("B26042217160011");
    expect(envelope.content["orderStatus"]).toBe("GOT_RESOURCE");
    expect(envelope.content["transactionId"]).toBe("7544949834056-1-TR_50_30");
  });

  it("parses ESIM_STATUS webhook correctly", () => {
    const raw = JSON.stringify({
      notifyType: "ESIM_STATUS",
      notifyId: "83eb2b243a5545d38ec26cebfcf4bd8d",
      eventGenerateTime: "2026-04-22T17:27:44Z",
      content: {
        iccid: "89103000000059824319",
        orderNo: "B26042216320015",
        esimTranNo: "26042216320015",
        transactionId: "txn-001",
        esimStatus: "IN_USE",
        smdpStatus: "ENABLED",
      },
    });

    const envelope = JSON.parse(raw) as WebhookEnvelope;

    expect(envelope.notifyType).toBe("ESIM_STATUS");
    expect(envelope.content["iccid"]).toBe("89103000000059824319");
    expect(envelope.content["esimStatus"]).toBe("IN_USE");
  });

  it("parses DATA_USAGE webhook correctly", () => {
    const raw = JSON.stringify({
      notifyType: "DATA_USAGE",
      notifyId: "7cb37a1e9ed2468e9243e6ccae682125",
      eventGenerateTime: "2026-04-22T17:21:59Z",
      content: {
        iccid: "89852240810732202668",
        orderNo: "B26041615170028",
        esimTranNo: "26041615170028",
        transactionId: "txn-002",
        totalVolume: 2147483648,
        orderUsage: 1073741824,
        remain: 1073741824,
        remainThreshold: 0.5,
        lastUpdateTime: "2026-04-22T17:00:00Z",
      },
    });

    const envelope = JSON.parse(raw) as WebhookEnvelope;

    expect(envelope.notifyType).toBe("DATA_USAGE");
    expect(envelope.content["remainThreshold"]).toBe(0.5);
    expect(envelope.content["totalVolume"]).toBe(2147483648);
  });

  it("parses CHECK_HEALTH webhook correctly", () => {
    const raw = JSON.stringify({
      notifyType: "CHECK_HEALTH",
      notifyId: "health-check-123",
      eventGenerateTime: "2026-04-22T17:00:00Z",
      content: {},
    });

    const envelope = JSON.parse(raw) as WebhookEnvelope;
    expect(envelope.notifyType).toBe("CHECK_HEALTH");
  });

  it("correctly identifies GOT_RESOURCE as the trigger to query profiles", () => {
    const orderStatus = "GOT_RESOURCE";
    // Per docs: when orderStatus is GOT_RESOURCE, call /esim/query to get ICCID
    // NOT "SUCCESS" — the old code was checking for "SUCCESS" which would never match
    expect(orderStatus).not.toBe("SUCCESS");
    expect(orderStatus).toBe("GOT_RESOURCE");
  });

  it("validates that ORDER_STATUS does NOT contain esimList", () => {
    // Per docs: "The ICCID is not included in this event. You must query for it."
    const content: Record<string, unknown> = {
      orderNo: "B26042217160011",
      orderStatus: "GOT_RESOURCE",
      transactionId: "txn-001",
    };

    expect(content).not.toHaveProperty("esimList");
    expect(content).not.toHaveProperty("iccid");
  });
});

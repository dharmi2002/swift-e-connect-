/**
 * Lightweight API router for server-side endpoints.
 *
 * Intercepts /api/* requests in the server entry before they reach TanStack.
 * This is needed because:
 * - createServerFn works for RPC from the frontend (order creation, status polling)
 * - But webhooks, cron endpoints need raw HTTP handlers accessible from outside
 */

import { verifySignature } from "./services/webhook-verify";
import { syncPackages, checkBalance, queryProfiles } from "./services/esimaccess";
import { sendEsimDeliveryEmail, sendAdminLowBalanceAlert } from "./services/email";
import { pollStuckOrders } from "./services/workers";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  fulfillOrderById,
  fulfillPaidTopup,
  settlePaystackPayment,
  settlePaystackTopup,
} from "./services/payment.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function checkCronAuth(request: Request): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) return process.env["ALLOW_UNAUTHENTICATED_CRON"] === "true";
  return request.headers.get("Authorization") === `Bearer ${expected}`;
}

/**
 * Returns a Response if the route matched, or null to fall through to TanStack.
 */
export async function handleApiRoute(request: Request, url: URL): Promise<Response | null> {
  const { pathname } = url;
  const method = request.method;

  // -----------------------------------------------------------------------
  // POST /api/webhooks/esim-access
  // -----------------------------------------------------------------------
  if (pathname === "/api/webhooks/esim-access" && method === "POST") {
    return handleWebhook(request);
  }

  if (pathname === "/api/webhooks/paystack" && method === "POST") {
    return handlePaystackWebhook(request);
  }

  // -----------------------------------------------------------------------
  // POST /api/packages/sync
  // -----------------------------------------------------------------------
  if (pathname === "/api/packages/sync" && method === "POST") {
    if (!checkCronAuth(request)) return new Response("Unauthorized", { status: 401 });
    try {
      const result = await syncPackages();
      return json(result);
    } catch (err) {
      console.error("Package sync error:", err);
      return json({ error: err instanceof Error ? err.message : "Sync failed" }, 500);
    }
  }

  // -----------------------------------------------------------------------
  // GET /api/health/balance
  // -----------------------------------------------------------------------
  if (pathname === "/api/health/balance" && method === "GET") {
    if (!checkCronAuth(request)) return new Response("Unauthorized", { status: 401 });
    try {
      const balance = await checkBalance();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: setting } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "low_balance_threshold")
        .single();
      const threshold = (setting?.value as unknown as { usd?: number })?.usd ?? 100;
      let alertSent = false;
      if (balance < threshold) {
        await sendAdminLowBalanceAlert(balance, threshold);
        alertSent = true;
      }
      return json({ balance, threshold, alertSent });
    } catch (err) {
      console.error("Balance check error:", err);
      return json({ error: err instanceof Error ? err.message : "Check failed" }, 500);
    }
  }

  // -----------------------------------------------------------------------
  // POST /api/orders/poll
  // -----------------------------------------------------------------------
  if (pathname === "/api/orders/poll" && method === "POST") {
    if (!checkCronAuth(request)) return new Response("Unauthorized", { status: 401 });
    try {
      const result = await pollStuckOrders();
      return json(result);
    } catch (err) {
      console.error("Order poll error:", err);
      return json({ error: err instanceof Error ? err.message : "Poll failed" }, 500);
    }
  }

  // Not an API route we handle — fall through to TanStack
  return null;
}

async function handlePaystackWebhook(request: Request): Promise<Response> {
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const rawBody = await request.text();
  if (!secret || !signature) return new Response("Unauthorized", { status: 401 });
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
    return new Response("Unauthorized", { status: 401 });
  let payload: {
    event?: string;
    data?: { reference?: string; metadata?: { order_id?: string; topup_id?: string } };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (payload.event !== "charge.success" || !payload.data?.reference) return json({ ok: true });
  let orderId = payload.data.metadata?.order_id;
  let topupId = payload.data.metadata?.topup_id;
  if (!orderId && !topupId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: order }, { data: topup }] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id")
        .eq("payment_reference", payload.data.reference)
        .maybeSingle(),
      supabaseAdmin
        .from("esim_topups")
        .select("id")
        .eq("payment_reference", payload.data.reference)
        .maybeSingle(),
    ]);
    orderId = order?.id;
    topupId = topup?.id;
  }
  try {
    if (topupId) {
      await settlePaystackTopup(topupId, payload.data.reference);
      await fulfillPaidTopup(topupId);
      return json({ ok: true });
    }
    if (!orderId) return json({ ok: true });
    await settlePaystackPayment(orderId, payload.data.reference);
    await fulfillOrderById(orderId);
    return json({ ok: true });
  } catch (error) {
    console.error("Paystack webhook processing failed:", error);
    return json({ error: "Payment processing failed" }, 500);
  }
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

/**
 * eSIMAccess webhook envelope structure (from docs):
 *
 * {
 *   "notifyType": "ORDER_STATUS" | "ESIM_STATUS" | "SMDP_EVENT" | "DATA_USAGE" | "VALIDITY_USAGE" | "CHECK_HEALTH",
 *   "notifyId": "unique-id",
 *   "eventGenerateTime": "ISO-8601",
 *   "content": { ... event-specific fields ... }
 * }
 *
 * ORDER_STATUS content: { orderNo, orderStatus, transactionId }
 *   - orderStatus "GOT_RESOURCE" means profiles ready to query
 *   - ICCID is NOT included — must call /esim/query to get it
 *
 * ESIM_STATUS content: { iccid, orderNo, esimTranNo, transactionId, esimStatus, smdpStatus, ... }
 */

interface WebhookEnvelope {
  notifyType: string;
  notifyId: string;
  eventGenerateTime: string;
  content: Record<string, unknown>;
}

interface OrderStatusContent {
  orderNo: string;
  orderStatus: string;
  transactionId: string;
}

async function handleWebhook(request: Request): Promise<Response> {
  const rawBody = await request.text();

  // Signature verification is mandatory in a pilot/production deployment. The
  // explicit override exists only for local provider connectivity testing.
  const secret = process.env["ESIM_ACCESS_WEBHOOK_SECRET"];
  const allowUnsigned = process.env["ALLOW_UNSIGNED_ESIM_WEBHOOKS"] === "true";
  if (!secret && !allowUnsigned) {
    return json({ error: "Webhook signature verification is not configured." }, 503);
  }
  if (secret) {
    const signature = request.headers.get("RT-Signature") ?? "";
    if (!signature || !verifySignature(rawBody, signature)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WebhookEnvelope;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const { notifyType, notifyId, content } = envelope;
  if (
    typeof notifyType !== "string" ||
    !notifyType ||
    typeof notifyId !== "string" ||
    !notifyId ||
    !content ||
    typeof content !== "object"
  ) {
    return new Response("Missing notifyType or content", { status: 400 });
  }

  // CHECK_HEALTH is a connectivity test — just respond OK
  if (notifyType === "CHECK_HEALTH") {
    return json({ ok: true });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Idempotency check using notifyId stored in event_type+order_no
  const orderNo = (content as Record<string, unknown>)["orderNo"] as string | undefined;
  const { data: existing } = await supabaseAdmin
    .from("webhook_logs")
    .select("id")
    .eq("event_type", notifyType)
    .eq("order_no", notifyId)
    .maybeSingle();

  if (existing) return json({ ok: true });

  const { error: webhookLogError } = await supabaseAdmin.from("webhook_logs").insert({
    event_type: notifyType,
    order_no: notifyId,
    signature: request.headers.get("RT-Signature") ?? "",
    payload: JSON.parse(rawBody),
  });
  if (webhookLogError) {
    // A concurrent delivery may win the unique idempotency key; that is safe.
    if (webhookLogError.code === "23505") return json({ ok: true });
    console.error("Unable to record webhook idempotency log:", webhookLogError);
    return json({ error: "Webhook could not be recorded" }, 500);
  }

  try {
    if (notifyType === "ORDER_STATUS") {
      await handleOrderStatus(content as unknown as OrderStatusContent, rawBody, supabaseAdmin);
    } else if (notifyType === "ESIM_STATUS") {
      await handleEsimStatus(content, rawBody, supabaseAdmin);
    } else if (notifyType === "DATA_USAGE") {
      await handleDataUsage(content, rawBody, supabaseAdmin);
    } else if (notifyType === "VALIDITY_USAGE") {
      await handleValidityUsage(content, rawBody, supabaseAdmin);
    }
  } catch (err) {
    console.error(`Webhook processing error (${notifyType}):`, err);
    await supabaseAdmin
      .from("webhook_logs")
      .delete()
      .eq("event_type", notifyType)
      .eq("order_no", notifyId);
    return json({ error: "Webhook processing failed" }, 500);
  }

  return json({ ok: true });
}

async function recordLineEvent(
  supabaseAdmin: any,
  iccid: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  const { data: line } = await supabaseAdmin
    .from("esim_lines")
    .select("id")
    .eq("iccid", iccid)
    .maybeSingle();
  if (!line) return;
  await supabaseAdmin
    .from("esim_line_events")
    .insert({ line_id: line.id, event_type: eventType, payload });
  return line.id as string;
}

async function handleEsimStatus(
  content: Record<string, unknown>,
  rawBody: string,
  supabaseAdmin: any,
) {
  const iccid = typeof content.iccid === "string" ? content.iccid : "";
  if (!iccid) return;
  const upstreamStatus = String(content.esimStatus ?? content.smdpStatus ?? "").toUpperCase();
  const status = upstreamStatus.includes("SUSPEND")
    ? "suspended"
    : upstreamStatus.includes("CANCEL") || upstreamStatus.includes("REVOK")
      ? "revoked"
      : upstreamStatus.includes("ACTIV") || upstreamStatus.includes("RELEASE")
        ? "active"
        : null;
  if (status) await supabaseAdmin.from("esim_lines").update({ status }).eq("iccid", iccid);
  await recordLineEvent(supabaseAdmin, iccid, "esim_status", { ...content, raw: rawBody });
}

async function handleDataUsage(
  content: Record<string, unknown>,
  rawBody: string,
  supabaseAdmin: any,
) {
  const iccid = typeof content.iccid === "string" ? content.iccid : "";
  const usage = Number(content.orderUsage ?? content.usedVolume ?? content.dataUsage ?? 0);
  if (!iccid || !Number.isFinite(usage)) return;
  await supabaseAdmin
    .from("esim_lines")
    .update({ data_used_mb: Math.max(0, usage / (1024 * 1024)) })
    .eq("iccid", iccid);
  await recordLineEvent(supabaseAdmin, iccid, "data_usage", { ...content, raw: rawBody });
}

async function handleValidityUsage(
  content: Record<string, unknown>,
  rawBody: string,
  supabaseAdmin: any,
) {
  const iccid = typeof content.iccid === "string" ? content.iccid : "";
  const expiry = content.expiredTime ?? content.expiryTime ?? content.expireTime;
  if (!iccid || typeof expiry !== "string") return;
  await supabaseAdmin.from("esim_lines").update({ expires_at: expiry }).eq("iccid", iccid);
  await recordLineEvent(supabaseAdmin, iccid, "validity_usage", { ...content, raw: rawBody });
}

async function handleOrderStatus(
  content: OrderStatusContent,
  rawBody: string,

  supabaseAdmin: any,
): Promise<void> {
  const { orderNo, orderStatus } = content;

  if (orderStatus === "GOT_RESOURCE") {
    // Profiles are ready — query the eSIMAccess API to retrieve ICCID, QR code, etc.
    const profiles = await queryProfiles(orderNo);

    if (!profiles.length) {
      console.warn(`ORDER_STATUS GOT_RESOURCE for ${orderNo} but queryProfiles returned empty`);
      return;
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .update({
        status: "completed",
        esim_iccid: profiles[0]!.iccid,
        activation_code: profiles[0]!.ac,
        qr_code_url: profiles[0]!.qrCodeUrl,
        smdp_address: profiles[0]!.smdpAddress,

        raw_webhook_payload: JSON.parse(rawBody),
      })
      .eq("order_no", orderNo)
      .select("customer_email, package_code, organization_id, quantity, id")
      .single();

    if (order) {
      const { data: pkg } = await supabaseAdmin
        .from("packages")
        .select("name, data_mb, validity_days")
        .eq("code", order.package_code)
        .single();

      if (pkg) {
        if (order.organization_id) {
          await supabaseAdmin.from("esim_lines").upsert(
            profiles.map((profile) => ({
              organization_id: order.organization_id,
              order_id: order.id,
              package_code: profile.packageCode || order.package_code,
              label: `${pkg.name} · ${profile.iccid.slice(-6)}`,
              esim_tran_no: profile.esimTranNo,
              iccid: profile.iccid,
              qr_code_url: profile.qrCodeUrl,
              smdp_address: profile.smdpAddress,
              activation_code: profile.ac,
              status: "unassigned",
              data_mb: pkg.data_mb,
              validity_days: pkg.validity_days,
            })),
            { onConflict: "esim_tran_no" },
          );
        }
        await sendEsimDeliveryEmail({
          customerEmail: order.customer_email,
          packageName: pkg.name,
          dataMb: pkg.data_mb,
          validityDays: pkg.validity_days,
          iccid: profiles[0]!.iccid,
          qrCodeUrl: profiles[0]!.qrCodeUrl,
          activationCode: profiles[0]!.ac,
          smdpAddress: profiles[0]!.smdpAddress,
        });
      }
    }
  } else if (orderStatus === "FAILED") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "failed", raw_webhook_payload: JSON.parse(rawBody) })
      .eq("order_no", orderNo);
  }
}

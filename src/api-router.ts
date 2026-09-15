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

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function checkCronAuth(request: Request): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) return true; // no secret configured = allow
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

  // Signature verification (optional — only if ESIM_ACCESS_WEBHOOK_SECRET is configured)
  const secret = process.env["ESIM_ACCESS_WEBHOOK_SECRET"];
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
  if (!notifyType || !content) {
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

  await supabaseAdmin.from("webhook_logs").insert({
    event_type: notifyType,
    order_no: orderNo ?? notifyId,
    signature: request.headers.get("RT-Signature") ?? "",
    payload: JSON.parse(rawBody),
  });

  try {
    if (notifyType === "ORDER_STATUS") {
      await handleOrderStatus(content as unknown as OrderStatusContent, rawBody, supabaseAdmin);
    }
    // ESIM_STATUS, DATA_USAGE, VALIDITY_USAGE, SMDP_EVENT: log only for now
    // Future: update eSIM lifecycle status, usage dashboards, etc.
  } catch (err) {
    console.error(`Webhook processing error (${notifyType}):`, err);
  }

  return json({ ok: true });
}

async function handleOrderStatus(
  content: OrderStatusContent,
  rawBody: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const esim = profiles[0]!;

    const { data: order } = await supabaseAdmin
      .from("orders")
      .update({
        status: "completed",
        esim_iccid: esim.iccid,
        activation_code: esim.ac,
        qr_code_url: esim.qrCodeUrl,
        smdp_address: esim.smdpAddress,
        activated_at: new Date().toISOString(),
        raw_webhook_payload: JSON.parse(rawBody),
      })
      .eq("order_no", orderNo)
      .select("customer_email, recipient_email, package_code")
      .single();

    if (order) {
      const { data: pkg } = await supabaseAdmin
        .from("packages")
        .select("name, data_mb, validity_days")
        .eq("code", order.package_code)
        .single();

      if (pkg) {
        await sendEsimDeliveryEmail({
          customerEmail: order.recipient_email ?? order.customer_email,
          packageName: pkg.name,
          dataMb: pkg.data_mb,
          validityDays: pkg.validity_days,
          iccid: esim.iccid,
          qrCodeUrl: esim.qrCodeUrl,
          activationCode: esim.ac,
          smdpAddress: esim.smdpAddress,
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

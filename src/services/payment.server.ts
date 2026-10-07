import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createOrder, topUpEsim } from "./esimaccess";

type PaystackResponse<T> = { status: boolean; message: string; data?: T };
type PaystackInit = { authorization_url: string; access_code: string; reference: string };
type PaystackVerification = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  gateway_response?: string;
};

export function isPaymentSuccessful(
  payment: PaystackVerification,
  expectedAmountMinor: number,
  reference: string,
): boolean {
  return (
    payment.status === "success" &&
    payment.reference === reference &&
    payment.amount === expectedAmountMinor
  );
}

const paystackKey = () => {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Payment is not configured. Set PAYSTACK_SECRET_KEY.");
  return key;
};

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paystackKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as PaystackResponse<T>;
  if (!response.ok || !payload.status || !payload.data)
    throw new Error(payload.message || "Payment provider request failed.");
  return payload.data;
}

export async function createPaystackCheckout(data: {
  email: string;
  packageCode: string;
  deviceType: string;
  quantity?: number;
  organizationId?: string;
}) {
  const quantity = Math.max(1, Math.min(100, Math.floor(data.quantity ?? 1)));
  const { data: pkg } = await supabaseAdmin
    .from("packages")
    .select("retail_price_usd")
    .eq("code", data.packageCode)
    .eq("is_active", true)
    .single();
  if (!pkg) throw new Error("Package not found or inactive.");
  const reference = `EL-${Date.now()}-${crypto.randomUUID().slice(0, 10)}`;
  const amountUsd = Number(pkg.retail_price_usd) * quantity;
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_email: data.email.trim().toLowerCase(),
      package_code: data.packageCode,
      device_type: data.deviceType,
      payment_method: "paystack",
      amount_usd: amountUsd,
      status: "payment_pending",
      payment_provider: "paystack",
      payment_status: "pending",
      payment_reference: reference,
      organization_id: data.organizationId ?? null,
      quantity,
    })
    .select("id")
    .single();
  if (error || !order) throw new Error("Unable to create payment order.");
  const callbackBase = process.env["PAYSTACK_CALLBACK_URL"];
  const callbackUrl = callbackBase
    ? `${callbackBase}${callbackBase.includes("?") ? "&" : "?"}orderId=${encodeURIComponent(order.id)}`
    : undefined;
  let payment: PaystackInit;
  try {
    payment = await paystack<PaystackInit>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: data.email.trim().toLowerCase(),
        amount: Math.round(amountUsd * 100),
        currency: process.env["PAYSTACK_CURRENCY"] || "USD",
        reference,
        callback_url: callbackUrl,
        metadata: { order_id: order.id, package_code: data.packageCode, quantity },
      }),
    });
  } catch (cause) {
    await Promise.all([
      supabaseAdmin
        .from("orders")
        .update({ status: "failed", payment_status: "failed" })
        .eq("id", order.id)
        .eq("payment_status", "pending"),
      supabaseAdmin.from("order_events").insert({
        order_id: order.id,
        event_type: "payment_initialization_failed",
        provider: "paystack",
        provider_reference: reference,
        payload: { error: cause instanceof Error ? cause.message : "Unknown error" },
      }),
    ]);
    throw cause;
  }
  await supabaseAdmin.from("order_events").insert({
    order_id: order.id,
    event_type: "payment_initialized",
    provider: "paystack",
    provider_reference: reference,
    payload: payment,
  });
  return { orderId: order.id, reference, authorizationUrl: payment.authorization_url };
}

export const initializePaystackPayment = createServerFn({ method: "POST" })
  .validator(
    (input: {
      email: string;
      packageCode: string;
      deviceType: string;
      quantity?: number;
      organizationId?: string;
    }) => input,
  )
  .handler(async ({ data }) => createPaystackCheckout(data));

export async function createPaystackTopupCheckout(data: { topupId: string; email: string }) {
  const { data: topup } = await supabaseAdmin
    .from("esim_topups")
    .select("id, amount_usd, payment_status, payment_reference")
    .eq("id", data.topupId)
    .single();
  if (!topup || topup.payment_status !== "pending" || !topup.amount_usd)
    throw new Error("Top-up is not available for payment.");

  const reference = `EL-TU-${Date.now()}-${crypto.randomUUID().slice(0, 10)}`;
  const { data: referenceClaim, error: referenceError } = await supabaseAdmin
    .from("esim_topups")
    .update({
      payment_provider: "paystack",
      payment_reference: reference,
    })
    .eq("id", topup.id)
    .eq("payment_status", "pending")
    .is("payment_reference", null)
    .select("id")
    .maybeSingle();
  if (referenceError || !referenceClaim)
    throw new Error("Top-up payment is already being prepared.");

  const callbackBase = process.env["PAYSTACK_CALLBACK_URL"];
  const callbackUrl = callbackBase
    ? `${callbackBase}${callbackBase.includes("?") ? "&" : "?"}topupId=${encodeURIComponent(topup.id)}`
    : undefined;
  try {
    const payment = await paystack<PaystackInit>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: data.email.trim().toLowerCase(),
        amount: Math.round(Number(topup.amount_usd) * 100),
        currency: process.env["PAYSTACK_CURRENCY"] || "USD",
        reference,
        callback_url: callbackUrl,
        metadata: { topup_id: topup.id },
      }),
    });
    return { topupId: topup.id, reference, authorizationUrl: payment.authorization_url };
  } catch (cause) {
    await supabaseAdmin
      .from("esim_topups")
      .update({ status: "failed", payment_status: "failed" })
      .eq("id", topup.id)
      .eq("payment_reference", reference);
    throw cause;
  }
}

export async function settlePaystackTopup(topupId: string, reference: string) {
  const { data: topup } = await supabaseAdmin
    .from("esim_topups")
    .select("id, amount_usd, payment_reference, payment_status, payment_provider")
    .eq("id", topupId)
    .single();
  if (!topup || topup.payment_provider !== "paystack" || topup.payment_reference !== reference)
    throw new Error("Top-up payment could not be verified.");
  if (topup.payment_status === "paid") return { paid: true, topupId: topup.id };

  const payment = await paystack<PaystackVerification>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  const paid = isPaymentSuccessful(payment, Math.round(Number(topup.amount_usd) * 100), reference);
  await supabaseAdmin
    .from("esim_topups")
    .update({
      payment_status: paid ? "paid" : "failed",
      status: paid ? "paid" : "failed",
      paid_at: paid ? new Date().toISOString() : null,
      payment_metadata: payment,
    })
    .eq("id", topup.id)
    .eq("payment_reference", reference);
  if (!paid) throw new Error("Top-up payment could not be verified for the expected amount.");
  return { paid: true, topupId: topup.id };
}

export const verifyPaystackTopupPayment = createServerFn({ method: "POST" })
  .validator((input: { topupId: string; reference: string }) => input)
  .handler(async ({ data }) => settlePaystackTopup(data.topupId, data.reference));

export async function fulfillPaidTopup(topupId: string) {
  const { data: claimed } = await supabaseAdmin
    .from("esim_topups")
    .update({ status: "processing" })
    .eq("id", topupId)
    .eq("status", "paid")
    .eq("payment_status", "paid")
    .select("id, line_id, package_code, transaction_id")
    .maybeSingle();
  if (!claimed) {
    const { data: current } = await supabaseAdmin
      .from("esim_topups")
      .select("status, payment_status")
      .eq("id", topupId)
      .single();
    if (current?.status === "completed") return { topupId, status: "completed" };
    if (current?.status === "processing" && current.payment_status === "pending")
      throw new Error("Top-up payment has not been verified.");
    return { topupId, status: current?.status ?? "processing" };
  }

  try {
    const { data: line } = await supabaseAdmin
      .from("esim_lines")
      .select("esim_tran_no")
      .eq("id", claimed.line_id)
      .single();
    if (!line?.esim_tran_no) throw new Error("eSIM line is not ready for a top-up.");
    const provider = await topUpEsim(
      line.esim_tran_no,
      claimed.package_code,
      claimed.transaction_id,
    );
    await supabaseAdmin
      .from("esim_topups")
      .update({ status: "completed", provider_payload: provider })
      .eq("id", claimed.id)
      .eq("status", "processing");
    return { topupId: claimed.id, status: "completed" };
  } catch (cause) {
    await supabaseAdmin
      .from("esim_topups")
      .update({
        // Payment is still valid; leave the top-up retryable for the operations worker.
        status: "paid",
        provider_payload: { error: cause instanceof Error ? cause.message : "Unknown error" },
      })
      .eq("id", claimed.id)
      .eq("status", "processing");
    throw cause;
  }
}

export const fulfillPaidTopupFn = createServerFn({ method: "POST" })
  .validator((input: { topupId: string }) => input)
  .handler(async ({ data }) => fulfillPaidTopup(data.topupId));

export async function settlePaystackPayment(orderId: string, reference: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, amount_usd, payment_reference, payment_status, payment_provider")
    .eq("id", orderId)
    .single();
  if (!order || order.payment_provider !== "paystack" || order.payment_reference !== reference)
    throw new Error("Payment order could not be verified.");
  const payment = await paystack<PaystackVerification>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  const expected = Math.round(Number(order.amount_usd) * 100);
  const paid = isPaymentSuccessful(payment, expected, reference);
  await supabaseAdmin.from("order_events").insert({
    order_id: order.id,
    event_type: paid ? "payment_verified" : "payment_rejected",
    provider: "paystack",
    provider_reference: reference,
    payload: payment,
  });
  await supabaseAdmin
    .from("orders")
    .update({
      payment_status: paid ? "paid" : "failed",
      paid_at: paid ? new Date().toISOString() : null,
      payment_metadata: payment,
    })
    .eq("id", order.id);
  if (!paid) throw new Error("Payment could not be verified for the expected amount.");
  return { paid: true, orderId: order.id };
}

export const verifyPaystackPayment = createServerFn({ method: "POST" })
  .validator((input: { orderId: string; reference: string }) => input)
  .handler(async ({ data }) => settlePaystackPayment(data.orderId, data.reference));

export async function fulfillOrderById(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, package_code, quantity, payment_status, transaction_id, order_no")
    .eq("id", orderId)
    .single();
  if (!order || order.payment_status !== "paid")
    throw new Error("Payment must be verified before fulfillment.");
  if (order.order_no) return { orderId: order.id, status: "processing" };
  const transactionId = `PS-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const upstream = await createOrder(order.package_code, transactionId, undefined, order.quantity);
  await supabaseAdmin
    .from("orders")
    .update({ status: "processing", transaction_id: transactionId, order_no: upstream.orderNo })
    .eq("id", order.id);
  await supabaseAdmin.from("order_events").insert({
    order_id: order.id,
    event_type: "supplier_order_created",
    provider: "esimaccess",
    provider_reference: upstream.orderNo,
    payload: upstream,
  });
  return { orderId: order.id, status: "processing" };
}

export const fulfillPaidOrder = createServerFn({ method: "POST" })
  .validator((input: { orderId: string }) => input)
  .handler(async ({ data }) => fulfillOrderById(data.orderId));

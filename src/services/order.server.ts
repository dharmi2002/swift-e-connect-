/**
 * Server functions for order operations.
 * Called from the frontend via TanStack Start's createServerFn RPC.
 */
import { createServerFn } from "@tanstack/react-start";
import { createOrder } from "./esimaccess";
import { getOptionalUserId } from "@/integrations/supabase/auth-optional.server";

// eSIMAccess is a paid wholesale API — until real credentials are configured,
// fall back to a mock provisioning result so the storefront flow (and demos)
// can run end-to-end without a live upstream account.
function isEsimAccessConfigured(): boolean {
  const key = process.env["ESIM_ACCESS_API_KEY"];
  return !!key && !key.startsWith("your-");
}

// ---------------------------------------------------------------------------
// Shared helpers — reused by the consumer checkout flow (placeOrder) and the
// business flows (purchaseForEmployee, assignSeat in bulk.server.ts)
// ---------------------------------------------------------------------------

/** Re-verify a Stripe PaymentIntent server-side — never trust a client-side "succeeded" claim. */
export async function verifyStripePayment(
  stripePaymentIntentId: string,
  packageCode: string,
  amountUsd: number,
): Promise<void> {
  const { stripe } = await import("./stripe.server");
  const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

  if (intent.status !== "succeeded") throw new Error("Payment was not completed");
  if (intent.metadata["packageCode"] !== packageCode) {
    throw new Error("Payment does not match the selected plan");
  }
  const expectedCents = Math.round(amountUsd * 100);
  if (intent.amount !== expectedCents || intent.currency !== "usd") {
    throw new Error("Payment amount does not match the selected plan");
  }
}

/**
 * Create one eSIM order: calls eSIMAccess (or falls back to a mock completed
 * order in demo mode), and inserts the resulting `orders` row.
 *
 * `recipientEmail` is who gets the QR/activation email — for a business order
 * this is the employee's own address, decoupled from whichever admin paid.
 */
export async function provisionEsimOrder(params: {
  packageCode: string;
  recipientEmail: string;
  deviceType?: string | undefined;
  paymentMethod: string;
  amountUsd: number;
  userId?: string | null | undefined;
  organizationId?: string | undefined;
  employeeId?: string | undefined;
}): Promise<{ orderId: string; status: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const transactionId = `PS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const recipientEmail = params.recipientEmail.trim();

  const baseRow = {
    customer_email: recipientEmail,
    recipient_email: recipientEmail,
    package_code: params.packageCode,
    device_type: params.deviceType ?? "ios",
    payment_method: params.paymentMethod,
    amount_usd: params.amountUsd,
    transaction_id: transactionId,
    user_id: params.userId ?? null,
    organization_id: params.organizationId ?? null,
    employee_id: params.employeeId ?? null,
  };

  if (isEsimAccessConfigured()) {
    const upstream = await createOrder(params.packageCode, transactionId);

    // Insert order as PROCESSING — webhook will complete it
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({ ...baseRow, status: "processing", order_no: upstream.orderNo })
      .select("id, status")
      .single();

    if (error) throw new Error("Failed to create order");

    return { orderId: order!.id, status: order!.status };
  }

  // Demo mode: no eSIMAccess account configured — complete immediately with mock delivery details
  const activationCode = transactionId;
  const smdpAddress = "consumer.rsp.passportsim.io";
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      ...baseRow,
      status: "completed",
      order_no: `DEMO-${transactionId}`,
      activated_at: new Date().toISOString(),
      esim_iccid: `8944${Math.random().toString().slice(2, 16)}`,
      smdp_address: smdpAddress,
      activation_code: activationCode,
      qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        `LPA:1$${smdpAddress}$${activationCode}`,
      )}`,
    })
    .select("id, status")
    .single();

  if (error) throw new Error("Failed to create order");

  return { orderId: order!.id, status: order!.status };
}

// ---------------------------------------------------------------------------
// Place Order — called from CheckoutSheet
// ---------------------------------------------------------------------------

export const placeOrder = createServerFn({ method: "POST" })
  .validator(
    (input: {
      email: string;
      packageCode: string;
      deviceType: string;
      paymentMethod: string;
      stripePaymentIntentId?: string | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { email, packageCode, deviceType, paymentMethod, stripePaymentIntentId } = data;

    // Validate package exists and is active
    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", packageCode)
      .eq("is_active", true)
      .single();

    if (!pkg) throw new Error("Package not found or inactive");

    if (paymentMethod === "stripe") {
      if (!stripePaymentIntentId) throw new Error("Missing payment confirmation");
      await verifyStripePayment(stripePaymentIntentId, packageCode, pkg.retail_price_usd);
    }

    const userId = await getOptionalUserId();

    return provisionEsimOrder({
      packageCode,
      recipientEmail: email,
      deviceType,
      paymentMethod,
      amountUsd: pkg.retail_price_usd,
      userId,
    });
  });

// ---------------------------------------------------------------------------
// Purchase for Employee — business admin buys a plan for one named employee
// ---------------------------------------------------------------------------

export const purchaseForEmployee = createServerFn({ method: "POST" })
  .validator(
    (input: { employeeId: string; packageCode: string; stripePaymentIntentId: string }) => input,
  )
  .handler(async ({ data }) => {
    const { employeeId, packageCode, stripePaymentIntentId } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const userId = await getOptionalUserId();
    if (!userId) throw new Error("Sign in required");

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id, email, organization_id")
      .eq("id", employeeId)
      .eq("is_active", true)
      .single();
    if (!employee) throw new Error("Employee not found");

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, owner_user_id")
      .eq("id", employee.organization_id)
      .single();
    if (!org || org.owner_user_id !== userId) throw new Error("Not authorized for this employee");

    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", packageCode)
      .eq("is_active", true)
      .single();
    if (!pkg) throw new Error("Package not found or inactive");

    await verifyStripePayment(stripePaymentIntentId, packageCode, pkg.retail_price_usd);

    return provisionEsimOrder({
      packageCode,
      recipientEmail: employee.email,
      paymentMethod: "stripe",
      amountUsd: pkg.retail_price_usd,
      userId,
      organizationId: org.id,
      employeeId: employee.id,
    });
  });

// ---------------------------------------------------------------------------
// Check Order Status — polled from frontend after placing order
// ---------------------------------------------------------------------------

export const getOrderStatus = createServerFn({ method: "GET" })
  .validator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, esim_iccid, qr_code_url, smdp_address, activation_code, package_code")
      .eq("id", data.orderId)
      .single();

    if (!order) throw new Error("Order not found");

    let packageName: string | null = null;
    let dataMb: number | null = null;
    let validityDays: number | null = null;

    if (order.status === "completed") {
      const { data: pkg } = await supabaseAdmin
        .from("packages")
        .select("name, data_mb, validity_days")
        .eq("code", order.package_code)
        .single();
      if (pkg) {
        packageName = pkg.name;
        dataMb = pkg.data_mb;
        validityDays = pkg.validity_days;
      }
    }

    return {
      id: order.id,
      status: order.status,
      iccid: order.esim_iccid,
      qrCodeUrl: order.qr_code_url,
      smdpAddress: order.smdp_address,
      activationCode: order.activation_code,
      packageName,
      dataMb,
      validityDays,
    };
  });

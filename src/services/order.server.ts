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

    // Never trust a client-side "payment succeeded" claim — re-verify with Stripe directly.
    if (paymentMethod === "stripe") {
      if (!stripePaymentIntentId) throw new Error("Missing payment confirmation");

      const { stripe } = await import("./stripe.server");
      const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

      if (intent.status !== "succeeded") throw new Error("Payment was not completed");
      if (intent.metadata["packageCode"] !== packageCode) {
        throw new Error("Payment does not match the selected plan");
      }
      const expectedCents = Math.round(pkg.retail_price_usd * 100);
      if (intent.amount !== expectedCents || intent.currency !== "usd") {
        throw new Error("Payment amount does not match the selected plan");
      }
    }

    // Generate unique transaction ID
    const transactionId = `PS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userId = await getOptionalUserId();

    if (isEsimAccessConfigured()) {
      const upstream = await createOrder(packageCode, transactionId);

      // Insert order as PROCESSING — webhook will complete it
      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_email: email.trim(),
          package_code: packageCode,
          device_type: deviceType,
          payment_method: paymentMethod,
          amount_usd: pkg.retail_price_usd,
          status: "processing",
          transaction_id: transactionId,
          order_no: upstream.orderNo,
          user_id: userId,
        })
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
        customer_email: email.trim(),
        package_code: packageCode,
        device_type: deviceType,
        payment_method: paymentMethod,
        amount_usd: pkg.retail_price_usd,
        status: "completed",
        transaction_id: transactionId,
        order_no: `DEMO-${transactionId}`,
        user_id: userId,
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

/**
 * Server functions for order operations.
 * Called from the frontend via TanStack Start's createServerFn RPC.
 */
import { createServerFn } from "@tanstack/react-start";
import { createOrder } from "./esimaccess";

// ---------------------------------------------------------------------------
// Place Order — called from CheckoutSheet
// ---------------------------------------------------------------------------

export const placeOrder = createServerFn({ method: "POST" })
  .validator(
    (input: { email: string; packageCode: string; deviceType: string; paymentMethod: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    if (process.env["PAYMENT_PROVIDER"] === "paystack") {
      throw new Error("Secure payment is enabled. Use the hosted Paystack checkout.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { email, packageCode, deviceType, paymentMethod } = data;

    // Validate package exists and is active
    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", packageCode)
      .eq("is_active", true)
      .single();

    if (!pkg) throw new Error("Package not found or inactive");

    // Generate unique transaction ID
    const transactionId = `PS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Call eSIMAccess upstream
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
  .validator((input: { orderId: string; paymentReference?: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, customer_email, esim_iccid, qr_code_url, smdp_address, activation_code, package_code, payment_reference, payment_status",
      )
      .eq("id", data.orderId)
      .single();

    if (!order) throw new Error("Order not found");
    if (order.payment_reference && order.payment_reference !== data.paymentReference) {
      throw new Error("Order access could not be verified.");
    }

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
      email: order.customer_email,
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

/**
 * Server functions for Stripe payment operations.
 * Called from the frontend via TanStack Start's createServerFn RPC.
 */
import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Create Payment Intent — called when the shopper picks "Card via Stripe"
// ---------------------------------------------------------------------------

export const createPaymentIntent = createServerFn({ method: "POST" })
  .validator((input: { packageCode: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stripe } = await import("./stripe.server");

    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", data.packageCode)
      .eq("is_active", true)
      .single();

    if (!pkg) throw new Error("Package not found or inactive");

    const amountCents = Math.round(pkg.retail_price_usd * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { packageCode: data.packageCode },
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      amountCents,
    };
  });

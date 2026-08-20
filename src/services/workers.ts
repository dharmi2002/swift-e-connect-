/**
 * Background worker functions.
 *
 * These are plain async functions designed to be called by:
 * - Vercel/Cloudflare cron triggers
 * - Supabase pg_cron + pg_net
 * - Or the API routes (packages/sync, health/balance, orders/poll)
 *
 * The order polling worker uses /esim/query (POST) to check order status,
 * matching the eSIMAccess API which requires POST for all endpoints.
 */

import { queryProfiles } from "./esimaccess";
import { sendEsimDeliveryEmail } from "./email";

/**
 * Order Polling Worker
 *
 * Finds orders stuck in PROCESSING for > 60 seconds,
 * polls eSIMAccess for their status, and completes them
 * if the webhook was missed.
 */
export async function pollStuckOrders(): Promise<{
  checked: number;
  completed: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const cutoff = new Date(Date.now() - 60_000).toISOString();

  const { data: stuckOrders } = await supabaseAdmin
    .from("orders")
    .select("id, order_no, customer_email, package_code")
    .eq("status", "processing")
    .lt("created_at", cutoff)
    .limit(20);

  if (!stuckOrders?.length) return { checked: 0, completed: 0 };

  let completed = 0;

  for (const order of stuckOrders) {
    if (!order.order_no) continue;

    try {
      // Query eSIMAccess for the eSIM profiles associated with this order
      const profiles = await queryProfiles(order.order_no);

      if (profiles.length > 0) {
        const esim = profiles[0]!;

        // Check if the profile has been allocated (smdpStatus = RELEASED or later)
        if (esim.smdpAddress && esim.iccid) {
          await supabaseAdmin
            .from("orders")
            .update({
              status: "completed",
              esim_iccid: esim.iccid,
              activation_code: esim.ac,
              qr_code_url: esim.qrCodeUrl,
              smdp_address: esim.smdpAddress,
            })
            .eq("id", order.id);

          // Fetch package info for delivery email
          const { data: pkg } = await supabaseAdmin
            .from("packages")
            .select("name, data_mb, validity_days")
            .eq("code", order.package_code)
            .single();

          if (pkg) {
            await sendEsimDeliveryEmail({
              customerEmail: order.customer_email,
              packageName: pkg.name,
              dataMb: pkg.data_mb,
              validityDays: pkg.validity_days,
              iccid: esim.iccid,
              qrCodeUrl: esim.qrCodeUrl,
              activationCode: esim.ac,
              smdpAddress: esim.smdpAddress,
            });
          }

          completed++;
        }
      }
      // If queryProfiles returns empty, eSIMAccess is still allocating (error 200010)
      // — leave the order as "processing" and try again next poll
    } catch (err) {
      console.error(`Poll failed for order ${order.id}:`, err);
    }
  }

  return { checked: stuckOrders.length, completed };
}

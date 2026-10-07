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
import { fulfillOrderById, fulfillPaidTopup } from "./payment.server";

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
  recoveredPayments: number;
  retriedTopups: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const cutoff = new Date(Date.now() - 60_000).toISOString();

  // A provider outage can happen after Paystack has already confirmed payment.
  // Retry supplier order creation from the paid record instead of requiring support
  // to reconcile it manually.
  const { data: paidOrders } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("payment_status", "paid")
    .is("order_no", null)
    .in("status", ["payment_pending", "processing"])
    .lt("created_at", cutoff)
    .limit(20);
  let recoveredPayments = 0;
  for (const order of paidOrders ?? []) {
    try {
      await fulfillOrderById(order.id);
      recoveredPayments++;
    } catch (err) {
      console.error(`Paid order recovery failed for ${order.id}:`, err);
    }
  }

  // Paid top-ups remain in the paid state when a supplier call fails, making them
  // safe to retry without charging the customer again.
  const { data: paidTopups } = await supabaseAdmin
    .from("esim_topups")
    .select("id")
    .eq("payment_status", "paid")
    .eq("status", "paid")
    .lt("created_at", cutoff)
    .limit(20);
  let retriedTopups = 0;
  for (const topup of paidTopups ?? []) {
    try {
      await fulfillPaidTopup(topup.id);
      retriedTopups++;
    } catch (err) {
      console.error(`Paid top-up recovery failed for ${topup.id}:`, err);
    }
  }

  const { data: stuckOrders } = await supabaseAdmin
    .from("orders")
    .select("id, order_no, customer_email, package_code, organization_id, payment_status")
    .eq("status", "processing")
    .or("payment_status.eq.paid,payment_status.eq.unpaid")
    .lt("created_at", cutoff)
    .limit(20);

  if (!stuckOrders?.length)
    return {
      checked: paidOrders?.length ?? 0,
      completed: 0,
      recoveredPayments,
      retriedTopups,
    };

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
            if (order.organization_id) {
              await supabaseAdmin.from("esim_lines").upsert(
                profiles.map((profile) => ({
                  organization_id: order.organization_id!,
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
            for (const profile of profiles) {
              await sendEsimDeliveryEmail({
                customerEmail: order.customer_email,
                packageName: pkg.name,
                dataMb: pkg.data_mb,
                validityDays: pkg.validity_days,
                iccid: profile.iccid,
                qrCodeUrl: profile.qrCodeUrl,
                activationCode: profile.ac,
                smdpAddress: profile.smdpAddress,
              });
            }
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

  return {
    checked: stuckOrders.length + (paidOrders?.length ?? 0),
    completed,
    recoveredPayments,
    retriedTopups,
  };
}

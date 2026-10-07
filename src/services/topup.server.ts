import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canViewBilling } from "@/lib/business";
import { createPaystackTopupCheckout } from "./payment.server";

export const topUpOrganizationLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lineId: string; packageCode: string }) => input)
  .handler(async ({ data, context }) => {
    const auth = context as { userId: string; claims?: { email?: unknown } };
    const userId = auth.userId;
    const { data: line } = await supabaseAdmin
      .from("esim_lines")
      .select("id, organization_id, esim_tran_no, status")
      .eq("id", data.lineId)
      .single();
    if (!line || !line.esim_tran_no) throw new Error("eSIM line is not ready for a top-up.");
    const { data: member } = await supabaseAdmin
      .from("organization_members")
      .select("role, status")
      .eq("organization_id", line.organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (
      !member ||
      member.status !== "active" ||
      !canViewBilling(member.role as "owner" | "admin" | "billing" | "manager" | "employee")
    )
      throw new Error("You do not have permission to top up this line.");
    if (["revoked", "suspended"].includes(line.status))
      throw new Error("This line must be active before it can be topped up.");
    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", data.packageCode)
      .eq("is_active", true)
      .single();
    if (!pkg) throw new Error("Top-up package not found or inactive.");
    const claimEmail = typeof auth.claims?.email === "string" ? auth.claims.email : "";
    const email =
      claimEmail || (await supabaseAdmin.auth.admin.getUserById(userId)).data.user?.email;
    if (!email) throw new Error("Your account does not have an email for payment checkout.");
    const transactionId = `TU-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const { data: topup, error } = await supabaseAdmin
      .from("esim_topups")
      .insert({
        line_id: line.id,
        package_code: data.packageCode,
        transaction_id: transactionId,
        amount_usd: pkg.retail_price_usd,
        payment_provider: "paystack",
        created_by_user_id: userId,
      })
      .select("id")
      .single();
    if (error || !topup) throw new Error("Unable to create top-up record.");
    try {
      return await createPaystackTopupCheckout({ topupId: topup.id, email });
    } catch (cause) {
      await supabaseAdmin
        .from("esim_topups")
        .update({
          status: "failed",
          provider_payload: { error: cause instanceof Error ? cause.message : "Unknown error" },
        })
        .eq("id", topup.id);
      throw cause;
    }
  });

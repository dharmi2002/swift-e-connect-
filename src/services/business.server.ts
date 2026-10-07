import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { createPaystackCheckout } from "./payment.server";
import { sendOrganizationInvitationEmail } from "./email";
import {
  canManageLines,
  canManageTeam,
  isInvitableRole,
  isLineStatus,
  normalizeEmail,
  slugifyOrganizationName,
  validateOrganizationName,
  type BusinessRole,
} from "@/lib/business";

type AuthContext = { userId: string; supabase: SupabaseClient<Database> };

async function membership(
  userId: string,
  organizationId: string,
): Promise<{ role: BusinessRole; status: string } | null> {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { role: BusinessRole; status: string } | null;
}

async function requireRole(
  userId: string,
  organizationId: string,
  check: (role: BusinessRole) => boolean,
) {
  const member = await membership(userId, organizationId);
  if (!member || member.status !== "active" || !check(member.role))
    throw new Error("You do not have permission for this organization.");
  return member;
}

async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const getBusinessWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId?: string }) => input)
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const { data: memberships, error } = await auth.supabase
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("user_id", auth.userId)
      .eq("status", "active");
    if (error) throw new Error("Unable to load your organizations.");
    const ids = (memberships ?? []).map((item) => item.organization_id);
    if (!ids.length)
      return { userId: auth.userId, organizations: [], members: [], lines: [], orders: [] };
    const organizationId =
      data.organizationId && ids.includes(data.organizationId) ? data.organizationId : ids[0];
    const [{ data: organizations }, { data: members }, { data: lines }, { data: orders }] =
      await Promise.all([
        auth.supabase.from("organizations").select("id, name, slug, created_at").in("id", ids),
        auth.supabase
          .from("organization_members")
          .select("user_id, role, status, created_at")
          .eq("organization_id", organizationId),
        auth.supabase
          .from("esim_lines")
          .select(
            "id, label, assigned_to, package_code, esim_tran_no, iccid, status, data_mb, data_used_mb, validity_days, expires_at",
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        auth.supabase
          .from("orders")
          .select(
            "id, package_code, quantity, amount_usd, status, payment_status, payment_reference, created_at",
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
    const membersWithEmail = await Promise.all(
      (members ?? []).map(async (member) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
        return { ...member, email: userData.user?.email ?? null };
      }),
    );
    return {
      userId: auth.userId,
      organizations: (organizations ?? []).map((org) => ({
        ...org,
        role: memberships?.find((m) => m.organization_id === org.id)?.role,
      })),
      members: membersWithEmail,
      lines: lines ?? [],
      orders: orders ?? [],
    };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string }) => input)
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const validationError = validateOrganizationName(data.name);
    if (validationError) throw new Error(validationError);
    const baseSlug = slugifyOrganizationName(data.name);
    const { data: organization, error } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.name.trim(),
        slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
        created_by: auth.userId,
      })
      .select("id, name, slug")
      .single();
    if (error || !organization) throw new Error("Unable to create organization.");
    const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
      organization_id: organization.id,
      user_id: auth.userId,
      role: "owner",
      status: "active",
    });
    if (memberError)
      throw new Error("Organization created, but owner access could not be provisioned.");
    return organization;
  });

export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; email: string; role: string }) => input)
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    await requireRole(auth.userId, data.organizationId, canManageTeam);
    if (!isInvitableRole(data.role)) throw new Error("Unsupported invitation role.");
    const email = normalizeEmail(data.email);
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const { error } = await supabaseAdmin.from("organization_invitations").insert({
      organization_id: data.organizationId,
      email,
      role: data.role,
      token_hash: await hashToken(token),
      invited_by: auth.userId,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    if (error) throw new Error("Unable to create invitation.");
    const inviteUrl = `${process.env["PUBLIC_APP_URL"] || "http://localhost:5173"}/account?invite=${token}`;
    try {
      const { data: organization } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", data.organizationId)
        .single();
      await sendOrganizationInvitationEmail({
        recipientEmail: email,
        organizationName: organization?.name || "your organization",
        role: data.role,
        inviteUrl,
      });
    } catch (cause) {
      console.error("Invitation email failed after invitation was stored:", cause);
    }
    return { inviteUrl };
  });

export const acceptOrganizationInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(auth.userId);
    const email = userData.user?.email ? normalizeEmail(userData.user.email) : "";
    const { data: invitation } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, organization_id, email, role, expires_at, accepted_at")
      .eq("token_hash", await hashToken(data.token))
      .maybeSingle();
    if (
      !invitation ||
      invitation.accepted_at ||
      new Date(invitation.expires_at) < new Date() ||
      invitation.email !== email
    )
      throw new Error("This invitation is invalid, expired, or belongs to another email address.");
    const { error } = await supabaseAdmin.from("organization_members").upsert(
      {
        organization_id: invitation.organization_id,
        user_id: auth.userId,
        role: invitation.role,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );
    if (error) throw new Error("Unable to accept invitation.");
    await supabaseAdmin
      .from("organization_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);
    return { organizationId: invitation.organization_id };
  });

export const assignOrganizationLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lineId: string; userId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const { data: line } = await supabaseAdmin
      .from("esim_lines")
      .select("id, organization_id")
      .eq("id", data.lineId)
      .single();
    if (!line) throw new Error("eSIM line not found.");
    await requireRole(auth.userId, line.organization_id, canManageLines);
    if (data.userId) {
      const member = await membership(data.userId, line.organization_id);
      if (!member || member.status !== "active")
        throw new Error("The assignee is not an active member of this organization.");
    }
    const { error } = await supabaseAdmin
      .from("esim_lines")
      .update({ assigned_to: data.userId, status: data.userId ? "assigned" : "unassigned" })
      .eq("id", data.lineId);
    if (error) throw new Error("Unable to update eSIM assignment.");
    return { ok: true };
  });

export const updateOrganizationLineStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lineId: string; status: string }) => input)
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    if (!isLineStatus(data.status)) throw new Error("Unsupported eSIM line status.");
    const { data: line } = await supabaseAdmin
      .from("esim_lines")
      .select("organization_id")
      .eq("id", data.lineId)
      .single();
    if (!line) throw new Error("eSIM line not found.");
    await requireRole(auth.userId, line.organization_id, canManageLines);
    const { error } = await supabaseAdmin
      .from("esim_lines")
      .update({ status: data.status })
      .eq("id", data.lineId);
    if (error) throw new Error("Unable to update eSIM status.");
    return { ok: true };
  });

export const placeBusinessOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      organizationId: string;
      email: string;
      packageCode: string;
      deviceType: string;
      paymentMethod: string;
      quantity: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    await requireRole(auth.userId, data.organizationId, canManageLines);
    const quantity = Math.floor(data.quantity);
    if (quantity < 1 || quantity > 100) throw new Error("Quantity must be between 1 and 100.");
    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", data.packageCode)
      .eq("is_active", true)
      .single();
    if (!pkg) throw new Error("Package not found or inactive.");
    if (data.paymentMethod !== "paystack")
      throw new Error("Paystack checkout is currently required for business purchases.");
    const checkout = await createPaystackCheckout({
      email: normalizeEmail(data.email),
      packageCode: data.packageCode,
      deviceType: data.deviceType,
      quantity,
      organizationId: data.organizationId,
    });
    await supabaseAdmin
      .from("orders")
      .update({ created_by_user_id: auth.userId })
      .eq("id", checkout.orderId);
    return checkout;
  });

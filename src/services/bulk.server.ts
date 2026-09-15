/**
 * Server functions for bulk eSIM seat purchases (business accounts).
 *
 * A bulk purchase pays once for N unassigned "seats". Each seat is only
 * turned into a real eSIM order (via provisionEsimOrder, same as any other
 * order) once the admin assigns it to an employee or email — so this never
 * needs to touch eSIMAccess's single-eSIM-per-order assumptions.
 */
import { createServerFn } from "@tanstack/react-start";
import { getOptionalUserId } from "@/integrations/supabase/auth-optional.server";
import { requireOrganization } from "./organization.server";

// ---------------------------------------------------------------------------
// Purchase Bulk Seats — business admin pays for N unassigned eSIMs
// ---------------------------------------------------------------------------

export const purchaseBulkSeats = createServerFn({ method: "POST" })
  .validator(
    (input: { packageCode: string; quantity: number; stripePaymentIntentId: string }) => input,
  )
  .handler(async ({ data }) => {
    const { packageCode, quantity, stripePaymentIntentId } = data;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      throw new Error("Quantity must be between 1 and 500");
    }

    const org = await requireOrganization();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", packageCode)
      .eq("is_active", true)
      .single();
    if (!pkg) throw new Error("Package not found or inactive");

    const amountUsdTotal = Math.round(pkg.retail_price_usd * quantity * 100) / 100;

    const { verifyStripePayment } = await import("./order.server");
    await verifyStripePayment(stripePaymentIntentId, packageCode, amountUsdTotal);

    const transactionId = `PSB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: purchase, error } = await supabaseAdmin
      .from("bulk_purchases")
      .insert({
        organization_id: org.id,
        package_code: packageCode,
        quantity,
        amount_usd_total: amountUsdTotal,
        stripe_payment_intent_id: stripePaymentIntentId,
        transaction_id: transactionId,
        status: "completed",
      })
      .select("id")
      .single();

    if (error) throw new Error("Failed to record bulk purchase");

    const seatRows = Array.from({ length: quantity }, () => ({
      bulk_purchase_id: purchase!.id,
      organization_id: org.id,
      status: "unassigned",
    }));

    const { error: seatsError } = await supabaseAdmin.from("esim_seats").insert(seatRows);
    if (seatsError) throw new Error("Failed to create seats");

    return { bulkPurchaseId: purchase!.id, quantity };
  });

// ---------------------------------------------------------------------------
// List Seats — assigned + unassigned, with package/employee/order context
// ---------------------------------------------------------------------------

export type SeatRow = {
  id: string;
  status: string;
  packageCode: string;
  packageName: string;
  createdAt: string;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  assignedEmail: string | null;
  orderStatus: string | null;
};

export const listSeats = createServerFn({ method: "GET" }).handler(async (): Promise<SeatRow[]> => {
  const org = await requireOrganization();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: seats, error } = await supabaseAdmin
    .from("esim_seats")
    .select(
      "id, status, created_at, bulk_purchase_id, order_id, assigned_employee_id, assigned_email",
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Failed to load seats");
  if (!seats?.length) return [];

  const bulkPurchaseIds = [...new Set(seats.map((s) => s.bulk_purchase_id))];
  const { data: purchases } = await supabaseAdmin
    .from("bulk_purchases")
    .select("id, package_code")
    .in("id", bulkPurchaseIds);
  const packageCodeByPurchase = new Map((purchases ?? []).map((p) => [p.id, p.package_code]));

  const packageCodes = [...new Set(packageCodeByPurchase.values())];
  const { data: packages } = packageCodes.length
    ? await supabaseAdmin.from("packages").select("code, name").in("code", packageCodes)
    : { data: [] as { code: string; name: string }[] };
  const packageNameByCode = new Map((packages ?? []).map((p) => [p.code, p.name]));

  const employeeIds = [
    ...new Set(seats.map((s) => s.assigned_employee_id).filter((x): x is string => !!x)),
  ];
  const { data: employees } = employeeIds.length
    ? await supabaseAdmin.from("employees").select("id, full_name").in("id", employeeIds)
    : { data: [] as { id: string; full_name: string }[] };
  const employeeNameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  const orderIds = [...new Set(seats.map((s) => s.order_id).filter((x): x is string => !!x))];
  const { data: orders } = orderIds.length
    ? await supabaseAdmin.from("orders").select("id, status").in("id", orderIds)
    : { data: [] as { id: string; status: string }[] };
  const orderStatusById = new Map((orders ?? []).map((o) => [o.id, o.status]));

  return seats.map((seat) => {
    const packageCode = packageCodeByPurchase.get(seat.bulk_purchase_id) ?? "";
    return {
      id: seat.id,
      status: seat.status,
      packageCode,
      packageName: packageNameByCode.get(packageCode) ?? packageCode,
      createdAt: seat.created_at,
      assignedEmployeeId: seat.assigned_employee_id,
      assignedEmployeeName: seat.assigned_employee_id
        ? (employeeNameById.get(seat.assigned_employee_id) ?? null)
        : null,
      assignedEmail: seat.assigned_email,
      orderStatus: seat.order_id ? (orderStatusById.get(seat.order_id) ?? null) : null,
    };
  });
});

// ---------------------------------------------------------------------------
// Assign Seat — hand an unassigned seat to an employee (or a one-off email),
// which provisions the actual eSIM order at this point.
// ---------------------------------------------------------------------------

export const assignSeat = createServerFn({ method: "POST" })
  .validator(
    (input: {
      seatId: string;
      employeeId?: string | undefined;
      recipientEmail?: string | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { seatId, employeeId, recipientEmail } = data;
    const org = await requireOrganization();
    const userId = await getOptionalUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: seat } = await supabaseAdmin
      .from("esim_seats")
      .select("id, status, bulk_purchase_id")
      .eq("id", seatId)
      .eq("organization_id", org.id)
      .single();
    if (!seat) throw new Error("Seat not found");
    if (seat.status !== "unassigned") throw new Error("Seat is already assigned");

    let email = recipientEmail?.trim();
    if (employeeId) {
      const { data: employee } = await supabaseAdmin
        .from("employees")
        .select("id, email")
        .eq("id", employeeId)
        .eq("organization_id", org.id)
        .eq("is_active", true)
        .single();
      if (!employee) throw new Error("Employee not found");
      email = employee.email;
    }
    if (!email) throw new Error("An employee or recipient email is required");

    const { data: purchase } = await supabaseAdmin
      .from("bulk_purchases")
      .select("package_code")
      .eq("id", seat.bulk_purchase_id)
      .single();
    if (!purchase) throw new Error("Bulk purchase not found");

    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("retail_price_usd")
      .eq("code", purchase.package_code)
      .single();

    const { provisionEsimOrder } = await import("./order.server");
    const { orderId } = await provisionEsimOrder({
      packageCode: purchase.package_code,
      recipientEmail: email,
      paymentMethod: "business_seat",
      amountUsd: pkg?.retail_price_usd ?? 0,
      userId,
      organizationId: org.id,
      employeeId,
    });

    const { error } = await supabaseAdmin
      .from("esim_seats")
      .update({
        status: "assigned",
        order_id: orderId,
        assigned_employee_id: employeeId ?? null,
        assigned_email: email,
      })
      .eq("id", seatId);

    if (error) throw new Error("Failed to assign seat");
    return { orderId };
  });

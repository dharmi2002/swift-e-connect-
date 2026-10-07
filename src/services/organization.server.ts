/**
 * Server functions for business/organization operations.
 * Called from the frontend via TanStack Start's createServerFn RPC.
 */
import { createServerFn } from "@tanstack/react-start";

export type Organization = {
  id: string;
  name: string;
  companyEmail: string;
};

/**
 * Loads the organization owned by the current session, or throws if there isn't one.
 *
 * This is a plain helper (not a createServerFn handler), so unlike the RPC
 * exports below it isn't swapped out for a client stub — its imports must
 * stay dynamic or they'd ship server-only code into the client bundle.
 */
export async function requireOrganization(): Promise<Organization> {
  const { getOptionalUserId } = await import("@/integrations/supabase/auth-optional.server");
  const userId = await getOptionalUserId();
  if (!userId) throw new Error("Sign in required");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, company_email")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!org) throw new Error("No business account found for this user");

  return { id: org.id, name: org.name, companyEmail: org.company_email };
}

// ---------------------------------------------------------------------------
// getMyOrganization — used to gate /business routes and show the dashboard link
// ---------------------------------------------------------------------------

export const getMyOrganization = createServerFn({ method: "GET" }).handler(
  async (): Promise<Organization | null> => {
    try {
      return await requireOrganization();
    } catch {
      return null;
    }
  },
);

// ---------------------------------------------------------------------------
// Offices
// ---------------------------------------------------------------------------

export const listOffices = createServerFn({ method: "GET" }).handler(async () => {
  const org = await requireOrganization();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("offices")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("name", { ascending: true });

  if (error) throw new Error("Failed to load offices");
  return data ?? [];
});

export const createOffice = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const org = await requireOrganization();
    const name = data.name.trim();
    if (!name) throw new Error("Office name is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: office, error } = await supabaseAdmin
      .from("offices")
      .insert({ organization_id: org.id, name })
      .select("id, name")
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("An office with that name already exists");
      throw new Error("Failed to create office");
    }
    return office;
  });

// ---------------------------------------------------------------------------
// Employees + plan report
// ---------------------------------------------------------------------------

export type EmployeeReportRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  officeId: string | null;
  officeName: string | null;
  plan: {
    packageName: string;
    dataMb: number;
    validityDays: number;
    orderStatus: string;
    expiresAt: string | null;
  } | null;
  status: "no_plan" | "processing" | "failed" | "active" | "expiring_soon" | "expired";
};

export const listEmployees = createServerFn({ method: "GET" }).handler(
  async (): Promise<EmployeeReportRow[]> => {
    const org = await requireOrganization();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: employees, error } = await supabaseAdmin
      .from("employees")
      .select("id, full_name, email, phone, office_id")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) throw new Error("Failed to load employees");
    if (!employees?.length) return [];

    const officeIds = [
      ...new Set(employees.map((e) => e.office_id).filter((x): x is string => !!x)),
    ];
    const { data: offices } = officeIds.length
      ? await supabaseAdmin.from("offices").select("id, name").in("id", officeIds)
      : { data: [] as { id: string; name: string }[] };
    const officeNameById = new Map((offices ?? []).map((o) => [o.id, o.name]));

    const employeeIds = employees.map((e) => e.id);
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("employee_id, status, activated_at, created_at, package_code")
      .in("employee_id", employeeIds)
      .order("created_at", { ascending: false });

    // Keep only the most recent order per employee (orders is already newest-first)
    const latestOrderByEmployee = new Map<string, NonNullable<typeof orders>[number]>();
    for (const order of orders ?? []) {
      if (order.employee_id && !latestOrderByEmployee.has(order.employee_id)) {
        latestOrderByEmployee.set(order.employee_id, order);
      }
    }

    const packageCodes = [
      ...new Set([...latestOrderByEmployee.values()].map((o) => o.package_code)),
    ];
    const { data: packages } = packageCodes.length
      ? await supabaseAdmin
          .from("packages")
          .select("code, name, data_mb, validity_days")
          .in("code", packageCodes)
      : { data: [] as { code: string; name: string; data_mb: number; validity_days: number }[] };
    const packageByCode = new Map((packages ?? []).map((p) => [p.code, p]));

    const now = Date.now();

    return employees.map((employee): EmployeeReportRow => {
      const order = latestOrderByEmployee.get(employee.id);
      const pkg = order ? packageByCode.get(order.package_code) : undefined;

      if (!order || !pkg) {
        return {
          id: employee.id,
          fullName: employee.full_name,
          email: employee.email,
          phone: employee.phone,
          officeId: employee.office_id,
          officeName: employee.office_id ? (officeNameById.get(employee.office_id) ?? null) : null,
          plan: null,
          status: "no_plan",
        };
      }

      const startedAt = order.activated_at ?? order.created_at;
      const expiresAt =
        order.status === "completed"
          ? new Date(new Date(startedAt).getTime() + pkg.validity_days * 86_400_000).toISOString()
          : null;

      let status: EmployeeReportRow["status"];
      if (order.status === "failed") status = "failed";
      else if (order.status !== "completed") status = "processing";
      else if (!expiresAt) status = "active";
      else {
        const msRemaining = new Date(expiresAt).getTime() - now;
        if (msRemaining < 0) status = "expired";
        else if (msRemaining < 3 * 86_400_000) status = "expiring_soon";
        else status = "active";
      }

      return {
        id: employee.id,
        fullName: employee.full_name,
        email: employee.email,
        phone: employee.phone,
        officeId: employee.office_id,
        officeName: employee.office_id ? (officeNameById.get(employee.office_id) ?? null) : null,
        plan: {
          packageName: pkg.name,
          dataMb: pkg.data_mb,
          validityDays: pkg.validity_days,
          orderStatus: order.status,
          expiresAt,
        },
        status,
      };
    });
  },
);

export const createEmployee = createServerFn({ method: "POST" })
  .validator(
    (input: {
      fullName: string;
      email: string;
      phone?: string | undefined;
      officeId?: string | null | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    const org = await requireOrganization();
    const fullName = data.fullName.trim();
    const email = data.email.trim();
    if (!fullName) throw new Error("Name is required");
    if (!email) throw new Error("Email is required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee, error } = await supabaseAdmin
      .from("employees")
      .insert({
        organization_id: org.id,
        office_id: data.officeId ?? null,
        full_name: fullName,
        email,
        phone: data.phone?.trim() || null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("An employee with that email already exists");
      throw new Error("Failed to add employee");
    }
    return employee;
  });

export const removeEmployee = createServerFn({ method: "POST" })
  .validator((input: { employeeId: string }) => input)
  .handler(async ({ data }) => {
    const org = await requireOrganization();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("employees")
      .update({ is_active: false })
      .eq("id", data.employeeId)
      .eq("organization_id", org.id);

    if (error) throw new Error("Failed to remove employee");
    return { ok: true };
  });

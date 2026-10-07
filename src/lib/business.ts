export const BUSINESS_ROLES = ["owner", "admin", "billing", "manager", "employee"] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const INVITABLE_ROLES = ["admin", "billing", "manager", "employee"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const MANAGER_ROLES: readonly BusinessRole[] = ["owner", "admin", "manager"];
const BILLING_ROLES: readonly BusinessRole[] = ["owner", "admin", "billing"];

export function canManageTeam(role: BusinessRole): boolean {
  return MANAGER_ROLES.includes(role);
}

export function canManageLines(role: BusinessRole): boolean {
  return MANAGER_ROLES.includes(role);
}

export function canViewBilling(role: BusinessRole): boolean {
  return BILLING_ROLES.includes(role);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateOrganizationName(name: string): string | null {
  const value = name.trim();
  if (value.length < 2) return "Organization name must be at least 2 characters.";
  if (value.length > 80) return "Organization name must be 80 characters or fewer.";
  return null;
}

export function slugifyOrganizationName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "organization"
  );
}

export function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

export function isLineStatus(
  status: string,
): status is "unassigned" | "assigned" | "active" | "suspended" | "revoked" {
  return ["unassigned", "assigned", "active", "suspended", "revoked"].includes(status);
}

import { describe, expect, it } from "vitest";
import {
  canManageLines,
  canManageRoles,
  canManageTeam,
  canViewBilling,
  isInvitableRole,
  isLineStatus,
  normalizeEmail,
  slugifyOrganizationName,
  summarizeOrganizationUtilization,
  validateOrganizationName,
} from "./business";

describe("business permissions", () => {
  it("allows owners, admins, and managers to manage the team", () => {
    expect(["owner", "admin", "manager"].every((role) => canManageTeam(role as never))).toBe(true);
    expect(canManageTeam("employee")).toBe(false);
  });

  it("separates billing from team management", () => {
    expect(canViewBilling("billing")).toBe(true);
    expect(canViewBilling("manager")).toBe(false);
    expect(canManageLines("billing")).toBe(false);
    expect(canManageRoles("owner")).toBe(true);
    expect(canManageRoles("admin")).toBe(true);
    expect(canManageRoles("manager")).toBe(false);
  });
});

describe("business validation helpers", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  TEAM@Example.COM ")).toBe("team@example.com");
  });

  it("validates organization names", () => {
    expect(validateOrganizationName("A")).toBeTruthy();
    expect(validateOrganizationName("Acme Travel")).toBeNull();
    expect(validateOrganizationName("x".repeat(81))).toBeTruthy();
  });

  it("creates stable readable slugs", () => {
    expect(slugifyOrganizationName("  Café & Tours  ")).toBe("cafe-tours");
    expect(slugifyOrganizationName("!!!")).toBe("organization");
  });

  it("accepts only supported invitation roles and line statuses", () => {
    expect(isInvitableRole("employee")).toBe(true);
    expect(isInvitableRole("owner")).toBe(false);
    expect(isLineStatus("suspended")).toBe(true);
    expect(isLineStatus("deleted")).toBe(false);
  });

  it("summarizes company line utilization", () => {
    expect(
      summarizeOrganizationUtilization([
        { assigned_to: "employee-1", status: "active", data_mb: 1000, data_used_mb: 250 },
        { assigned_to: null, status: "suspended", data_mb: 500, data_used_mb: 100 },
        { assigned_to: "employee-2", status: "revoked", data_mb: null, data_used_mb: null },
      ]),
    ).toMatchObject({
      totalLines: 3,
      assignedLines: 2,
      activeLines: 1,
      suspendedLines: 1,
      revokedLines: 1,
      totalDataMb: 1500,
      usedDataMb: 350,
      utilizationPercent: (350 / 1500) * 100,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  canManageLines,
  canManageTeam,
  canViewBilling,
  isInvitableRole,
  isLineStatus,
  normalizeEmail,
  slugifyOrganizationName,
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
});

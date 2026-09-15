import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getMyOrganization } from "@/services/organization.server";

const tabs = [
  { to: "/business/employees", label: "Employees" },
  { to: "/business/bulk", label: "Bulk Packages" },
];

/** Auth/org gate + header + tab nav shared by every /business/* dashboard page. */
export function BusinessDashboardShell({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  const orgQuery = useQuery({
    queryKey: ["my-organization"],
    queryFn: () => getMyOrganization(),
    enabled: !!user,
  });

  if (authLoading || (!!user && orgQuery.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !orgQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold">
            {user ? "No business account found" : "Sign in to your business account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user
              ? "This account isn't linked to a business. Register a company to get started."
              : "Manage employees and eSIM plans from your dashboard."}
          </p>
        </div>
        <div className="flex gap-2">
          {!user && (
            <Button asChild variant="hero">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild variant={user ? "hero" : "outline"}>
            <Link to="/business/signup">Register a business</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="truncate text-lg font-extrabold tracking-tight">
              {orgQuery.data.name}
            </span>
          </Link>
          <nav className="ml-auto flex shrink-0 gap-1">
            {tabs.map((tab) => (
              <Button
                key={tab.to}
                asChild
                variant={location.pathname.startsWith(tab.to) ? "soft" : "ghost"}
                size="sm"
              >
                <Link to={tab.to}>{tab.label}</Link>
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

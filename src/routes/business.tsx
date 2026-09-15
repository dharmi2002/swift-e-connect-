import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pathless layout — auth/org gating and dashboard chrome live in
// BusinessDashboardShell so that /business/signup (also nested here by the
// file-router's dot convention) can render without being blocked by it.
export const Route = createFileRoute("/business")({
  component: () => <Outlet />,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/business/")({
  beforeLoad: () => {
    throw redirect({ to: "/business/employees" });
  },
});

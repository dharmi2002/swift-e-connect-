/**
 * Client-side error reporting.
 *
 * Called from the root error boundary to log React rendering errors.
 * Replace the console.error call with your preferred error tracking service
 * (e.g. Sentry, LogRocket, Datadog RUM).
 */

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[PassportSIM Error]", {
    message,
    stack,
    route: window.location.pathname,
    ...context,
  });
}

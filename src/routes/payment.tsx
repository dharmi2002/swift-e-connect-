import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EsimReadyDialog, type EsimResult } from "@/components/store/EsimReadyDialog";
import { getOrderStatus } from "@/services/order.server";
import {
  fulfillPaidOrder,
  fulfillPaidTopupFn,
  verifyPaystackPayment,
  verifyPaystackTopupPayment,
} from "@/services/payment.server";
import { formatData } from "@/lib/packages";

export const Route = createFileRoute("/payment")({
  head: () => ({ meta: [{ title: "Payment confirmation · eLango" }] }),
  component: PaymentPage,
});

function PaymentPage() {
  const [state, setState] = useState<"loading" | "error" | "ready" | "success">("loading");
  const [message, setMessage] = useState("Confirming your payment securely…");
  const [esim, setEsim] = useState<EsimResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function confirm() {
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get("orderId");
      const topupId = params.get("topupId");
      const reference = params.get("reference");
      if ((!orderId && !topupId) || !reference) {
        setState("error");
        setMessage("Payment reference is missing. Please contact support.");
        return;
      }
      try {
        if (topupId) {
          await verifyPaystackTopupPayment({ data: { topupId, reference } });
          await fulfillPaidTopupFn({ data: { topupId } });
          if (cancelled) return;
          setMessage("Your data top-up is complete.");
          setState("success");
          return;
        }
        if (!orderId) throw new Error("Order reference is missing.");
        await verifyPaystackPayment({ data: { orderId, reference } });
        await fulfillPaidOrder({ data: { orderId } });
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const order = await getOrderStatus({ data: { orderId, paymentReference: reference } });
          if (cancelled) return;
          if (
            order.status === "completed" &&
            order.iccid &&
            order.qrCodeUrl &&
            order.activationCode
          ) {
            setEsim({
              email: order.email,
              planLabel: `${order.packageName ?? "eSIM"} · ${order.dataMb ? formatData(order.dataMb) : ""} / ${order.validityDays ?? ""} days`,
              iccid: order.iccid,
              smdp: order.smdpAddress ?? "",
              activationCode: order.activationCode,
              qrUrl: order.qrCodeUrl,
            });
            setState("ready");
            return;
          }
          if (order.status === "failed")
            throw new Error("Your eSIM order failed upstream. Support has been notified.");
          setMessage("Payment confirmed. Preparing your eSIM…");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        throw new Error(
          "Payment succeeded, but provisioning is taking longer than expected. Check your email or contact support.",
        );
      } catch (cause) {
        if (!cancelled) {
          setState("error");
          setMessage(cause instanceof Error ? cause.message : "Payment confirmation failed.");
        }
      }
    }
    void confirm();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="account-page">
      <div className="account-card account-shell">
        <p className="eyebrow">SECURE CHECKOUT</p>
        <h1>
          {state === "ready"
            ? "Your eSIM is ready"
            : state === "success"
              ? "Top-up complete"
              : state === "error"
                ? "We need your attention"
                : "Finishing your order"}
        </h1>
        {state === "loading" && <Loader2 className="mt-6 animate-spin" />}
        {state !== "ready" && <p className="account-muted">{message}</p>}
        {state === "success" && (
          <Button asChild>
            <a href="/account">Return to account</a>
          </Button>
        )}
        {state === "error" && (
          <Button asChild>
            <a href="mailto:support@elango.africa">Contact support</a>
          </Button>
        )}
      </div>
      <EsimReadyDialog
        esim={esim}
        onOpenChange={(open) => {
          if (!open) window.location.assign("/");
        }}
      />
    </main>
  );
}

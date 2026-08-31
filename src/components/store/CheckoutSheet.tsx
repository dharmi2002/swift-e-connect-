import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  CreditCard,
  Headphones,
  Loader2,
  Mail,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatData, formatUsd, type Package } from "@/lib/packages";
import { placeOrder, getOrderStatus } from "@/services/order.server";
import { StripePaymentForm } from "./StripePaymentForm";
import type { EsimResult } from "./EsimReadyDialog";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email")
  .max(255);

const devices = [
  { id: "ios", label: "iPhone / iPad" },
  { id: "android", label: "Android" },
] as const;

const payments = [
  { id: "mpesa", label: "M-Pesa", hint: "Safaricom mobile money" },
  { id: "airtel", label: "Airtel Money", hint: "Mobile money" },
  { id: "paystack", label: "Card via Paystack", hint: "Visa / Mastercard" },
  { id: "stripe", label: "Card via Stripe", hint: "Visa / Mastercard / Amex" },
] as const;

const trust = [
  { icon: Mail, label: "Instant email delivery" },
  { icon: ShieldCheck, label: "No hidden roaming charges" },
  { icon: Headphones, label: "24/7 WhatsApp support" },
];

/** Poll order status via server function until completed/failed */
async function pollUntilReady(
  orderId: string,
  maxAttempts = 30,
  intervalMs = 2000,
): Promise<Omit<EsimResult, "email">> {
  for (let i = 0; i < maxAttempts; i++) {
    const order = await getOrderStatus({ data: { orderId } });

    if (order.status === "completed" && order.iccid && order.qrCodeUrl && order.activationCode) {
      const dataLabel = order.dataMb ? formatData(order.dataMb) : "";
      const planLabel = order.packageName
        ? `${order.packageName} · ${dataLabel} / ${order.validityDays} days`
        : "eSIM";
      return {
        planLabel,
        iccid: order.iccid,
        smdp: order.smdpAddress || "consumer.rsp.passportsim.io",
        activationCode: order.activationCode,
        qrUrl: order.qrCodeUrl,
      };
    }

    if (order.status === "failed") throw new Error("Order failed upstream");

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Order timed out — check your email for delivery");
}

export function CheckoutSheet({
  pkg,
  defaultEmail,
  onOpenChange,
  onComplete,
}: {
  pkg: Package | null;
  defaultEmail?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onComplete: (esim: EsimResult) => void;
}) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [device, setDevice] = useState<string>("ios");
  const [error, setError] = useState<string | null>(null);
  const [showStripeForm, setShowStripeForm] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (pkg) {
      setStep(1);
      setError(null);
      setShowStripeForm(false);
      setEmail((current) => current || defaultEmail || "");
    }
    return () => abortRef.current?.abort();
  }, [pkg, defaultEmail]);

  const purchase = useMutation({
    mutationFn: async (input: { paymentMethod: string; stripePaymentIntentId?: string }) => {
      if (!pkg) throw new Error("No plan selected");

      // 1. Create order via server function → eSIMAccess
      const { orderId } = await placeOrder({
        data: {
          email: email.trim(),
          packageCode: pkg.code,
          deviceType: device,
          paymentMethod: input.paymentMethod,
          stripePaymentIntentId: input.stripePaymentIntentId,
        },
      });

      // 2. Poll until webhook delivers the eSIM profile
      const esim = await pollUntilReady(orderId);

      // If planLabel wasn't populated from polling, build from local data
      if (esim.planLabel === "eSIM") {
        esim.planLabel = `${pkg.name} · ${formatData(pkg.data_mb)} / ${pkg.validity_days} days`;
      }

      return { ...esim, email: email.trim() } satisfies EsimResult;
    },
    onSuccess: (esim) => {
      onOpenChange(false);
      onComplete(esim);
    },
    onError: (err) => {
      const msg =
        err instanceof Error ? err.message : "Payment couldn't be completed. Please try again.";
      toast.error(msg);
    },
  });

  const goToPayment = () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setError(null);
    setStep(2);
  };

  return (
    <Sheet open={!!pkg} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl sm:mx-auto sm:max-w-lg"
      >
        {pkg && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="min-w-0 truncate">
                  {pkg.flag_emoji} {pkg.name}
                </span>
                <span className="shrink-0 text-primary">{formatUsd(pkg.retail_price_usd)}</span>
              </SheetTitle>
              <SheetDescription>
                {formatData(pkg.data_mb)} · {pkg.validity_days} days · Step {step} of 2
              </SheetDescription>
            </SheetHeader>

            {step === 1 ? (
              <div className="space-y-5 pb-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email for QR code delivery</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={255}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 text-base"
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Device type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {devices.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDevice(d.id)}
                        className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors ${
                          device === d.id
                            ? "border-primary bg-accent text-accent-foreground"
                            : "bg-card hover:bg-muted"
                        }`}
                      >
                        <Smartphone className="h-4 w-4 shrink-0" /> {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button variant="hero" size="xl" className="w-full" onClick={goToPayment}>
                  Continue to payment
                </Button>
              </div>
            ) : showStripeForm ? (
              <div className="pb-2">
                <StripePaymentForm
                  packageCode={pkg.code}
                  amountUsd={pkg.retail_price_usd}
                  onBack={() => setShowStripeForm(false)}
                  onPaid={(stripePaymentIntentId) =>
                    purchase.mutate({ paymentMethod: "stripe", stripePaymentIntentId })
                  }
                />
                {purchase.isPending && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p>Provisioning your eSIM — this takes a few seconds…</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5 pb-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>

                <div className="grid gap-2">
                  {payments.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={purchase.isPending}
                      onClick={() =>
                        p.id === "stripe"
                          ? setShowStripeForm(true)
                          : purchase.mutate({ paymentMethod: p.id })
                      }
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <CreditCard className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.hint}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold">
                        {formatUsd(pkg.retail_price_usd)}
                      </span>
                    </button>
                  ))}
                </div>

                {purchase.isPending && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p>Provisioning your eSIM — this takes a few seconds…</p>
                  </div>
                )}
              </div>
            )}

            <ul className="grid gap-2 border-t pt-4">
              {trust.map((t) => (
                <li key={t.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <t.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">{t.label}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

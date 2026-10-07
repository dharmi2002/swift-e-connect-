import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStripe } from "@/integrations/stripe/client";
import { createPaymentIntent } from "@/services/payment.server";
import { formatUsd } from "@/lib/packages";

export function StripePaymentForm({
  packageCode,
  amountUsd,
  onBack,
  onPaid,
  createIntent,
}: {
  packageCode: string;
  amountUsd: number;
  onBack: () => void;
  onPaid: (paymentIntentId: string) => void;
  /** Override how the client secret is fetched — defaults to a single-package intent. */
  createIntent?: () => Promise<{ clientSecret: string }>;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const getIntent = createIntent ?? (() => createPaymentIntent({ data: { packageCode } }));
    getIntent()
      .then((res) => {
        if (!cancelled) setClientSecret(res.clientSecret);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't start payment — please try again.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageCode]);

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" className="w-full" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparing secure payment…
      </div>
    );
  }

  return (
    <Elements stripe={getStripe()} options={{ clientSecret }}>
      <CardForm amountUsd={amountUsd} onBack={onBack} onPaid={onPaid} />
    </Elements>
  );
}

function CardForm({
  amountUsd,
  onBack,
  onPaid,
}: {
  amountUsd: number;
  onBack: () => void;
  onPaid: (paymentIntentId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setSubmitting(false);

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed — please check your card details.");
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      onPaid(paymentIntent.id);
      return;
    }

    setError("Payment wasn't completed — please try again.");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <PaymentElement />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        variant="hero"
        size="xl"
        className="w-full"
        disabled={!stripe || submitting}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Pay {formatUsd(amountUsd)}
      </Button>
    </form>
  );
}

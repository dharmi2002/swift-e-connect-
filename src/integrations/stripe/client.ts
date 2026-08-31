import { loadStripe, type Stripe } from "@stripe/stripe-js";

let _stripePromise: Promise<Stripe | null> | undefined;

export function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    const key = import.meta.env["VITE_STRIPE_PUBLISHABLE_KEY"];
    if (!key) {
      console.error("[Stripe] Missing VITE_STRIPE_PUBLISHABLE_KEY. Set it in your .env file.");
      return Promise.resolve(null);
    }
    _stripePromise = loadStripe(key);
  }
  return _stripePromise;
}

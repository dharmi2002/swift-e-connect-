// Server-side Stripe client — uses the secret key, never expose to client code.
import Stripe from "stripe";

function createStripeClient(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY. Set it in your .env file.");
  return new Stripe(key);
}

let _stripe: Stripe | undefined;

export const stripe = new Proxy({} as Stripe, {
  get(_, prop, receiver) {
    if (!_stripe) _stripe = createStripeClient();
    return Reflect.get(_stripe, prop, receiver);
  },
});

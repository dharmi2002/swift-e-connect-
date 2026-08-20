/**
 * HMAC-SHA256 signature verification for eSIMAccess webhooks.
 * The upstream sends an `RT-Signature` header computed as
 * HMAC-SHA256(WEBHOOK_SECRET, rawBody).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const WEBHOOK_SECRET = () => {
  const s = process.env["ESIM_ACCESS_WEBHOOK_SECRET"];
  if (!s) throw new Error("Missing ESIM_ACCESS_WEBHOOK_SECRET");
  return s;
};

export function verifySignature(rawBody: string, signature: string): boolean {
  const expected = createHmac("sha256", WEBHOOK_SECRET()).update(rawBody).digest("hex");

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

import { describe, expect, it } from "vitest";
import { isPaymentSuccessful } from "./payment.server";

describe("payment fulfillment guard", () => {
  const payment = { status: "success", reference: "EL-123", amount: 450 };

  it("requires successful status, matching reference, and exact amount", () => {
    expect(isPaymentSuccessful(payment, 450, "EL-123")).toBe(true);
    expect(isPaymentSuccessful({ ...payment, amount: 449 }, 450, "EL-123")).toBe(false);
    expect(isPaymentSuccessful(payment, 450, "EL-other")).toBe(false);
    expect(isPaymentSuccessful({ ...payment, status: "failed" }, 450, "EL-123")).toBe(false);
  });
});

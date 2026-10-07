import { describe, expect, it } from "vitest";
import { getSalesChatReply } from "./sales-chat";

describe("getSalesChatReply", () => {
  it("guides African plan shoppers toward the catalog", () => {
    expect(getSalesChatReply("I need data in Kenya")).toContain("local African plans");
  });

  it("supports team sales conversations", () => {
    expect(getSalesChatReply("I need 20 eSIMs for employees")).toContain("business account");
  });

  it("answers direct eSIM compatibility questions", () => {
    const reply = getSalesChatReply("How do I know if my phone can take eSIM?");
    expect(reply).toContain("carrier-unlocked");
    expect(reply).toContain("EID");
    expect(reply).toContain("Check device");
  });

  it("does not collect sensitive payment or account secrets", () => {
    expect(getSalesChatReply("What is my OTP and card number?")).toContain("cannot collect");
  });

  it("discloses the AI role when the intent is unclear", () => {
    expect(getSalesChatReply("hello")).toContain("support phone number is not configured");
  });
});

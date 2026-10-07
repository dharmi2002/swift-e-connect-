import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPhoneOtp, sendPhoneOtp } from "./twilio-verify.server";

describe("Twilio phone verification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects non-E.164 phone numbers before making a request", async () => {
    await expect(sendPhoneOtp("0700000000")).rejects.toThrow("international format");
  });

  it("starts an SMS verification", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "secret");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA123");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: "pending" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendPhoneOtp("+254 700 000 000")).resolves.toEqual({
      sent: true,
      phone: "+254700000000",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/Services/VA123/Verifications"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts only an approved verification check", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "secret");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA123");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ status: "approved" }), { status: 200 })),
    );
    await expect(checkPhoneOtp("+254700000000", "123456")).resolves.toEqual({
      verified: true,
      phone: "+254700000000",
    });
  });
});

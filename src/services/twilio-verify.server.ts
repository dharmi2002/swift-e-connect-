import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { allowRequest } from "@/lib/rate-limit";

type TwilioResponse = { status?: string; message?: string };

function twilioConfig() {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const serviceSid = process.env["TWILIO_VERIFY_SERVICE_SID"];
  if (!accountSid || !authToken || !serviceSid) {
    throw new Error(
      "Phone verification is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID.",
    );
  }
  return { accountSid, authToken, serviceSid };
}

function normalizePhone(phone: string): string {
  const value = phone.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error(
      "Enter a valid phone number in international format, for example +254700000000.",
    );
  }
  return value;
}

async function callTwilio(path: string, values: Record<string, string>): Promise<TwilioResponse> {
  const { accountSid, authToken } = twilioConfig();
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${twilioConfig().serviceSid}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(values),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as TwilioResponse;
  if (!response.ok)
    throw new Error(payload.message || "Twilio could not process the verification request.");
  return payload;
}

export async function sendPhoneOtp(phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  if (!allowRequest(`twilio:send:${phone}`, 5, 15 * 60_000))
    throw new Error("Too many verification requests. Try again later.");
  const result = await callTwilio("Verifications", { To: phone, Channel: "sms" });
  return { sent: result.status === "pending", phone };
}

export const requestPhoneOtp = createServerFn({ method: "POST" })
  .validator((input: { phone: string }) => input)
  .handler(async ({ data }) => sendPhoneOtp(data.phone));

export async function checkPhoneOtp(phoneInput: string, code: string) {
  const phone = normalizePhone(phoneInput);
  const normalizedCode = code.trim();
  if (!/^\d{4,10}$/.test(normalizedCode))
    throw new Error("Enter the numeric verification code from SMS.");
  const result = await callTwilio("VerificationCheck", { To: phone, Code: normalizedCode });
  if (result.status !== "approved") throw new Error("That verification code is not valid.");
  return { verified: true, phone };
}

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .validator((input: { phone: string; code: string }) => input)
  .handler(async ({ data }) => checkPhoneOtp(data.phone, data.code));

export const registerWithVerifiedPhone = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string; phone: string; code: string }) => input)
  .handler(async ({ data }) => {
    await checkPhoneOtp(data.phone, data.code);
    if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) throw new Error("Enter a valid email address.");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters.");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: false,
      phone: normalizePhone(data.phone),
      phone_confirm: true,
      user_metadata: { phone_verified_by: "twilio_verify" },
    });
    if (error || !created.user) {
      if (error?.message.toLowerCase().includes("already been registered")) {
        throw new Error("An account with this email already exists. Sign in instead.");
      }
      throw new Error(error?.message || "Unable to create your account.");
    }
    return { userId: created.user.id, email: created.user.email };
  });

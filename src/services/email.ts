/**
 * Brevo (formerly Sendinblue) transactional email service.
 *
 * - Customer eSIM delivery email with QR code
 * - Admin low-balance alert
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_KEY = () => {
  const k = process.env["BREVO_API_KEY"];
  if (!k) throw new Error("Missing BREVO_API_KEY");
  return k;
};

const FROM_EMAIL = process.env["FROM_EMAIL"] || "noreply@passportsim.io";
const FROM_NAME = process.env["FROM_NAME"] || "PassportSIM";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrevoRecipient {
  email: string;
  name?: string;
}

interface BrevoPayload {
  sender: { email: string; name: string };
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}

function safeImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return escapeHtml(url.toString());
  } catch {
    return "";
  }
}

function safeSubjectPart(value: string): string {
  return value.replace(/[\r\n]/g, " ").slice(0, 120);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function sendEmail(payload: BrevoPayload): Promise<void> {
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_KEY(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export interface EsimDeliveryParams {
  customerEmail: string;
  packageName: string;
  dataMb: number;
  validityDays: number;
  iccid: string;
  qrCodeUrl: string;
  activationCode: string;
  smdpAddress: string;
}

export async function sendOrganizationInvitationEmail(params: {
  recipientEmail: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
}): Promise<void> {
  const organizationName = escapeHtml(params.organizationName);
  const role = escapeHtml(params.role);
  const inviteUrl = escapeHtml(params.inviteUrl);
  const html = `
<!DOCTYPE html><html lang="en"><body style="font-family:Arial,sans-serif;color:#171725;line-height:1.6">
<div style="max-width:560px;margin:32px auto;padding:32px;border:1px solid #e9e4ef;border-radius:16px">
<h1>Join ${organizationName} on eLango</h1>
<p>You have been invited as <strong>${role}</strong> to help manage company eSIM lines.</p>
<p><a href="${inviteUrl}" style="display:inline-block;padding:12px 18px;background:#7f3cf0;color:#fff;border-radius:8px;text-decoration:none">Accept invitation</a></p>
<p style="color:#716b7c;font-size:13px">This invitation expires in 7 days and can only be accepted by this email address.</p>
</div></body></html>`.trim();
  await sendEmail({
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: params.recipientEmail }],
    subject: `You’re invited to ${safeSubjectPart(params.organizationName)} on eLango`,
    htmlContent: html,
  });
}

/** Send eSIM delivery email with embedded QR and activation details */
export async function sendEsimDeliveryEmail(params: EsimDeliveryParams): Promise<void> {
  const dataLabel =
    params.dataMb >= 1024 ? `${Math.round(params.dataMb / 1024)} GB` : `${params.dataMb} MB`;

  const packageName = escapeHtml(params.packageName);
  const qrCodeUrl = safeImageUrl(params.qrCodeUrl);
  const smdpAddress = escapeHtml(params.smdpAddress);
  const activationCode = escapeHtml(params.activationCode);
  const iccid = escapeHtml(params.iccid);
  const lpaString = escapeHtml(`LPA:1$${params.smdpAddress}$${params.activationCode}`);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:32px;margin-bottom:32px">
  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:32px;text-align:center">
    <h1 style="margin:0;color:#fff;font-size:22px">Your eSIM is Ready! 🎉</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px">${packageName} · ${dataLabel} · ${params.validityDays} days</p>
  </td></tr>
  <tr><td style="padding:32px;text-align:center">
    <p style="margin:0 0 16px;font-size:15px;color:#334155">Scan this QR code in your phone's eSIM settings:</p>
    <img src="${qrCodeUrl}" alt="eSIM QR Code" width="220" height="220" style="border:1px solid #e2e8f0;border-radius:8px" />
  </td></tr>
  <tr><td style="padding:0 32px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;padding:16px">
      <tr><td style="padding:12px 16px">
        <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">SM-DP+ Address</p>
        <p style="margin:0;font-size:14px;font-family:monospace;color:#0f172a;word-break:break-all">${smdpAddress}</p>
      </td></tr>
      <tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Activation Code</p>
        <p style="margin:0;font-size:14px;font-family:monospace;color:#0f172a;word-break:break-all">${activationCode}</p>
      </td></tr>
      <tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">LPA String (copy & paste)</p>
        <p style="margin:0;font-size:14px;font-family:monospace;color:#0f172a;word-break:break-all">${lpaString}</p>
      </td></tr>
      <tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">ICCID</p>
        <p style="margin:0;font-size:14px;font-family:monospace;color:#0f172a">${iccid}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 32px;text-align:center">
    <p style="margin:0;font-size:13px;color:#94a3b8">Need help? Reply to this email or WhatsApp us anytime.</p>
  </td></tr>
  <tr><td style="padding:16px 32px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:12px;color:#94a3b8">© ${new Date().getFullYear()} PassportSIM</p>
  </td></tr>
</table>
</body>
</html>`.trim();

  await sendEmail({
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: params.customerEmail }],
    subject: `Your ${safeSubjectPart(params.packageName)} eSIM is ready — install now`,
    htmlContent: html,
  });
}

/** Admin alert when wallet balance is low */
export async function sendAdminLowBalanceAlert(
  currentBalance: number,
  threshold: number,
): Promise<void> {
  // Load admin email from system_settings
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: setting } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "admin_email")
    .single();

  const adminEmail = typeof setting?.value === "string" ? setting.value : "ops@passportsim.io";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:sans-serif">
<div style="max-width:480px;margin:32px auto;padding:24px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px">
  <h2 style="margin:0 0 12px;color:#991b1b">⚠️ Low Wallet Balance</h2>
  <p style="margin:0 0 8px;color:#7f1d1d">Your eSIMAccess wallet balance has dropped below the alert threshold.</p>
  <table style="margin:12px 0;font-size:14px;color:#7f1d1d">
    <tr><td style="padding:4px 12px 4px 0;font-weight:600">Current Balance:</td><td>$${currentBalance.toFixed(2)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:600">Threshold:</td><td>$${threshold.toFixed(2)}</td></tr>
  </table>
  <p style="margin:0;color:#991b1b;font-size:13px">Top up your wallet at <a href="https://esimaccess.com" style="color:#991b1b">esimaccess.com</a> to avoid failed checkouts.</p>
</div>
</body>
</html>`.trim();

  await sendEmail({
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: adminEmail }],
    subject: `🚨 PassportSIM: Wallet balance low ($${currentBalance.toFixed(2)})`,
    htmlContent: html,
  });
}

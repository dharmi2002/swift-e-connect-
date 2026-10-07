import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, LogOut, Mail, Plus, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { packagesQuery, formatData, formatUsd } from "@/lib/packages";
import { canViewBilling } from "@/lib/business";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptOrganizationInvitation,
  assignOrganizationLine,
  createOrganization,
  getBusinessWorkspace,
  inviteOrganizationMember,
  placeBusinessOrder,
  updateOrganizationLineStatus,
} from "@/services/business.server";
import { topUpOrganizationLine } from "@/services/topup.server";
import { registerWithVerifiedPhone, requestPhoneOtp } from "@/services/twilio-verify.server";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Business accounts · eLango" }] }),
  component: AccountPage,
});

type Workspace = Awaited<ReturnType<typeof getBusinessWorkspace>>;

function AccountPage() {
  const [session, setSession] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const packages = useQuery(packagesQuery);

  const loadWorkspace = useCallback(async () => {
    try {
      const next = await getBusinessWorkspace({ data: { organizationId } });
      setWorkspace(next);
      if (!organizationId && next.organizations[0]) setOrganizationId(next.organizations[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the workspace.");
    }
  }, [organizationId]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) void loadWorkspace();
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void loadWorkspace();
      else setWorkspace(null);
    });
    return () => data.subscription.unsubscribe();
  }, [loadWorkspace]);

  const selectedOrganization = useMemo(
    () =>
      workspace?.organizations.find((organization) => organization.id === organizationId) ??
      workspace?.organizations[0],
    [workspace, organizationId],
  );

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (mode === "sign-up" && (!otpSent || !otp.trim())) {
      setError("Send and enter the SMS verification code before creating the account.");
      return;
    }
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await registerWithVerifiedPhone({ data: { email, password, phone, code: otp } }).then(
            async (created) => {
              const signIn = await supabase.auth.signInWithPassword({ email, password });
              return { data: { session: signIn.data.session }, error: signIn.error, created };
            },
          );
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === "sign-up" && result.data.session) {
      try {
        await createOrganization({ data: { name: organizationName } });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Organization setup failed.");
        return;
      }
    }
    setMessage(
      mode === "sign-up" && !result.data.session
        ? "Check your email to confirm your account, then return here to finish setup."
        : "You’re signed in.",
    );
  }

  async function sendPhoneOtp() {
    setError("");
    try {
      await requestPhoneOtp({ data: { phone } });
      setOtpSent(true);
      setMessage("Verification code sent by SMS.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send verification code.");
    }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const result = await inviteOrganizationMember({
        data: {
          organizationId: selectedOrganization!.id,
          email: String(form.get("inviteEmail")),
          role: String(form.get("inviteRole")),
        },
      });
      setMessage(`Invitation ready: ${result.inviteUrl}`);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation failed.");
    }
  }

  async function purchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const result = await placeBusinessOrder({
        data: {
          organizationId: selectedOrganization!.id,
          email,
          packageCode: String(form.get("packageCode")),
          deviceType: "unknown",
          paymentMethod: "paystack",
          quantity: Number(form.get("quantity")),
        },
      });
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order failed.");
    }
  }

  async function topUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await topUpOrganizationLine({
        data: {
          lineId: String(form.get("lineId")),
          packageCode: String(form.get("topupPackageCode")),
        },
      });
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Top-up failed.");
    }
  }

  async function acceptInvite() {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    try {
      const result = await acceptOrganizationInvitation({ data: { token } });
      setOrganizationId(result.organizationId);
      setMessage("Invitation accepted.");
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation could not be accepted.");
    }
  }

  if (loading)
    return (
      <AccountShell>
        <p>Loading account…</p>
      </AccountShell>
    );
  if (!session)
    return (
      <AccountShell>
        <div className="account-card">
          <p className="eyebrow">BUSINESS CONTROL CENTER</p>
          <h1>
            {mode === "sign-in" ? "Sign in to manage your eSIM fleet" : "Create a company account"}
          </h1>
          <p className="account-muted">
            Buy lines in bulk, assign them to employees, and suspend access when plans change.
          </p>
          <form className="account-form" onSubmit={submitAuth}>
            <Input
              required
              type="email"
              placeholder="Work email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              required
              minLength={8}
              type="password"
              placeholder="Password (8+ characters)"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {mode === "sign-up" && (
              <>
                <Input
                  required
                  placeholder="Company name"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                />
                <div className="account-otp-row">
                  <Input
                    required
                    type="tel"
                    placeholder="Phone: +254700000000"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => void sendPhoneOtp()}>
                    {otpSent ? "Resend code" : "Send OTP"}
                  </Button>
                </div>
                {otpSent && (
                  <div className="account-otp-row">
                    <Input
                      required
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="SMS verification code"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                    />
                    <span className="account-muted">
                      Verified securely when you create the account.
                    </span>
                  </div>
                )}
              </>
            )}
            <Button type="submit">{mode === "sign-in" ? "Sign in" : "Create account"}</Button>
          </form>
          <button
            className="account-text-button"
            type="button"
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          >
            {mode === "sign-in" ? "Create a business account" : "Already have an account? Sign in"}
          </button>
          {message && <p className="account-success">{message}</p>}
          {error && <p className="account-error">{error}</p>}
        </div>
      </AccountShell>
    );

  const role = selectedOrganization?.role ?? "employee";
  const canManage = ["owner", "admin", "manager"].includes(role);
  const canTopUp = canViewBilling(role as "owner" | "admin" | "billing" | "manager" | "employee");
  const canBuy = canManage;
  return (
    <AccountShell>
      <div className="account-topbar">
        <div>
          <p className="eyebrow">BUSINESS CONTROL CENTER</p>
          <h1>{selectedOrganization?.name ?? "Your organizations"}</h1>
        </div>
        <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
          <LogOut /> Sign out
        </Button>
      </div>
      {workspace?.organizations.length ? (
        <select
          className="account-select"
          value={selectedOrganization?.id}
          onChange={(event) => setOrganizationId(event.target.value)}
        >
          {workspace.organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name} · {organization.role}
            </option>
          ))}
        </select>
      ) : (
        <div className="account-card">
          <h2>Create your first organization</h2>
          <form
            className="account-form"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await createOrganization({ data: { name: organizationName } });
                await loadWorkspace();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Unable to create organization.");
              }
            }}
          >
            <Input
              required
              placeholder="Company name"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
            />
            <Button type="submit">
              <Plus /> Create organization
            </Button>
          </form>
        </div>
      )}
      {selectedOrganization && (
        <>
          <div className="account-grid">
            <section className="account-card">
              <div className="account-card-heading">
                <h2>Team</h2>
                <UserPlus />
              </div>
              <p className="account-muted">
                Invite employees and give managers the least access they need.
              </p>
              {canManage && (
                <form className="account-form" onSubmit={invite}>
                  <Input
                    name="inviteEmail"
                    required
                    type="email"
                    placeholder="employee@company.com"
                  />
                  <select name="inviteRole" className="account-select">
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="billing">Billing</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button type="submit">Send invite</Button>
                </form>
              )}
              <div className="account-list">
                {workspace?.members.map((member) => (
                  <div className="account-row" key={member.user_id}>
                    <span>{member.email ?? `${member.user_id.slice(0, 8)}…`}</span>
                    <b>{member.role}</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="account-card">
              <div className="account-card-heading">
                <h2>Recent orders</h2>
                <span className="account-muted">Last 25</span>
              </div>
              {workspace?.orders.length ? (
                <div className="account-table-wrap">
                  <table className="account-table">
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Quantity</th>
                        <th>Payment</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.orders.map((order) => (
                        <tr key={order.id}>
                          <td>{order.package_code}</td>
                          <td>{order.quantity}</td>
                          <td>{order.payment_status}</td>
                          <td>
                            <span className="account-status">{order.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="account-muted">No organization orders yet.</p>
              )}
            </section>
            <section className="account-card">
              <div className="account-card-heading">
                <h2>Buy eSIM lines</h2>
                <ShieldCheck />
              </div>
              {canBuy ? (
                <form className="account-form" onSubmit={purchase}>
                  <select name="packageCode" className="account-select" required>
                    {(packages.data ?? []).map((pkg) => (
                      <option key={pkg.code} value={pkg.code}>
                        {pkg.name} · {formatData(pkg.data_mb)} · {formatUsd(pkg.retail_price_usd)}
                      </option>
                    ))}
                  </select>
                  <Input
                    name="quantity"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={1}
                    required
                  />
                  <Button type="submit">Buy and assign later</Button>
                </form>
              ) : (
                <p className="account-muted">
                  Only owners, admins, and managers can purchase lines.
                </p>
              )}
            </section>
          </div>
          <section className="account-card">
            <div className="account-card-heading">
              <h2>eSIM lines</h2>
              <Button variant="ghost" onClick={() => void loadWorkspace()}>
                <RefreshCw /> Refresh
              </Button>
            </div>
            {canTopUp && (workspace?.lines.length ?? 0) > 0 && (
              <form className="account-form account-topup-form" onSubmit={topUp}>
                <select name="lineId" className="account-select" required>
                  <option value="">Choose an active line</option>
                  {workspace?.lines
                    .filter((line) => !["revoked", "suspended"].includes(line.status))
                    .map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.label ?? line.iccid}
                      </option>
                    ))}
                </select>
                <select name="topupPackageCode" className="account-select" required>
                  {(packages.data ?? []).map((pkg) => (
                    <option key={pkg.code} value={pkg.code}>
                      {pkg.name} · {formatData(pkg.data_mb)}
                    </option>
                  ))}
                </select>
                <Button type="submit">Top up line</Button>
              </form>
            )}
            {workspace?.lines.length ? (
              <div className="account-table-wrap">
                <table className="account-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Status</th>
                      <th>Usage</th>
                      <th>Expires</th>
                      <th>Assigned to</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.label ?? line.iccid}</td>
                        <td>
                          <span className="account-status">{line.status}</span>
                        </td>
                        <td>
                          {formatData(line.data_used_mb ?? 0)} / {formatData(line.data_mb ?? 0)}
                        </td>
                        <td>
                          {line.expires_at ? new Date(line.expires_at).toLocaleDateString() : "—"}
                        </td>
                        <td>
                          {canManage ? (
                            <select
                              className="account-mini-select"
                              value={line.assigned_to ?? ""}
                              onChange={async (event) => {
                                await assignOrganizationLine({
                                  data: { lineId: line.id, userId: event.target.value || null },
                                });
                                await loadWorkspace();
                              }}
                            >
                              <option value="">Unassigned</option>
                              {workspace?.members
                                .filter((member) => member.status === "active")
                                .map((member) => (
                                  <option key={member.user_id} value={member.user_id}>
                                    {member.email ?? `${member.user_id.slice(0, 8)}…`}
                                  </option>
                                ))}
                            </select>
                          ) : line.assigned_to ? (
                            `${line.assigned_to.slice(0, 8)}…`
                          ) : (
                            "Unassigned"
                          )}
                        </td>
                        <td>
                          {canManage && (
                            <select
                              className="account-mini-select"
                              value={line.status}
                              onChange={async (event) => {
                                await updateOrganizationLineStatus({
                                  data: { lineId: line.id, status: event.target.value },
                                });
                                await loadWorkspace();
                              }}
                            >
                              <option value="unassigned">Unassigned</option>
                              <option value="assigned">Assigned</option>
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                              <option value="revoked">Revoked</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="account-muted">
                No lines yet. Buy a batch and they will appear after supplier confirmation.
              </p>
            )}
          </section>
          {canManage && (
            <Button variant="outline" onClick={() => void acceptInvite()}>
              <Mail /> Accept invitation from this browser
            </Button>
          )}
        </>
      )}
    </AccountShell>
  );
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-page">
      <a className="account-back" href="/">
        ← Back to eLango
      </a>
      <main className="account-shell">{children}</main>
    </div>
  );
}

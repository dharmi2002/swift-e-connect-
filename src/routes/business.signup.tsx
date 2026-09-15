import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/business/signup")({
  head: () => ({
    meta: [{ title: "Register your business — PassportSIM" }],
  }),
  component: BusinessSignupPage,
});

const businessSignupSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(160),
  fullName: z.string().trim().min(1, "Your name is required").max(120),
  email: z
    .string()
    .trim()
    .min(1, "Company email is required")
    .email("Enter a valid email")
    .max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function BusinessSignupPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = businessSignupSchema.safeParse({ companyName, fullName, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setError(null);
    setPending(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.fullName,
          account_type: "business",
          company_name: parsed.data.companyName,
        },
      },
    });

    setPending(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      navigate({ to: "/business" });
      return;
    }

    // Email confirmation is required before a session is issued
    setConfirmationSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">PassportSIM for Business</span>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Register your business</CardTitle>
            <CardDescription>
              Manage employee eSIMs or buy plans in bulk from one dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {confirmationSent ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to <span className="font-medium">{email}</span>.
                  Confirm your email, then sign in below.
                </p>
                <Button asChild variant="hero" className="w-full">
                  <Link to="/login">Go to sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company name</Label>
                  <Input
                    id="companyName"
                    autoComplete="organization"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Ltd"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Your name</Label>
                  <Input
                    id="fullName"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Admin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Company email</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@acme.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full"
                  disabled={pending}
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create business account
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {!confirmationSent && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="font-medium text-primary underline underline-offset-4">
              Sign in
            </Link>
            <br />
            Buying an eSIM for yourself?{" "}
            <Link to="/signup" className="font-medium text-primary underline underline-offset-4">
              Create a personal account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe2, Search, Smartphone, Zap, ShieldCheck, Mail, Headphones, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PackageCard } from "@/components/store/PackageCard";
import { CheckoutSheet } from "@/components/store/CheckoutSheet";
import { EsimReadyDialog, type EsimResult } from "@/components/store/EsimReadyDialog";
import { CompatibilityDialog } from "@/components/store/CompatibilityDialog";
import { packagesQuery, type Package } from "@/lib/packages";
import { useAuth } from "@/hooks/use-auth";
import { getMyOrganization } from "@/services/organization.server";
import heroImage from "@/assets/hero-traveler.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PassportSIM — Travel eSIMs for Africa & 100+ Countries" },
      {
        name: "description",
        content:
          "Buy instant travel eSIMs for Kenya, Nigeria, South Africa, Dubai, Europe and the USA. QR delivered by email in seconds — pay with M-Pesa or card.",
      },
      { property: "og:title", content: "PassportSIM — Travel eSIMs for Africa & 100+ Countries" },
      {
        property: "og:description",
        content: "Instant digital eSIMs delivered in seconds. No physical SIM card swapping.",
      },
    ],
  }),
  component: Home,
});

const quickFilters = ["East Africa", "Dubai", "Europe", "USA"];

function Home() {
  const { data, isLoading } = useQuery(packagesQuery);
  const { user, signOut } = useAuth();
  const orgQuery = useQuery({
    queryKey: ["my-organization"],
    queryFn: () => getMyOrganization(),
    enabled: !!user,
  });
  const [search, setSearch] = useState("");
  const [showLocal, setShowLocal] = useState(false);
  const [selected, setSelected] = useState<Package | null>(null);
  const [esim, setEsim] = useState<EsimResult | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((p) =>
      `${p.location_name} ${p.name} ${p.location_code}`.toLowerCase().includes(q),
    );
  }, [data, search]);

  const countries = filtered.filter((p) => p.region_type === "country");
  const regional = filtered.filter((p) => p.region_type === "regional");

  return (
    <div className="min-h-screen bg-background font-sans">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <a href="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground">
              <Globe2 className="h-5 w-5" />
            </span>
            <span className="truncate text-lg font-extrabold tracking-tight">PassportSIM</span>
          </a>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <CompatibilityDialog>
              <Button variant="soft" size="sm">
                <Smartphone /> <span className="hidden sm:inline">Compatibility</span>
                <span className="sm:hidden">Check</span>
              </Button>
            </CompatibilityDialog>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 text-sm font-medium text-muted-foreground sm:flex">
                  <User className="h-4 w-4" /> {user.email}
                </span>
                {orgQuery.data && (
                  <Button asChild variant="soft" size="sm">
                    <Link to="/business">Business dashboard</Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => signOut()}>
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/business/signup">For Business</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild variant="hero" size="sm">
                  <Link to="/signup">Create account</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="bg-gradient-hero text-primary-foreground">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-2 md:items-center md:py-20">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-xs font-bold text-gold-foreground">
                <Zap className="h-3.5 w-3.5" /> Delivered in under 60 seconds
              </span>
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                Stay Connected Across Africa &amp; 100+ Countries
              </h1>
              <p className="mt-4 max-w-md text-base opacity-90">
                Instant digital eSIMs delivered in seconds. No physical SIM card swapping.
              </p>

              <div className="mt-6 rounded-2xl bg-card p-3 shadow-lift">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                  <Search className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxLength={60}
                    placeholder="Where are you traveling to? (e.g., Kenya, UK, UAE)"
                    className="h-12 min-w-0 border-0 bg-transparent text-base text-foreground shadow-none focus-visible:ring-0"
                    aria-label="Search destinations"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickFilters.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSearch(f)}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:brightness-95"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <CompatibilityDialog>
                <button className="mt-4 text-sm font-semibold underline underline-offset-4 opacity-90 hover:opacity-100">
                  Is your phone eSIM compatible?
                </button>
              </CompatibilityDialog>
            </div>

            <img
              src={heroImage}
              alt="Traveler using an eSIM on their phone at the airport"
              width={1200}
              height={1200}
              className="hidden aspect-square w-full rounded-3xl object-cover shadow-lift md:block"
            />
          </div>
        </section>

        <section id="plans" className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
            <div className="min-w-0">
              <h2 className="text-2xl font-extrabold tracking-tight">Choose your data plan</h2>
              <p className="text-sm text-muted-foreground">
                {filtered.length} plans available{search ? ` for “${search}”` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label htmlFor="currency" className="text-xs text-muted-foreground">
                Local currency
              </Label>
              <Switch id="currency" checked={showLocal} onCheckedChange={setShowLocal} />
            </div>
          </div>

          <Tabs defaultValue="country" className="mt-6">
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
              <TabsTrigger value="country">Single Country</TabsTrigger>
              <TabsTrigger value="regional">Regional Passes</TabsTrigger>
            </TabsList>

            <TabsContent value="country">
              <PlanGrid
                loading={isLoading}
                items={countries}
                showLocal={showLocal}
                onBuy={setSelected}
              />
            </TabsContent>
            <TabsContent value="regional">
              <PlanGrid
                loading={isLoading}
                items={regional}
                showLocal={showLocal}
                onBuy={setSelected}
              />
            </TabsContent>
          </Tabs>
        </section>

        <section className="border-t bg-card">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-3">
            {[
              {
                icon: Mail,
                title: "Instant email delivery",
                text: "QR code lands in your inbox seconds after payment.",
              },
              {
                icon: ShieldCheck,
                title: "No hidden roaming charges",
                text: "Flat prices in USD and your local currency.",
              },
              {
                icon: Headphones,
                title: "24/7 WhatsApp support",
                text: "Real humans, any timezone, before and after travel.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border p-5 shadow-card">
                <item.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-bold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} PassportSIM — eSIMs for Africa and beyond.
      </footer>

      <CheckoutSheet
        pkg={selected}
        defaultEmail={user?.email}
        onOpenChange={(open) => !open && setSelected(null)}
        onComplete={setEsim}
      />
      <EsimReadyDialog esim={esim} onOpenChange={(open) => !open && setEsim(null)} />
    </div>
  );
}

function PlanGrid({
  loading,
  items,
  showLocal,
  onBuy,
}: {
  loading: boolean;
  items: Package[];
  showLocal: boolean;
  onBuy: (pkg: Package) => void;
}) {
  if (loading) {
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="mt-10 text-center text-sm text-muted-foreground">
        No plans match that destination yet — try another country or a regional pass.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} showLocal={showLocal} onBuy={onBuy} />
      ))}
    </div>
  );
}

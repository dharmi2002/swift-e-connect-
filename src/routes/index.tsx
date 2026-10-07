import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Globe2,
  Headphones,
  Instagram,
  Layers3,
  Linkedin,
  Menu,
  MessageSquare,
  MapPinned,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Signal,
  Smartphone,
  Star,
  Twitter,
  Wifi,
  Youtube,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PackageCard } from "@/components/store/PackageCard";
import { CheckoutSheet } from "@/components/store/CheckoutSheet";
import { EsimReadyDialog, type EsimResult } from "@/components/store/EsimReadyDialog";
import { CompatibilityDialog } from "@/components/store/CompatibilityDialog";
import { filterPackages, packagesQuery, type Package } from "@/lib/packages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "eLango — Stay connected wherever you go" },
      {
        name: "description",
        content: "Flexible eSIM data for journeys across Africa and around the world.",
      },
      { property: "og:title", content: "eLango — Travel data without the roaming bills" },
    ],
  }),
  component: Home,
});

const quickFilters = ["Kenya", "Nigeria", "South Africa", "Ghana", "UAE"];

function Home() {
  const { data, isLoading } = useQuery(packagesQuery);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Package | null>(null);
  const [esim, setEsim] = useState<EsimResult | null>(null);
  const [bundleIndex, setBundleIndex] = useState(0);
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);
  const filtered = useMemo(() => filterPackages(data ?? [], search), [data, search]);
  const catalogStats = useMemo(() => {
    const packages = data ?? [];
    return {
      plans: packages.length,
      locations: new Set(packages.map((pkg) => pkg.location_code)).size,
      regionalPlans: packages.filter((pkg) => pkg.region_type !== "country").length,
    };
  }, [data]);
  const statValue = (value: number) => (isLoading ? "—" : String(value));
  const bundles = [
    {
      name: "East Africa Explorer",
      countries: "5 countries",
      price: "$18",
      data: "10 GB",
      color: "light",
    },
    {
      name: "Southeast Asia Hopper",
      countries: "8 countries",
      price: "$19",
      data: "10 GB",
      color: "pink",
    },
    {
      name: "Global Roamer",
      countries: "International coverage",
      price: "$42",
      data: "20 GB",
      color: "dark",
    },
  ];
  const bundle = bundles[bundleIndex];

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <AnnouncementBar />
      <SiteHeader />
      <main>
        <section className="hero-section">
          <div className="page-shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">TRAVEL DATA, WITHOUT THE QUEUES</p>
              <h1>
                Stay connected <span>wherever</span> you go.
              </h1>
              <p className="hero-lede">
                Flexible eSIM data for journeys across Africa and around the world. No queues, no
                roaming bills, no plastic SIM.
              </p>
              <div className="hero-search">
                <div className="search-input-wrap">
                  <Search aria-hidden="true" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    maxLength={60}
                    placeholder="Where do you need data?"
                    aria-label="Search destinations"
                  />
                </div>
                <a className="pink-button" href="#plans">
                  Find plans <ArrowRight />
                </a>
              </div>
              <div className="popular-row">
                <span>Popular:</span>
                {quickFilters.map((filter) => (
                  <button key={filter} type="button" onClick={() => setSearch(filter)}>
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="hero-visual" aria-label="eSIM connection illustration">
              <div className="hero-orbit orbit-one" />
              <div className="hero-orbit orbit-two" />
              <div className="phone-mockup">
                <div className="phone-speaker" />
                <Wifi />
                <div className="phone-check">
                  <Check />
                </div>
                <span>Connected</span>
              </div>
              <div className="server-stack">
                <span />
                <span />
                <span />
              </div>
              <div className="connection-line line-one" />
              <div className="connection-line line-two" />
              <div className="hero-glow" />
            </div>
          </div>
        </section>
        <section className="trust-section page-shell">
          <div className="stats-grid">
            <TrustStat icon={<Zap />} value={statValue(catalogStats.plans)} label="active plans" />
            <TrustStat
              icon={<Globe2 />}
              value={statValue(catalogStats.locations)}
              label="catalog locations"
            />
            <TrustStat
              icon={<ShieldCheck />}
              value={statValue(catalogStats.regionalPlans)}
              label="regional plans"
            />
            <TrustStat icon={<Headphones />} value="0" label="contracts required" />
          </div>
          <div className="network-strip">
            <span>Vodacom</span>
            <span>Safaricom</span>
            <span>Airtel</span>
            <span>MTN</span>
            <span>Etisalat</span>
            <span>Orange</span>
            <span>Vodafone</span>
            <span>T-Mobile</span>
            <span>Telkom</span>
            <span>Zain</span>
          </div>
        </section>
        <section id="plans" className="section page-shell">
          <div className="section-heading centered">
            <p className="eyebrow">TRENDING PLANS</p>
            <h2>Get an eSIM for popular destinations</h2>
            <p>Prices shown are starting points. Data only, no contract.</p>
          </div>
          <Tabs defaultValue="local" className="plans-tabs">
            <TabsList>
              <TabsTrigger value="local">Local</TabsTrigger>
              <TabsTrigger value="regional">Regional</TabsTrigger>
              <TabsTrigger value="continental">Continental</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
            </TabsList>
            {(["local", "regional", "continental", "global"] as const).map((tab) => (
              <TabsContent key={tab} value={tab}>
                <PlanGrid loading={isLoading} items={filtered} onBuy={setSelected} />
              </TabsContent>
            ))}
          </Tabs>
          <div className="center-link">
            <a href="#plans">
              See all {isLoading ? "catalog" : catalogStats.locations} locations <ArrowRight />
            </a>
          </div>
        </section>
        <section id="how-it-works" className="section pale-section">
          <div className="page-shell">
            <div className="section-heading centered">
              <p className="eyebrow">HOW IT WORKS</p>
              <h2>Four steps, about two minutes</h2>
              <p>
                Install before you fly. Your data only starts counting down when you first connect
                at your destination.
              </p>
            </div>
            <div className="steps-grid">
              <Step
                number="1"
                icon={<MapPinned />}
                title="Choose"
                text="Pick a ready-made package or build a plan around your budget."
              />
              <Step
                number="2"
                icon={<CreditCard />}
                title="Buy"
                text="Pay by card or mobile money. Your eSIM arrives immediately."
              />
              <Step
                number="3"
                icon={<QrCode />}
                title="Install"
                text="Scan the QR or tap to install. Guided steps for iOS and Android."
              />
              <Step
                number="4"
                icon={<Wifi />}
                title="Connect"
                text="Land, switch on data, and you are online."
              />
            </div>
          </div>
        </section>
        <section className="section page-shell why-grid">
          <div>
            <p className="eyebrow">WHY ELANGO</p>
            <h2>Forget roaming bills. Just travel.</h2>
            <p className="section-lede">
              Buy in the app, install before you leave, and land with data already working. Your
              home SIM stays in for calls and codes.
            </p>
            <div className="benefits-list">
              <Benefit
                title="Transparent plan pricing"
                text="See the plan price, data allowance, validity and network coverage before you buy."
              />
              <Benefit
                title="Guided installation"
                text="Follow the installation steps for iOS and Android after delivery."
              />
              <Benefit
                title="Fast, reliable networks"
                text="4G and 5G on the strongest local partner in every destination."
              />
              <Benefit
                title="Keep your home number"
                text="Your physical SIM stays in for calls and one-time codes."
              />
              <Benefit
                title="Clear support guidance"
                text="Find installation, coverage and account guidance in one place."
              />
            </div>
          </div>
          <div className="usage-card">
            <div className="usage-card-top">
              <span>Your plans</span>
              <Signal />
            </div>
            <PlanUsage name="Japan" detail="10 GB · 8 GB left" status="using now" active />
            <PlanUsage name="Southeast Asia" detail="10 GB" status="Ready · fallback" />
            <PlanUsage name="Global" detail="20 GB" status="Not installed" />
            <div className="usage-actions">
              <a href="#how-it-works">
                <QrCode /> INSTALL
              </a>
              <span>One scan, done</span>
            </div>
          </div>
        </section>
        <section id="coverage" className="section bundle-section">
          <div className="page-shell">
            <div className="section-heading">
              <p className="eyebrow">POPULAR BUNDLES</p>
              <h2>See exactly where each bundle works</h2>
            </div>
            <div className="carousel-controls">
              <button
                onClick={() => setBundleIndex((bundleIndex + bundles.length - 1) % bundles.length)}
                aria-label="Previous bundle"
              >
                <ChevronLeft />
              </button>
              <button
                onClick={() => setBundleIndex((bundleIndex + 1) % bundles.length)}
                aria-label="Next bundle"
              >
                <ChevronRight />
              </button>
              <span>
                <span className="autoplay-dot" /> Autoplay off
              </span>
            </div>
            <div className={`bundle-card ${bundle.color}`}>
              <div className="bundle-meta">
                <span className="dark-pill">REGIONAL</span>
                <b>{bundle.countries} · ONE BALANCE</b>
              </div>
              <h3>{bundle.name}</h3>
              <p>
                Cross borders without swapping plans. One regional package, one balance, no roaming
                surprises.
              </p>
              <div className="country-pills">
                <span>🇹🇿 Tanzania</span>
                <span>🇰🇪 Kenya</span>
                <span>🇺🇬 Uganda</span>
                <span>🇷🇼 Rwanda</span>
                <span>+3 more</span>
              </div>
              <div className="bundle-numbers">
                <div>
                  <b>{bundle.data}</b>
                  <small>30 days validity</small>
                </div>
                <div>
                  <b>{bundle.price}</b>
                  <small>one-off</small>
                </div>
                <div>
                  <b>{bundle.countries.split(" ")[0]}</b>
                  <small>countries served</small>
                </div>
              </div>
              <div className="bundle-actions">
                <a className="dark-button" href="#plans">
                  Buy this bundle <ArrowRight />
                </a>
                <a className="outline-button" href="#coverage">
                  View coverage
                </a>
              </div>
            </div>
          </div>
        </section>
        <section id="custom-plan" className="section page-shell custom-grid">
          <div className="custom-copy">
            <p className="eyebrow">NO FIXED BUNDLES</p>
            <h2>Customize your data around what you have.</h2>
            <p className="section-lede">
              Tell us where you are going, how long for, and what you want to spend. We size the
              plan to your budget instead of rounding you up to the next bundle.
            </p>
            <div className="custom-points">
              <span>
                <Globe2 /> Any mix of countries
              </span>
              <span>
                <Clock3 /> 7 to 90 days
              </span>
              <span>
                <CreditCard /> From $5 upward
              </span>
            </div>
            <a className="pink-button" href="#plans">
              Start customizing <ArrowRight />
            </a>
          </div>
          <div className="budget-card">
            <div className="cloud-icon">
              <Layers3 />
            </div>
            <span>YOUR BUDGET</span>
            <strong>$20</strong>
            <div className="budget-result">
              <span>YOU GET</span>
              <b>12 GB</b>
              <small>30 days</small>
            </div>
          </div>
        </section>
        <section id="business" className="section business-section">
          <div className="page-shell">
            <div className="section-heading centered">
              <p className="eyebrow">ELANGO FOR BUSINESS</p>
              <h2>Two powerful solutions for your business.</h2>
              <p>
                Keep your team connected wherever they travel, and reach your customers on the
                channels they already use — from one eLango account.
              </p>
            </div>
            <div className="business-grid">
              <BusinessCard
                icon={<Building2 />}
                label="CONNECTIVITY"
                title="eSIM for Business"
                text="Shared data pools your whole travelling team draws on."
                items={[
                  "Buy gigabytes once and share them across the team",
                  "Country, regional, continental and global coverage",
                  "Add team members and allocate GB per person",
                  "Monitor usage and top up whenever you need more",
                ]}
                tags={["Data pools", "Team eSIMs", "No seat pricing"]}
                cta="Explore Business eSIM"
              />
              <BusinessCard
                dark
                icon={<MessageSquare />}
                label="COMMUNICATION"
                title="eLango Gateway"
                text="Reach your customers on the channels they already use."
                items={[
                  "WhatsApp, SMS, email, Telegram and USSD in one place",
                  "Build customer audiences and segments",
                  "Send campaigns, alerts and notifications",
                  "Schedule messages and track the results",
                ]}
                tags={["Business only", "Multi-channel", "Campaigns"]}
                cta="Explore Gateway"
              />
            </div>
            <p className="business-note">
              Use one, or use both — a single eLango account covers connectivity and customer
              communication.
            </p>
          </div>
        </section>
        <section id="faq" className="section page-shell faq-grid">
          <div>
            <p className="eyebrow">NEED TO KNOW</p>
            <h2>Frequently asked questions</h2>
            <Accordion type="single" collapsible className="faq-list">
              <AccordionItem value="one">
                <AccordionTrigger>Will my phone work with an eLango eSIM?</AccordionTrigger>
                <AccordionContent>
                  Most phones released after 2018 support eSIM. Run the device check in the header —
                  pick your brand and model and we will tell you straight away, including the
                  carrier-lock caveat.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="two">
                <AccordionTrigger>When does the data start counting down?</AccordionTrigger>
                <AccordionContent>
                  Your validity starts when the eSIM first connects to a supported network at your
                  destination.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="three">
                <AccordionTrigger>Can I keep my regular number?</AccordionTrigger>
                <AccordionContent>
                  Yes. Keep your physical SIM active for calls and verification codes while eLango
                  handles your travel data.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="four">
                <AccordionTrigger>What happens when I run out of data?</AccordionTrigger>
                <AccordionContent>
                  You can top up from your account or install a second plan before your current
                  balance runs out.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="five">
                <AccordionTrigger>How is Business different from Personal?</AccordionTrigger>
                <AccordionContent>
                  Business accounts add shared data pools, team allocation, usage monitoring and
                  customer communication tools.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <div id="support" className="support-card">
            <p className="eyebrow">SUPPORT</p>
            <h3>Need help? Start with our installation and coverage guides.</h3>
            <a href="#support">
              <MessageSquare /> Chat with support <ArrowRight />
            </a>
            <a href="#how-it-works">
              <QrCode /> Installation guide <ArrowRight />
            </a>
            <a href="#coverage">
              <Globe2 /> Check coverage <ArrowRight />
            </a>
            <div className="online-status">
              <span /> Support resources available <small>Contact details are listed below</small>
            </div>
          </div>
        </section>
        <section id="about" className="section testimonial-section">
          <div className="page-shell">
            <div className="section-heading centered">
              <p className="eyebrow">TRAVELLERS</p>
              <h2>Landed, and already online</h2>
              <p>Stories from travellers using regional and local data plans.</p>
            </div>
            <div className="testimonial-grid">
              <Testimonial
                quote="Landed in Bangkok, switched on my phone and it was already online. The regional plan carried me through Vietnam and Malaysia without a second thought."
                name="Aisha Mbaruku"
                role="Photographer · Dar es Salaam"
                detail="East Africa 10 GB · 3 countries, 21 days"
              />
              <Testimonial
                quote="I run a field team of eleven. One pool, allocate what each person needs, top it up when it runs low. Our roaming bill basically disappeared."
                name="Daniel Otieno"
                role="Operations lead · Nairobi"
                detail="East Africa Pool 200 GB · 11 people"
              />
              <Testimonial
                quote="The part I did not expect to love: it tells me which plan is being used and what it will fall back to next. No more guessing."
                name="Lena Fischer"
                role="Consultant · Berlin"
                detail="Global 20 GB · 6 countries, 30 days"
              />
            </div>
          </div>
        </section>
        <section className="final-cta page-shell">
          <div className="final-cta-copy">
            <p className="eyebrow">READY WHEN YOU ARE</p>
            <h2>Your next trip shouldn't start with a SIM queue.</h2>
            <p>Buy before you fly, install at home, land connected.</p>
            <div>
              <a className="dark-button" href="#plans">
                Buy eSIM <ArrowRight />
              </a>
              <a className="outline-button" href="#custom-plan">
                Build your plan
              </a>
            </div>
          </div>
          <form
            className="newsletter-card"
            onSubmit={(event) => {
              event.preventDefault();
              setNewsletterSubmitted(true);
            }}
          >
            <p className="eyebrow">TRAVEL TIPS</p>
            <h3>Route-specific data tips before you fly</h3>
            <Label htmlFor="newsletter-email">Email address</Label>
            <Input id="newsletter-email" placeholder="you@example.com" type="email" />
            <div className="newsletter-check">
              <Checkbox id="tips" defaultChecked />
              <Label htmlFor="tips">
                Send me occasional travel data tips. No spam, unsubscribe anytime.
              </Label>
            </div>
            {newsletterSubmitted ? (
              <p className="newsletter-success">
                You’re on the list — watch your inbox for the next travel tip.
              </p>
            ) : (
              <Button type="submit" className="dark-button full-button">
                <Send /> Subscribe
              </Button>
            )}
          </form>
        </section>
      </main>
      <SiteFooter />
      <CheckoutSheet
        pkg={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onComplete={setEsim}
      />
      <EsimReadyDialog esim={esim} onOpenChange={(open) => !open && setEsim(null)} />
    </div>
  );
}

function AnnouncementBar() {
  return (
    <div className="announcement">
      <Zap /> Digital delivery after payment and provider confirmation
    </div>
  );
}
function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page-shell header-inner">
        <a href="/" className="brand">
          <span className="brand-mark" />
          <span>eLango</span>
        </a>
        <a className="menu-button" href="#plans">
          <Menu /> Menu
        </a>
        <div id="device-check" className="header-actions">
          <a className="account-link" href="/account">
            Business account
          </a>
          <CompatibilityDialog>
            <Button variant="soft" className="compatibility-button">
              <Smartphone /> <span>Check device</span>
            </Button>
          </CompatibilityDialog>
        </div>
      </div>
    </header>
  );
}
function TrustStat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="trust-stat">
      <span>{icon}</span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}
function Step({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="step-card">
      <div className="step-icon">
        {icon}
        <small>{number}</small>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
function Benefit({ title, text }: { title: string; text: string }) {
  return (
    <div className="benefit">
      <Check />
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
    </div>
  );
}
function PlanUsage({
  name,
  detail,
  status,
  active,
}: {
  name: string;
  detail: string;
  status: string;
  active?: boolean;
}) {
  return (
    <div className="plan-usage">
      <div>
        <b>{name}</b>
        <small>{detail}</small>
      </div>
      <span className={active ? "active" : ""}>{status}</span>
    </div>
  );
}
function BusinessCard({
  dark,
  icon,
  label,
  title,
  text,
  items,
  tags,
  cta,
}: {
  dark?: boolean;
  icon: ReactNode;
  label: string;
  title: string;
  text: string;
  items: string[];
  tags: string[];
  cta: string;
}) {
  return (
    <article className={`business-card ${dark ? "dark" : ""}`}>
      <div className="business-card-header">
        <span className="business-icon">{icon}</span>
        <b>{label}</b>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <Check /> {item}
          </li>
        ))}
      </ul>
      <div className="tag-row">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <a href="#business">
        {cta} <ArrowRight />
      </a>
    </article>
  );
}
function Testimonial({
  quote,
  name,
  role,
  detail,
}: {
  quote: string;
  name: string;
  role: string;
  detail: string;
}) {
  return (
    <article className="testimonial">
      <div className="testimonial-avatar">
        {name
          .split(" ")
          .map((part) => part[0])
          .join("")}
      </div>
      <div className="stars">
        <Star />
        <Star />
        <Star />
        <Star />
        <Star />
      </div>
      <blockquote>“{quote}”</blockquote>
      <b>{name}</b>
      <small>{role}</small>
      <span>{detail}</span>
    </article>
  );
}
function PlanGrid({
  loading,
  items,
  onBuy,
}: {
  loading: boolean;
  items: Package[];
  onBuy: (pkg: Package) => void;
}) {
  if (loading)
    return (
      <div className="plans-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-64 rounded-3xl" />
        ))}
      </div>
    );
  if (!items.length)
    return (
      <p className="empty-plans">No plans match that destination yet — try another country.</p>
    );
  return (
    <div className="plans-grid">
      {items.slice(0, 9).map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} showLocal={false} onBuy={onBuy} />
      ))}
    </div>
  );
}
function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-shell footer-grid">
        <div className="footer-brand">
          <a href="/" className="brand">
            <span className="brand-mark" />
            <span>eLango</span>
          </a>
          <p>
            Stay connected wherever you go. African-first travel data for individuals and teams.
          </p>
          <div className="socials">
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              <Instagram />
            </a>
            <a href="https://x.com/" target="_blank" rel="noreferrer" aria-label="X">
              <Twitter />
            </a>
            <a
              href="https://www.linkedin.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="LinkedIn"
            >
              <Linkedin />
            </a>
            <a
              href="https://www.youtube.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="YouTube"
            >
              <Youtube />
            </a>
          </div>
        </div>
        <FooterColumn
          title="PRODUCT"
          links={[
            "eSIM Store|#plans",
            "Custom bundles|#custom-plan",
            "eSIM for Business|#business",
            "eLango Gateway|#business",
            "Coverage|#coverage",
          ]}
        />
        <FooterColumn
          title="LEARN"
          links={[
            "What is an eSIM?|#how-it-works",
            "Installation guide|#how-it-works",
            "FAQs|#faq",
            "Device compatibility|#device-check",
            "Help centre|#support",
          ]}
        />
        <FooterColumn
          title="COMPANY"
          links={[
            "About eLango|#about",
            "Contact us|mailto:hello@elango.africa",
            "Support|#support",
          ]}
        />
      </div>
      <div className="page-shell footer-bottom">
        <span>
          <CreditCard /> Secure payment options
        </span>
        <span>
          <Zap /> Digital delivery after provider confirmation
        </span>
        <span>
          <Headphones /> Installation and coverage guidance
        </span>
      </div>
      <div className="page-shell legal">
        © 2026 eLango. Travel connectivity for people and teams. Terms Privacy Cookies
      </div>
    </footer>
  );
}
function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="footer-column">
      <b>{title}</b>
      {links.map((link) => {
        const [label, href] = link.split("|");
        return (
          <a href={href} key={link}>
            {label}
          </a>
        );
      })}
    </div>
  );
}

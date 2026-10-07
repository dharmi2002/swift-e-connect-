import { CalendarDays, Signal, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatData, formatLocal, formatUsd, type Package } from "@/lib/packages";

export function PackageCard({
  pkg,
  showLocal,
  onBuy,
}: {
  pkg: Package;
  showLocal: boolean;
  onBuy: (pkg: Package) => void;
}) {
  const local = formatLocal(pkg);

  return (
    <article className="flex min-h-[260px] flex-col rounded-3xl border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-lift">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            <span className="mr-1">{pkg.flag_emoji}</span>
            {pkg.location_name}
          </p>
          <h3 className="truncate text-base font-bold">{pkg.name}</h3>
        </div>
        {pkg.is_popular && (
          <Badge className="shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent">
            <Zap className="mr-1 h-3 w-3" /> Popular
          </Badge>
        )}
      </header>

      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-extrabold leading-none tracking-tight">
          {formatData(pkg.data_mb)}
        </span>
        <span className="pb-1 text-sm text-muted-foreground">of data</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> {pkg.validity_days} Days
        </span>
        {pkg.networks.slice(0, 2).map((n) => (
          <span
            key={n}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground"
          >
            <Signal className="h-3.5 w-3.5" /> {n}
          </span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t pt-4">
        <div className="min-w-0">
          <p className="text-xl font-bold">
            {showLocal && local ? local : formatUsd(pkg.retail_price_usd)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {showLocal && local ? formatUsd(pkg.retail_price_usd) : (local ?? "USD")}
          </p>
        </div>
        <Button variant="hero" className="shrink-0 rounded-xl font-bold" onClick={() => onBuy(pkg)}>
          Buy eSIM <span aria-hidden="true">→</span>
        </Button>
      </div>
    </article>
  );
}

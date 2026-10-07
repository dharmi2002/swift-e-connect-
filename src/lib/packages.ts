import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Package = {
  id: string;
  code: string;
  location_code: string;
  location_name: string;
  flag_emoji: string;
  name: string;
  region_type: string;
  data_mb: number;
  validity_days: number;
  retail_price_usd: number;
  local_currency: string | null;
  local_price: number | null;
  networks: string[];
  is_popular: boolean;
};

export const packagesQuery = queryOptions({
  queryKey: ["packages"],
  queryFn: async (): Promise<Package[]> => {
    const { data, error } = await supabase
      .from("packages")
      .select(
        "id, code, location_code, location_name, flag_emoji, name, region_type, data_mb, validity_days, retail_price_usd, local_currency, local_price, networks, is_popular",
      )
      .eq("is_active", true)
      .order("retail_price_usd", { ascending: true });

    if (error) throw error;
    return (data ?? []) as Package[];
  },
});

/** Return the complete catalog when the destination search is empty. */
export function filterPackages(packages: Package[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return packages;

  return packages.filter((pkg) =>
    `${pkg.location_name} ${pkg.name} ${pkg.location_code}`.toLowerCase().includes(query),
  );
}

export function formatData(mb: number) {
  if (mb >= 20480) return `${Math.round(mb / 1024)} GB`;
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}

export function formatUsd(value: number) {
  return `$${Number(value).toFixed(2)}`;
}

export function formatLocal(pkg: Package) {
  if (!pkg.local_currency || pkg.local_price === null) return null;
  const amount = Number(pkg.local_price);
  const rounded = amount >= 100 ? Math.round(amount).toLocaleString() : amount.toFixed(2);
  return `${pkg.local_currency} ${rounded}`;
}

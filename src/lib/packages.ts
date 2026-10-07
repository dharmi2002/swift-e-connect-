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

/**
 * Local-only catalog used when the app is run without Supabase credentials.
 * Production and configured staging always read the live packages table.
 */
export const africanDevelopmentPackages: Package[] = [
  {
    id: "dev-ke-1gb-7",
    code: "ke-1gb-7",
    location_code: "KE",
    location_name: "Kenya",
    flag_emoji: "🇰🇪",
    name: "Kenya Data Pass",
    region_type: "country",
    data_mb: 1024,
    validity_days: 7,
    retail_price_usd: 4.5,
    local_currency: "KES",
    local_price: 580,
    networks: ["Safaricom 4G/5G", "Airtel"],
    is_popular: true,
  },
  {
    id: "dev-ke-5gb-30",
    code: "ke-5gb-30",
    location_code: "KE",
    location_name: "Kenya",
    flag_emoji: "🇰🇪",
    name: "Kenya Data Pass",
    region_type: "country",
    data_mb: 5120,
    validity_days: 30,
    retail_price_usd: 15,
    local_currency: "KES",
    local_price: 1935,
    networks: ["Safaricom 4G/5G"],
    is_popular: true,
  },
  {
    id: "dev-ng-3gb-15",
    code: "ng-3gb-15",
    location_code: "NG",
    location_name: "Nigeria",
    flag_emoji: "🇳🇬",
    name: "Nigeria Data Pass",
    region_type: "country",
    data_mb: 3072,
    validity_days: 15,
    retail_price_usd: 11,
    local_currency: "NGN",
    local_price: 16500,
    networks: ["MTN 4G", "Glo"],
    is_popular: true,
  },
  {
    id: "dev-ng-10gb-30",
    code: "ng-10gb-30",
    location_code: "NG",
    location_name: "Nigeria",
    flag_emoji: "🇳🇬",
    name: "Nigeria Data Pass",
    region_type: "country",
    data_mb: 10240,
    validity_days: 30,
    retail_price_usd: 26,
    local_currency: "NGN",
    local_price: 39000,
    networks: ["MTN 4G/5G"],
    is_popular: false,
  },
  {
    id: "dev-za-5gb-15",
    code: "za-5gb-15",
    location_code: "ZA",
    location_name: "South Africa",
    flag_emoji: "🇿🇦",
    name: "South Africa Data Pass",
    region_type: "country",
    data_mb: 5120,
    validity_days: 15,
    retail_price_usd: 13.5,
    local_currency: "ZAR",
    local_price: 245,
    networks: ["Vodacom 5G", "MTN"],
    is_popular: true,
  },
  {
    id: "dev-gh-3gb-15",
    code: "gh-3gb-15",
    location_code: "GH",
    location_name: "Ghana",
    flag_emoji: "🇬🇭",
    name: "Ghana Data Pass",
    region_type: "country",
    data_mb: 3072,
    validity_days: 15,
    retail_price_usd: 10,
    local_currency: "GHS",
    local_price: 150,
    networks: ["MTN 4G"],
    is_popular: false,
  },
  {
    id: "dev-eg-5gb-30",
    code: "eg-5gb-30",
    location_code: "EG",
    location_name: "Egypt",
    flag_emoji: "🇪🇬",
    name: "Egypt Data Pass",
    region_type: "country",
    data_mb: 5120,
    validity_days: 30,
    retail_price_usd: 17,
    local_currency: "EGP",
    local_price: 830,
    networks: ["Orange 4G", "Vodafone"],
    is_popular: false,
  },
  {
    id: "dev-ma-5gb-15",
    code: "ma-5gb-15",
    location_code: "MA",
    location_name: "Morocco",
    flag_emoji: "🇲🇦",
    name: "Morocco Data Pass",
    region_type: "country",
    data_mb: 5120,
    validity_days: 15,
    retail_price_usd: 14,
    local_currency: "MAD",
    local_price: 140,
    networks: ["Maroc Telecom"],
    is_popular: false,
  },
  {
    id: "dev-ae-5gb-15",
    code: "ae-5gb-15",
    location_code: "AE",
    location_name: "United Arab Emirates",
    flag_emoji: "🇦🇪",
    name: "Dubai / UAE Pass",
    region_type: "country",
    data_mb: 5120,
    validity_days: 15,
    retail_price_usd: 18,
    local_currency: "AED",
    local_price: 66,
    networks: ["Etisalat 5G", "du"],
    is_popular: true,
  },
  {
    id: "dev-eafr-5gb-15",
    code: "eafr-5gb-15",
    location_code: "EAFR",
    location_name: "East Africa",
    flag_emoji: "🌍",
    name: "East Africa Regional Pass",
    region_type: "regional",
    data_mb: 5120,
    validity_days: 15,
    retail_price_usd: 21,
    local_currency: "KES",
    local_price: 2710,
    networks: ["Safaricom", "MTN", "Airtel"],
    is_popular: true,
  },
  {
    id: "dev-wafr-10gb-30",
    code: "wafr-10gb-30",
    location_code: "WAFR",
    location_name: "West Africa",
    flag_emoji: "🌍",
    name: "West Africa Regional Pass",
    region_type: "regional",
    data_mb: 10240,
    validity_days: 30,
    retail_price_usd: 39,
    local_currency: "NGN",
    local_price: 58500,
    networks: ["MTN", "Orange", "Glo"],
    is_popular: true,
  },
  {
    id: "dev-afr-20gb-30",
    code: "afr-20gb-30",
    location_code: "AFR",
    location_name: "Pan-Africa",
    flag_emoji: "🌍",
    name: "Pan-Africa Unlimited-ish",
    region_type: "regional",
    data_mb: 20480,
    validity_days: 30,
    retail_price_usd: 59,
    local_currency: "USD",
    local_price: 59,
    networks: ["MTN", "Vodacom", "Safaricom", "Orange"],
    is_popular: true,
  },
];

export const packagesQuery = queryOptions({
  queryKey: ["packages"],
  queryFn: async (): Promise<Package[]> => {
    try {
      const { data, error } = await supabase
        .from("packages")
        .select(
          "id, code, location_code, location_name, flag_emoji, name, region_type, data_mb, validity_days, retail_price_usd, local_currency, local_price, networks, is_popular",
        )
        .eq("is_active", true)
        .order("retail_price_usd", { ascending: true });

      if (error) throw error;
      if (data?.length) return data as Package[];
      if (import.meta.env.DEV) return africanDevelopmentPackages;
      return [];
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[Packages] Using the local African development catalog:", error);
        return africanDevelopmentPackages;
      }
      throw error;
    }
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

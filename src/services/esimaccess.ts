/**
 * eSIMAccess Wholesale API client
 * Docs: https://docs.esimaccess.com
 *
 * Key conventions from the API:
 * - ALL endpoints are POST (never GET)
 * - Base path includes /open/
 * - Prices are integer × 10,000 (10000 = $1.00 USD)
 * - Data volumes are in bytes
 * - Responses use { success, errorCode, errorMsg, obj: { ... } }
 */

// ---------------------------------------------------------------------------
// Types — match the actual API response shapes
// ---------------------------------------------------------------------------

export interface EsimPackage {
  packageCode: string;
  slug: string;
  name: string;
  description: string;
  location: string; // Alpha-2 ISO codes, comma-separated for multi-country
  price: number; // × 10,000 (10000 = $1.00)
  retailPrice: number; // × 10,000
  currencyCode: string;
  volume: number; // bytes
  duration: number; // validity period value
  durationUnit: string; // "DAY"
  unusedValidTime: number; // days until package invalid
  activeType: number; // 1 = first install, 2 = first network
  speed: string; // e.g. "3G/4G"
  favorite: boolean;
  smsStatus: number; // 0 = no SMS, 1 = API+mobile, 2 = API only
  dataType: number; // 1=total, 2=daily reduced, 3=daily cutoff, 4=daily unlimited
  supportTopUpType: number; // 1=no, 2=yes, 3=yes with periodNum
  ipExport: string;
  fupPolicy?: string;
  locationNetworkList: Array<{
    locationName: string;
    locationLogo: string;
    operatorList: Array<{
      operatorName: string;
      networkType: string;
    }>;
  }>;
}

/** Wrapper returned by all eSIMAccess endpoints */
interface ApiResponse<T> {
  success: boolean;
  errorCode: string | null;
  errorMsg: string | null;
  obj: T;
}

export interface PackageListResult {
  packageList: EsimPackage[];
}

export interface OrderResult {
  orderNo: string;
  transactionId: string;
}

export interface EsimProfile {
  iccid: string;
  esimTranNo: string;
  ac: string; // activation code
  qrCodeUrl: string;
  smdpAddress: string;
  esimStatus: string;
  smdpStatus: string;
  orderNo: string;
  transactionId: string;
  packageCode: string;
  orderUsage: number; // bytes used
  remainVolume?: number;
}

export interface QueryResult {
  esimList: EsimProfile[];
}

export interface BalanceResult {
  balance: number; // × 10,000
}

export interface TopUpResult {
  transactionId: string;
  iccid: string;
  expiredTime: string;
  totalVolume: number;
  totalDuration: number;
  orderUsage: number;
  topUpEsimTranNo: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env["ESIM_ACCESS_BASE_URL"] || "https://api.esimaccess.com/api/v1/open";
const API_KEY = () => {
  const k = process.env["ESIM_ACCESS_API_KEY"];
  if (!k) throw new Error("Missing ESIM_ACCESS_API_KEY");
  return k;
};

// ---------------------------------------------------------------------------
// HTTP helper — ALL endpoints are POST
// ---------------------------------------------------------------------------

async function api<T>(path: string, body: unknown = {}): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "RT-AccessCode": API_KEY(),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eSIMAccess POST ${path} → ${res.status}: ${text}`);
  }

  return (await res.json()) as ApiResponse<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch full package catalog from upstream */
export async function fetchPackages(locationCode?: string): Promise<EsimPackage[]> {
  const res = await api<PackageListResult>("/package/list", {
    locationCode: locationCode ?? "",
    type: "",
    packageCode: "",
    iccid: "",
  });
  if (!res.success) throw new Error(`fetchPackages failed: ${res.errorMsg}`);
  return res.obj.packageList;
}

/** Place an order for a single eSIM profile */
export async function createOrder(
  packageCode: string,
  transactionId: string,
  wholesalePrice?: number, // × 10,000
  count = 1,
): Promise<OrderResult> {
  const packageInfoList: Array<{
    packageCode: string;
    count: number;
    price?: number;
  }> = [{ packageCode, count }];
  if (wholesalePrice !== undefined) {
    packageInfoList[0]!.price = wholesalePrice;
  }

  const res = await api<OrderResult>("/esim/order", {
    transactionId,
    packageInfoList,
  });
  if (!res.success) throw new Error(`createOrder failed: ${res.errorMsg}`);
  return res.obj;
}

/** Query eSIM profiles by orderNo — used after ORDER_STATUS webhook */
export async function queryProfiles(orderNo: string): Promise<EsimProfile[]> {
  const res = await api<QueryResult>("/esim/query", { orderNo });
  if (!res.success) {
    // 200010 = profiles still being allocated
    if (res.errorCode === "200010") return [];
    throw new Error(`queryProfiles failed: ${res.errorMsg}`);
  }
  return res.obj.esimList ?? [];
}

/** Apply a top-up package to an existing eSIM */
export async function topUpEsim(
  esimTranNo: string,
  packageCode: string,
  transactionId: string,
): Promise<TopUpResult> {
  const res = await api<TopUpResult>("/esim/topup", {
    esimTranNo,
    iccid: "",
    packageCode,
    transactionId,
  });
  if (!res.success) throw new Error(`topUpEsim failed: ${res.errorMsg}`);
  return res.obj;
}

/** Check pre-funded wallet balance. Returns USD dollars (converted from ×10,000). */
export async function checkBalance(): Promise<number> {
  const res = await api<BalanceResult>("/balance/query");
  if (!res.success) throw new Error(`checkBalance failed: ${res.errorMsg}`);
  return res.obj.balance / 10_000;
}

/** Cancel an unused eSIM profile — refunds to wallet */
export async function cancelProfile(esimTranNo: string): Promise<void> {
  const res = await api<Record<string, never>>("/esim/cancel", { esimTranNo });
  if (!res.success) throw new Error(`cancelProfile failed: ${res.errorMsg}`);
}

/** Set or update webhook URL */
export async function setWebhook(webhookUrl: string): Promise<void> {
  const res = await api<Record<string, never>>("/webhook/save", { webhook: webhookUrl });
  if (!res.success) throw new Error(`setWebhook failed: ${res.errorMsg}`);
}

// ---------------------------------------------------------------------------
// Sync helper — fetches upstream catalog, applies markup, upserts to Supabase
// ---------------------------------------------------------------------------

export interface MarkupRule {
  type: "PERCENTAGE" | "FIXED";
  value: number;
}

/** Convert API price (×10,000) to USD dollars */
export function priceToUsd(apiPrice: number): number {
  return Math.round((apiPrice / 10_000) * 100) / 100;
}

export function applyMarkup(wholesaleUsd: number, rule: MarkupRule): number {
  if (rule.type === "PERCENTAGE") {
    return Math.round(wholesaleUsd * (1 + rule.value / 100) * 100) / 100;
  }
  return Math.round((wholesaleUsd + rule.value) * 100) / 100;
}

/**
 * Full catalog sync: fetch upstream → apply markup → upsert into packages table.
 * Designed to be called from a cron job or admin endpoint.
 */
export async function syncPackages(): Promise<{ upserted: number }> {
  // Lazy-import server client to avoid pulling Supabase into client bundle
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Load markup rule from system_settings
  const { data: setting } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "markup_rule")
    .single();

  const markupRule: MarkupRule = (setting?.value as unknown as MarkupRule) ?? {
    type: "PERCENTAGE",
    value: 20,
  };

  const upstream = await fetchPackages();

  const rows = upstream.map((pkg) => ({
    code: pkg.packageCode,
    location_code: pkg.location,
    location_name: pkg.description || pkg.name,
    name: pkg.slug || pkg.packageCode,
    data_mb: Math.round(pkg.volume / (1024 * 1024)),
    validity_days: pkg.duration,
    retail_price_usd: applyMarkup(priceToUsd(pkg.price), markupRule),
    networks:
      pkg.locationNetworkList?.flatMap((loc) =>
        loc.operatorList.map((op) => `${op.operatorName} ${op.networkType}`),
      ) ?? [],
    flag_emoji: "", // populated separately or from a lookup
    region_type: pkg.location.includes(",") ? "regional" : "country",
    is_active: true,
  }));

  const { error, count } = await supabaseAdmin
    .from("packages")
    .upsert(rows, { onConflict: "code", ignoreDuplicates: false })
    .select("code");

  if (error) throw new Error(`syncPackages upsert failed: ${error.message}`);
  return { upserted: count ?? rows.length };
}

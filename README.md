# PassportSIM — eSIM Reseller Storefront

PassportSIM is a white-label eSIM reseller storefront powered by the **eSIMAccess Wholesale API**. Customers browse data packages, purchase an eSIM, and receive their QR code + activation details by email — all automated.

**Stack:** TanStack Start (React 19 SSR) · Vite 8 · Nitro (Cloudflare Workers) · Supabase (PostgreSQL + Auth) · Brevo transactional email · Vitest

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Directory Map](#directory-map)
3. [Request Flow](#request-flow)
4. [eSIMAccess API Integration](#esimaccess-api-integration)
5. [Webhook Handling](#webhook-handling)
6. [Cron / Background Workers](#cron--background-workers)
7. [Email Delivery (Brevo)](#email-delivery-brevo)
8. [Database Schema](#database-schema)
9. [Environment Variables](#environment-variables)
10. [Development Setup](#development-setup)
11. [Testing](#testing)
12. [Deployment (Cloudflare Workers)](#deployment-cloudflare-workers)
13. [What's Left to Build](#whats-left-to-build)
14. [Build System Note](#build-system-note)

---

## Architecture Overview

```
Browser ──▶ TanStack Start (SSR) ──▶ Nitro (Cloudflare Worker)
                │                          │
                │  createServerFn (RPC)     │  /api/* raw HTTP
                ▼                          ▼
        order.server.ts             api-router.ts
                │                     │    │    │
                └──┬──────────────────┘    │    │
                   ▼                       │    │
          esimaccess.ts (API client)       │    │
                                           │    │
                           webhooks ◄──────┘    │
                           cron jobs ◄──────────┘
                                │
                                ▼
                        Supabase (DB)
                        Brevo (email)
```

There are **two server-side entry points**:

| Path | Mechanism | Use |
|------|-----------|-----|
| `src/services/order.server.ts` | `createServerFn` (TanStack RPC) | Frontend calls — place order, poll status |
| `src/api-router.ts` | Raw HTTP handler | External callers — webhooks, cron endpoints |

`src/server.ts` is the Nitro entry point. It intercepts `/api/*` requests and routes them to `api-router.ts` before handing everything else to TanStack Start's SSR renderer.

---

## Directory Map

```
src/
├── server.ts                    # Nitro entry — intercepts /api/*, delegates to SSR
├── api-router.ts                # Raw HTTP routes: webhook, cron endpoints
├── router.tsx                   # TanStack router config
├── start.ts                     # TanStack Start bootstrap
│
├── services/
│   ├── esimaccess.ts            # eSIMAccess API client (ALL endpoints)
│   ├── order.server.ts          # createServerFn: placeOrder, getOrderStatus
│   ├── workers.ts               # pollStuckOrders (cron fallback)
│   ├── email.ts                 # Brevo transactional email
│   └── webhook-verify.ts        # HMAC-SHA256 signature verification
│
├── integrations/supabase/
│   ├── client.ts                # Browser-side Supabase client (lazy singleton)
│   ├── client.server.ts         # Server-side Supabase client (service role key)
│   ├── auth-middleware.ts       # TanStack middleware — validates JWT, injects context
│   ├── auth-attacher.ts         # Attaches auth headers to server function calls
│   └── types.ts                 # Generated database types
│
├── lib/
│   ├── packages.ts              # formatData, formatUsd, formatLocal helpers
│   ├── utils.ts                 # cn() (tailwind-merge)
│   ├── error-capture.ts         # Captures SSR errors before h3 swallows them
│   ├── error-page.ts            # Static 500 error HTML
│   └── error-reporting.ts       # Client-side error boundary logger (TODO: Sentry)
│
├── components/store/
│   ├── PackageCard.tsx           # eSIM package display card
│   ├── CheckoutSheet.tsx         # Checkout flow — collects email, device, payment
│   ├── CompatibilityDialog.tsx   # eSIM compatibility checker
│   └── EsimReadyDialog.tsx       # Post-purchase eSIM delivery display
│
├── routes/
│   ├── __root.tsx                # Root layout, head tags, error boundary
│   └── index.tsx                 # Homepage / store
│
└── __tests__/                   # Test files (some also colocated as *.test.ts)
```

---

## Request Flow

### Purchase (happy path)

```
1. Customer selects package → opens CheckoutSheet
2. CheckoutSheet collects: email, device type, payment method
3. [PAYMENT STEP — NOT YET IMPLEMENTED]
4. Frontend calls placeOrder() server function
5. placeOrder():
   a. Validates package exists & is active in Supabase
   b. Generates transaction ID: PS-{timestamp}-{random}
   c. POSTs to eSIMAccess /esim/order
   d. Inserts order row with status = "processing"
   e. Returns { orderId, status } to frontend
6. Frontend polls getOrderStatus() every few seconds
7. Meanwhile, eSIMAccess sends ORDER_STATUS webhook with orderStatus = "GOT_RESOURCE"
8. Webhook handler:
   a. Parses envelope, checks idempotency
   b. POSTs to /esim/query to fetch ICCID, QR code, smdpAddress
   c. Updates order → status = "completed"
   d. Sends delivery email via Brevo
9. Frontend poll sees status = "completed" → shows EsimReadyDialog with QR code
```

### Webhook missed (fallback)

```
1. Cron calls POST /api/orders/poll
2. pollStuckOrders() finds orders stuck in "processing" for >60s
3. For each, queries /esim/query
4. If profile ready (has smdpAddress + iccid): completes order + sends email
5. If still allocating (error 200010): leaves as "processing", retries next poll
```

---

## eSIMAccess API Integration

**Docs:** https://docs.esimaccess.com

**File:** `src/services/esimaccess.ts`

### Critical conventions

| Convention | Detail |
|-----------|--------|
| **HTTP method** | ALL endpoints are **POST** (no GET) |
| **Base URL** | `https://api.esimaccess.com/api/v1/open` (note the `/open` suffix) |
| **Auth header** | `RT-AccessCode: <api-key>` |
| **Response envelope** | `{ success: boolean, errorCode, errorMsg, obj: T }` |
| **Prices** | Integer × 10,000. `10000` = $1.00 USD. Use `priceToUsd()` to convert. |
| **Data volumes** | Bytes. Divide by `1024*1024` for MB. |
| **Rate limit** | 8 requests/second |

### Endpoints used

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `fetchPackages()` | `/package/list` | Full catalog. Returns `obj.packageList[]` |
| `createOrder()` | `/esim/order` | Order an eSIM. Body: `{ transactionId, packageInfoList: [{ packageCode, count, price? }] }` |
| `queryProfiles()` | `/esim/query` | Fetch ICCID/QR/smdpAddress after order. Body: `{ orderNo }`. Error `200010` = still allocating |
| `topUpEsim()` | `/esim/topup` | Add data to existing eSIM. Body: `{ esimTranNo, packageCode, transactionId }` |
| `checkBalance()` | `/balance/query` | Wallet balance. Returns USD (converted from ×10,000) |
| `cancelProfile()` | `/esim/cancel` | Cancel unused profile. Refunds to wallet |
| `setWebhook()` | `/webhook/save` | Register webhook URL. Body: `{ webhook: "https://..." }` |

### Package sync

`syncPackages()` fetches the full upstream catalog, applies a markup rule from `system_settings.markup_rule`, and upserts into the `packages` table. Default markup: 20% if no rule configured.

Call it via `POST /api/packages/sync` (with cron auth).

---

## Webhook Handling

**File:** `src/api-router.ts`

**Endpoint:** `POST /api/webhooks/esim-access`

### Envelope format

```json
{
  "notifyType": "ORDER_STATUS",
  "notifyId": "unique-id",
  "eventGenerateTime": "2024-01-15T10:30:00Z",
  "content": {
    "orderNo": "ORD-12345",
    "orderStatus": "GOT_RESOURCE",
    "transactionId": "PS-1234567890-abc123"
  }
}
```

### Notify types

| Type | Action |
|------|--------|
| `CHECK_HEALTH` | Returns `{ ok: true }` immediately |
| `ORDER_STATUS` | Processes order completion (see below) |
| `ESIM_STATUS` | Logged only (future: lifecycle tracking) |
| `DATA_USAGE` | Logged only (future: usage dashboards) |
| `VALIDITY_USAGE` | Logged only |
| `SMDP_EVENT` | Logged only |

### ORDER_STATUS processing

⚠️ **Important:** The `ORDER_STATUS` webhook does **NOT** contain ICCID or QR code. When `orderStatus === "GOT_RESOURCE"`:

1. Call `queryProfiles(orderNo)` to fetch the actual eSIM details
2. Update order to `status = "completed"` with ICCID, QR, smdpAddress, activation code
3. Send delivery email

When `orderStatus === "FAILED"`: set order status to `"failed"`.

### Signature verification

Optional. If `ESIM_ACCESS_WEBHOOK_SECRET` is set, the handler verifies the `RT-Signature` header using HMAC-SHA256. The verification function is in `src/services/webhook-verify.ts`.

### Idempotency

Each webhook is logged to `webhook_logs` keyed by `notifyType` + `notifyId`. Duplicate webhooks are detected and skipped.

### Setup

Register your webhook URL with eSIMAccess:

```bash
curl -X POST https://api.esimaccess.com/api/v1/open/webhook/save \
  -H "Content-Type: application/json" \
  -H "RT-AccessCode: YOUR_API_KEY" \
  -d '{"webhook": "https://your-domain.com/api/webhooks/esim-access"}'
```

Or use the `setWebhook()` function.

Test connectivity: https://esimaccess.com/webhook-test-form

---

## Cron / Background Workers

All cron endpoints require `Authorization: Bearer <CRON_SECRET>` (unless `CRON_SECRET` is unset).

| Endpoint | Method | Frequency | Purpose |
|----------|--------|-----------|---------|
| `/api/packages/sync` | POST | Daily | Sync upstream catalog → `packages` table |
| `/api/health/balance` | GET | Hourly | Check wallet balance, alert if below threshold |
| `/api/orders/poll` | POST | Every 2–5 min | Complete stuck orders (webhook fallback) |

### Cloudflare Workers cron setup

In `wrangler.toml` (or Cloudflare dashboard → Workers → Triggers → Cron):

```toml
[triggers]
crons = [
  "0 3 * * *",    # package sync at 3 AM UTC
  "0 * * * *",    # balance check every hour
  "*/5 * * * *",  # poll stuck orders every 5 min
]
```

Each cron trigger should call the corresponding endpoint with the `CRON_SECRET` as a Bearer token.

---

## Email Delivery (Brevo)

**File:** `src/services/email.ts`

Two email types:

1. **eSIM Delivery** — Sent to customer after order completes. Contains:
   - QR code image (hosted by eSIMAccess)
   - SM-DP+ address
   - Activation code
   - LPA string (`LPA:1$smdpAddress$activationCode`)
   - ICCID

2. **Low Balance Alert** — Sent to admin (from `system_settings.admin_email`) when wallet balance drops below `system_settings.low_balance_threshold`.

---

## Database Schema

**Engine:** Supabase (PostgreSQL)

### `orders`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `order_no` | text | eSIMAccess order number |
| `transaction_id` | text | Our unique transaction ID (`PS-{ts}-{rand}`) |
| `customer_email` | text | Buyer's email |
| `package_code` | text | eSIMAccess package code |
| `device_type` | text | "iphone" / "android" / "other" |
| `payment_method` | text | Payment method used |
| `amount_usd` | numeric | Retail price charged |
| `status` | text | `processing` → `completed` / `failed` |
| `esim_iccid` | text | ICCID (set on completion) |
| `activation_code` | text | eSIM activation code |
| `qr_code_url` | text | QR code image URL |
| `smdp_address` | text | SM-DP+ server address |
| `raw_webhook_payload` | jsonb | Full webhook payload for debugging |
| `created_at` | timestamptz | Order creation time |

### `packages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `code` | text (unique) | eSIMAccess package code (upsert key) |
| `name` | text | Package slug / display name |
| `location_code` | text | ISO country/region codes |
| `location_name` | text | Human-readable location |
| `data_mb` | integer | Data allowance in MB |
| `validity_days` | integer | Package validity period |
| `retail_price_usd` | numeric | Price after markup |
| `networks` | text[] | Available network operators |
| `flag_emoji` | text | Country flag (populated separately) |
| `region_type` | text | `"country"` or `"regional"` |
| `is_active` | boolean | Whether to show in storefront |
| `is_popular` | boolean | Featured flag |
| `local_currency` | text | Local currency code |
| `local_price` | numeric | Price in local currency |
| `created_at` | timestamptz | Row creation time |

### `system_settings`

Key-value store for app configuration.

| Key | Value type | Default | Purpose |
|-----|-----------|---------|---------|
| `markup_rule` | `{ type: "PERCENTAGE" \| "FIXED", value: number }` | `{ type: "PERCENTAGE", value: 20 }` | Price markup on wholesale cost |
| `low_balance_threshold` | `{ usd: number }` | `{ usd: 100 }` | Balance alert threshold |
| `admin_email` | string | `"ops@passportsim.io"` | Admin alert recipient |

### `webhook_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `event_type` | text | `notifyType` from webhook |
| `order_no` | text | `notifyId` or `orderNo` |
| `signature` | text | `RT-Signature` header value |
| `payload` | jsonb | Full webhook body |
| `processed_at` | timestamptz | When processed |

---

## Environment Variables

Copy `.env.example` → `.env` and fill in:

```env
# Supabase
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
VITE_SUPABASE_URL="https://your-project.supabase.co"         # client-side
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."           # client-side

# eSIMAccess API
ESIM_ACCESS_API_KEY="your-esimaccess-api-key"
ESIM_ACCESS_BASE_URL="https://api.esimaccess.com/api/v1/open"
ESIM_ACCESS_WEBHOOK_SECRET="your-webhook-signing-secret"      # optional

# Brevo (transactional email)
BREVO_API_KEY="xkeysib-..."
FROM_EMAIL="noreply@passportsim.io"
FROM_NAME="PassportSIM"

# Cron job auth
CRON_SECRET="a-random-secret-for-cron-calls"
```

| Variable | Required | Side | Notes |
|----------|----------|------|-------|
| `SUPABASE_URL` | ✅ | Server | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | Server | aka "anon key" |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server | Service role — bypasses RLS |
| `VITE_SUPABASE_URL` | ✅ | Client | Same URL, exposed to browser via Vite |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Client | Same anon key, exposed to browser |
| `ESIM_ACCESS_API_KEY` | ✅ | Server | eSIMAccess dashboard → API Keys |
| `ESIM_ACCESS_BASE_URL` | ❌ | Server | Defaults to `https://api.esimaccess.com/api/v1/open` |
| `ESIM_ACCESS_WEBHOOK_SECRET` | ❌ | Server | Enable signature verification on webhooks |
| `BREVO_API_KEY` | ✅ | Server | Brevo dashboard → SMTP & API → API Keys |
| `FROM_EMAIL` | ❌ | Server | Defaults to `noreply@passportsim.io` |
| `FROM_NAME` | ❌ | Server | Defaults to `PassportSIM` |
| `CRON_SECRET` | ❌ | Server | If unset, cron endpoints are open (dev only!) |

---

## Development Setup

### Prerequisites

- Node.js ≥ 18
- npm

### Install & run

```bash
npm install
```

```bash
cp .env.example .env   # then fill in values
```

```bash
npm run dev             # starts Vite dev server on http://localhost:5173
```

### Other commands

```bash
npm run build           # production build
```

```bash
npm run preview         # preview production build locally
```

```bash
npm run lint            # ESLint
```

```bash
npm run format          # Prettier auto-format
```

```bash
npm test                # run all tests (Vitest)
```

```bash
npm run test:watch      # watch mode
```

---

## Testing

**Framework:** Vitest · **Config:** `vitest.config.ts`

65 tests across these files:

| File | Tests | What it covers |
|------|-------|---------------|
| `src/services/esimaccess.test.ts` | 13 | `priceToUsd`, `applyMarkup`, mocked API calls |
| `src/services/webhook.test.ts` | 6 | Webhook envelope structure, `GOT_RESOURCE` status |
| `src/services/webhook-verify.test.ts` | 5 | HMAC-SHA256 signature verification |
| `src/lib/packages.test.ts` | 11 | `formatData`, `formatUsd`, `formatLocal` |
| `src/lib/utils.test.ts` | 5 | `cn()` class name merging |

```bash
npm test
```

### Adding tests

Place test files next to the module (`foo.test.ts`) or in `src/__tests__/`. The glob pattern is `src/**/*.test.{ts,tsx}`.

---

## Deployment (Cloudflare Workers)

The build targets Cloudflare Workers via Nitro. The build config wrapper handles the Nitro plugins automatically.

```bash
npm run build
```

```bash
npx wrangler deploy
```

Set all environment variables in Cloudflare dashboard → Workers → Settings → Variables, or via `wrangler.toml` secrets.

### Post-deploy checklist

1. Set environment variables in Cloudflare
2. Register webhook URL: call `setWebhook("https://your-domain.com/api/webhooks/esim-access")`
3. Set up cron triggers (see [Cron section](#cron--background-workers))
4. Run initial package sync: `POST /api/packages/sync` with `Authorization: Bearer <CRON_SECRET>`
5. Insert initial `system_settings` rows (markup_rule, low_balance_threshold, admin_email)

---

## What's Left to Build

### 🔴 Payment Integration (critical)

The checkout flow currently calls `placeOrder()` immediately — **no payment is collected**. You need to:

1. **Choose a payment provider** (Stripe, Paystack, Flutterwave, etc.)
2. **Create a payment intent/session** before calling `placeOrder()`
3. **Verify payment** server-side before placing the eSIMAccess order
4. **Handle payment failures** gracefully (don't place eSIM order if payment fails)
5. **Store payment reference** in the `orders` table (the `payment_method` and `transaction_id` columns exist)

The integration point is in `src/components/store/CheckoutSheet.tsx` — look for the order placement call.

### 🟡 Nice-to-haves

- **Admin dashboard** — order management, analytics, system settings UI
- **Order history** — customer-facing order lookup by email
- **Top-up flow** — `topUpEsim()` is implemented in the API client but not exposed in UI
- **Usage tracking** — process `DATA_USAGE` and `VALIDITY_USAGE` webhooks
- **Error reporting** — replace `console.error` in `error-reporting.ts` with Sentry/LogRocket
- **Rate limiting** — eSIMAccess allows 8 req/s; add client-side throttling
- **Flag emoji** — populate `flag_emoji` in package sync (currently empty string)
- **RLS policies** — Supabase Row Level Security for the orders table

---

## Build System Note

The Vite config uses `@lovable.dev/vite-tanstack-config` — an opaque wrapper that bundles TanStack Start, React, Tailwind, Nitro, and several other Vite plugins. **Do not remove it** without rewriting `vite.config.ts` to include all those plugins manually. The package is a build-time dev dependency only; it does not appear in production output.

See the TODO in `vite.config.ts` for migration notes.

-- ============================================================
-- PassportSIM backend tables + orders table extensions
-- ============================================================

-- 1. Extend orders table for eSIMAccess integration
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS transaction_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS order_no text,
  ADD COLUMN IF NOT EXISTS raw_webhook_payload jsonb;

-- Index for polling worker (stuck PROCESSING orders)
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at)
  WHERE status IN ('pending', 'processing');

-- 2. Webhook idempotency log
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  order_no text NOT NULL,
  signature text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, order_no)
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.webhook_logs TO service_role;

-- 3. System settings (markup rules, thresholds)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.system_settings TO service_role;
GRANT ALL ON public.system_settings TO service_role;

-- Seed default settings
INSERT INTO public.system_settings (key, value) VALUES
  ('markup_rule', '{"type": "PERCENTAGE", "value": 20}'),
  ('low_balance_threshold', '{"usd": 100}'),
  ('admin_email', '"ops@passportsim.io"')
ON CONFLICT (key) DO NOTHING;

-- 4. Allow service_role full access on orders (for webhook handler)
GRANT ALL ON public.orders TO service_role;

-- 5. Add SELECT on orders for service_role (polling worker)
CREATE POLICY "Service role full access on orders"
  ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on webhook_logs"
  ON public.webhook_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on system_settings"
  ON public.system_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

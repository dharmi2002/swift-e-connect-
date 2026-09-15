-- ============================================================
-- Business (B2B) accounts: organizations, offices, employees,
-- bulk eSIM seat purchases, and order attribution/expiry fields.
-- ============================================================

-- 1. Organizations — one business account, one admin (owner_user_id)
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_email text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

CREATE POLICY "Owners can view their organization"
  ON public.organizations FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);

CREATE POLICY "Owners can update their organization"
  ON public.organizations FOR UPDATE TO authenticated USING (auth.uid() = owner_user_id);

CREATE POLICY "Service role full access on organizations"
  ON public.organizations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Offices — simple named groupings under an organization
CREATE TABLE IF NOT EXISTS public.offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_offices_organization_id ON public.offices (organization_id);

ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.offices TO authenticated;
GRANT ALL ON public.offices TO service_role;

CREATE POLICY "Owners can view their offices"
  ON public.offices FOR SELECT TO authenticated USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on offices"
  ON public.offices FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Employees — managed records (no login), belong to an org and optionally an office
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  office_id uuid REFERENCES public.offices(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_employees_organization_id ON public.employees (organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_office_id ON public.employees (office_id);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

CREATE POLICY "Owners can view their employees"
  ON public.employees FOR SELECT TO authenticated USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on employees"
  ON public.employees FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Orders: attribute to a business + employee, decouple recipient from payer, track activation time
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_organization_id ON public.orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_orders_employee_id ON public.orders (employee_id);

CREATE POLICY "Owners can view their organization's orders"
  ON public.orders FOR SELECT TO authenticated USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
  );

-- 5. Bulk purchases — one paid transaction for N unassigned eSIM seats
CREATE TABLE IF NOT EXISTS public.bulk_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_code text NOT NULL REFERENCES public.packages(code),
  quantity integer NOT NULL CHECK (quantity > 0),
  amount_usd_total numeric(10,2) NOT NULL,
  stripe_payment_intent_id text,
  transaction_id text UNIQUE,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_purchases_organization_id ON public.bulk_purchases (organization_id);

ALTER TABLE public.bulk_purchases ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.bulk_purchases TO authenticated;
GRANT ALL ON public.bulk_purchases TO service_role;

CREATE POLICY "Owners can view their bulk purchases"
  ON public.bulk_purchases FOR SELECT TO authenticated USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on bulk_purchases"
  ON public.bulk_purchases FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. eSIM seats — one row per purchased seat; provisioned lazily on assignment
CREATE TABLE IF NOT EXISTS public.esim_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_purchase_id uuid NOT NULL REFERENCES public.bulk_purchases(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  assigned_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_email text,
  status text NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esim_seats_bulk_purchase_id ON public.esim_seats (bulk_purchase_id);
CREATE INDEX IF NOT EXISTS idx_esim_seats_organization_id ON public.esim_seats (organization_id);

ALTER TABLE public.esim_seats ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.esim_seats TO authenticated;
GRANT ALL ON public.esim_seats TO service_role;

CREATE POLICY "Owners can view their esim seats"
  ON public.esim_seats FOR SELECT TO authenticated USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on esim_seats"
  ON public.esim_seats FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. Auto-create an organization row for business signups (mirrors the profile auto-creation below)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;

  IF new.raw_user_meta_data ->> 'account_type' = 'business' THEN
    INSERT INTO public.organizations (owner_user_id, name, company_email)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data ->> 'company_name', 'My Business'),
      new.email
    )
    ON CONFLICT (company_email) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

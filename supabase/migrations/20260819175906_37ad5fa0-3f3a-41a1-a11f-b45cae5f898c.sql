CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  location_code text NOT NULL,
  location_name text NOT NULL,
  flag_emoji text NOT NULL DEFAULT '🌍',
  name text NOT NULL,
  region_type text NOT NULL DEFAULT 'country',
  data_mb integer NOT NULL,
  validity_days integer NOT NULL,
  retail_price_usd numeric(10,2) NOT NULL,
  local_currency text,
  local_price numeric(12,2),
  networks text[] NOT NULL DEFAULT '{}',
  is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.packages TO anon;
GRANT SELECT ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Packages are publicly viewable" ON public.packages FOR SELECT TO anon, authenticated USING (is_active);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email text NOT NULL,
  package_code text NOT NULL REFERENCES public.packages(code),
  device_type text NOT NULL DEFAULT 'ios',
  payment_method text NOT NULL DEFAULT 'card',
  amount_usd numeric(10,2),
  status text NOT NULL DEFAULT 'pending',
  esim_iccid text,
  qr_code_url text,
  smdp_address text,
  activation_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.orders TO anon;
GRANT INSERT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can place an order" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);

INSERT INTO public.packages (code, location_code, location_name, flag_emoji, name, region_type, data_mb, validity_days, retail_price_usd, local_currency, local_price, networks, is_popular) VALUES
('ke-1gb-7', 'KE', 'Kenya', '🇰🇪', 'Kenya Data Pass', 'country', 1024, 7, 4.50, 'KES', 580.00, ARRAY['Safaricom 4G/5G','Airtel'], true),
('ke-5gb-30', 'KE', 'Kenya', '🇰🇪', 'Kenya Data Pass', 'country', 5120, 30, 15.00, 'KES', 1935.00, ARRAY['Safaricom 4G/5G'], true),
('ng-3gb-15', 'NG', 'Nigeria', '🇳🇬', 'Nigeria Data Pass', 'country', 3072, 15, 11.00, 'NGN', 16500.00, ARRAY['MTN 4G','Glo'], true),
('ng-10gb-30', 'NG', 'Nigeria', '🇳🇬', 'Nigeria Data Pass', 'country', 10240, 30, 26.00, 'NGN', 39000.00, ARRAY['MTN 4G/5G'], false),
('za-5gb-15', 'ZA', 'South Africa', '🇿🇦', 'South Africa Data Pass', 'country', 5120, 15, 13.50, 'ZAR', 245.00, ARRAY['Vodacom 5G','MTN'], true),
('za-20gb-30', 'ZA', 'South Africa', '🇿🇦', 'South Africa Max', 'country', 20480, 30, 34.00, 'ZAR', 620.00, ARRAY['Vodacom 5G'], false),
('gh-3gb-15', 'GH', 'Ghana', '🇬🇭', 'Ghana Data Pass', 'country', 3072, 15, 10.00, 'GHS', 150.00, ARRAY['MTN 4G'], false),
('eg-5gb-30', 'EG', 'Egypt', '🇪🇬', 'Egypt Data Pass', 'country', 5120, 30, 17.00, 'EGP', 830.00, ARRAY['Orange 4G','Vodafone'], false),
('ma-5gb-15', 'MA', 'Morocco', '🇲🇦', 'Morocco Data Pass', 'country', 5120, 15, 14.00, 'MAD', 140.00, ARRAY['Maroc Telecom'], false),
('ae-5gb-15', 'AE', 'United Arab Emirates', '🇦🇪', 'Dubai / UAE Pass', 'country', 5120, 15, 18.00, 'AED', 66.00, ARRAY['Etisalat 5G','du'], true),
('gb-10gb-30', 'GB', 'United Kingdom', '🇬🇧', 'UK Data Pass', 'country', 10240, 30, 19.00, 'GBP', 15.00, ARRAY['EE 5G','Three'], false),
('us-10gb-30', 'US', 'United States', '🇺🇸', 'USA Data Pass', 'country', 10240, 30, 22.00, 'USD', 22.00, ARRAY['T-Mobile 5G','AT&T'], true),
('eafr-5gb-15', 'EAFR', 'East Africa', '🌍', 'East Africa Regional Pass', 'regional', 5120, 15, 21.00, 'KES', 2710.00, ARRAY['Safaricom','MTN','Airtel'], true),
('wafr-10gb-30', 'WAFR', 'West Africa', '🌍', 'West Africa Regional Pass', 'regional', 10240, 30, 39.00, 'NGN', 58500.00, ARRAY['MTN','Orange','Glo'], true),
('afr-20gb-30', 'AFR', 'Pan-Africa', '🌍', 'Pan-Africa Unlimited-ish', 'regional', 20480, 30, 59.00, 'USD', 59.00, ARRAY['MTN','Vodacom','Safaricom','Orange'], true),
('eu-10gb-30', 'EU', 'Europe', '🇪🇺', 'Europe Regional Pass', 'regional', 10240, 30, 24.00, 'EUR', 22.00, ARRAY['Vodafone','Orange','O2'], true);
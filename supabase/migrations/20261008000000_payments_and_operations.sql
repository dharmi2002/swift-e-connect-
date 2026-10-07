-- Payment state and operational data. Payment must be verified before supplier fulfillment.
alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  add column if not exists payment_reference text unique,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  provider text,
  provider_reference text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (order_id, event_type, provider_reference)
);

create table if not exists public.esim_line_events (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.esim_lines(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.esim_topups (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.esim_lines(id) on delete cascade,
  package_code text not null references public.packages(code),
  transaction_id text not null unique,
  amount_usd numeric(10,2),
  status text not null default 'processing' check (status in ('processing', 'paid', 'completed', 'failed')),
  payment_provider text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_reference text unique,
  paid_at timestamptz,
  payment_metadata jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- The table may already exist in a staging database from an earlier revision.
-- Keep the migration safe for both fresh and upgraded environments.
alter table public.esim_topups
  drop constraint if exists esim_topups_status_check;
alter table public.esim_topups
  add constraint esim_topups_status_check
  check (status in ('processing', 'paid', 'completed', 'failed'));
alter table public.esim_topups
  add column if not exists payment_provider text,
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  add column if not exists payment_reference text unique,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_orders_payment_reference on public.orders(payment_reference);
create index if not exists idx_topups_payment_reference on public.esim_topups(payment_reference);
create index if not exists idx_order_events_order on public.order_events(order_id, created_at desc);
create index if not exists idx_line_events_line on public.esim_line_events(line_id, created_at desc);

alter table public.order_events enable row level security;
alter table public.esim_line_events enable row level security;
alter table public.esim_topups enable row level security;

create policy "Members can view organization order events" on public.order_events
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.created_by_user_id = auth.uid()
          or (o.organization_id is not null and public.is_org_member(o.organization_id)))
    )
  );

create policy "Members can view line events" on public.esim_line_events
  for select to authenticated using (
    exists (
      select 1 from public.esim_lines l
      where l.id = line_id and public.is_org_member(l.organization_id)
    )
  );

create policy "Members can view line topups" on public.esim_topups
  for select to authenticated using (
    exists (
      select 1 from public.esim_lines l
      where l.id = line_id and public.is_org_member(l.organization_id)
    )
  );

grant select on public.order_events, public.esim_line_events, public.esim_topups to authenticated;
grant all on public.order_events, public.esim_line_events, public.esim_topups to service_role;

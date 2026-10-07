-- Business accounts, team membership, invitations, and centrally managed eSIM lines.
-- All columns are nullable where needed to preserve the existing guest checkout flow.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Compatibility with the original business-account migration already used by
-- existing deployments. Keep its columns and make the new membership model
-- additive instead of requiring a destructive table replacement.
alter table public.organizations add column if not exists slug text;
alter table public.organizations add column if not exists created_by uuid references auth.users(id) on delete restrict;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'owner_user_id'
  ) then
    update public.organizations set created_by = owner_user_id where created_by is null;
    alter table public.organizations alter column owner_user_id drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'company_email'
  ) then
    alter table public.organizations alter column company_email drop not null;
  end if;
end $$;
update public.organizations
set slug = coalesce(
  nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''),
  'org'
) || '-' || left(id::text, 8)
where slug is null;
alter table public.organizations alter column slug set not null;
create unique index if not exists organizations_slug_key on public.organizations(slug);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('owner', 'admin', 'billing', 'manager', 'employee')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'owner_user_id'
  ) then
    insert into public.organization_members (organization_id, user_id, role)
    select id, coalesce(created_by, owner_user_id), 'owner'
    from public.organizations
    where coalesce(created_by, owner_user_id) is not null
    on conflict (organization_id, user_id) do nothing;
  else
    insert into public.organization_members (organization_id, user_id, role)
    select id, created_by, 'owner'
    from public.organizations
    where created_by is not null
    on conflict (organization_id, user_id) do nothing;
  end if;
end $$;

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'employee' check (role in ('admin', 'billing', 'manager', 'employee')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.esim_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  package_code text not null references public.packages(code),
  label text,
  esim_tran_no text unique,
  iccid text unique,
  qr_code_url text,
  smdp_address text,
  activation_code text,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'active', 'suspended', 'revoked')),
  data_mb integer,
  validity_days integer,
  data_used_mb numeric not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists quantity integer not null default 1 check (quantity > 0 and quantity <= 100);

create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_invitations_email on public.organization_invitations(lower(email));
create index if not exists idx_esim_lines_org on public.esim_lines(organization_id, status);
create index if not exists idx_esim_lines_assigned on public.esim_lines(assigned_to);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.esim_lines enable row level security;

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_org_manager(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin', 'manager')
  );
$$;

create or replace function public.is_org_billing_admin(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin', 'billing')
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_manager(uuid) to authenticated;
grant execute on function public.is_org_billing_admin(uuid) to authenticated;

create policy "Members can view their organizations" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "Users can create organizations" on public.organizations
  for insert to authenticated with check (created_by = auth.uid());
create policy "Managers can update organizations" on public.organizations
  for update to authenticated using (public.is_org_manager(id)) with check (public.is_org_manager(id));

create policy "Members can view organization members" on public.organization_members
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Managers can manage organization members" on public.organization_members
  for insert to authenticated with check (public.is_org_manager(organization_id));
create policy "Managers can update organization members" on public.organization_members
  for update to authenticated using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
create policy "Owners can remove organization members" on public.organization_members
  for delete to authenticated using (public.is_org_manager(organization_id));

create policy "Managers can view invitations" on public.organization_invitations
  for select to authenticated using (public.is_org_manager(organization_id));

create policy "Members can view organization eSIM lines" on public.esim_lines
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Managers can create organization eSIM lines" on public.esim_lines
  for insert to authenticated with check (public.is_org_manager(organization_id));
create policy "Managers can update organization eSIM lines" on public.esim_lines
  for update to authenticated using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));

create policy "Users can view their own organization orders" on public.orders
  for select to authenticated using (
    created_by_user_id = auth.uid()
    or (organization_id is not null and public.is_org_member(organization_id))
  );

create or replace function public.touch_esim_line_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists esim_lines_updated_at on public.esim_lines;
create trigger esim_lines_updated_at before update on public.esim_lines
for each row execute function public.touch_esim_line_updated_at();

grant select on public.organizations, public.organization_members, public.organization_invitations, public.esim_lines to authenticated;
grant insert, update on public.organizations, public.organization_members, public.esim_lines to authenticated;
grant select on public.orders to authenticated;

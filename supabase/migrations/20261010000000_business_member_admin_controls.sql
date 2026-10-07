-- Keep direct Supabase writes aligned with the server-side member-management rules.
-- Managers may operate lines and invite ordinary staff, but only owners/admins
-- may grant privileged roles or remove members.

create or replace function public.can_manage_org_roles(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

grant execute on function public.can_manage_org_roles(uuid) to authenticated;

drop policy if exists "Managers can manage organization members" on public.organization_members;
drop policy if exists "Managers can update organization members" on public.organization_members;
drop policy if exists "Owners can remove organization members" on public.organization_members;

create policy "Managers can invite non-privileged members" on public.organization_members
  for insert to authenticated
  with check (
    public.is_org_manager(organization_id)
    and role <> 'owner'
    and (role <> 'admin' or public.can_manage_org_roles(organization_id))
  );

create policy "Owners and admins can update members" on public.organization_members
  for update to authenticated
  using (public.can_manage_org_roles(organization_id) and role <> 'owner')
  with check (public.can_manage_org_roles(organization_id) and role <> 'owner');

create policy "Owners and admins can remove members" on public.organization_members
  for delete to authenticated
  using (public.can_manage_org_roles(organization_id) and role <> 'owner');

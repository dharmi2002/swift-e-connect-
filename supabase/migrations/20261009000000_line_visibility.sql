-- Restrict eSIM line visibility to operational roles or the assigned employee.
-- Managers and billing users need line visibility for assignment/top-up operations;
-- employees must never receive another employee's activation credentials.

create or replace function public.can_view_org_line(target_org uuid, target_assignee uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
      and (
        role in ('owner', 'admin', 'manager', 'billing')
        or target_assignee = auth.uid()
      )
  );
$$;

grant execute on function public.can_view_org_line(uuid, uuid) to authenticated;

drop policy if exists "Members can view organization eSIM lines" on public.esim_lines;
create policy "Authorized users can view organization eSIM lines" on public.esim_lines
  for select to authenticated
  using (public.can_view_org_line(organization_id, assigned_to));

-- Employees should not receive organization-wide billing or usage history.
drop policy if exists "Users can view their own organization orders" on public.orders;
create policy "Authorized users can view organization orders" on public.orders
  for select to authenticated using (
    created_by_user_id = auth.uid()
    or (
      organization_id is not null
      and (public.is_org_manager(organization_id) or public.is_org_billing_admin(organization_id))
    )
  );

drop policy if exists "Members can view organization order events" on public.order_events;
create policy "Authorized users can view organization order events" on public.order_events
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.created_by_user_id = auth.uid()
          or (
            o.organization_id is not null
            and (public.is_org_manager(o.organization_id) or public.is_org_billing_admin(o.organization_id))
          )
        )
    )
  );

drop policy if exists "Members can view line events" on public.esim_line_events;
create policy "Authorized users can view line events" on public.esim_line_events
  for select to authenticated using (
    exists (
      select 1 from public.esim_lines l
      where l.id = line_id and public.can_view_org_line(l.organization_id, l.assigned_to)
    )
  );

drop policy if exists "Members can view line topups" on public.esim_topups;
create policy "Authorized users can view line topups" on public.esim_topups
  for select to authenticated using (
    exists (
      select 1 from public.esim_lines l
      where l.id = line_id and public.can_view_org_line(l.organization_id, l.assigned_to)
    )
  );

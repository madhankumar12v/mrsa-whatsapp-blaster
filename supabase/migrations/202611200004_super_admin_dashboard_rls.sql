-- Super Admin read access for the platform console.
-- The helper is SECURITY DEFINER so its role check is not blocked by profiles RLS.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.platform_role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

drop policy if exists "Super admins can read all profiles" on public.profiles;
create policy "Super admins can read all profiles"
on public.profiles for select to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins can read all workspaces" on public.workspaces;
create policy "Super admins can read all workspaces"
on public.workspaces for select to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins can read all workspace memberships" on public.workspace_memberships;
create policy "Super admins can read all workspace memberships"
on public.workspace_memberships for select to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins can read all subscriptions" on public.workspace_subscriptions;
create policy "Super admins can read all subscriptions"
on public.workspace_subscriptions for select to authenticated
using (public.is_super_admin());

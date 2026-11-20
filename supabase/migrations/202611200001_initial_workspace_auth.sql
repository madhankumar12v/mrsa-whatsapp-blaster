-- MrSa WhatsApp Blaster: Supabase Auth + workspace foundation
-- Apply this migration in the Supabase SQL Editor or with Supabase CLI.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  platform_role text not null default 'user' check (platform_role in ('user', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  owner_email text,
  created_at timestamptz not null default now()
);
create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists workspace_memberships_user_idx on public.workspace_memberships(user_id);
create index if not exists workspace_memberships_workspace_idx on public.workspace_memberships(workspace_id);

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_name text not null default 'Starter',
  monthly_price_paise integer not null default 29900 check (monthly_price_paise > 0),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'expired', 'suspended')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  paid_through timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null,
  phone text not null,
  group_name text not null default 'Customers',
  consent_status text not null default 'pending' check (consent_status in ('opted_in', 'pending', 'opted_out')),
  consent_source text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, phone)
);
create index if not exists contacts_workspace_created_idx on public.contacts(workspace_id, created_at desc);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  new_workspace_id uuid;
  user_name text;
  workspace_label text;
begin
  user_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  workspace_label := coalesce(nullif(trim(new.raw_user_meta_data ->> 'workspace_name'), ''), user_name || '''s Workspace');
  insert into public.profiles (id, full_name, email) values (new.id, user_name, new.email);
  insert into public.workspaces (name, owner_user_id, owner_email) values (workspace_label, new.id, new.email) returning id into new_workspace_id;
  insert into public.workspace_memberships (workspace_id, user_id, role) values (new_workspace_id, new.id, 'admin');
  insert into public.workspace_subscriptions (workspace_id, status, trial_started_at, trial_ends_at, plan_name, monthly_price_paise)
  values (new_workspace_id, 'trialing', now(), now() + interval '30 days', 'Starter', 29900);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_mrsa on auth.users;
create trigger on_auth_user_created_mrsa after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id and wm.user_id = (select auth.uid()));
$$;
create or replace function public.has_workspace_access(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_memberships wm
    join public.workspace_subscriptions ws on ws.workspace_id = wm.workspace_id
    where wm.workspace_id = target_workspace_id and wm.user_id = (select auth.uid())
      and ((ws.status = 'trialing' and ws.trial_ends_at > now())
        or (ws.status = 'active' and ws.paid_through > now()))
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.contacts enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()) and platform_role = 'user');
drop policy if exists "Members can read their workspace" on public.workspaces;
create policy "Members can read their workspace" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
drop policy if exists "Members can read workspace memberships" on public.workspace_memberships;
create policy "Members can read workspace memberships" on public.workspace_memberships for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "Members can read their subscription" on public.workspace_subscriptions;
create policy "Members can read their subscription" on public.workspace_subscriptions for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists "Active workspace members can read contacts" on public.contacts;
create policy "Active workspace members can read contacts" on public.contacts for select to authenticated using (public.has_workspace_access(workspace_id));
drop policy if exists "Active workspace admins can add contacts" on public.contacts;
create policy "Active workspace admins can add contacts" on public.contacts for insert to authenticated
with check (public.has_workspace_access(workspace_id) and created_by = (select auth.uid())
  and exists (select 1 from public.workspace_memberships wm where wm.workspace_id = contacts.workspace_id and wm.user_id = (select auth.uid()) and wm.role = 'admin'));
drop policy if exists "Active workspace admins can update contacts" on public.contacts;
create policy "Active workspace admins can update contacts" on public.contacts for update to authenticated
using (public.has_workspace_access(workspace_id)
  and exists (select 1 from public.workspace_memberships wm where wm.workspace_id = contacts.workspace_id and wm.user_id = (select auth.uid()) and wm.role = 'admin'))
with check (public.has_workspace_access(workspace_id));
drop policy if exists "Active workspace admins can delete contacts" on public.contacts;
create policy "Active workspace admins can delete contacts" on public.contacts for delete to authenticated
using (public.has_workspace_access(workspace_id)
  and exists (select 1 from public.workspace_memberships wm where wm.workspace_id = contacts.workspace_id and wm.user_id = (select auth.uid()) and wm.role = 'admin'));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.workspaces, public.workspace_memberships, public.workspace_subscriptions to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_access(uuid) to authenticated;

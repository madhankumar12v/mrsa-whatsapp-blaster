-- Security monitoring, team administration and audit trail.
create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_audit_logs_workspace_created_idx
  on public.security_audit_logs(workspace_id, created_at desc);
alter table public.security_audit_logs enable row level security;
drop policy if exists "Workspace admins can read security audit logs" on public.security_audit_logs;
create policy "Workspace admins can read security audit logs" on public.security_audit_logs
 for select to authenticated using (
  exists(select 1 from public.workspace_memberships wm where wm.workspace_id=security_audit_logs.workspace_id and wm.user_id=(select auth.uid()) and wm.role='admin')
 );
grant select on public.security_audit_logs to authenticated;

create table if not exists public.integration_health_checks (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 service text not null,
 status text not null check(status in ('healthy','degraded','down','not_configured')),
 checked_at timestamptz not null default now(),
 latency_ms integer,
 details jsonb not null default '{}'::jsonb
);
create index if not exists integration_health_workspace_checked_idx
 on public.integration_health_checks(workspace_id,checked_at desc);
alter table public.integration_health_checks enable row level security;
drop policy if exists "Workspace admins can read integration health" on public.integration_health_checks;
create policy "Workspace admins can read integration health" on public.integration_health_checks
 for select to authenticated using (
  exists(select 1 from public.workspace_memberships wm where wm.workspace_id=integration_health_checks.workspace_id and wm.user_id=(select auth.uid()) and wm.role='admin')
 );
grant select on public.integration_health_checks to authenticated;

create table if not exists public.webhook_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid references public.workspaces(id) on delete cascade,
 event_type text not null,
 status text not null check(status in ('received','processed','failed')),
 message_count integer not null default 0,
 details jsonb not null default '{}'::jsonb,
 received_at timestamptz not null default now(),
 processed_at timestamptz
);
create index if not exists webhook_events_workspace_received_idx
 on public.webhook_events(workspace_id,received_at desc);
alter table public.webhook_events enable row level security;
drop policy if exists "Workspace admins can read webhook events" on public.webhook_events;
create policy "Workspace admins can read webhook events" on public.webhook_events
 for select to authenticated using (
  workspace_id is not null and exists(select 1 from public.workspace_memberships wm where wm.workspace_id=webhook_events.workspace_id and wm.user_id=(select auth.uid()) and wm.role='admin')
 );
grant select on public.webhook_events to authenticated;

-- Only workspace admins can change another member's role or remove them.
drop policy if exists "Workspace admins can update member roles" on public.workspace_memberships;
create policy "Workspace admins can update member roles" on public.workspace_memberships
 for update to authenticated using (
  exists(select 1 from public.workspace_memberships admin where admin.workspace_id=workspace_memberships.workspace_id and admin.user_id=(select auth.uid()) and admin.role='admin')
 ) with check (
  role in ('admin','user') and exists(select 1 from public.workspace_memberships admin where admin.workspace_id=workspace_memberships.workspace_id and admin.user_id=(select auth.uid()) and admin.role='admin')
 );
drop policy if exists "Workspace admins can remove members" on public.workspace_memberships;
create policy "Workspace admins can remove members" on public.workspace_memberships
 for delete to authenticated using (
  user_id <> (select auth.uid()) and exists(select 1 from public.workspace_memberships admin where admin.workspace_id=workspace_memberships.workspace_id and admin.user_id=(select auth.uid()) and admin.role='admin')
 );
grant update, delete on public.workspace_memberships to authenticated;

create or replace function public.guard_workspace_membership_admin()
returns trigger language plpgsql security definer set search_path=''
as $$
declare admin_count integer;
begin
 if tg_op='UPDATE' then
   if new.workspace_id <> old.workspace_id or new.user_id <> old.user_id then
     raise exception 'Workspace and user identity cannot be changed.';
   end if;
 end if;
 if tg_op='DELETE' or (tg_op='UPDATE' and old.role='admin' and new.role<>'admin') then
   select count(*) into admin_count from public.workspace_memberships
    where workspace_id=old.workspace_id and role='admin';
   if admin_count <= 1 then raise exception 'A workspace must retain at least one administrator.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
drop trigger if exists guard_workspace_membership_admin_trigger on public.workspace_memberships;
create trigger guard_workspace_membership_admin_trigger
 before update or delete on public.workspace_memberships
 for each row execute function public.guard_workspace_membership_admin();

create or replace function public.write_workspace_audit_log()
returns trigger language plpgsql security definer set search_path=''
as $$
declare wid uuid; action_name text; target text; details_json jsonb;
begin
 if tg_op='DELETE' then wid:=old.workspace_id; target:=old.user_id::text; details_json:=jsonb_build_object('role',old.role); action_name:='team.member_removed';
 elsif tg_op='UPDATE' then wid:=new.workspace_id; target:=new.user_id::text; details_json:=jsonb_build_object('old_role',old.role,'new_role',new.role); action_name:='team.role_changed';
 else wid:=new.workspace_id; target:=new.user_id::text; details_json:=jsonb_build_object('role',new.role); action_name:='team.member_added';
 end if;
 insert into public.security_audit_logs(workspace_id,actor_user_id,action,target_type,target_id,details)
 values(wid,auth.uid(),action_name,'workspace_member',target,details_json);
 return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists workspace_membership_audit_trigger on public.workspace_memberships;
create trigger workspace_membership_audit_trigger
 after insert or update or delete on public.workspace_memberships
 for each row execute function public.write_workspace_audit_log();

create or replace function public.audit_manual_payment_changes()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.security_audit_logs(workspace_id,actor_user_id,action,target_type,target_id,details)
 values(coalesce(new.workspace_id,old.workspace_id),auth.uid(),
  case when tg_op='INSERT' then 'billing.payment_submitted' else 'billing.payment_reviewed' end,
  'manual_payment',coalesce(new.id,old.id)::text,
  jsonb_build_object('status',coalesce(new.status,old.status),'amount_paise',coalesce(new.amount_paise,old.amount_paise)));
 return new;
end;
$$;
drop trigger if exists manual_payment_audit_trigger on public.manual_payment_submissions;
create trigger manual_payment_audit_trigger after insert or update on public.manual_payment_submissions
 for each row execute function public.audit_manual_payment_changes();

-- Campaign protection and monthly WhatsApp usage accounting.
-- Existing workspaces remain uncapped until an administrator configures a plan limit.
alter table public.workspace_subscriptions
  add column if not exists monthly_message_limit integer
    check (monthly_message_limit is null or monthly_message_limit >= 0),
  add column if not exists monthly_contact_limit integer
    check (monthly_contact_limit is null or monthly_contact_limit >= 0);

create table if not exists public.whatsapp_monthly_usage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  usage_month date not null,
  messages_attempted integer not null default 0 check (messages_attempted >= 0),
  messages_accepted integer not null default 0 check (messages_accepted >= 0),
  messages_failed integer not null default 0 check (messages_failed >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, usage_month)
);
alter table public.whatsapp_monthly_usage enable row level security;
drop policy if exists "Workspace admins can read monthly WhatsApp usage" on public.whatsapp_monthly_usage;
create policy "Workspace admins can read monthly WhatsApp usage"
  on public.whatsapp_monthly_usage for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = whatsapp_monthly_usage.workspace_id
      and wm.user_id = (select auth.uid()) and wm.role = 'admin'
  ));
grant select on public.whatsapp_monthly_usage to authenticated;
grant all on public.whatsapp_monthly_usage to service_role;

create or replace function public.reserve_whatsapp_message_usage(
  p_workspace_id uuid,
  p_message_count integer,
  p_actor_user_id uuid
) returns table(allowed boolean, used integer, monthly_limit integer, remaining integer)
language plpgsql security definer set search_path=''
as $$
declare
  current_limit integer;
  current_used integer;
  month_start date := date_trunc('month', timezone('utc', now()))::date;
begin
  if p_message_count is null or p_message_count < 1 or p_message_count > 50 then
    raise exception 'A campaign must contain between 1 and 50 unique recipients.';
  end if;
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required.';
  end if;
  if not exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_user_id and wm.role = 'admin'
  ) then
    raise exception 'Workspace administrator access is required.';
  end if;
  perform 1 from public.workspace_subscriptions ws
    where ws.workspace_id = p_workspace_id
      and ((ws.status = 'trialing' and ws.trial_ends_at > now())
        or (ws.status = 'active' and ws.paid_through > now()))
    for update;
  if not found then raise exception 'An active subscription or valid free trial is required.'; end if;
  select ws.monthly_message_limit into current_limit
    from public.workspace_subscriptions ws where ws.workspace_id = p_workspace_id;
  insert into public.whatsapp_monthly_usage(workspace_id, usage_month)
    values(p_workspace_id, month_start) on conflict do nothing;
  select u.messages_attempted into current_used
    from public.whatsapp_monthly_usage u
    where u.workspace_id = p_workspace_id and u.usage_month = month_start
    for update;
  if current_limit is not null and current_used + p_message_count > current_limit then
    return query select false, current_used, current_limit, greatest(0, current_limit-current_used);
    return;
  end if;
  update public.whatsapp_monthly_usage
    set messages_attempted = messages_attempted + p_message_count, updated_at = now()
    where workspace_id = p_workspace_id and usage_month = month_start
    returning messages_attempted into current_used;
  return query select true, current_used, current_limit,
    case when current_limit is null then null else greatest(0,current_limit-current_used) end;
end;
$$;
revoke all on function public.reserve_whatsapp_message_usage(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.reserve_whatsapp_message_usage(uuid,integer,uuid) to service_role;

create or replace function public.record_whatsapp_message_results(
  p_workspace_id uuid,
  p_accepted integer,
  p_failed integer
) returns void
language plpgsql security definer set search_path=''
as $$
declare month_start date := date_trunc('month', timezone('utc', now()))::date;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role is required.'; end if;
  if coalesce(p_accepted,0) < 0 or coalesce(p_failed,0) < 0 then
    raise exception 'Usage result counts cannot be negative.';
  end if;
  update public.whatsapp_monthly_usage
    set messages_accepted = messages_accepted + coalesce(p_accepted,0),
        messages_failed = messages_failed + coalesce(p_failed,0),
        updated_at = now()
    where workspace_id = p_workspace_id and usage_month = month_start;
end;
$$;
revoke all on function public.record_whatsapp_message_results(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.record_whatsapp_message_results(uuid,integer,integer) to service_role;

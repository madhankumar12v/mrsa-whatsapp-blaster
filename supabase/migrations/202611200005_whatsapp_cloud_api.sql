-- WhatsApp Cloud API consent evidence and message delivery logs.
-- Apply in Supabase SQL Editor before enabling the Cloudflare Pages Functions.
alter table public.contacts
  add column if not exists consent_at timestamptz,
  add column if not exists consent_source text,
  add column if not exists consent_evidence text;

create table if not exists public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  recipient_phone text not null,
  template_name text not null,
  meta_message_id text unique,
  status text not null default 'accepted',
  status_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_message_logs_workspace_created_idx
  on public.whatsapp_message_logs(workspace_id, created_at desc);
create index if not exists whatsapp_message_logs_contact_idx
  on public.whatsapp_message_logs(contact_id, created_at desc);

alter table public.whatsapp_message_logs enable row level security;

drop policy if exists "Workspace admins can read WhatsApp message logs" on public.whatsapp_message_logs;
create policy "Workspace admins can read WhatsApp message logs"
on public.whatsapp_message_logs for select to authenticated
using (
  public.has_workspace_access(workspace_id)
  and exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = whatsapp_message_logs.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = 'admin'
  )
);

grant select on public.whatsapp_message_logs to authenticated;

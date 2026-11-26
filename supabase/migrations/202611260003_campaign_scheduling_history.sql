-- Campaign scheduling and durable campaign-level history.
alter table public.campaign_drafts
  add column if not exists template_name text,
  add column if not exists template_language text,
  add column if not exists template_parameters jsonb not null default '[]'::jsonb,
  add column if not exists contact_ids uuid[] not null default '{}',
  add column if not exists scheduled_at timestamptz;

alter table public.campaign_drafts drop constraint if exists campaign_drafts_status_check;
alter table public.campaign_drafts add constraint campaign_drafts_status_check
  check (status in ('draft','archived','scheduled','processing','sent','failed'));

create index if not exists campaign_drafts_due_schedule_idx
  on public.campaign_drafts(scheduled_at)
  where status = 'scheduled';

create table if not exists public.campaign_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_draft_id uuid references public.campaign_drafts(id) on delete set null,
  campaign_name text not null,
  template_name text not null,
  category text not null check (category in ('marketing','utility')),
  language text not null default 'en_US',
  parameters jsonb not null default '[]'::jsonb,
  audience_count integer not null default 0 check (audience_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  status text not null check (status in ('scheduled','processing','completed','partial','failed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_runs_workspace_created_idx
  on public.campaign_runs(workspace_id, created_at desc);

alter table public.campaign_runs enable row level security;

drop policy if exists "Workspace members can read campaign runs" on public.campaign_runs;
create policy "Workspace members can read campaign runs"
  on public.campaign_runs for select to authenticated
  using (public.has_workspace_access(workspace_id));

drop policy if exists "Workspace admins can create campaign runs" on public.campaign_runs;
create policy "Workspace admins can create campaign runs"
  on public.campaign_runs for insert to authenticated
  with check (
    public.has_workspace_access(workspace_id)
    and (created_by is null or created_by = (select auth.uid()))
    and exists (
      select 1 from public.workspace_memberships wm
      where wm.workspace_id = campaign_runs.workspace_id
        and wm.user_id = (select auth.uid()) and wm.role = 'admin'
    )
  );

grant select, insert on public.campaign_runs to authenticated;

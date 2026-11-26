-- Persist campaign drafts per workspace with member isolation.
create table if not exists public.campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  message text not null check (char_length(trim(message)) between 1 and 10000),
  category text not null default 'marketing' check (category in ('marketing', 'utility')),
  audience_count integer not null default 0 check (audience_count >= 0),
  status text not null default 'draft' check (status in ('draft', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_drafts_workspace_created_idx
  on public.campaign_drafts(workspace_id, created_at desc);

alter table public.campaign_drafts enable row level security;

drop policy if exists "Workspace members can read campaign drafts" on public.campaign_drafts;
create policy "Workspace members can read campaign drafts"
  on public.campaign_drafts for select to authenticated
  using (public.has_workspace_access(workspace_id));

drop policy if exists "Workspace admins can create campaign drafts" on public.campaign_drafts;
create policy "Workspace admins can create campaign drafts"
  on public.campaign_drafts for insert to authenticated
  with check (
    public.has_workspace_access(workspace_id)
    and (created_by is null or created_by = (select auth.uid()))
    and exists (
      select 1 from public.workspace_memberships wm
      where wm.workspace_id = campaign_drafts.workspace_id
        and wm.user_id = (select auth.uid()) and wm.role = 'admin'
    )
  );

drop policy if exists "Workspace admins can update campaign drafts" on public.campaign_drafts;
create policy "Workspace admins can update campaign drafts"
  on public.campaign_drafts for update to authenticated
  using (
    public.has_workspace_access(workspace_id)
    and exists (
      select 1 from public.workspace_memberships wm
      where wm.workspace_id = campaign_drafts.workspace_id
        and wm.user_id = (select auth.uid()) and wm.role = 'admin'
    )
  )
  with check (public.has_workspace_access(workspace_id));

drop policy if exists "Workspace admins can delete campaign drafts" on public.campaign_drafts;
create policy "Workspace admins can delete campaign drafts"
  on public.campaign_drafts for delete to authenticated
  using (
    public.has_workspace_access(workspace_id)
    and exists (
      select 1 from public.workspace_memberships wm
      where wm.workspace_id = campaign_drafts.workspace_id
        and wm.user_id = (select auth.uid()) and wm.role = 'admin'
    )
  );

grant select, insert, update, delete on public.campaign_drafts to authenticated;

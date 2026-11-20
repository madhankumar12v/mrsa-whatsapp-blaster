-- Manual UPI payment submissions and admin-controlled subscription activation.
-- Customers submit a UTR; this migration never treats a submitted reference as proof of payment.

create table if not exists public.manual_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  utr text not null check (char_length(trim(utr)) between 6 and 80),
  amount_paise integer not null default 29900 check (amount_paise = 29900),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  customer_note text,
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists manual_payment_submissions_utr_unique
  on public.manual_payment_submissions (lower(trim(utr)));
create index if not exists manual_payment_submissions_workspace_created_idx
  on public.manual_payment_submissions (workspace_id, created_at desc);

alter table public.manual_payment_submissions enable row level security;
revoke all on public.manual_payment_submissions from anon, authenticated;
grant select, insert on public.manual_payment_submissions to authenticated;

drop policy if exists "Workspace members can view payment submissions" on public.manual_payment_submissions;
create policy "Submitters and workspace admins can view payment submissions"
  on public.manual_payment_submissions for select to authenticated
  using (
    submitted_by = (select auth.uid())
    or exists (
      select 1 from public.workspace_memberships wm
      where wm.workspace_id = manual_payment_submissions.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role = 'admin'
    )
  );

drop policy if exists "Workspace members can submit UPI payment references" on public.manual_payment_submissions;
create policy "Workspace members can submit UPI payment references"
  on public.manual_payment_submissions for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and amount_paise = 29900
    and public.is_workspace_member(workspace_id)
  );

create or replace function public.review_manual_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_admin_note text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.manual_payment_submissions%rowtype;
  admin_ok boolean;
  access_start timestamptz;
begin
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = (
      select m.workspace_id from public.manual_payment_submissions m where m.id = p_payment_id
    )
      and wm.user_id = (select auth.uid())
      and wm.role = 'admin'
  ) into admin_ok;

  if not admin_ok then
    raise exception 'Workspace administrator access is required.';
  end if;

  select * into payment_row
  from public.manual_payment_submissions
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment submission not found.';
  end if;
  if payment_row.status <> 'pending' then
    raise exception 'This payment submission has already been reviewed.';
  end if;

  if p_approve then
    select greatest(
      now(),
      coalesce(ws.paid_through, ws.trial_ends_at, now())
    ) into access_start
    from public.workspace_subscriptions ws
    where ws.workspace_id = payment_row.workspace_id
    for update;

    if access_start is null then
      raise exception 'Workspace subscription was not found.';
    end if;

    update public.workspace_subscriptions
      set status = 'active',
          paid_through = access_start + interval '30 days',
          updated_at = now()
      where workspace_id = payment_row.workspace_id;

    update public.manual_payment_submissions
      set status = 'approved',
          admin_note = coalesce(nullif(trim(p_admin_note), ''), 'Payment verified by workspace admin.'),
          reviewed_by = (select auth.uid()),
          reviewed_at = now()
      where id = p_payment_id;
  else
    update public.manual_payment_submissions
      set status = 'rejected',
          admin_note = coalesce(nullif(trim(p_admin_note), ''), 'Payment could not be verified.'),
          reviewed_by = (select auth.uid()),
          reviewed_at = now()
      where id = p_payment_id;
  end if;

  return true;
end;
$$;

revoke all on function public.review_manual_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_manual_payment(uuid, boolean, text) to authenticated;

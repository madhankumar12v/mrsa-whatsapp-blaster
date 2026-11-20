-- MrSa WhatsApp Blaster: Razorpay billing records and atomic activation.
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  provider_order_id text not null unique,
  provider_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created','paid','failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payment_orders_workspace_created_idx
  on public.payment_orders(workspace_id, created_at desc);

alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from anon, authenticated;
grant all on public.payment_orders to service_role;

-- Only the server-side service role may activate an order. This function is
-- transactional and idempotent; clients cannot call it with their user JWT.
create or replace function public.activate_mrsa_payment(
  p_order_id text,
  p_payment_id text,
  p_amount_paise integer,
  p_currency text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payment_orders%rowtype;
begin
  select * into payment_row
  from public.payment_orders
  where provider_order_id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if payment_row.amount_paise <> p_amount_paise
     or payment_row.currency <> p_currency
     or p_currency <> 'INR' then
    return false;
  end if;

  if payment_row.status = 'paid' then
    return payment_row.provider_payment_id = p_payment_id;
  end if;

  update public.payment_orders
  set status = 'paid',
      provider_payment_id = p_payment_id,
      paid_at = now()
  where id = payment_row.id;

  update public.workspace_subscriptions
  set status = 'active',
      paid_through = greatest(coalesce(paid_through, now()), now()) + interval '30 days',
      updated_at = now()
  where workspace_id = payment_row.workspace_id;

  return true;
end;
$$;

revoke all on function public.activate_mrsa_payment(text,text,integer,text) from public, anon, authenticated;
grant execute on function public.activate_mrsa_payment(text,text,integer,text) to service_role;

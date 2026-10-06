-- Apply before deploying the operations refresh. Additive; historic records stay closed.
begin;
alter table public.deliveries
  add column if not exists is_ready boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists dealership_address text,
  add column if not exists return_plan text,
  add column if not exists paperwork_status text,
  add column if not exists paperwork_at timestamptz,
  add column if not exists paperwork_by text,
  add column if not exists paperwork_recipient text,
  add column if not exists trade_returned_at timestamptz,
  add column if not exists trade_returned_by text,
  add column if not exists closeout_required boolean not null default false,
  add column if not exists closeout_completed_at timestamptz,
  add column if not exists cod_exception text,
  add column if not exists completed_by_name text;
-- NULL on historical records is intentional; do not invent previous handoffs.
alter table public.deliveries alter column paperwork_status set default 'pending';
create or replace function public.compute_delivery_closeout()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.delivered_at is not null and (new.closeout_required or new.closeout_completed_at is not null) then
    new.closeout_required :=
      (coalesce(new.cod_required, false) and not coalesce(new.cod_received, false))
      or (coalesce(new.is_trade, false) and new.trade_returned_at is null)
      or (coalesce(new.paperwork_status, 'pending') not in ('ups','dealer','not_required'));
    if new.closeout_required then new.closeout_completed_at := null;
    else new.closeout_completed_at := coalesce(new.closeout_completed_at, now()); end if;
  end if;
  return new;
end; $$;
drop trigger if exists deliveries_closeout on public.deliveries;
create trigger deliveries_closeout before insert or update on public.deliveries
for each row execute function public.compute_delivery_closeout();
create index if not exists deliveries_closeout_pending_idx on public.deliveries (delivered_at) where closeout_required = true;
commit;

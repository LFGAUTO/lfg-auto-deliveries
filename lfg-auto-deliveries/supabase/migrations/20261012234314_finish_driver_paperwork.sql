create or replace function public.compute_delivery_closeout()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.delivered_at is not null and (new.closeout_required or new.closeout_completed_at is not null) then
    new.closeout_required :=
      (coalesce(new.cod_required, false) and not coalesce(new.cod_received, false))
      or (coalesce(new.is_trade, false) and new.trade_returned_at is null)
      or (coalesce(new.paperwork_status, 'pending') not in ('ups','dealer','office','not_required','e_contracts'));
    if new.closeout_required then new.closeout_completed_at := null;
    else new.closeout_completed_at := coalesce(new.closeout_completed_at, now()); end if;
  end if;
  return new;
end; $$;

-- Recompute current pending runs; historic completed deliveries stay untouched.
update public.deliveries set closeout_required=true
where delivered_at is not null and closeout_required=true
  and paperwork_status in ('office','e_contracts');

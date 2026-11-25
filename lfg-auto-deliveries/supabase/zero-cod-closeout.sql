create or replace function public.compute_delivery_closeout()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.delivered_at is not null and (new.closeout_required or new.closeout_completed_at is not null) then
    new.closeout_required :=
      (coalesce(new.cod_required, false) and not coalesce(new.cod_received, false)
       and regexp_replace(coalesce(new.cod_amount, ''), '[$,[:space:]]', '', 'g') <> ''
       and regexp_replace(coalesce(new.cod_amount, ''), '[$,[:space:]]', '', 'g') !~ '^0+([.]0+)?$')
      or (coalesce(new.is_trade, false) and new.trade_returned_at is null)
      or (coalesce(new.paperwork_status, 'pending') not in ('ups','dealer','office','not_required','e_contracts'));
    if new.closeout_required then new.closeout_completed_at := null;
    else new.closeout_completed_at := coalesce(new.closeout_completed_at, now()); end if;
  end if;
  return new;
end; $$;


-- Recompute only currently open zero/blank COD runs; do not mark money received.
update public.deliveries set closeout_required = true
where delivered_at is not null and closeout_required = true and cod_required = true
  and (regexp_replace(coalesce(cod_amount, ''), '[$,[:space:]]', '', 'g') = ''
    or regexp_replace(coalesce(cod_amount, ''), '[$,[:space:]]', '', 'g') ~ '^0+([.]0+)?$');

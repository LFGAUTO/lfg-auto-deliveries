-- Add a separate follow-up outcome without changing delivery or photo-received flags.
alter table public.deliveries add column if not exists client_photo_pending boolean not null default false;
-- Preserve the live RPCs, including their authorization and all unrelated logic.
do $$
declare signature text; source text;
begin
 foreach signature in array array['public.driver_portal(jsonb)','public.observer_deliveries()'] loop
  source := pg_get_functiondef(signature::regprocedure);
  if position('''client_photo_pending''' in source)=0 then
   if position('''client_photo_refused'',''e_contract''' in source)=0 then
    raise exception 'Photo field anchor missing in %',signature;
   end if;
   execute replace(source,'''client_photo_refused'',''e_contract''','''client_photo_refused'',''client_photo_pending'',''e_contract''');
  end if;
 end loop;
end $$;

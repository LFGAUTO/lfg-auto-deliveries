begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where email='lfgcars+delivery@mail.grokbot.com'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare rows jsonb; item jsonb; changes integer;begin
 if public.is_admin() or public.is_driver() then raise exception 'Observer inherited operational write role';end if;
 if exists(select 1 from public.deliveries) or exists(select 1 from public.payroll_paid) then raise exception 'Raw private records exposed';end if;
 rows:=public.observer_deliveries();
 if jsonb_typeof(rows)<>'array' then raise exception 'Observer results unavailable';end if;
 for item in select value from jsonb_array_elements(rows) loop
  if item ?| array['contract_photo_url','trade_photo_url','extra_photos','driver_signature','pay_amount','pay_adjust','customer_phone','customer_email','vin'] then raise exception 'Disallowed fields exposed';end if;
 end loop;
 update public.deliveries set status='issue';get diagnostics changes=row_count;if changes<>0 then raise exception 'Observer changed deliveries';end if;
 update public.profiles set role='admin' where id=auth.uid();get diagnostics changes=row_count;if changes<>0 then raise exception 'Observer escalated privileges';end if;
 begin perform public.driver_portal('{"table":"deliveries","op":"select"}'::jsonb);raise exception 'Driver API accepted observer';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where email='bobbyfonzarelli@gmail.com'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 begin perform public.observer_deliveries();raise exception 'Driver can call observer API';exception when insufficient_privilege then null;end;
end $$;
rollback;

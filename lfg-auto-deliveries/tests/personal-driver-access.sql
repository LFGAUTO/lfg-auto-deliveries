begin;
insert into public.drivers_roster(id,name) values('10000000-0000-4000-8000-000000000001','Fixture Driver A'),('10000000-0000-4000-8000-000000000002','Fixture Driver B');
insert into delivery_private.driver_accounts(roster_id,email) values('10000000-0000-4000-8000-000000000001','lfg-fixture-a@example.invalid'),('10000000-0000-4000-8000-000000000002','lfg-fixture-b@example.invalid');
insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000001','lfg-fixture-a@example.invalid'),('20000000-0000-4000-8000-000000000002','lfg-fixture-b@example.invalid');
insert into public.deliveries(id,customer_name,driver1_name,driver2_name,is_ready,status,archived,delivered_at,pay_amount,pay_adjust) values
 ('30000000-0000-4000-8000-000000000001','Fixture A only','Fixture Driver A',null,true,'assigned',false,now(),123,7),
 ('30000000-0000-4000-8000-000000000002','Fixture B only','Fixture Driver B',null,true,'assigned',false,now(),987,2),
 ('30000000-0000-4000-8000-000000000003','Fixture shared','Fixture Driver A','Fixture Driver B',true,'assigned',false,now(),50,0);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 if (select count(*) from public.deliveries)<>0 then raise exception 'Raw delivery table leaked';end if;
 if (select count(*) from public.payroll_paid)<>0 then raise exception 'Raw payroll leaked';end if;
 r:=public.driver_portal('{"table":"deliveries","op":"select"}');
 if jsonb_array_length(r)<>2 or r::text like '%Fixture B only%' or r::text like '%pay_amount%' then raise exception 'Personal delivery privacy failed: %',r;end if;
 r:=public.driver_portal('{"action":"payroll","driver_name":"Fixture Driver B"}');
 if (r->>'total')::numeric<>180 or (r->>'count')::integer<>2 then raise exception 'Personal pay leaked or miscounted: %',r;end if;
 begin perform public.driver_portal('{"table":"deliveries","op":"update","id":"30000000-0000-4000-8000-000000000002","values":{"status":"at_dealer"}}');raise exception 'Other driver update allowed';exception when insufficient_privilege then null;end;
 begin perform public.driver_portal('{"table":"deliveries","op":"update","id":"30000000-0000-4000-8000-000000000001","values":{"pay_amount":9999}}');raise exception 'Pay update allowed';exception when insufficient_privilege then null;end;
 r:=public.driver_portal('{"table":"deliveries","op":"update","id":"30000000-0000-4000-8000-000000000001","status":"assigned","values":{"status":"at_dealer","at_dealer_at":"2026-10-27T12:00:00Z"}}');
 if r->>'status'<>'at_dealer' or r?'pay_amount' then raise exception 'Arrival update failed';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$declare r jsonb;begin
 r:=public.driver_portal('{"table":"deliveries","op":"select"}');if jsonb_array_length(r)<>2 or r::text like '%Fixture A only%' then raise exception 'Driver B read isolation failed';end if;
 r:=public.driver_portal('{"action":"payroll"}');if (r->>'total')::numeric<>1039 then raise exception 'Driver B payroll failed';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"c7045276-6b07-4637-85fc-ac8e353113a2","role":"authenticated"}',true);
do $$begin
 begin perform public.driver_portal('{"action":"payroll"}');raise exception 'Shared identity used personal API';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"b117f4d5-2812-461b-a684-d431ea767d9f","role":"authenticated"}',true);
do $$begin if not public.is_admin() or (select count(*) from public.deliveries)<3 then raise exception 'Admin access broken';end if;end $$;
rollback;

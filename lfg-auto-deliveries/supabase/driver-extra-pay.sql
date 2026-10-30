create table public.payroll_extras (
 id uuid primary key default gen_random_uuid(),
 driver_name text not null check(length(trim(driver_name)) between 1 and 100),
 work_date date not null,
 category text not null check(category in ('Errand','Lease return','Other')),
 amount numeric(12,2) not null check(amount>0 and amount<=100000),
 description text not null default '' check(length(description)<=1000),
 created_by text not null default '',
 created_at timestamptz not null default now(),
 voided boolean not null default false,
 voided_by text,
 voided_at timestamptz
);
create index payroll_extras_driver_date on public.payroll_extras(driver_name,work_date);
alter table public.payroll_extras enable row level security;
revoke all on public.payroll_extras from public,anon,authenticated;
grant select,insert,update on public.payroll_extras to authenticated;
grant all on public.payroll_extras to service_role;
create policy extras_admin on public.payroll_extras for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create function public.stamp_payroll_extra() returns trigger language plpgsql security invoker set search_path='' as $$
declare actor text;
begin
 if auth.uid() is not null then
  if not public.is_admin() then raise exception 'Administrator required'; end if;
  select coalesce(nullif(trim(concat_ws(' ',first_name,last_name)),''),username,'Admin') into actor from public.profiles where id=auth.uid();
 end if;
 if TG_OP='INSERT' then
  if not exists(select 1 from public.drivers_roster where name=new.driver_name) then raise exception 'Choose an existing driver'; end if;
  new.created_by:=coalesce(actor,nullif(new.created_by,''),'Admin');
  new.created_at:=now();new.voided:=false;new.voided_by:=null;new.voided_at:=null;
 else
  if (to_jsonb(new)-array['voided','voided_by','voided_at']) is distinct from (to_jsonb(old)-array['voided','voided_by','voided_at']) or not new.voided or old.voided then raise exception 'Extra pay can only be removed; add a new entry to correct it'; end if;
  new.voided_at:=now();new.voided_by:=coalesce(actor,new.voided_by,'Admin');
 end if;
 return new;
end $$;
revoke all on function public.stamp_payroll_extra() from public,anon,authenticated;
create trigger stamp_payroll_extra before insert or update on public.payroll_extras for each row execute function public.stamp_payroll_extra();
CREATE OR REPLACE FUNCTION public.driver_portal(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare who text; roster uuid; item public.deliveries; changed public.deliveries; patch jsonb; result jsonb; cols text; k text; start_day date; total numeric; jobs integer; payment jsonb;
 allowed text[]:=array['status','at_dealer_at','en_route_at','delivered_at','archived','closeout_required','completed_by_name','cod_received','cod_exception','trade_picked_up_at','driver_signature','delivered_condition_ok','driver_notes','task_bluetooth','task_lfg_box','task_app','task_review','task_photo_client','task_photo_contract','client_photo_url','contract_photo_url','trade_photo_url','extra_photos','client_photo_refused','e_contract','odometer','fuel_level','damage_noted','damage_notes','prev_status','paperwork_status','paperwork_at','paperwork_by','paperwork_recipient','trade_returned_at','trade_returned_by'];
begin
 select d.name,d.id into who,roster from public.profiles p join delivery_private.driver_accounts a on a.user_id=p.id and a.roster_id=p.driver_roster_id join public.drivers_roster d on d.id=a.roster_id where p.id=auth.uid() and p.role='driver' and p.status='active';
 if who is null then raise exception 'Personal driver login required' using errcode='42501'; end if;
 if payload->>'action'='payroll' then
  start_day := (now() at time zone 'America/New_York')::date;
  start_day := start_day - ((extract(dow from start_day)::integer+1)%7);
  select coalesce(sum(coalesce(pay_amount,100)+coalesce(pay_adjust,0)),0),count(*) into total,jobs from public.deliveries where who in(driver1_name,driver2_name) and coalesce(pay_exclude,false)=false and delivered_at >= (start_day::timestamp at time zone 'America/New_York') and delivered_at < ((start_day+7)::timestamp at time zone 'America/New_York');
  total := total + (select coalesce(sum(amount),0) from public.payroll_extras where driver_name=who and not voided and work_date>=start_day and work_date<start_day+7);
  select jsonb_build_object('amount',amount,'deliveries',deliveries) into payment from public.payroll_paid where driver_name=who and week_start=start_day;
  return jsonb_build_object('total',total,'extras',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'description',description,'work_date',work_date,'amount',amount) order by work_date),'[]'::jsonb) from public.payroll_extras where driver_name=who and not voided and work_date>=start_day and work_date<start_day+7),'count',jobs,'payment',payment,'label',to_char(start_day,'MM/DD/YYYY')||' – '||to_char(start_day+6,'MM/DD/YYYY'));
 end if;
 if payload->>'table'='drivers_roster' and payload->>'op'='select' then return jsonb_build_array(jsonb_build_object('id',roster,'name',who));end if;
 if payload->>'table'='deliveries' and payload->>'op'='select' then
  select coalesce(jsonb_agg(to_jsonb(d)-array['pay_amount','pay_adjust','pay_adjust_note','pay_exclude'] order by delivery_date),'[]'::jsonb) into result from public.deliveries d where who in(driver1_name,driver2_name) and (is_ready or closeout_required) and (not archived or closeout_required);
  return result;
 end if;
 if payload->>'op' not in('update','insert') or payload->>'table' not in('deliveries','issues','activity_log') then raise exception 'Operation not allowed' using errcode='42501';end if;
 select * into item from public.deliveries where id=coalesce(payload->>'id',payload->'values'->>'delivery_id')::uuid and who in(driver1_name,driver2_name) and (is_ready or closeout_required) for update;
 if not found then raise exception 'Delivery is not assigned to this account' using errcode='42501';end if;
 if payload->>'table'='deliveries' and payload->>'op'='update' then
  if item.archived and not item.closeout_required then raise exception 'Delivery is already closed';end if;
  if payload->>'status' is not null and payload->>'status'<>item.status then raise exception 'Delivery changed. Refresh and try again.';end if;
  patch:=payload->'values';
  if jsonb_typeof(patch)<>'object' or patch='{}'::jsonb then raise exception 'No update provided';end if;
  for k in select jsonb_object_keys(patch) loop if not k=any(allowed) then raise exception 'Field not allowed: %',k using errcode='42501';end if;end loop;
  if patch?'status' and patch->>'status'<>item.status and not(patch->>'status'='issue' or (item.status='assigned' and patch->>'status'='at_dealer') or (item.status='at_dealer' and patch->>'status'='en_route') or (item.status='en_route' and patch->>'status'='delivered')) then raise exception 'Invalid delivery step';end if;
  if patch?'completed_by_name' then patch:=jsonb_set(patch,'{completed_by_name}',to_jsonb(who));end if;
  if patch?'paperwork_by' then patch:=jsonb_set(patch,'{paperwork_by}',to_jsonb(who));end if;
  if patch?'trade_returned_by' then patch:=jsonb_set(patch,'{trade_returned_by}',to_jsonb(who));end if;
  changed:=jsonb_populate_record(item,patch);
  select string_agg(format('%I=($1).%I',v,v),',') into cols from unnest(allowed) v;
  execute 'update public.deliveries set '||cols||' where id=$2 returning *' into changed using changed,item.id;
  return to_jsonb(changed)-array['pay_amount','pay_adjust','pay_adjust_note','pay_exclude'];
 elsif payload->>'table'='issues' and payload->>'op'='insert' then
  insert into public.issues(delivery_id,type,note,photo_url,created_by,created_by_name) values(item.id,left(payload->'values'->>'type',120),left(payload->'values'->>'note',4000),payload->'values'->>'photo_url',auth.uid(),who);
  return 'null'::jsonb;
 elsif payload->>'table'='activity_log' and payload->>'op'='insert' then
  insert into public.activity_log(delivery_id,user_id,user_name,action) values(item.id,auth.uid(),who,left(payload->'values'->>'action',4000));return 'null'::jsonb;
 end if;
 raise exception 'Operation not allowed' using errcode='42501';
end $function$


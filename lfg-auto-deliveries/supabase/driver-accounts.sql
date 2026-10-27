-- Phase 1: add personal-driver access, preserving the shared account until cutover.
begin;
alter table public.profiles add column if not exists driver_roster_id uuid references public.drivers_roster(id);
create table if not exists delivery_private.driver_accounts (
 roster_id uuid primary key references public.drivers_roster(id), email text unique not null,
 user_id uuid unique references auth.users(id), invited_at timestamptz, invite_error text
);
alter table delivery_private.driver_accounts enable row level security;
revoke all on delivery_private.driver_accounts from public,anon,authenticated;
insert into delivery_private.driver_accounts(roster_id,email) values
 ('068cf6c4-7066-4537-bf9f-9a84488f65b5','mpts1226@gmail.com'),
 ('1582f931-8ef4-428a-b165-cd6df7d546d8','bobbyfonzarelli@gmail.com'),
 ('0e23a303-5fc1-43b9-8a57-6f3743b2833a','thelgnds1@aol.com') on conflict (roster_id) do nothing;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare r uuid; n text;
begin
 select a.roster_id,d.name into r,n from delivery_private.driver_accounts a join public.drivers_roster d on d.id=a.roster_id where a.email=lower(new.email) and (a.user_id is null or a.user_id=new.id);
 insert into public.profiles(id,role,first_name,email,username,status,driver_roster_id)
 values(new.id,'driver',coalesce(n,''),new.email,split_part(new.email,'@',1),case when r is not null then 'active' else 'inactive' end,r) on conflict(id) do nothing;
 if r is not null then update delivery_private.driver_accounts set user_id=new.id where roster_id=r; end if;
 return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') $$;
create or replace function public.is_driver() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='driver' and status='active') $$;
revoke all on function public.is_admin(),public.is_driver() from public,anon;
grant execute on function public.is_admin(),public.is_driver() to authenticated,service_role;
-- New personal accounts never inherit the legacy shared-login table permissions.
drop policy if exists deliveries_driver_read on public.deliveries;
create policy deliveries_driver_read on public.deliveries for select to authenticated using(auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid and public.is_driver());
drop policy if exists deliveries_driver_update on public.deliveries;
create policy deliveries_driver_update on public.deliveries for update to authenticated using(auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid and public.is_driver()) with check(auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid and public.is_driver());
drop policy if exists payroll_read on public.payroll_paid;
create policy payroll_read on public.payroll_paid for select to authenticated using(public.is_admin() or (auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid and public.is_driver()));
drop policy if exists roster_driver_read on public.drivers_roster;
create policy roster_driver_read on public.drivers_roster for select to authenticated using(public.is_driver() and (auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid or id in(select driver_roster_id from public.profiles where id=auth.uid())));
drop policy if exists issues_admin_read on public.issues;
create policy issues_admin_read on public.issues for select to authenticated using(public.is_admin() or (auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid and public.is_driver()));
drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues for insert to authenticated with check(public.is_admin() or (auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid and public.is_driver()));
drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log for insert to authenticated with check(public.is_admin() or (auth.uid()='c7045276-6b07-4637-85fc-ac8e353113a2'::uuid and public.is_driver()));
drop policy if exists live_read on public.live_locations;
create policy live_read on public.live_locations for select to authenticated using(public.is_admin());
drop policy if exists live_write on public.live_locations;
create policy live_write on public.live_locations for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace function public.driver_portal(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare who text; roster uuid; item public.deliveries; changed public.deliveries; patch jsonb; result jsonb; cols text; k text; start_day date; total numeric; jobs integer; payment jsonb;
 allowed text[]:=array['status','at_dealer_at','en_route_at','delivered_at','archived','closeout_required','completed_by_name','cod_received','cod_exception','trade_picked_up_at','driver_signature','delivered_condition_ok','driver_notes','task_bluetooth','task_lfg_box','task_app','task_review','task_photo_client','task_photo_contract','client_photo_url','contract_photo_url','trade_photo_url','extra_photos','client_photo_refused','e_contract','odometer','fuel_level','damage_noted','damage_notes','prev_status','paperwork_status','paperwork_at','paperwork_by','paperwork_recipient','trade_returned_at','trade_returned_by'];
begin
 select d.name,d.id into who,roster from public.profiles p join delivery_private.driver_accounts a on a.user_id=p.id and a.roster_id=p.driver_roster_id join public.drivers_roster d on d.id=a.roster_id where p.id=auth.uid() and p.role='driver' and p.status='active';
 if who is null then raise exception 'Personal driver login required' using errcode='42501'; end if;
 if payload->>'action'='payroll' then
  start_day := (now() at time zone 'America/New_York')::date;
  start_day := start_day - ((extract(dow from start_day)::integer+1)%7);
  select coalesce(sum(coalesce(pay_amount,100)+coalesce(pay_adjust,0)),0),count(*) into total,jobs from public.deliveries where who in(driver1_name,driver2_name) and coalesce(pay_exclude,false)=false and delivered_at >= (start_day::timestamp at time zone 'America/New_York') and delivered_at < ((start_day+7)::timestamp at time zone 'America/New_York');
  select jsonb_build_object('amount',amount,'deliveries',deliveries) into payment from public.payroll_paid where driver_name=who and week_start=start_day;
  return jsonb_build_object('total',total,'count',jobs,'payment',payment,'label',to_char(start_day,'MM/DD/YYYY')||' – '||to_char(start_day+6,'MM/DD/YYYY'));
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
end $$;
revoke all on function public.driver_portal(jsonb) from public,anon;
grant execute on function public.driver_portal(jsonb) to authenticated;

-- Provisioning RPCs are service-only. Email and roster identity come from this approved table.
create or replace function public.driver_accounts_to_invite() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('email',a.email,'roster_id',a.roster_id,'name',d.name)),'[]'::jsonb) from delivery_private.driver_accounts a join public.drivers_roster d on d.id=a.roster_id where a.user_id is null $$;
create or replace function public.driver_account_invited(account_email text, failure text default null) returns void language sql security definer set search_path='' as $$
 update delivery_private.driver_accounts set invited_at=case when failure is null then now() else invited_at end,invite_error=failure where email=account_email $$;
revoke all on function public.driver_accounts_to_invite(),public.driver_account_invited(text,text) from public,anon,authenticated;
grant execute on function public.driver_accounts_to_invite(),public.driver_account_invited(text,text) to service_role;
notify pgrst,'reload schema';
commit;

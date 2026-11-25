-- Read-only payroll details. Identity is derived from the authenticated account.
create or replace function public.driver_payroll(payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  who text; start_day date; offset_weeks integer; entries jsonb; extras jsonb;
  delivery_total numeric; extra_total numeric; jobs integer; payment jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') then
    select name into who from public.drivers_roster where name=payload->>'driver_name';
  else
    select d.name into who from public.profiles p
    join delivery_private.driver_accounts a on a.user_id=p.id and a.roster_id=p.driver_roster_id
    join public.drivers_roster d on d.id=a.roster_id
    where p.id=auth.uid() and p.role='driver' and p.status='active';
  end if;
  if who is null then raise exception 'Active driver account required' using errcode='42501'; end if;
  offset_weeks := coalesce((payload->>'week_offset')::integer,0);
  if offset_weeks > 0 or offset_weeks < -520 then raise exception 'Choose a valid payroll week'; end if;
  start_day := (now() at time zone 'America/New_York')::date;
  start_day := start_day - ((extract(dow from start_day)::integer+1)%7) + offset_weeks*7;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'customer_name',d.customer_name,'vyear',d.vyear,'make',d.make,'model',d.model,
    'delivered_at',d.delivered_at,'base',coalesce(d.pay_amount,100),'adjustment',coalesce(d.pay_adjust,0),
    'adjustment_note',d.pay_adjust_note,'excluded',coalesce(d.pay_exclude,false),
    'amount',case when coalesce(d.pay_exclude,false) then 0 else coalesce(d.pay_amount,100)+coalesce(d.pay_adjust,0) end,
    'shared',nullif(d.driver1_name,'') is not null and nullif(d.driver2_name,'') is not null and d.driver1_name<>d.driver2_name
  ) order by d.delivered_at,d.id),'[]'::jsonb),
  coalesce(sum(case when coalesce(d.pay_exclude,false) then 0 else coalesce(d.pay_amount,100)+coalesce(d.pay_adjust,0) end),0),
  count(*) filter (where not coalesce(d.pay_exclude,false))
  into entries,delivery_total,jobs
  from public.deliveries d where who in(d.driver1_name,d.driver2_name)
    and d.delivered_at >= (start_day::timestamp at time zone 'America/New_York')
    and d.delivered_at < ((start_day+7)::timestamp at time zone 'America/New_York');
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'description',description,'work_date',work_date,'amount',amount) order by work_date,id),'[]'::jsonb),coalesce(sum(amount),0)
  into extras,extra_total from public.payroll_extras where driver_name=who and not voided and work_date>=start_day and work_date<start_day+7;
  select jsonb_build_object('amount',amount,'deliveries',deliveries,'paid_at',paid_at) into payment from public.payroll_paid where driver_name=who and week_start=start_day;
  return jsonb_build_object('driver_name',who,'week_start',start_day,'week_end',start_day+6,
    'label',to_char(start_day,'MM/DD/YYYY')||' – '||to_char(start_day+6,'MM/DD/YYYY'),
    'entries',entries,'extras',extras,'delivery_total',delivery_total,'extra_total',extra_total,
    'total',delivery_total+extra_total,'count',jobs,'payment',payment);
end; $$;
revoke all on function public.driver_payroll(jsonb) from public,anon;
grant execute on function public.driver_payroll(jsonb) to authenticated,service_role;

import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

test('payroll scopes identity, week boundaries, shared jobs, exclusions and paid corrections', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema delivery_private;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create table profiles(id uuid,role text,status text,driver_roster_id uuid);
      create function public.is_admin() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and role='admin' and status='active')$$;
      create table drivers_roster(id uuid,name text);
      create table delivery_private.driver_accounts(user_id uuid,roster_id uuid);
      create table deliveries(id uuid default gen_random_uuid(),customer_name text,vyear text,make text,model text,delivered_at timestamptz,driver1_name text,driver2_name text,pay_amount numeric,pay_adjust numeric,pay_adjust_note text,pay_exclude boolean);
      create table payroll_extras(id uuid default gen_random_uuid(),driver_name text,category text,description text,work_date date,amount numeric,voided boolean default false);
      create table payroll_paid(driver_name text,week_start date,amount numeric,deliveries integer,paid_at timestamptz default now());
      insert into profiles values('00000000-0000-0000-0000-000000000001','driver','active','00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000002','driver','active','00000000-0000-0000-0000-000000000012'),('00000000-0000-0000-0000-000000000003','admin','active',null);
      insert into drivers_roster values('00000000-0000-0000-0000-000000000011','One'),('00000000-0000-0000-0000-000000000012','Two');
      insert into delivery_private.driver_accounts select id,driver_roster_id from profiles where role='driver';
      create temp table week as select d-((extract(dow from d)::integer+1)%7) as start_day from (select (now() at time zone 'America/New_York')::date d) s;
      insert into deliveries(customer_name,driver1_name,driver2_name,pay_amount,pay_adjust,delivered_at,pay_exclude) select 'Shared','One','Two',100,25,start_day::timestamp at time zone 'America/New_York',false from week;
      insert into deliveries(customer_name,driver1_name,pay_amount,delivered_at,pay_exclude) select 'Excluded','One',100,start_day::timestamp at time zone 'America/New_York',true from week;
      insert into deliveries(customer_name,driver1_name,pay_amount,delivered_at) select 'Other only','Two',900,start_day::timestamp at time zone 'America/New_York' from week;
      insert into deliveries(customer_name,driver1_name,pay_amount,delivered_at) select 'Previous','One',100,(start_day::timestamp at time zone 'America/New_York')-interval '1 second' from week;
      insert into payroll_extras(driver_name,category,amount,work_date) select 'One','Waiting',20,start_day from week;
      insert into payroll_extras(driver_name,category,amount,work_date,voided) select 'One','Voided',500,start_day,true from week;
      insert into payroll_paid(driver_name,week_start,amount,deliveries) select 'One',start_day,145,1 from week;`)
    await db.exec(await readFile(new URL('../supabase/driver-payroll-details.sql',import.meta.url),'utf8'))
    const login = id => db.query("select set_config('test.uid',$1,false)",[id ? `00000000-0000-0000-0000-${String(id).padStart(12,'0')}` : ''])
    const get = async payload => (await db.query('select driver_payroll($1::jsonb) as result',[JSON.stringify(payload)])).rows[0].result
    await login(1)
    let r=await get({driver_name:'Two'})
    assert.equal(r.driver_name,'One');assert.equal(r.total,145);assert.equal(r.count,1);assert.equal(r.entries.length,2)
    assert.equal(r.entries.find(x=>x.customer_name==='Shared').shared,true)
    assert.equal(r.entries.find(x=>x.customer_name==='Excluded').amount,0)
    assert.equal(r.extras.length,1);assert.equal(r.payment.amount,145)
    assert.equal((await get({week_offset:-1})).entries[0].customer_name,'Previous')
    await assert.rejects(()=>get({week_offset:1}),/valid payroll week/)
    await db.exec("update deliveries set pay_adjust=50 where customer_name='Shared'")
    r=await get({});assert.equal(r.total,170);assert.equal(r.payment.amount,145)
    await db.exec("update deliveries set driver1_name='Two',driver2_name=null where customer_name='Shared'")
    r=await get({});assert.equal(r.count,0);assert.equal(r.total,20);assert.equal(r.payment.amount,145)
    await login(3);assert.equal((await get({driver_name:'Two'})).count,2)
    await login(null);await assert.rejects(()=>get({}),/Sign in required/)
    await login(1);await db.exec("update profiles set status='inactive' where role='driver'")
    await assert.rejects(()=>get({driver_name:'Two'}),/Active driver/)
    assert.equal((await db.query("select has_function_privilege('anon','public.driver_payroll(jsonb)','execute') as allowed")).rows[0].allowed,false)
  } finally {await db.close()}
})

import {DRAFT_TEXT_FIELDS} from './model.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const tables={payroll_extras:['select','insert','update'],deliveries:['select','insert','update','delete'],issues:['select','update'],activity_log:['select','insert'],drivers_roster:['select','insert','delete'],payroll_paid:['select','upsert','delete']};
const deliveryFields=new Set([...DRAFT_TEXT_FIELDS,'is_trade','cod_required','pay_amount','pay_adjust','pay_adjust_note','pay_exclude','paperwork_status','paperwork_at','paperwork_by','paperwork_recipient','trade_returned_at','trade_returned_by','cod_received','cod_exception','completed_by_name','closeout_required','closeout_completed_at','status','archived','delivered_at','at_dealer_at','en_route_at','is_ready','published_at','updated_at','created_by']);
const fields={payroll_extras:new Set(['id','driver_name','work_date','category','amount','description','voided']),deliveries:deliveryFields,issues:new Set(['resolved','solution','resolved_at','resolved_by']),activity_log:new Set(['delivery_id','user_id','user_name','action']),drivers_roster:new Set(['name','phone']),payroll_paid:new Set(['driver_name','week_start','amount','deliveries','paid_by','paid_at'])};
export function validateAdminQuery(input,actor){
 if(!actor?.name||typeof actor.name!=='string'||actor.name.length>100)throw Error('Administrator identity required.');
 const {table,op='select',columns='*',filters=[],orders=[],limit,range,single,values,options={}}=input||{};
 if(!tables[table]?.includes(op))throw Error('Unsupported delivery operation.');
 if(typeof columns!=='string'||!(columns==='*'||/^[a-z_]+(?:,[a-z_]+)*$/.test(columns)||(table==='issues'&&columns==='*, deliveries(customer_name)')))throw Error('Unsupported delivery columns.');
 if(!Array.isArray(filters)||filters.length>12||!Array.isArray(orders)||orders.length>4)throw Error('Invalid delivery filters.');
 for(const f of filters){if(!['eq','neq','gte','lte','gt','lt','is','in','or'].includes(f.method))throw Error('Unsupported filter.');if(f.method==='or'){if(op!=='select'||typeof f.value!=='string'||f.value.length>1000||!/^[a-z0-9_.,:TZ+()\-]+$/i.test(f.value))throw Error('Invalid filter.');}else{if(!/^[a-z_]+$/.test(f.column))throw Error('Invalid filter column.');if(typeof f.value==='object'&&f.value!==null&&(!Array.isArray(f.value)||f.value.length>100))throw Error('Invalid filter value.');}}
 for(const order of orders)if(!/^[a-z_]+$/.test(order.column))throw Error('Invalid sort column.');
 if(limit!=null&&(!Number.isInteger(limit)||limit<1||limit>10000))throw Error('Invalid limit.');
 if(range&&(!Array.isArray(range)||range.length!==2||!range.every(Number.isInteger)||range[0]<0||range[1]<range[0]||range[1]-range[0]>1000))throw Error('Invalid range.');
 if(![undefined,null,'single','maybeSingle'].includes(single))throw Error('Invalid result type.');
 const write=op!=='select';
 if(write&&['update','delete'].includes(op)){
  if(filters.some(f=>f.method!=='eq'))throw Error('Changes require an exact record.');
  if(table==='payroll_paid'){if(!filters.some(f=>f.column==='driver_name'&&typeof f.value==='string'&&f.value.trim())||!filters.some(f=>f.column==='week_start'&&/^\d{4}-\d{2}-\d{2}$/.test(f.value)))throw Error('Choose a payroll week and driver.');}
  else if(!filters.some(f=>f.column==='id'&&uuid(f.value)))throw Error('Choose a delivery record.');
 }
 let patch;
 if(write&&op!=='delete'){
  if(!values||Array.isArray(values)||typeof values!=='object')throw Error('One record is required.');
  if(Object.keys(values).some(k=>!fields[table].has(k)))throw Error('Unsupported delivery field.');
  patch={...values};
  if(table==='deliveries'){
   if(patch.status&&!['assigned','at_dealer','en_route','delivered','issue'].includes(patch.status))throw Error('Invalid delivery status.');
   for(const k of ['is_ready','archived','is_trade','cod_required','cod_received','pay_exclude','closeout_required'])if(k in patch&&typeof patch[k]!=='boolean')throw Error('Invalid delivery flag.');
   for(const k of ['pay_amount','pay_adjust'])if(k in patch&&(!Number.isFinite(Number(patch[k]))||(k==='pay_amount'&&Number(patch[k])<0)))throw Error('Invalid pay amount.');
   if(patch.driver1_name&&patch.driver2_name&&patch.driver1_name.trim().toLowerCase()===patch.driver2_name.trim().toLowerCase())throw Error('Choose two different drivers.');
   if(op==='insert'){if(!String(patch.customer_name||'').trim())throw Error('Customer name required.');Object.assign(patch,{created_by:null,status:'assigned',is_ready:false,archived:false});}
   if(patch.is_ready===true)patch.published_at=new Date().toISOString();
   for(const k of ['paperwork_by','trade_returned_by','completed_by_name'])if(k in patch)patch[k]=actor.name;
  }
  if(table==='activity_log'){patch.user_id=null;patch.user_name=actor.name;if(!String(patch.action||'').trim()||String(patch.action).length>5000)throw Error('Activity description required.');}
  if(table==='issues'&&'resolved_by'in patch)patch.resolved_by=actor.name;
  if(table==='drivers_roster'&&(!String(patch.name||'').trim()||String(patch.name).length>100))throw Error('Driver name required.');
  if(table==='payroll_extras'){
   if(op==='insert'){
    if(!uuid(patch.id)||!/^\d{4}-\d{2}-\d{2}$/.test(patch.work_date)||!['Errand','Lease return','Other'].includes(patch.category)||!Number.isFinite(Number(patch.amount))||Number(patch.amount)<=0||Number(patch.amount)>100000||!String(patch.driver_name||'').trim())throw Error('Choose driver, date, type and positive amount.');
    patch.created_by=actor.name;
   }else if(op==='update'){if(Object.keys(patch).length!==1||patch.voided!==true)throw Error('Only removal is supported.');patch.voided_by=actor.name;}
  }
  if(table==='payroll_paid'){
   if(options.onConflict!=='driver_name,week_start'||!String(patch.driver_name||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(patch.week_start)||!Number.isFinite(Number(patch.amount))||Number(patch.amount)<0||!Number.isInteger(patch.deliveries)||patch.deliveries<0)throw Error('Invalid payroll record.');
   patch.paid_by=actor.name;patch.paid_at=new Date().toISOString();
  }
 }
 return {table,op,columns,filters,orders,limit,range,single,patch,options:{onConflict:options.onConflict},returning:input.returning===true};
}
export async function adminQuery(db,input,actor){
 const spec=validateAdminQuery(input,actor);let q=db.from(spec.table);
 if(spec.op==='select')q=q.select(spec.columns);else if(spec.op==='delete')q=q.delete();else if(spec.op==='upsert')q=q.upsert(spec.patch,spec.options);else q=q[spec.op](spec.patch);
 if(spec.op!=='select'&&spec.returning)q=q.select(spec.columns);
 for(const f of spec.filters)q=f.method==='or'?q.or(f.value):q[f.method](f.column,f.value);
 for(const o of spec.orders)q=q.order(o.column,{ascending:o.ascending!==false});
 if(spec.limit)q=q.limit(spec.limit);if(spec.range)q=q.range(...spec.range);
 if(spec.single)q=q[spec.single]();
 let result;
 if(spec.op==='select'&&!spec.limit&&!spec.range&&!spec.single){const rows=[];for(let start=0;;start+=1000){const r=await q.range(start,start+999);if(r.error)return {data:null,error:{message:r.error.message}};rows.push(...(r.data||[]));if((r.data||[]).length<1000)break;}result={data:rows,error:null};}
 else result=await q;
 return {data:result.data??null,error:result.error?{message:result.error.message,code:result.error.code}:null};
}
export async function adminPush(db,input){
 const action=input?.action;
 if(action==='status'){
  const {data:jobs,error}=await db.from('delivery_push_jobs').select('id,delivery_id,revision,driver_name,status,created_at,accepted_at,acknowledged_at,last_error,deliveries!inner(customer_name,archived)').eq('deliveries.archived',false).neq('status','cancelled').order('created_at',{ascending:false}).limit(250);if(error)throw error;
  const phones=await db.from('delivery_push_devices').select('driver_name').eq('active',true);if(phones.error)throw phones.error;return {jobs:jobs||[],phones:(phones.data||[]).map(p=>p.driver_name)};
 }
 if(action==='retry'){
  if(!uuid(input.job_id))throw Error('Choose an alert.');
  const {error}=await db.from('delivery_push_jobs').update({status:'queued',attempts:0,available_at:new Date().toISOString(),last_error:null}).eq('id',input.job_id).in('status',['failed','no_device']).is('acknowledged_at',null);if(error)throw error;return {ok:true};
 }
 if(!['drain','health'].includes(action))throw Error('Unsupported alert action.');
 const {data:config,error}=await db.rpc('delivery_push_configuration');if(error||!config?.lfg_push_worker)throw Error('Notification worker unavailable.');
 const response=await fetch(Deno.env.get('SUPABASE_URL')+'/functions/v1/driver-push',{method:'POST',headers:{'Content-Type':'application/json','x-lfg-worker':config.lfg_push_worker},body:JSON.stringify({action}),signal:AbortSignal.timeout(15000)});
 const json=await response.json();if(!response.ok)throw Error('Notification worker will retry automatically.');return json;
}
export async function adminFunction(db,input,actor){
 if(input?.name!=='reset-driver-password')throw Error('Unsupported operation.');
 const password=String(input.body?.password||'');if(password.length<6||password.length>128)throw Error('Use a driver password of 6–128 characters.');
 let driver;
 for(let page=1;page<=100;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:100});if(error)throw error;driver=data.users.find(u=>u.email==='driver@lfgauto.app');if(driver||data.users.length<100)break;}
 if(!driver)throw Error('Shared driver account not found.');
 const {error}=await db.auth.admin.updateUserById(driver.id,{password});if(error)throw Error('Could not update the driver password.');
 await db.from('activity_log').insert({user_name:actor.name,action:'Reset the shared driver password from central admin'});return {ok:true};
}

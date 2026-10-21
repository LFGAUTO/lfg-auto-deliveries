import test from 'node:test';import assert from 'node:assert/strict';
import {validateAdminQuery,adminQuery,adminPush} from '../supabase/functions/landing-delivery-bridge/admin.js';
const actor={name:'Jessica Dering',username:'jess'};const id='11111111-1111-4111-8111-111111111111';
test('central operations allow scoped delivery, archive and payroll changes with verified attribution',()=>{
 const publish=validateAdminQuery({table:'deliveries',op:'update',filters:[{method:'eq',column:'id',value:id}],values:{is_ready:true,published_at:'old'}},actor);
 assert.equal(publish.patch.is_ready,true);assert.ok(Date.parse(publish.patch.published_at)>Date.now()-10000);
 const draft=validateAdminQuery({table:'deliveries',op:'insert',values:{customer_name:'Fixture',created_by:id,is_ready:true,archived:true,status:'delivered'}},actor);
 assert.equal(draft.patch.is_ready,false);assert.equal(draft.patch.created_by,null);assert.equal(draft.patch.status,'assigned');assert.equal(draft.patch.archived,false);
 const audit=validateAdminQuery({table:'activity_log',op:'insert',values:{action:'Created draft',user_name:'Spoofed',user_id:id}},actor);assert.equal(audit.patch.user_name,'Jessica Dering');assert.equal(audit.patch.user_id,null);
 const payroll=validateAdminQuery({table:'payroll_paid',op:'upsert',values:{driver_name:'Bobby',week_start:'2026-10-17',amount:175,deliveries:1,paid_by:'Spoofed'},options:{onConflict:'driver_name,week_start'}},actor);assert.equal(payroll.patch.paid_by,'Jessica Dering');
 const edit=validateAdminQuery({table:'deliveries',op:'update',filters:[{method:'eq',column:'id',value:id},{method:'eq',column:'archived',value:true}],values:{driver1_name:'Bobby',driver2_name:'Stingray',pay_amount:200}},actor);assert.equal(edit.patch.pay_amount,200);
});
test('private tables, unscoped writes, arbitrary relations, impersonation and invalid payroll cannot pass the bridge',()=>{
 for(const input of [{table:'profiles'},{table:'admin_delivery_bridge_keys'},{table:'delivery_push_devices'},{table:'deliveries',columns:'*, profiles(*)'},{table:'deliveries',op:'update',values:{is_ready:true}},{table:'deliveries',op:'delete',filters:[{method:'or',value:'archived.eq.true'}]},{table:'deliveries',op:'update',filters:[{method:'eq',column:'id',value:id}],values:{landing_lead_id:id}},{table:'payroll_paid',op:'delete',filters:[{method:'eq',column:'driver_name',value:'Bobby'}]},{table:'payroll_paid',op:'upsert',values:{amount:-1},options:{onConflict:'driver_name,week_start'}}])assert.throws(()=>validateAdminQuery(input,actor));
 assert.throws(()=>validateAdminQuery({table:'deliveries'},null));
});
test('proxy retains complete history past one thousand rows and executes only a scoped publish',async()=>{
 let spec,ops=[];const source=Array.from({length:1001},(_,id)=>({id}));const db={from(table){spec={table};const q={select(columns){spec.columns=columns;return q},order(){return q},eq(column,value){ops.push(['eq',column,value]);return q},update(patch){ops.push(['update',patch]);return q},range(start,end){return Promise.resolve({data:source.slice(start,end+1)})},single(){return q},then(resolve,reject){return Promise.resolve({data:{id},error:null}).then(resolve,reject)}};return q}};
 const history=await adminQuery(db,{table:'deliveries'},actor);assert.equal(history.data.length,1001);
 await adminQuery(db,{table:'deliveries',op:'update',values:{is_ready:true},filters:[{method:'eq',column:'id',value:id}],returning:true,single:'single'},actor);assert.equal(spec.table,'deliveries');assert.deepEqual(ops[1],['eq','id',id]);assert.equal(ops[0][1].is_ready,true);
});
test('alert status exposes driver names and job state, never subscriptions or notification keys',async()=>{
 const reads=[];const db={from(table){reads.push({table});const record=reads.at(-1);const q={select(columns){record.columns=columns;return q},eq(){return q},neq(){return q},order(){return q},limit(){return q},then(resolve,reject){return Promise.resolve({data:table==='delivery_push_devices'?[{driver_name:'Bobby'}]:[{id:'job',status:'queued'}]}).then(resolve,reject)}};return q}};
 const status=await adminPush(db,{action:'status'});assert.deepEqual(status.phones,['Bobby']);assert.equal(status.jobs[0].status,'queued');assert.equal(reads.find(r=>r.table==='delivery_push_devices').columns,'driver_name');
});

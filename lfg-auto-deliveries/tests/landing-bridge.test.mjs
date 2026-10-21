import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('signed landing bridge creates idempotent drafts, protects live records, rejects stale saves and links without changing workflow',async()=>{
 const keys=generateKeyPairSync('ed25519');globalThis.bridgePublic=keys.publicKey.export({format:'der',type:'spki'}).toString('base64');
 let rows=[],calls=0,tick=0;
 globalThis.bridgeDB={from(table){calls++;let op='select',patch,one=false,filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},order(){return q},range(){return q},single(){one=true;return q},maybeSingle(){one=true;return q},insert(p){op='insert';patch=p;return q},update(p){op='update';patch=p;return q},then(resolve,reject){
 let result;if(table==='drivers_roster')result={data:[{name:'Bobby'}]};else if(op==='insert'){
 if(rows.some(r=>r.landing_lead_id===patch.landing_lead_id))result={error:{code:'23505'}};
 else{const row={id:randomUUID(),updated_at:new Date(++tick).toISOString(),push_revision:0,...patch};rows.push(row);result={data:structuredClone(row)}}
 }else if(op==='update'){const matches=rows.filter(r=>filters.every(fn=>fn(r)));matches.forEach(r=>Object.assign(r,patch,{updated_at:new Date(++tick).toISOString()}));result={data:one?structuredClone(matches[0]||null):structuredClone(matches)}}
 else{const matches=rows.filter(r=>filters.every(fn=>fn(r)));result={data:one?structuredClone(matches[0]||null):structuredClone(matches)}}
 return Promise.resolve(result).then(resolve,reject)}};return q}};
 globalThis.Deno={env:{get:()=> 'fixture'},serve:fn=>{globalThis.bridgeHandler=fn}};
 const source=await readFile('supabase/functions/landing-delivery-bridge/index.ts','utf8');
 const dir=await mkdtemp(path.resolve('.ui-test-'));
 const result=await build({entryPoints:['supabase/functions/landing-delivery-bridge/index.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^npm:/},()=>({path:'supabase',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClient=()=>globalThis.bridgeDB;'}));b.onLoad({filter:/landing-delivery-bridge\/index.ts$/},()=>({contents:source.replace(/const PUBLIC_KEY = '[^']+';/,'const PUBLIC_KEY = globalThis.bridgePublic;'),loader:'ts'}));}}]});
 const file=path.join(dir,'bridge.mjs');await writeFile(file,result.outputFiles[0].text);await import(pathToFileURL(file));
 const leadId=randomUUID();const customer={name:'Integration Customer',phone:'7325551212'};
 const call=async(action,payload={},extras={})=>{const body=JSON.stringify({action,leadId,customer,payload,timestamp:Date.now(),...extras});const signature=sign(null,Buffer.from(body),keys.privateKey).toString('base64');const r=await bridgeHandler(new Request('https://example.test',{method:'POST',headers:{'x-lfg-signature':signature},body}));return {status:r.status,...await r.json()}};
 try{
 let r=await bridgeHandler(new Request('https://example.test',{method:'POST',body:'{}'}));assert.equal(r.status,401);assert.equal(calls,0);
 assert.equal((await call('status',{}, {timestamp:Date.now()-120000})).status,401);assert.equal(calls,0);
 const draft={customer_name:customer.name,customer_phone:customer.phone,is_ready:true,status:'delivered',archived:true,pay_amount:100};
 r=await call('create',{draft});assert.equal(r.status,200);assert.equal(r.delivery.is_ready,false);assert.equal(r.delivery.archived,false);assert.equal(r.delivery.status,'assigned');assert.equal(rows.length,1);
 const id=r.delivery.id;const baseline=r.delivery.updated_at;
 r=await call('create',{draft});assert.equal(r.alreadyLinked,true);assert.equal(r.delivery.id,id);assert.equal(rows.length,1);
 r=await call('saveDraft',{draft:{...draft,delivery_date:'2026-10-23'},updatedAt:baseline});assert.equal(r.status,200);assert.equal(r.delivery.delivery_date,'2026-10-23');
 r=await call('saveDraft',{draft:{...draft,delivery_date:'2026-10-24'},updatedAt:baseline});assert.equal(r.status,409);assert.equal(rows[0].delivery_date,'2026-10-23');
 rows[0].is_ready=true;r=await call('saveDraft',{draft,updatedAt:rows[0].updated_at});assert.equal(r.status,409);assert.equal(rows[0].is_ready,true);
 rows=[{id:randomUUID(),customer_name:customer.name,customer_phone:customer.phone,status:'en_route',is_ready:true,archived:false,driver1_name:'Bobby',pay_amount:175,push_revision:3,updated_at:'old'}];
 const liveId=rows[0].id;
 r=await call('inspect');assert.equal(r.candidates.length,1);
 r=await call('create',{draft});assert.equal(r.status,409);assert.equal(rows.length,1);
 r=await call('link',{deliveryId:liveId});assert.equal(r.status,200);assert.equal(r.delivery.status,'en_route');assert.equal(r.delivery.driver1_name,'Bobby');assert.equal(r.delivery.pay_amount,175);assert.equal(r.delivery.push_revision,3);assert.equal(r.delivery.is_ready,true);
 r=await call('link',{deliveryId:randomUUID()});assert.equal(r.status,409);
 assert.equal(rows.length,1);
 }finally{await rm(dir,{recursive:true,force:true});delete globalThis.Deno;delete globalThis.bridgeDB;delete globalThis.bridgeHandler;}
});

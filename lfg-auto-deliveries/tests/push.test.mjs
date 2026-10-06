import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import vm from 'node:vm'

test('push queue targets assigned drivers, deduplicates, reassigns, and protects private data',async()=>{
 const db=new PGlite()
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema vault;
 create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table public.profiles(id uuid,role text);
 create table public.deliveries(id uuid primary key default gen_random_uuid(),is_ready boolean default false,driver1_name text,driver2_name text,customer_name text);
 insert into public.profiles values('00000000-0000-0000-0000-000000000001','driver');`)
 await db.exec(await readFile(new URL('../supabase/migrations/20261006210404_driver_push_alerts.sql',import.meta.url),'utf8'))
 let q=await db.query(`insert into deliveries(driver1_name,driver2_name) values('Mike','Mike') returning id`);const id=q.rows[0].id
 assert.equal((await db.query('select * from delivery_push_jobs')).rows.length,0)
 await db.query('update deliveries set is_ready=true where id=$1',[id])
 assert.equal((await db.query('select * from delivery_push_jobs')).rows.length,1)
 await db.query('update deliveries set is_ready=true where id=$1',[id])
 assert.equal((await db.query('select * from delivery_push_jobs')).rows.length,1)
 await db.query("update deliveries set driver2_name='Doug' where id=$1",[id])
 q=await db.query("select driver_name,status,revision from delivery_push_jobs order by revision,driver_name")
 assert.equal(q.rows.filter(r=>r.status==='cancelled').length,1)
 assert.deepEqual(q.rows.filter(r=>r.status==='queued').map(r=>r.driver_name),['Doug','Mike'])
 assert.equal((await db.query('select * from claim_delivery_push()')).rows.length,2)
 assert.equal((await db.query('select * from claim_delivery_push()')).rows.length,0)
 q=await db.query(`select has_table_privilege('authenticated','delivery_push_devices','select') as devices,has_function_privilege('authenticated','delivery_push_configuration()','execute') as config,has_function_privilege('anon','claim_delivery_push()','execute') as send`)
 assert.deepEqual(q.rows[0],{devices:false,config:false,send:false})
 await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'`)
 await assert.rejects(db.query("update deliveries set driver1_name='Other' where id=$1",[id]),/Only dispatch/)
 await db.close()
})

test('notification click opens the assigned delivery, never an external URL',async()=>{
 const handlers={};let navigated,focused=false
 const self={location:{origin:'https://lfgdelivery.netlify.app'},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[{url:'https://lfgdelivery.netlify.app/driver',navigate:async u=>navigated=u,focus:async()=>focused=true}]}}
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL})
 let work;handlers.notificationclick({notification:{close(){},data:{url:'/driver?delivery=123'}},waitUntil:p=>work=p});await work
 assert.equal(navigated,'https://lfgdelivery.netlify.app/driver?delivery=123');assert.equal(focused,true)
 navigated=null;handlers.notificationclick({notification:{close(){},data:{url:'https://evil.example'}},waitUntil:p=>work=p});assert.equal(navigated,null)
})

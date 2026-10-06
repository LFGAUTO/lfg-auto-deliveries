import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'
const cors = {'Access-Control-Allow-Origin':'https://lfgdelivery.netlify.app','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}})
const uuid=(s:unknown)=>typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s)
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('')
function validSubscription(s:any) {
 try { const u=new URL(s.endpoint); return u.protocol==='https:' && !u.username && !u.password && !u.port &&
 (u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com')) &&
 /^[A-Za-z0-9_-]{80,100}$/.test(s.keys?.p256dh) && /^[A-Za-z0-9_-]{20,30}$/.test(s.keys?.auth)
 } catch {return false}
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
 if(req.method!=='POST') return respond({error:'POST required'},405)
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
 const must=async(q:any)=>{const r=await q;if(r.error)throw new Error('Database operation failed');return r.data}
 try {
  const body=await req.json(); const action=body.action
  const config=await must(db.rpc('delivery_push_configuration'))
  const worker=req.headers.get('x-lfg-worker');
  let user:any=null, admin=false
  if(worker && worker===config?.lfg_push_worker) { if(!['drain','health'].includes(action))return respond({error:'Forbidden'},403) }
  else {
   const token=(req.headers.get('Authorization')||'').replace(/^Bearer /i,'')
   const {data,error}=await db.auth.getUser(token)
   if(error||!data.user)return respond({error:'Sign in required'},401)
   user=data.user
   const profile=await must(db.from('profiles').select('role').eq('id',user.id).maybeSingle())
   if(!profile||!['driver','admin'].includes(profile.role))return respond({error:'Driver or admin required'},403)
   admin=profile.role==='admin'
  }
  if(action==='health' && worker===config?.lfg_push_worker) {
   const sample=webpush.generateVAPIDKeys();
   const details=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/test-only',keys:{p256dh:sample.publicKey,auth:'AAAAAAAAAAAAAAAAAAAAAA'}},'test encryption',{vapidDetails:{subject:'mailto:finedeals@lfgauto.com',publicKey:config.lfg_push_public,privateKey:config.lfg_push_private}});
   return respond({ok:true,encryption:details.body.length>0});
  }
  if(action==='config')return respond({publicKey:config?.lfg_push_public})
  async function device() {
   if(!uuid(body.device_id)||typeof body.device_token!=='string'||body.device_token.length<40)return null
   const d=await must(db.from('delivery_push_devices').select('*').eq('id',body.device_id).eq('owner_id',user.id).maybeSingle())
   return d && d.token_hash===await hash(body.device_token) ? d : null
  }
  async function send(d:any,payload:any) {
   if(!validSubscription(d.subscription)) return {ok:false,dead:true}
   const details=webpush.generateRequestDetails(d.subscription,JSON.stringify(payload),{TTL:3600,urgency:'high',vapidDetails:{subject:'mailto:finedeals@lfgauto.com',publicKey:config.lfg_push_public,privateKey:config.lfg_push_private}})
   const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,signal:AbortSignal.timeout(10000),redirect:'error'})
   if([404,410].includes(response.status))await must(db.from('delivery_push_devices').update({active:false}).eq('id',d.id))
   return {ok:response.ok,dead:[404,410].includes(response.status)}
  }
  if(action==='register') {
   if(!uuid(body.device_id)||typeof body.device_token!=='string'||!/^[A-Za-z0-9_-]{43,100}$/.test(body.device_token)||!validSubscription(body.subscription))return respond({error:'Invalid phone registration'},400)
   const roster=await must(db.from('drivers_roster').select('name').eq('name',body.driver_name).maybeSingle())
   if(!roster)return respond({error:'Choose a driver from the roster'},400)
   const existing=await must(db.from('delivery_push_devices').select('id,token_hash').eq('id',body.device_id).maybeSingle())
   if(existing && existing.token_hash!==await hash(body.device_token))return respond({error:'Phone registration does not match this login'},403)
   await must(db.from('delivery_push_devices').upsert({id:body.device_id,owner_id:user.id,token_hash:await hash(body.device_token),driver_name:roster.name,subscription:body.subscription,active:true,updated_at:new Date().toISOString()},{onConflict:'id'}))
   // New phones can receive recent unacknowledged jobs that had no registered phone.
   await must(db.from('delivery_push_jobs').update({status:'queued',attempts:0,available_at:new Date().toISOString(),last_error:null}).eq('driver_name',roster.name).eq('status','no_device').is('acknowledged_at',null).gte('created_at',new Date(Date.now()-86400000).toISOString()))
   return respond({ok:true,driver_name:roster.name})
  }
  if(['device','disable','test','ack','jobs'].includes(action)) {
   const d=await device();if(!d)return respond({error:'Enable alerts for this phone first'},403)
   if(action==='device')return respond({active:d.active,driver_name:d.driver_name})
   if(action==='disable'){await must(db.from('delivery_push_devices').update({active:false}).eq('id',d.id));return respond({ok:true})}
   if(action==='test'){
    if(!d.active)return respond({error:'Enable alerts first'},400)
    if(d.last_test_at && Date.now()-Date.parse(d.last_test_at)<30000)return respond({error:'Wait 30 seconds before another test'},429)
    await must(db.from('delivery_push_devices').update({last_test_at:new Date().toISOString()}).eq('id',d.id))
    const result=await send(d,{title:'LFG AUTO · Test alert',body:'Alerts are set up for '+d.driver_name+'.',url:'/driver',tag:'lfg-test'})
    return respond(result.ok?{ok:true}:{error:'Push service rejected the test. Enable alerts again.'},result.ok?200:502)
   }
   if(action==='jobs')return respond({jobs:await must(db.from('delivery_push_jobs').select('id,delivery_id,revision,driver_name,status,created_at,acknowledged_at').eq('driver_name',d.driver_name).neq('status','cancelled').order('created_at',{ascending:false}).limit(100)),driver_name:d.driver_name})
   if(!uuid(body.job_id))return respond({error:'Invalid assignment'},400)
   const j=await must(db.from('delivery_push_jobs').select('*').eq('id',body.job_id).eq('driver_name',d.driver_name).maybeSingle())
   if(!j||j.status==='cancelled')return respond({error:'Assignment no longer current'},409)
   const delivery=await must(db.from('deliveries').select('is_ready,push_revision,driver1_name,driver2_name').eq('id',j.delivery_id).single())
   if(!delivery.is_ready||delivery.push_revision!==j.revision||![delivery.driver1_name,delivery.driver2_name].includes(d.driver_name))return respond({error:'Assignment changed; refresh your deliveries'},409)
   await must(db.from('delivery_push_jobs').update({acknowledged_at:new Date().toISOString(),acknowledged_device:d.id}).eq('id',j.id).is('acknowledged_at',null))
   return respond({ok:true})
  }
  if(action==='status'&&admin) {
   const jobs=await must(db.from('delivery_push_jobs').select('id,delivery_id,revision,driver_name,status,created_at,accepted_at,acknowledged_at,last_error,deliveries!inner(customer_name,archived)').eq('deliveries.archived',false).neq('status','cancelled').order('created_at',{ascending:false}).limit(250))
   const devices=await must(db.from('delivery_push_devices').select('driver_name,active'))
   return respond({jobs,phones:devices.filter((d:any)=>d.active).map((d:any)=>d.driver_name)})
  }
  if(action==='retry'&&admin){
   if(!uuid(body.job_id))return respond({error:'Invalid assignment'},400)
   await must(db.from('delivery_push_jobs').update({status:'queued',attempts:0,available_at:new Date().toISOString(),last_error:null}).eq('id',body.job_id).in('status',['failed','no_device']).is('acknowledged_at',null));return respond({ok:true})
  }
  if(action==='drain'&&(admin||worker===config?.lfg_push_worker)) {
   const jobs=await must(db.rpc('claim_delivery_push'))
   await Promise.all(jobs.map(async(j:any)=>{
    try {
     const delivery=await must(db.from('deliveries').select('is_ready,archived,push_revision,driver1_name,driver2_name').eq('id',j.delivery_id).maybeSingle())
     if(!delivery||!delivery.is_ready||delivery.archived||delivery.push_revision!==j.revision||![delivery.driver1_name,delivery.driver2_name].includes(j.driver_name)){
      await must(db.from('delivery_push_jobs').update({status:'cancelled'}).eq('id',j.id));return
     }
     const devices=await must(db.from('delivery_push_devices').select('*').eq('driver_name',j.driver_name).eq('active',true))
     if(!devices.length){await must(db.from('delivery_push_jobs').update({status:'no_device',last_error:'Driver has not enabled alerts on a phone'}).eq('id',j.id));return}
     const results=await Promise.all(devices.map((d:any)=>send(d,{title:'LFG AUTO · Delivery ready',body:'Jess has a delivery ready for you. Open it and tap Got it.',url:'/driver?delivery='+j.delivery_id,tag:'lfg-'+j.id}).catch(()=>({ok:false,dead:false}))))
     const accepted=results.some((r:any)=>r.ok)
     await must(db.from('delivery_push_jobs').update(accepted?{status:'accepted',accepted_at:new Date().toISOString(),last_error:null}:{status:j.attempts>=3?'failed':'queued',available_at:new Date(Date.now()+60000).toISOString(),last_error:'Push not accepted; check phone setup'}).eq('id',j.id).eq('status','sending'))
    }catch {await db.from('delivery_push_jobs').update({status:j.attempts>=3?'failed':'queued',available_at:new Date(Date.now()+60000).toISOString(),last_error:'Send interrupted; retry needed'}).eq('id',j.id).eq('status','sending')}
   }))
   await db.from('delivery_push_jobs').update({status:'failed',last_error:'Send timed out; retry needed'}).eq('status','sending').gte('attempts',3).lt('available_at',new Date().toISOString())
   return respond({ok:true,processed:jobs.length})
  }
  return respond({error:'Forbidden'},403)
 } catch {return respond({error:'Could not complete alert request. Try again or contact Jess.'},500)}
})

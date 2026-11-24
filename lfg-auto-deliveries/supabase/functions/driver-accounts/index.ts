import {createClient} from 'npm:@supabase/supabase-js@2.45.4'
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(x=>x.toString(16).padStart(2,'0')).join('')
Deno.serve(async req=>{
 const reply=(data:unknown,status=200)=>Response.json(data,{status})
 if(req.method!=='POST')return reply({error:'POST required'},405)
 const minute=req.headers.get('x-lfg-setup-time')||'',signature=req.headers.get('x-lfg-setup-signature')||''
 if(!/^\d+$/.test(minute)||Math.abs(Date.now()/60000-Number(minute))>2||!/^[0-9a-f]{64}$/.test(signature))return reply({error:'Unauthorized'},401)
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
 const {data:config,error}=await db.rpc('delivery_push_configuration')
 if(error||!config?.lfg_push_worker)return reply({error:'Setup unavailable'},503)
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.lfg_push_worker),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('driver-account-setup:'+minute)))
 let different=0;for(let i=0;i<64;i++)different|=signature.charCodeAt(i)^expected.charCodeAt(i)
 if(different)return reply({error:'Unauthorized'},401)
 const body=await req.json().catch(()=>({}))
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():''
 let accounts
 if(email){
  // Refresh setup only for an approved, active driver who has never confirmed.
  const {data:profile,error:profileError}=await db.from('profiles').select('id,email,driver_roster_id').eq('email',email).eq('role','driver').eq('status','active').not('driver_roster_id','is',null).maybeSingle()
  if(profileError||!profile)return reply({error:'Approved driver not found'},404)
  const {data:user,error:userError}=await db.auth.admin.getUserById(profile.id)
  if(userError||!user.user||user.user.email?.toLowerCase()!==email||user.user.email_confirmed_at)return reply({error:'Account is not awaiting first-time setup'},409)
  accounts=[{email}]
 }else{
  const {data,error:loadError}=await db.rpc('driver_accounts_to_invite');if(loadError)return reply({error:'Could not read approved drivers'},500)
  accounts=data
 }
 const result=[]
 for(const account of accounts){
  const {data,error}=await db.auth.admin.generateLink({type:'invite',email:account.email,options:{redirectTo:'https://delivery.lfgauto.com/set-password'}})
  const failure=error?.message||null
  if(failure)await db.rpc('driver_account_invited',{account_email:account.email,failure})
  result.push({email:account.email,created:!!data?.user,token_hash:data?.properties?.hashed_token,redirect:data?.properties?.redirect_to,error:failure})
 }
 return reply({accounts:result})
})

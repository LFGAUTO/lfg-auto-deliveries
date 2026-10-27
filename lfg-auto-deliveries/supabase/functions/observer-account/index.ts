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
 const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('observer-account-setup:'+minute)))
 let different=0;for(let i=0;i<64;i++)different|=signature.charCodeAt(i)^expected.charCodeAt(i)
 if(different)return reply({error:'Unauthorized'},401)
 const email='lfgcars+delivery@mail.grokbot.com', previousEmail='lfgcars@mail.grokbot.com'
 const {data:previous,error:lookupError}=await db.from('profiles').select('id,role').eq('email',previousEmail).maybeSingle()
 if(lookupError)return reply({error:'Account lookup failed'},500)
 if(previous){
   if(previous.role!=='observer')return reply({error:'Previous account role mismatch'},409)
   const {error:changeError}=await db.auth.admin.updateUserById(previous.id,{email})
   if(changeError)return reply({error:changeError.message},500)
   const {error:profileError}=await db.from('profiles').update({email}).eq('id',previous.id).eq('role','observer')
   if(profileError)return reply({error:'Could not update observer profile email'},500)
 }
 const {data:existing,error:existingError}=await db.from('profiles').select('id,role').eq('email',email).maybeSingle()
 if(existingError)return reply({error:'Account lookup failed'},500)
 if(existing&&existing.role!=='observer')return reply({error:'Existing account role mismatch'},409)
 if(existing){const {data:user}=await db.auth.admin.getUserById(existing.id);if(user?.user?.email_confirmed_at)return reply({error:'Account already activated'},409)}
 const {data,error:inviteError}=await db.auth.admin.generateLink({type:'invite',email,options:{redirectTo:'https://delivery.lfgauto.com/set-password'}})
 if(inviteError||!data?.user)return reply({error:inviteError?.message||'Could not prepare setup'},500)
 const {error:profileError}=await db.from('profiles').update({email,role:'observer',status:'active',first_name:'LFG Delivery Desk Bot',last_name:'',driver_roster_id:null}).eq('id',data.user.id)
 if(profileError)return reply({error:'Permission setup failed'},500)
 return reply({email,created:true,token_hash:data.properties?.hashed_token})
})

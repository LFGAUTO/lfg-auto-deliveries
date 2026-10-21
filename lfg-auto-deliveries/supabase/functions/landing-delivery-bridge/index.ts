import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { cleanDraft, isDraftEditable, deliveryMatches } from './model.js';

const PUBLIC_KEY = 'MCowBQYDK2VwAyEAUokmNamHmMPpmZ59chU1FWcUZljoMkbp1a965nga9MY=';
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const publicKey = crypto.subtle.importKey('spki',Uint8Array.from(atob(PUBLIC_KEY),c=>c.charCodeAt(0)),{name:'Ed25519'},false,['verify']);
const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const SUMMARY = 'id,customer_name,customer_phone,delivery_date,status,is_ready,archived,driver1_name,driver2_name,landing_lead_id,make,model,vyear';
const CHOICES = 'id,created_at,dealership_name,dealership_address,dealership_contact,dealership_phone,make,model,color,vyear,miles_per_year,contract_type,cust_window_text,return_plan,trade_make,trade_model,trade_year,trade_return_dealer,pay_amount';
async function allRows(columns: string) {
  const rows: any[]=[];
  for(let start=0;;start+=1000){const {data,error}=await db.from('deliveries').select(columns).order('created_at',{ascending:false}).order('id').range(start,start+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)break;}
  return rows;
}
Deno.serve(async req => {
  if(req.method!=='POST')return json({error:'Method not allowed.'},405);
  try {
    const raw=await req.text();
    if(raw.length>40000)return json({error:'Request too large.'},413);
    let signature: Uint8Array;
    try {signature=Uint8Array.from(atob(req.headers.get('x-lfg-signature')||''),c=>c.charCodeAt(0));}catch{return json({error:'Unauthorized'},401);}
    if(!await crypto.subtle.verify('Ed25519',await publicKey,signature,new TextEncoder().encode(raw)))return json({error:'Unauthorized'},401);
    const body=JSON.parse(raw);
    if(typeof body.timestamp!=='number' || Math.abs(Date.now()-body.timestamp)>60000)return json({error:'Request expired. Please retry.'},401);
    const {action,leadId,payload={},customer={}}=body;
    if(!uuid(leadId) || !['inspect','status','create','link','saveDraft'].includes(action))return json({error:'Invalid request.'},400);
    const {data:linked,error:readError}=await db.from('deliveries').select('*').eq('landing_lead_id',leadId).maybeSingle();
    if(readError)throw readError;
    if(action==='status')return json({delivery:linked});
    if(action==='inspect') {
      const [history,roster,candidateRows]=await Promise.all([allRows(CHOICES),db.from('drivers_roster').select('name').order('name'),linked?Promise.resolve([]):allRows(SUMMARY+',created_at')]);
      if(roster.error)throw roster.error;
      return json({delivery:linked,choices:history,drivers:(roster.data||[]).map(d=>d.name),candidates:candidateRows.filter(d=>!d.landing_lead_id&&deliveryMatches(d,customer)).slice(0,20)});
    }
    if(action==='create') {
      if(linked)return json({delivery:linked,alreadyLinked:true});
      // Match on normalized full name or phone; require explicit linking or an
      // explicit second-run confirmation, never silently attach a customer.
      const matches=(await allRows(SUMMARY+',created_at')).filter(d=>!d.landing_lead_id&&deliveryMatches(d,customer));
      if(matches.length && payload.confirmNew!==true)return json({error:'A matching delivery exists. Link it, or confirm this is a separate delivery.',candidates:matches.slice(0,20)},409);
      let draft;try{draft=cleanDraft(payload.draft);}catch(e){return json({error:e.message},400);}
      const {data,error}=await db.from('deliveries').insert({...draft,landing_lead_id:leadId,status:'assigned',archived:false,is_ready:false,paperwork_status:'pending'}).select('*').single();
      if(error){if(error.code==='23505'){const {data:existing}=await db.from('deliveries').select('*').eq('landing_lead_id',leadId).single();if(existing)return json({delivery:existing,alreadyLinked:true});}throw error;}
      return json({delivery:data});
    }
    if(action==='link') {
      if(linked)return linked.id===payload.deliveryId?json({delivery:linked}):json({error:'This customer already has a linked delivery.'},409);
      if(!uuid(payload.deliveryId))return json({error:'Choose a delivery.'},400);
      const {data:target,error}=await db.from('deliveries').select('*').eq('id',payload.deliveryId).single();
      if(error||!target)return json({error:'Delivery not found.'},404);
      if(target.landing_lead_id)return json({error:'That delivery is already linked to another customer.'},409);
      const {data,error:saveError}=await db.from('deliveries').update({landing_lead_id:leadId}).eq('id',target.id).is('landing_lead_id',null).select('*').maybeSingle();
      if(saveError?.code==='23505'||(!saveError&&!data))return json({error:'The delivery link changed. Please reload.'},409);
      if(saveError)throw saveError;
      return json({delivery:data});
    }
    if(action==='saveDraft') {
      if(!isDraftEditable(linked))return json({error:'This delivery is no longer an editable draft. Open delivery admin for live or completed delivery changes.'},409);
      let draft;try{draft=cleanDraft(payload.draft);}catch(e){return json({error:e.message},400);}
      if(typeof payload.updatedAt!=='string')return json({error:'Reload before saving.'},400);
      const {data,error}=await db.from('deliveries').update(draft).eq('id',linked.id).eq('updated_at',payload.updatedAt).eq('is_ready',false).eq('archived',false).eq('status','assigned').is('delivered_at',null).select('*').maybeSingle();
      if(error)throw error;
      if(!data)return json({error:'This delivery changed in another window. Reload it before saving.'},409);
      return json({delivery:data});
    }
  }catch(error){console.error('Landing delivery bridge error:',error?.code||error?.name||'Unknown');return json({error:'Delivery connection unavailable. Please retry.'},503);}
});

import {useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../context/AuthContext'
import {useToast} from './Toast'
export default function ReactivateDelivery({delivery:d,onSaved}){
 const {isAdmin,profile,userName}=useAuth(),toast=useToast()
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 if(!isAdmin||d.status!=='delivered')return null
 async function reopen(){
  const status=d.en_route_at?'en_route':d.at_dealer_at?'at_dealer':'assigned'
  if(!window.confirm(`Reactivate ${d.customer_name} — ${d.vyear||''} ${d.make||''} ${d.model||''}, VIN ${d.vin||'not recorded'}?\n\nThis corrects an accidental close. It returns the same delivery to ${status.replaceAll('_',' ')} and clears its delivered/closed timestamps. Photos, tasks, drivers and pay rates stay saved. Completed payroll totals will recalculate; recorded payments stay unchanged. Review saved tasks before closing again.`))return
  setBusy(true);setError('')
  try{
   const {data,error}=await supabase.from('deliveries').update({status,archived:false,delivered_at:null,closeout_completed_at:null,closeout_required:false}).eq('id',d.id).eq('status','delivered').eq('updated_at',d.updated_at).select('*').single()
   if(error||!data)throw Error('Delivery changed or could not be reopened. Refresh and try again.')
   const log=await supabase.from('activity_log').insert({delivery_id:d.id,user_id:profile?.id||null,user_name:userName,action:`Reactivated accidental close for ${d.customer_name}; restored ${status}; previous delivered ${d.delivered_at||'none'}, closeout ${d.closeout_completed_at||'none'}.`})
   toast(log.error?'Delivery reactivated; activity note could not be saved.':'Delivery reactivated · back in active deliveries')
   await onSaved?.()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section style={{marginBottom:16}}><button className="btn gold" disabled={busy} onClick={reopen}>{busy?'Reactivating…':'Reactivate delivery'}</button><p className="meta">Correct an accidental close on this same delivery.</p>{error&&<p role="alert" className="error-banner">{error}</p>}</section>
}

import {useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../context/AuthContext'
import {useToast} from './Toast'
export default function DeliveryPay({delivery:d,onSaved}){
 const {isAdmin,profile,userName}=useAuth(),toast=useToast()
 const [editing,setEditing]=useState(false),[amount,setAmount]=useState(d.pay_amount??100),[adjust,setAdjust]=useState(d.pay_adjust??0),[note,setNote]=useState(d.pay_adjust_note||''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 if(!isAdmin)return null
 async function save(){
  const base=Number(amount),extra=Number(adjust)
  if(amount===''||adjust===''||!Number.isFinite(base)||!Number.isFinite(extra)||base<0||base+extra<0){setError('Enter a valid pay amount and adjustment. Total cannot be negative.');return}
  if(!note.trim()){setError('Add a reason for the pay change.');return}
  setBusy(true);setError('')
  try{
   const {data,error}=await supabase.from('deliveries').update({pay_amount:base,pay_adjust:extra,pay_adjust_note:note.trim()}).eq('id',d.id).select('id').single()
   if(error||!data)throw error||new Error('Delivery was not updated')
   setEditing(false);toast('Delivery pay updated');await onSaved?.()
   void supabase.from('activity_log').insert({delivery_id:d.id,user_id:profile.id,user_name:userName,action:`changed delivery pay from $${Number(d.pay_amount??100)+Number(d.pay_adjust||0)} to $${base+extra} per driver: ${note.trim()}`}).then(()=>{},()=>{})
  }catch(e){setError('Could not save pay: '+e.message)}finally{setBusy(false)}
 }
 return <section><h2 className="section-title">Driver pay</h2><p>${(Number(d.pay_amount??100)+Number(d.pay_adjust||0)).toFixed(2)} per driver · {d.pay_exclude?'Excluded from payroll':'Included in payroll'}</p>{!editing?<button className="btn ghost sm" onClick={()=>{setAmount(d.pay_amount??100);setAdjust(d.pay_adjust??0);setNote(d.pay_adjust_note||'');setEditing(true)}}>Edit delivery pay</button>:<><div className="fg2"><label className="fld"><span>Base pay per driver ($)</span><input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} /></label><label className="fld"><span>Extra pay / deduction ($)</span><input type="number" step="0.01" value={adjust} onChange={e=>setAdjust(e.target.value)} /></label></div><label className="fld"><span>Reason for change</span><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Delivery took longer than expected" /></label><p>Total: ${(Number(amount)+Number(adjust)).toFixed(2)} per driver</p>{error&&<p className="error-banner" role="alert">{error}</p>}<div className="btnrow"><button className="btn ghost" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button><button className="btn gold" disabled={busy} onClick={save}>{busy?'Saving…':'Save delivery pay'}</button></div></>}</section>
}

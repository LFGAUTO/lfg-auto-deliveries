import { useRef, useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'

export default function ExtraPay({ drivers, date, onClose, onSaved }) {
  const [form, setForm] = useState({driver_name:'', work_date:date, category:'Errand', amount:'', description:''})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(crypto.randomUUID())
  const lock = useRef(false)
  const change = (key,value) => setForm(f=>({...f,[key]:value}))
  async function save(e) {
    e.preventDefault()
    if(lock.current) return
    lock.current=true; setBusy(true); setError('')
    try {
      const {error} = await supabase.from('payroll_extras').insert({...form,id:request.current,amount:Number(form.amount)})
      if(error?.code==='23505'){
        const {data:existing,error:readError}=await supabase.from('payroll_extras').select('*').eq('id',request.current).single()
        if(readError || !existing || existing.voided || existing.driver_name!==form.driver_name || existing.work_date!==form.work_date || existing.category!==form.category || Number(existing.amount)!==Number(form.amount) || existing.description!==form.description) throw Error('This entry may already have saved. Close this form and refresh payroll before adding another.')
      }else if(error) throw Error(error.message)
      onSaved()
    } catch(e) { setError(e.message) }
    finally { lock.current=false;setBusy(false) }
  }
  return <Modal title="Add extra pay" onClose={()=>{if(!busy)onClose()}}>
    <p className="sub">For errands, lease returns, or other work. The work date determines the Saturday–Friday payroll week.</p>
    <form onSubmit={save}><fieldset disabled={busy} style={{border:0,padding:0}}>
      <label className="fld"><span>Driver</span><select required value={form.driver_name} onChange={e=>change('driver_name',e.target.value)}><option value="">Choose driver</option>{drivers.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select></label>
      <label className="fld"><span>Work date</span><input required type="date" value={form.work_date} onChange={e=>change('work_date',e.target.value)}/></label>
      <label className="fld"><span>Type</span><select value={form.category} onChange={e=>change('category',e.target.value)}>{['Errand','Lease return','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="fld"><span>Amount ($)</span><input required type="number" min="0.01" max="100000" step="0.01" value={form.amount} onChange={e=>change('amount',e.target.value)}/></label>
      <label className="fld"><span>Description / customer (optional)</span><textarea maxLength={1000} value={form.description} onChange={e=>change('description',e.target.value)}/></label>
      {error && <p role="alert">{error}</p>}
      <div className="btnrow"><button className="btn gold" type="submit">{busy?'Saving…':'Save extra pay'}</button><button className="btn ghost" type="button" onClick={onClose}>Cancel</button></div>
    </fieldset></form>
  </Modal>
}

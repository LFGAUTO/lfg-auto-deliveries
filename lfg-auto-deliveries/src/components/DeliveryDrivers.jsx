import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

export default function DeliveryDrivers({ delivery: d, onSaved }) {
  const { isAdmin, profile, userName } = useAuth()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [drivers, setDrivers] = useState([])
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!isAdmin) return null

  async function edit() {
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.from('drivers_roster').select('name').order('name')
      if (error) throw error
      setDrivers([...new Set([...(data || []).map(x => x.name), d.driver1_name, d.driver2_name].filter(Boolean))].sort())
      setFirst(d.driver1_name || ''); setSecond(d.driver2_name || ''); setReason(''); setEditing(true)
    } catch { setError('Could not load drivers. Please try again.') }
    finally { setBusy(false) }
  }

  async function save() {
    if (busy) return
    if (!first) { setError('Choose Driver 1.'); return }
    if (first === second) { setError('Choose two different drivers.'); return }
    if (!reason.trim()) { setError('Add a reason for the driver change.'); return }
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.from('deliveries')
        .update({ driver1_name: first, driver2_name: second || null })
        .eq('id', d.id).eq('archived', true).select('id').single()
      if (error || !data) throw error || new Error('Delivery was not updated')
      void supabase.from('activity_log').insert({
        delivery_id: d.id, user_id: profile.id, user_name: userName,
        action: `changed archived drivers from ${[d.driver1_name, d.driver2_name].filter(Boolean).join(' & ') || 'Unassigned'} to ${[first, second].filter(Boolean).join(' & ')}: ${reason.trim()}`,
      }).then(() => {}, () => {})
      setEditing(false); toast('Delivery drivers updated'); await onSaved?.()
    } catch (e) { setError('Could not save drivers: ' + e.message) }
    finally { setBusy(false) }
  }

  const count = [first, second].filter(Boolean).length
  const perDriver = Number(d.pay_amount ?? 100) + Number(d.pay_adjust || 0)
  return <section>
    <h2 className="section-title">Assigned drivers</h2>
    <p>{[d.driver1_name, d.driver2_name].filter(Boolean).join(' & ') || 'Unassigned'}</p>
    {!editing ? <button className="btn ghost sm" disabled={busy} onClick={edit}>{busy ? 'Loading drivers…' : 'Edit drivers'}</button> : <>
      <div className="fg2">
        <label className="fld"><span>Driver 1</span><select disabled={busy} value={first} onChange={e => setFirst(e.target.value)}><option value="">Choose driver</option>{drivers.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="fld"><span>Driver 2 (optional)</span><select disabled={busy} value={second} onChange={e => setSecond(e.target.value)}><option value="">No second driver</option>{drivers.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <p>{d.pay_exclude ? 'This delivery is excluded from payroll.' : `$${perDriver.toFixed(2)} per driver · ${count} driver${count === 1 ? '' : 's'} · $${(perDriver * count).toFixed(2)} total`}</p>
      <label className="fld"><span>Reason for change</span><textarea disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="Second driver helped complete the delivery" /></label>
      <div className="btnrow"><button className="btn ghost" disabled={busy} onClick={() => { setEditing(false); setError('') }}>Cancel</button><button className="btn gold" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save drivers'}</button></div>
    </>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </section>
}

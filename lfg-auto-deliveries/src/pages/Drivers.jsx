import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'

// Drivers share ONE login. This page just manages the list of NAMES used
// when assigning deliveries. The signature captured at delivery shows who did it.
export default function Drivers() {
  const toast = useToast()
  const [roster, setRoster] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })

  async function load() {
    const { data } = await supabase.from('drivers_roster').select('*').order('name')
    setRoster(data || [])
  }
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  async function addDriver() {
    if (!form.name.trim()) { toast('Name required'); return }
    const { error } = await supabase.from('drivers_roster').insert({ name: form.name.trim(), phone: form.phone.trim() || null })
    if (error) { toast('Error: ' + error.message); return }
    toast('Driver added to roster'); setShowNew(false); setForm({ name: '', phone: '' }); load()
  }

  async function remove(d) {
    if (!confirm(`Remove ${d.name} from the roster?`)) return
    const { error } = await supabase.from('drivers_roster').delete().eq('id', d.id)
    if (error) { toast('Error: ' + error.message); return }
    toast('Removed from roster'); load()
  }

  async function resetDriverPw() {
    const password = prompt('New password for the shared driver login:')
    if (password === null) return
    if (password.trim().length < 6) { toast('Use at least 6 characters'); return }
    const { data, error } = await supabase.functions.invoke('reset-driver-password', { body: { password: password.trim() } })
    if (error || data?.error) { toast('Error: ' + (data?.error || error.message)); return }
    toast('Driver password updated')
  }

  return (
    <>
      <div className="h1">Drivers</div>
      <div className="sub">Driver roster — names used when assigning deliveries</div>

      <div className="card" style={{ borderColor: '#1d6bb6', background: 'rgba(29,107,182,.10)', marginBottom: 14 }}>
        <strong className="gold">Shared driver login</strong>
        <div className="meta" style={{ color: '#cfe2f2', marginTop: 4 }}>
          All drivers use one login (set it up once in Supabase — see the README). Because each driver signs at delivery,
          the signature on the record shows who actually completed it.
        </div>
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={resetDriverPw}>Reset Driver Password</button>
      </div>

      <button className="btn gold" onClick={() => setShowNew(true)}>+ Add Driver to Roster</button>
      <div style={{ height: 14 }} />

      <div className="grid">
        {roster.length === 0 && <div className="muted">No drivers yet. Add the names you assign deliveries to.</div>}
        {roster.map(d => (
          <div key={d.id} className="card dcard">
            <div>
              <div className="cn">{d.name}</div>
              <div className="meta">{d.phone || 'no phone'}</div>
            </div>
            <button className="btn danger sm" onClick={() => remove(d)}>Remove</button>
          </div>
        ))}
      </div>

      {showNew && (
        <Modal title="Add Driver to Roster" onClose={() => setShowNew(false)}>
          <label className="fld"><span>Name</span><input value={form.name} onChange={set('name')} placeholder="Bobby Fonz" /></label>
          <label className="fld"><span>Phone</span><input value={form.phone} onChange={set('phone')} type="tel" /></label>
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn gold" onClick={addDriver}>Add Driver</button>
          </div>
        </Modal>
      )}
    </>
  )
}

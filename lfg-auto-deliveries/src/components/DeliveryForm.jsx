import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import Modal from './Modal'

const EMPTY = {
  status: 'assigned',
  customer_name: '', customer_phone: '', delivery_address: '',
  delivery_date: '', delivery_time: '', driver1_name: '', driver2_name: '',
  dealership_name: '', dealership_contact: '', dealership_phone: '',
  vin: '', vyear: '', make: '', model: '', color: '',
  monthly_payment: '', miles_per_year: '', contract_type: '',
  is_trade: false, trade_year: '', trade_make: '', trade_model: '', trade_vin: '', trade_notes: '',
  trade_destination: 'office', trade_return_dealer: '',
  cod_required: false, cod_amount: '', cod_made_out_to: 'Dealer', cod_type: 'Check', cod_received: false,
  odometer: '', fuel_level: '', damage_noted: false, damage_notes: '',
  task_bluetooth: false, task_app: false, task_photo_client: false, task_photo_contract: false,
  admin_notes: '', driver_notes: '',
}

export default function DeliveryForm({ existing, drivers, onClose, onSaved }) {
  const { profile, userName } = useAuth()
  const toast = useToast()
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [d1Other, setD1Other] = useState(false)
  const [d2Other, setD2Other] = useState(false)

  useEffect(() => {
    if (existing) {
      const merged = { ...EMPTY, ...existing }
      // normalize null -> '' so inputs stay controlled
      Object.keys(merged).forEach(k => { if (merged[k] === null) merged[k] = EMPTY[k] ?? '' })
      setF(merged)
      const names = drivers.map(d => d.name)
      setD1Other(!!merged.driver1_name && !names.includes(merged.driver1_name))
      setD2Other(!!merged.driver2_name && !names.includes(merged.driver2_name))
    }
  }, [existing, drivers])

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setF(prev => ({ ...prev, [k]: v }))
  }

  async function save() {
    if (!f.customer_name.trim()) { toast('Customer name is required'); return }
    if (d1Other && !f.driver1_name.trim()) { toast('Type the Driver 1 name'); return }
    if (d2Other && !f.driver2_name.trim()) { toast('Type the Driver 2 name'); return }
    setBusy(true)
    const payload = {
      ...f,
      driver1_name: f.driver1_name.trim() || null,
      driver2_name: f.driver2_name.trim() || null,
    }
    let res
    if (existing) {
      res = await supabase.from('deliveries').update(payload).eq('id', existing.id).select().single()
    } else {
      res = await supabase.from('deliveries').insert({ ...payload, created_by: profile.id }).select().single()
    }
    setBusy(false)
    if (res.error) { toast('Error: ' + res.error.message); return }

    await supabase.from('activity_log').insert({
      delivery_id: res.data.id, user_id: profile.id, user_name: userName,
      action: existing ? 'edited the delivery' : 'created the delivery',
    })
    toast(existing ? 'Delivery updated' : 'Delivery created')
    onSaved?.()
    onClose()
  }

  const T = ({ children }) => <div className="section-title">{children}</div>
  const In = ({ k, label, type = 'text', ...rest }) => (
    <label className="fld"><span>{label}</span>
      <input type={type} value={f[k]} onChange={set(k)} {...rest} /></label>
  )

  return (
    <Modal wide title={existing ? 'Edit Delivery' : 'New Delivery'} onClose={onClose}>
      <T>Deal &amp; Customer</T>
      <In k="customer_name" label="Customer Name" />
      <div className="fg2">
        <In k="customer_phone" label="Customer Phone" type="tel" />
        <label className="fld"><span>Driver 1</span>
          <select value={d1Other ? '__other__' : f.driver1_name}
            onChange={e => {
              const v = e.target.value
              if (v === '__other__') { setD1Other(true); setF(p => ({ ...p, driver1_name: '' })) }
              else { setD1Other(false); setF(p => ({ ...p, driver1_name: v })) }
            }}>
            <option value="">— Unassigned —</option>
            {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            <option value="__other__">Other (write in name)</option>
          </select></label>
      </div>
      {d1Other && (
        <label className="fld"><span>Driver 1 Name (write in)</span>
          <input value={f.driver1_name} onChange={set('driver1_name')} placeholder="Type driver name" /></label>
      )}
      <label className="fld"><span>Driver 2 (optional)</span>
        <select value={d2Other ? '__other__' : f.driver2_name}
          onChange={e => {
            const v = e.target.value
            if (v === '__other__') { setD2Other(true); setF(p => ({ ...p, driver2_name: '' })) }
            else { setD2Other(false); setF(p => ({ ...p, driver2_name: v })) }
          }}>
          <option value="">— None —</option>
          {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          <option value="__other__">Other (write in name)</option>
        </select></label>
      {d2Other && (
        <label className="fld"><span>Driver 2 Name (write in)</span>
          <input value={f.driver2_name} onChange={set('driver2_name')} placeholder="Type driver name" /></label>
      )}
      <In k="delivery_address" label="Delivery Address" />
      <div className="fg2">
        <In k="delivery_date" label="Delivery Date" type="date" />
        <In k="delivery_time" label="Delivery Time" type="time" />
      </div>

      <T>New Vehicle</T>
      <div className="fg2">
        <In k="dealership_name" label="Dealership Name" />
        <In k="dealership_contact" label="Dealership Contact" />
      </div>
      <div className="fg2">
        <In k="dealership_phone" label="Dealership Phone" type="tel" />
        <In k="vin" label="VIN" />
      </div>
      <div className="fg2">
        <In k="vyear" label="Year" />
        <In k="make" label="Make" />
      </div>
      <div className="fg2">
        <In k="model" label="Model" />
        <In k="color" label="Color" />
      </div>
      <div className="fg2">
        <In k="monthly_payment" label="Monthly Payment" />
        <In k="miles_per_year" label="Miles Per Year" />
      </div>
      <In k="contract_type" label="Type Of Contract" />

      <T>Lease Return / Trade</T>
      <label className="check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={f.is_trade} onChange={set('is_trade')} /> Lease Return or Trade?
      </label>
      {f.is_trade && (
        <>
          <div className="fg2"><In k="trade_year" label="Year" /><In k="trade_make" label="Make" /></div>
          <div className="fg2"><In k="trade_model" label="Model" /><In k="trade_vin" label="Trade / Lease Return VIN" /></div>
          <label className="fld"><span>Where does it go?</span>
            <select value={f.trade_destination} onChange={set('trade_destination')}>
              <option value="office">Back to Office</option>
              <option value="dealer">Dealer (lease return)</option>
            </select></label>
          {f.trade_destination === 'dealer' && <In k="trade_return_dealer" label="Which Dealer (name & location)" placeholder="e.g. Audi of Freehold" />}
          <label className="fld"><span>Additional Trade Notes</span><textarea value={f.trade_notes} onChange={set('trade_notes')} /></label>
        </>
      )}

      <T>COD / Payment</T>
      <label className="check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={f.cod_required} onChange={set('cod_required')} /> COD Required?
      </label>
      {f.cod_required && (
        <>
          <div className="fg2">
            <In k="cod_amount" label="COD Amount" />
            <label className="fld"><span>Made Out To</span>
              <select value={f.cod_made_out_to} onChange={set('cod_made_out_to')}>
                <option>Dealer</option><option>LFG AUTO LLC</option>
              </select></label>
          </div>
          <label className="fld"><span>COD Type</span>
            <select value={f.cod_type} onChange={set('cod_type')}>
              <option>Check</option><option>Cash</option><option>Other</option>
            </select></label>
          <label className="check"><input type="checkbox" checked={f.cod_received} onChange={set('cod_received')} /> COD Received</label>
        </>
      )}

      <T>Notes</T>
      <label className="fld"><span>Admin Notes</span><textarea value={f.admin_notes} onChange={set('admin_notes')} /></label>

      <div className="btnrow" style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn gold" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Delivery'}</button>
      </div>
    </Modal>
  )
}

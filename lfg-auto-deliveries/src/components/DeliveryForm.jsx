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

  // NOTE: these are plain helper FUNCTIONS that are CALLED ( {field(...)} ),
  // not components used as <Field/>. That keeps each input mounted while you
  // type, so focus is never lost. Do not convert these back to <Components/>.
  const section = (text) => <div className="section-title">{text}</div>
  const field = (k, label, type = 'text', extra = {}) => (
    <label className="fld"><span>{label}</span>
      <input type={type} value={f[k]} onChange={set(k)} {...extra} /></label>
  )
  const area = (k, label) => (
    <label className="fld"><span>{label}</span>
      <textarea value={f[k]} onChange={set(k)} /></label>
  )

  return (
    <Modal wide title={existing ? 'Edit Delivery' : 'New Delivery'} onClose={onClose}>
      {section('Deal & Customer')}
      {field('customer_name', 'Customer Name')}
      <div className="fg2">
        {field('customer_phone', 'Customer Phone', 'tel')}
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
      {d1Other && field('driver1_name', 'Driver 1 Name (write in)', 'text', { placeholder: 'Type driver name' })}
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
      {d2Other && field('driver2_name', 'Driver 2 Name (write in)', 'text', { placeholder: 'Type driver name' })}
      {field('delivery_address', 'Delivery Address')}
      <div className="fg2">
        {field('delivery_date', 'Delivery Date', 'date')}
        {field('delivery_time', 'Delivery Time', 'time')}
      </div>

      {section('New Vehicle')}
      <div className="fg2">
        {field('dealership_name', 'Dealership Name')}
        {field('dealership_contact', 'Dealership Contact')}
      </div>
      <div className="fg2">
        {field('dealership_phone', 'Dealership Phone', 'tel')}
        {field('vin', 'VIN')}
      </div>
      <div className="fg2">
        {field('vyear', 'Year')}
        {field('make', 'Make')}
      </div>
      <div className="fg2">
        {field('model', 'Model')}
        {field('color', 'Color')}
      </div>
      <div className="fg2">
        {field('monthly_payment', 'Monthly Payment')}
        {field('miles_per_year', 'Miles Per Year')}
      </div>
      {field('contract_type', 'Type Of Contract')}

      {section('Lease Return / Trade')}
      <label className="check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={f.is_trade} onChange={set('is_trade')} /> Lease Return or Trade?
      </label>
      {f.is_trade && (
        <>
          <div className="fg2">{field('trade_year', 'Year')}{field('trade_make', 'Make')}</div>
          <div className="fg2">{field('trade_model', 'Model')}{field('trade_vin', 'Trade / Lease Return VIN')}</div>
          <label className="fld"><span>Where does it go?</span>
            <select value={f.trade_destination} onChange={set('trade_destination')}>
              <option value="office">Back to Office</option>
              <option value="dealer">Dealer (lease return)</option>
            </select></label>
          {f.trade_destination === 'dealer' && field('trade_return_dealer', 'Which Dealer (name & location)', 'text', { placeholder: 'e.g. Audi of Freehold' })}
          {area('trade_notes', 'Additional Trade Notes')}
        </>
      )}

      {section('COD / Payment')}
      <label className="check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={f.cod_required} onChange={set('cod_required')} /> COD Required?
      </label>
      {f.cod_required && (
        <>
          <div className="fg2">
            {field('cod_amount', 'COD Amount')}
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

      {section('Notes')}
      {area('admin_notes', 'Admin Notes')}

      <div className="btnrow" style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn gold" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Delivery'}</button>
      </div>
    </Modal>
  )
}

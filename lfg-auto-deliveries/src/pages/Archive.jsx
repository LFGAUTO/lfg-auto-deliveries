import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { fmtDateTime, vehicleLabel, downloadCSV, printDeliveryPacket } from '../lib/helpers'
import Modal from '../components/Modal'

export default function Archive() {
  const { profile, userName } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [view, setView] = useState(null)

  async function load() {
    const { data } = await supabase.from('deliveries')
      .select('*')
      .eq('archived', true).order('delivered_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function removeRecord(d) {
    if (!confirm(`Permanently delete the archived delivery for ${d.customer_name}? This cannot be undone.`)) return
    const { error } = await supabase.from('deliveries').delete().eq('id', d.id)
    if (error) { toast("Couldn't delete — try again."); return }
    toast('Archived delivery deleted'); setView(null); load()
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(d => {
      const drv = [d.driver1_name, d.driver2_name].filter(Boolean).join(' ')
      return [d.customer_name, d.vin, drv, d.delivery_date, d.make, d.model].join(' ').toLowerCase().includes(s)
    })
  }, [rows, q])

  function exportCSV() {
    const out = filtered.map(d => ({
      Customer: d.customer_name, Phone: d.customer_phone, VIN: d.vin, Vehicle: vehicleLabel(d),
      Dealership: d.dealership_name, Driver: [d.driver1_name, d.driver2_name].filter(Boolean).join(' & '),
      DeliveryDate: d.delivery_date, DeliveredAt: d.delivered_at,
      COD: d.cod_required ? d.cod_amount : '', Trade: d.is_trade ? `${d.trade_year} ${d.trade_make} ${d.trade_model}` : '',
      Damage: d.damage_noted ? d.damage_notes : '',
      ClientPhoto: d.client_photo_url || '', ContractPhoto: d.contract_photo_url || '', TradePhoto: d.trade_photo_url || '',
    }))
    downloadCSV(out, 'lfg-archive.csv')
  }

  const Field = ({ label, value }) => value ? (
    <div style={{ marginBottom: 6 }}><span className="muted" style={{ fontSize: 12 }}>{label}: </span>{String(value)}</div>
  ) : null

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div className="h1">Archive</div><div className="sub">Permanent delivery record · {rows.length} completed</div></div>
        <button className="btn ghost sm" onClick={exportCSV}>⬇ CSV</button>
      </div>

      <input placeholder="Search customer, VIN, driver, date, make, model…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />

      <div className="grid">
        {filtered.length === 0 && <div className="muted">No completed deliveries found.</div>}
        {filtered.map(d => (
          <div key={d.id} className="card dcard" onClick={() => setView(d)} style={{ cursor: 'pointer' }}>
            <div>
              <div className="cn">{d.customer_name}</div>
              <div className="meta">{vehicleLabel(d)} · VIN {d.vin || '—'}</div>
              <div className="meta">Delivered {fmtDateTime(d.delivered_at)}</div>
            </div>
            <span className="gold" style={{ fontSize: 13 }}>View →</span>
          </div>
        ))}
      </div>

      {view && (
        <Modal wide title={view.customer_name} onClose={() => setView(null)}>
          <div className="section-title">Vehicle</div>
          <Field label="Vehicle" value={vehicleLabel(view)} />
          <Field label="VIN" value={view.vin} />
          <Field label="Color" value={view.color} />
          <Field label="Monthly Payment" value={view.monthly_payment} />
          <Field label="Contract" value={view.contract_type} />

          <div className="section-title">Dealership</div>
          <Field label="Dealer" value={view.dealership_name} />
          <Field label="Contact" value={view.dealership_contact} />
          <Field label="Phone" value={view.dealership_phone} />

          <div className="section-title">Customer & Delivery</div>
          <Field label="Phone" value={view.customer_phone} />
          <Field label="Address" value={view.delivery_address} />
          <Field label="Driver" value={[view.driver1_name, view.driver2_name].filter(Boolean).join(' & ')} />

          <div className="section-title">Timestamps</div>
          <Field label="At Dealer" value={fmtDateTime(view.at_dealer_at)} />
          <Field label="En Route" value={fmtDateTime(view.en_route_at)} />
          <Field label="Delivered" value={fmtDateTime(view.delivered_at)} />
          {view.is_trade && <Field label="Trade Picked Up" value={fmtDateTime(view.trade_picked_up_at)} />}

          {view.is_trade && (<><div className="section-title">Trade / Lease Return</div>
            <Field label="Vehicle" value={`${view.trade_year || ''} ${view.trade_make || ''} ${view.trade_model || ''}`} />
            <Field label="VIN" value={view.trade_vin} />
            <Field label="Goes To" value={view.trade_destination === 'dealer' ? `Dealer — ${view.trade_return_dealer || ''}` : 'Back to Office'} />
            <Field label="Notes" value={view.trade_notes} /></>)}

          {view.cod_required && (<><div className="section-title">Payment</div>
            <Field label="COD Amount" value={view.cod_amount} />
            <Field label="Made Out To" value={view.cod_made_out_to} />
            <Field label="Type" value={view.cod_type} />
            <Field label="Received" value={view.cod_received ? 'Yes' : 'No'} /></>)}

          <div className="section-title">Condition & Tasks</div>
          <Field label="Odometer" value={view.odometer} />
          <Field label="Fuel" value={view.fuel_level} />
          <Field label="Damage" value={view.damage_noted ? (view.damage_notes || 'Yes') : 'None noted'} />
          <Field label="Set up Bluetooth" value={view.task_bluetooth ? 'Yes' : 'No'} />
          <Field label="Gave LFG Box" value={view.task_lfg_box ? 'Yes' : 'No'} />
          <Field label="Installed Vehicle App" value={view.task_app ? 'Yes' : 'No'} />
          <Field label="Asked for Review" value={view.task_review ? 'Yes' : 'No'} />
          <Field label="Client Photo Taken" value={view.task_photo_client ? 'Yes' : 'No'} />
          <Field label="Contract Photo Taken" value={view.task_photo_contract ? 'Yes' : 'No'} />

          <div className="section-title">Sign-Off</div>
          {view.driver_signature && <img src={view.driver_signature} alt="signature" style={{ background: '#fff', borderRadius: 10, maxWidth: 260, marginTop: 6 }} />}
          <div className="row" style={{ marginTop: 10 }}>
            {view.client_photo_url && <a href={view.client_photo_url} target="_blank" rel="noreferrer"><button className="btn ghost sm">Client Photo</button></a>}
            {view.contract_photo_url && <a href={view.contract_photo_url} target="_blank" rel="noreferrer"><button className="btn ghost sm">Contract Photo</button></a>}
            {view.trade_photo_url && <a href={view.trade_photo_url} target="_blank" rel="noreferrer"><button className="btn ghost sm">Trade Photo</button></a>}
          </div>
          <Field label="Driver Notes" value={view.driver_notes} />
          <Field label="Admin Notes" value={view.admin_notes} />
          <div className="btnrow" style={{ marginTop: 18, justifyContent: 'space-between' }}>
            <button className="btn ghost sm" onClick={() => printDeliveryPacket(view)}>🖨 Print / PDF</button>
            <button className="btn danger sm" onClick={() => removeRecord(view)}>🗑 Delete this record</button>
          </div>
        </Modal>
      )}
    </>
  )
}

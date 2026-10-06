import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { vehicleLabel, downloadCSV, printDeliveryPacket } from '../lib/helpers'
import StatusPill from '../components/StatusPill'
import DeliveryForm from '../components/DeliveryForm'
import useRefresh from '../hooks/useRefresh'
import { dayLabel } from '../lib/workflow'
import { pushRequest } from '../lib/push'
import { DispatchAlerts } from '../components/PushAlerts'

export default function Deliveries() {
  const { profile, userName } = useAuth()
  const toast = useToast()
  const [deliveries, setDeliveries] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [publishing, setPublishing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('deliveries')
      .select('*')
      .eq('archived', false).order('delivery_date', { ascending: true })
    setLoading(false)
    if (error) { setLoadError('Could not load deliveries'); return }
    setLoadError(''); setDeliveries(data || [])
    const { data: drv } = await supabase.from('drivers_roster').select('*').order('name')
    setDrivers(drv || [])
  }
  useRefresh(load)

  function openNew() { setEditing(null); setShowForm(true) }
  function openEdit(d) { setEditing(d); setShowForm(true) }

  async function remove(d) {
    if (!confirm(`Delete delivery for ${d.customer_name}? This cannot be undone.`)) return
    const { error } = await supabase.from('deliveries').delete().eq('id', d.id)
    if (error) { toast('Error: ' + error.message); return }
    toast('Delivery deleted'); load()
  }

  async function notifyDriver(d) {
    if (d.is_ready) return
    if (!d.driver1_name && !d.driver2_name) { toast('Assign a driver before making this delivery live'); return }
    if (!confirm(`Make ${d.customer_name}'s delivery visible to drivers? Assigned drivers with alerts enabled will receive a push notification.`)) return
    setPublishing(d.id)
    const { error } = await supabase.from('deliveries').update({ is_ready: true, published_at: new Date().toISOString() }).eq('id', d.id)
    setPublishing(null)
    if (error) { toast('Could not publish delivery'); return }
    await supabase.from('activity_log').insert({ delivery_id: d.id, user_id: profile.id, user_name: userName, action: `made ${d.customer_name}'s delivery live` })
    toast('Delivery is live. Assigned-driver alerts are queued.'); load()
    try { await pushRequest('drain') } catch { toast('Delivery saved. Alerts will retry automatically.') }
  }

  const driverName = (d) => [d.driver1_name, d.driver2_name].filter(Boolean).join(' & ') || 'Unassigned'

  const ORDER = ['assigned', 'at_dealer', 'en_route', 'delivered']
  const STATUS_LABEL = { assigned: 'Assigned', at_dealer: 'At Dealer', en_route: 'En Route', delivered: 'Delivered', issue: 'Issue' }
  const STAMP = { at_dealer: 'at_dealer_at', en_route: 'en_route_at', delivered: 'delivered_at' }

  async function applyStatus(d, newStatus, verb) {
    if (newStatus === d.status) return
    if (!confirm(`${verb} ${d.customer_name} to ${STATUS_LABEL[newStatus]}?`)) return
    const reason = prompt('Reason for this status correction:')
    if (!reason?.trim()) return
    const patch = { status: newStatus, ...(newStatus === 'delivered' ? { archived: true, closeout_required: true } : {}) }
    if (STAMP[newStatus]) patch[STAMP[newStatus]] = new Date().toISOString()
    const { error } = await supabase.from('deliveries').update(patch).eq('id', d.id)
    if (error) { toast("Couldn't update the status — try again."); return }
    await supabase.from('activity_log').insert({
      delivery_id: d.id, user_id: profile.id, user_name: userName,
      action: `corrected ${d.customer_name} → ${STATUS_LABEL[newStatus]}: ${reason.trim()}`,
    })
    toast('Status updated'); load()
  }

  function moveBack(d) {
    const idx = ORDER.indexOf(d.status)
    if (idx <= 0) { toast('Already at the first step'); return }
    applyStatus(d, ORDER[idx - 1], 'Move')
  }

  function exportCSV() {
    const rows = deliveries.map(d => ({
      Customer: d.customer_name, Phone: d.customer_phone, Address: d.delivery_address,
      Date: d.delivery_date, Time: d.delivery_time, Status: d.status,
      Driver: driverName(d),
      Vehicle: vehicleLabel(d), VIN: d.vin, Dealership: d.dealership_name,
      Monthly: d.monthly_payment, COD: d.cod_required ? d.cod_amount : '',
      ClientPhoto: d.client_photo_url || '', ContractPhoto: d.contract_photo_url || '', TradePhoto: d.trade_photo_url || '',
    }))
    downloadCSV(rows, 'lfg-deliveries.csv')
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div className="h1">Deliveries</div><div className="sub">Active deliveries</div></div>
        <button className="btn ghost sm" onClick={exportCSV}>⬇ CSV</button>
      </div>

      <button className="btn gold" onClick={openNew}>+ Create a Delivery</button>
      <div style={{ height: 14 }} />

      <DispatchAlerts />
      <div className="grid">
        {loading && <p role="status">Loading deliveries…</p>}
        {loadError && <p className="error-banner" role="alert">{loadError}</p>}
        {!loading && !loadError && deliveries.length === 0 && <div className="muted">No active deliveries. Create one above.</div>}
        {deliveries.map(d => (
          <div key={d.id} className="card" style={{ borderColor: d.is_ready ? undefined : '#5a4a17' }}>
            <div className="dcard">
              <div>
                <div className="cn">{d.customer_name}</div>
                <div className="meta">{vehicleLabel(d)}</div>
                <div className="meta">🧑‍✈️ {driverName(d)} · 📅 {dayLabel(d.delivery_date)} {d.delivery_time || ''}</div>
                {d.dealership_name && <div className="meta">🏢 {d.dealership_name}</div>}
                {d.is_ready
                  ? <div className="meta" style={{ color: '#7bd88f' }}>✓ Live in driver app</div>
                  : <div className="meta" style={{ color: '#e8c35a' }}>⏳ Draft — not visible to drivers yet</div>}
              </div>
              <StatusPill status={d.status} />
            </div>
            <button className={'btn ' + (d.is_ready ? 'ghost' : 'gold') + ' sm'} style={{ width: '100%', marginTop: 12 }} disabled={d.is_ready || publishing === d.id} onClick={() => notifyDriver(d)}>
              {d.is_ready ? 'Live in driver app' : publishing === d.id ? 'Publishing…' : 'Make delivery live'}
            </button>
            <div className="btnrow" style={{ marginTop: 8 }}>
              <button className="btn ghost sm" style={{ width: '100%' }} onClick={() => openEdit(d)}>Edit</button>
              <button className="btn ghost sm" style={{ width: '100%' }} onClick={() => printDeliveryPacket(d)}>🖨 Print / PDF</button>
              <button className="btn danger sm" style={{ width: '100%' }} onClick={() => remove(d)}>Delete</button>
            </div>
            <div className="btnrow" style={{ marginTop: 8, alignItems: 'center' }}>
              <button className="btn ghost sm" style={{ flex: '0 0 auto' }} onClick={() => moveBack(d)}>◀ Move Back</button>
              <label className="fld" style={{ flex: 1, margin: 0 }}>
                <select value={ORDER.includes(d.status) ? d.status : ''} onChange={e => applyStatus(d, e.target.value, 'Set')}>
                  {!ORDER.includes(d.status) && <option value="" disabled>Issue — resolve on Dashboard</option>}
                  <option value="assigned">Assigned</option>
                  <option value="at_dealer">At Dealer</option>
                  <option value="en_route">En Route</option>
                  <option value="delivered">Delivered</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <DeliveryForm existing={editing} drivers={drivers}
          onClose={() => setShowForm(false)} onSaved={load} />
      )}
    </>
  )
}

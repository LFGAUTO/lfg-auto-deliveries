import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { ISSUE_TYPES, vehicleLabel, fmtTime } from '../lib/helpers'
import StatusPill from '../components/StatusPill'
import Modal from '../components/Modal'
import SignaturePad from '../components/SignaturePad'

async function uploadPhoto(file, prefix) {
  if (!file) return null
  const path = `${prefix}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
  const { error } = await supabase.storage.from('delivery-photos').upload(path, file, { upsert: true })
  if (error) { console.error(error); return null }
  const { data } = supabase.storage.from('delivery-photos').getPublicUrl(path)
  return data.publicUrl
}

export default function DriverPortal() {
  const { profile, userName, signOut } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [deliverFor, setDeliverFor] = useState(null)
  const [issueFor, setIssueFor] = useState(null)

  async function load() {
    const { data } = await supabase.from('deliveries')
      .select('*').eq('archived', false)
      .order('delivery_date', { ascending: true })
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function logActivity(deliveryId, action) {
    await supabase.from('activity_log').insert({ delivery_id: deliveryId, user_id: profile.id, user_name: userName, action })
  }

  async function setStatus(d, status, stampField) {
    const patch = { status }
    if (stampField) patch[stampField] = new Date().toISOString()
    const { error } = await supabase.from('deliveries').update(patch).eq('id', d.id)
    if (error) { toast('Error: ' + error.message); return }
    await logActivity(d.id, `marked ${status.replace('_', ' ')}`)
    toast('Updated'); load()
  }

  async function tradePickedUp(d) {
    const { error } = await supabase.from('deliveries').update({ trade_picked_up_at: new Date().toISOString() }).eq('id', d.id)
    if (error) { toast('Error: ' + error.message); return }
    await logActivity(d.id, 'picked up the trade'); toast('Trade pickup saved'); load()
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="mark">L</span> LFG <span className="gold">AUTO</span></div>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <span className="who">{userName}</span>
          <button className="btn ghost sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div className="content">
        <div className="h1">Active Deliveries</div>
        <div className="sub">Shared driver login · tap a button at each step · sign at delivery</div>

        {rows.length === 0 && <div className="muted">No active deliveries right now.</div>}

        <div className="grid">
          {rows.map(d => (
            <div key={d.id} className="card">
              <div className="dcard">
                <div>
                  <div className="cn">{d.customer_name}</div>
                  <div className="meta">{vehicleLabel(d)}</div>
                  {(d.driver1_name || d.driver2_name) && <div className="meta">🧑‍✈️ {[d.driver1_name, d.driver2_name].filter(Boolean).join(' & ')}</div>}
                  <div className="meta">📍 {d.delivery_address || '—'}</div>
                  <div className="meta">📞 {d.customer_phone || '—'} · 🕒 {d.delivery_time || '—'}</div>
                  {d.dealership_name && <div className="meta">🏢 {d.dealership_name} {d.dealership_phone ? `· ${d.dealership_phone}` : ''}</div>}
                  {d.cod_required && <div className="meta gold">💵 COD {d.cod_amount} ({d.cod_type}) to {d.cod_made_out_to}</div>}
                  {d.admin_notes && <div className="meta">📝 {d.admin_notes}</div>}
                  {d.is_trade && (
                    <div style={{ marginTop: 8, padding: 10, border: '1px solid #1d6bb6', borderRadius: 10, background: 'rgba(29,107,182,.12)' }}>
                      <div style={{ fontWeight: 800, color: '#7db8ec', fontSize: 12, letterSpacing: 1 }}>🔁 PICKING UP</div>
                      <div className="meta" style={{ color: '#cfe2f2' }}>{[d.trade_year, d.trade_make, d.trade_model].filter(Boolean).join(' ') || 'Trade / lease return'} · VIN {d.trade_vin || '—'}</div>
                      <div className="meta" style={{ color: '#cfe2f2' }}>➡ Goes to: <strong>{d.trade_destination === 'dealer' ? (d.trade_return_dealer || 'Dealer') : 'Back to Office'}</strong></div>
                      {d.trade_notes && <div className="meta" style={{ color: '#cfe2f2' }}>📝 {d.trade_notes}</div>}
                    </div>
                  )}
                </div>
                <StatusPill status={d.status} />
              </div>

              <hr />
              <div className="grid" style={{ gap: 10 }}>
                <button className="btn blue xl" onClick={() => setStatus(d, 'at_dealer', 'at_dealer_at')}>AT DEALER</button>
                <button className="btn orange xl" onClick={() => setStatus(d, 'en_route', 'en_route_at')}>EN ROUTE</button>
                <button className="btn green xl" onClick={() => setDeliverFor(d)}>DELIVERED</button>
                {d.is_trade && <button className="btn ghost" onClick={() => tradePickedUp(d)}>
                  TRADE PICKED UP {d.trade_picked_up_at ? `✓ ${fmtTime(d.trade_picked_up_at)}` : ''}</button>}
                <button className="btn danger" onClick={() => setIssueFor(d)}>REPORT ISSUE</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {deliverFor && <DeliverModal d={deliverFor} onClose={() => setDeliverFor(null)}
        onDone={async (patch) => {
          const { error } = await supabase.from('deliveries').update({
            ...patch, status: 'delivered', delivered_at: new Date().toISOString(), archived: true,
          }).eq('id', deliverFor.id)
          if (error) { toast('Error: ' + error.message); return }
          await logActivity(deliverFor.id, 'completed the delivery')
          toast('Delivered & archived'); setDeliverFor(null); load()
        }} />}

      {issueFor && <IssueModal d={issueFor} onClose={() => setIssueFor(null)}
        onDone={async ({ type, note, photo_url }) => {
          await supabase.from('issues').insert({ delivery_id: issueFor.id, type, note, photo_url, created_by: profile.id, created_by_name: userName })
          const patch = { status: 'issue' }
          if (issueFor.status !== 'issue') patch.prev_status = issueFor.status
          await supabase.from('deliveries').update(patch).eq('id', issueFor.id)
          await logActivity(issueFor.id, `reported an issue: ${type}`)
          toast('Issue reported'); setIssueFor(null); load()
        }} />}
    </div>
  )
}

function DeliverModal({ d, onClose, onDone }) {
  const toast = useToast()
  const [sig, setSig] = useState(null)
  const [ok, setOk] = useState(false)
  const [notes, setNotes] = useState('')
  const [tasks, setTasks] = useState({ bt: false, box: false, app: false, review: false })
  const [busy, setBusy] = useState(false)
  const [clientFile, setClientFile] = useState(null)
  const [contractFile, setContractFile] = useState(null)
  const [tradeFile, setTradeFile] = useState(null)

  const tog = (k) => () => setTasks(p => ({ ...p, [k]: !p[k] }))

  async function submit() {
    if (!sig) { toast('Driver signature required'); return }
    if (!ok) { toast('Confirm acceptable condition'); return }
    if (!clientFile) { toast('Client photo required'); return }
    if (!contractFile) { toast('Contract photo required'); return }
    if (d.is_trade && !tradeFile) { toast('Trade / lease return photo required'); return }
    setBusy(true)
    const client_photo_url = await uploadPhoto(clientFile, 'client')
    const contract_photo_url = await uploadPhoto(contractFile, 'contract')
    const trade_photo_url = d.is_trade ? await uploadPhoto(tradeFile, 'trade') : null
    await onDone({
      driver_signature: sig, delivered_condition_ok: true,
      driver_notes: notes || null, client_photo_url, contract_photo_url, trade_photo_url,
      task_bluetooth: tasks.bt, task_lfg_box: tasks.box, task_app: tasks.app, task_review: tasks.review,
      task_photo_client: !!client_photo_url, task_photo_contract: !!contract_photo_url,
    })
    setBusy(false)
  }

  return (
    <Modal title="Complete Delivery" onClose={onClose}>
      <div className="sub">{d.customer_name} · {vehicleLabel(d)}</div>
      <label className="fld"><span>Driver Signature</span></label>
      <SignaturePad onChange={setSig} />
      <label className="check" style={{ margin: '14px 0' }}>
        <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> Delivered in acceptable condition
      </label>
      <div className="section-title">Delivery Tasks</div>
      <label className="check"><input type="checkbox" checked={tasks.bt} onChange={tog('bt')} /> Set up Bluetooth</label>
      <label className="check"><input type="checkbox" checked={tasks.box} onChange={tog('box')} /> Gave LFG Box</label>
      <label className="check"><input type="checkbox" checked={tasks.app} onChange={tog('app')} /> Installed Vehicle App</label>
      <label className="check"><input type="checkbox" checked={tasks.review} onChange={tog('review')} /> Asked for Review</label>
      <div style={{ height: 10 }} />
      <label className="fld"><span>Client Photo (required)</span><input type="file" accept="image/*" capture="environment" onChange={e => setClientFile(e.target.files[0])} /></label>
      <label className="fld"><span>Contract Photo (required)</span><input type="file" accept="image/*" capture="environment" onChange={e => setContractFile(e.target.files[0])} /></label>
      {d.is_trade && <label className="fld"><span>Trade / Lease Return Photo (required)</span><input type="file" accept="image/*" capture="environment" onChange={e => setTradeFile(e.target.files[0])} /></label>}
      <label className="fld"><span>Notes (optional)</span><textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <button className="btn green xl" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Confirm Delivered'}</button>
    </Modal>
  )
}

function IssueModal({ d, onClose, onDone }) {
  const toast = useToast()
  const [type, setType] = useState(ISSUE_TYPES[0])
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!note.trim()) { toast('A note is required'); return }
    setBusy(true)
    const photo_url = await uploadPhoto(file, 'issue')
    await onDone({ type, note, photo_url })
    setBusy(false)
  }

  return (
    <Modal title="Report an Issue" onClose={onClose}>
      <div className="sub">{d.customer_name} · {vehicleLabel(d)}</div>
      <label className="fld"><span>Issue Type</span>
        <select value={type} onChange={e => setType(e.target.value)}>{ISSUE_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="fld"><span>What happened? (required)</span><textarea value={note} onChange={e => setNote(e.target.value)} /></label>
      <label className="fld"><span>Photo (optional)</span><input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files[0])} /></label>
      <button className="btn danger xl" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit Issue'}</button>
    </Modal>
  )
}

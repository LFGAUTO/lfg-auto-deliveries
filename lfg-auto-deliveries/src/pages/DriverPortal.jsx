import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { ISSUE_TYPES, vehicleLabel, fmtTime, printDeliveryPacket } from '../lib/helpers'
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
  const [drivers, setDrivers] = useState([])
  const [pick, setPick] = useState('all')
  const [deliverFor, setDeliverFor] = useState(null)
  const [issueFor, setIssueFor] = useState(null)

  async function load() {
    const { data } = await supabase.from('deliveries')
      .select('*').eq('archived', false)
      .order('delivery_date', { ascending: true })
    setRows(data || [])
    const { data: drv } = await supabase.from('drivers_roster').select('*').order('name')
    setDrivers(drv || [])
  }
  useEffect(() => { load() }, [])

  // Live location sharing: ON while the selected driver has an EN ROUTE job, OFF otherwise.
  useEffect(() => {
    const realName = (pick !== 'all' && pick !== '__un__') ? pick : null
    const myEnRoute = realName
      ? rows.find(d => d.status === 'en_route' && (d.driver1_name === realName || d.driver2_name === realName))
      : null

    if (!realName || !myEnRoute || !navigator.geolocation) {
      if (realName) supabase.from('live_locations').delete().eq('driver_name', realName) // stop sharing
      return
    }

    let stopped = false
    const send = () => navigator.geolocation.getCurrentPosition(
      pos => {
        if (stopped) return
        supabase.from('live_locations').upsert({
          driver_name: realName, lat: pos.coords.latitude, lng: pos.coords.longitude,
          customer: myEnRoute.customer_name, delivery_id: myEnRoute.id, updated_at: new Date().toISOString(),
        })
      },
      () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    )
    send()
    const t = setInterval(send, 25000)
    return () => { stopped = true; clearInterval(t) }
  }, [pick, rows])

  async function logActivity(deliveryId, action) {
    await supabase.from('activity_log').insert({ delivery_id: deliveryId, user_id: profile.id, user_name: userName, action })
  }

  const STATUS_LABEL = { assigned: 'Assigned', at_dealer: 'At Dealer', en_route: 'En Route', delivered: 'Delivered', issue: 'Issue' }

  async function setStatus(d, status, stampField) {
    const label = STATUS_LABEL[status] || status
    if (!window.confirm(`Mark ${d.customer_name} as ${label}?`)) return
    const patch = { status }
    if (stampField) patch[stampField] = new Date().toISOString()
    const { error } = await supabase.from('deliveries').update(patch).eq('id', d.id)
    if (error) { toast('Error: ' + error.message); return }
    await logActivity(d.id, `marked ${d.customer_name} — ${label}`)
    toast('Updated'); load()
  }

  async function tradePickedUp(d) {
    if (!window.confirm(`Confirm trade / lease return picked up for ${d.customer_name}?`)) return
    const { error } = await supabase.from('deliveries').update({ trade_picked_up_at: new Date().toISOString() }).eq('id', d.id)
    if (error) { toast('Error: ' + error.message); return }
    await logActivity(d.id, `picked up the trade for ${d.customer_name}`); toast('Trade pickup saved'); load()
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
        <div className="sub">Pick your name to see your jobs and share your live location once you tap EN ROUTE · keep this screen open while driving</div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '12px 0 16px' }}>
          <button className={'btn sm ' + (pick === 'all' ? 'gold' : 'ghost')} onClick={() => setPick('all')}>All</button>
          {drivers.map(dr => (
            <button key={dr.id} className={'btn sm ' + (pick === dr.name ? 'gold' : 'ghost')} onClick={() => setPick(dr.name)}>{dr.name}</button>
          ))}
          <button className={'btn sm ' + (pick === '__un__' ? 'gold' : 'ghost')} onClick={() => setPick('__un__')}>Unassigned</button>
        </div>

        {(() => {
          const shown = rows.filter(d => {
            if (pick === 'all') return true
            if (pick === '__un__') return !d.driver1_name && !d.driver2_name
            return d.driver1_name === pick || d.driver2_name === pick
          })
          return (<>
        {shown.length === 0 && <div className="muted">No deliveries here right now.</div>}

        <div className="grid">
          {shown.map(d => (
            <div key={d.id} className="card">
              <div className="dcard">
                <div>
                  <div className="cn">{d.customer_name}</div>
                  <div className="meta">{vehicleLabel(d)}</div>
                  <div className="meta gold">🔑 VIN: {d.vin || '—'}</div>
                  {(d.driver1_name || d.driver2_name) && <div className="meta">🧑‍✈️ {[d.driver1_name, d.driver2_name].filter(Boolean).join(' & ')}</div>}
                  <div className="meta">📍 {d.delivery_address || '—'}</div>
                  <div className="meta">🗓 {d.delivery_date || '—'} · 🕒 {d.delivery_time || '—'}</div>
                  <div className="meta">📞 {d.customer_phone || '—'}</div>
                  {d.dealership_name && <div className="meta">🏢 {d.dealership_name} {d.dealership_phone ? `· ${d.dealership_phone}` : ''}</div>}
                  {d.cod_required && <div className="meta gold">💵 COD {d.cod_amount} ({d.cod_type}) to {d.cod_made_out_to}</div>}
                  {d.admin_notes && <div className="meta">📝 {d.admin_notes}</div>}
                  {d.is_trade && (
                    <div style={{ marginTop: 8, padding: 10, border: '1px solid #1d6bb6', borderRadius: 10, background: 'rgba(29,107,182,.12)' }}>
                      <div style={{ fontWeight: 800, color: '#7db8ec', fontSize: 12, letterSpacing: 1 }}>🔁 PICKING UP — {d.trade_kind === 'lease_return' ? 'LEASE RETURN' : 'TRADE'}</div>
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
                <button className="btn ghost" onClick={() => printDeliveryPacket(d)}>🖨 Checklist PDF</button>
              </div>
            </div>
          ))}
        </div>
          </>)
        })()}
      </div>

      {deliverFor && <DeliverModal d={deliverFor} onClose={() => setDeliverFor(null)}
        onDone={async (patch) => {
          const { error } = await supabase.from('deliveries').update({
            ...patch, status: 'delivered', delivered_at: new Date().toISOString(), archived: true,
          }).eq('id', deliverFor.id)
          if (error) { toast('Error: ' + error.message); return }
          await logActivity(deliverFor.id, `completed ${deliverFor.customer_name}'s delivery`)
          toast('Delivered & archived'); setDeliverFor(null); load()
        }} />}

      {issueFor && <IssueModal d={issueFor} onClose={() => setIssueFor(null)}
        onDone={async ({ type, note, photo_url }) => {
          await supabase.from('issues').insert({ delivery_id: issueFor.id, type, note, photo_url, created_by: profile.id, created_by_name: userName })
          const patch = { status: 'issue' }
          if (issueFor.status !== 'issue') patch.prev_status = issueFor.status
          await supabase.from('deliveries').update(patch).eq('id', issueFor.id)
          await logActivity(issueFor.id, `reported an issue on ${issueFor.customer_name}: ${type}`)
          toast('Issue reported'); setIssueFor(null); load()
        }} />}
    </div>
  )
}

function DeliverModal({ d, onClose, onDone }) {
  const toast = useToast()
  const KEY = `lfg_deliver_draft_${d.id}`
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })()

  const [sig, setSig] = useState(saved.sig || null)
  const [ok, setOk] = useState(saved.ok || false)
  const [notes, setNotes] = useState(saved.notes || '')
  const [tasks, setTasks] = useState(saved.tasks || { bt: false, box: false, app: false, review: false })
  const [eContract, setEContract] = useState(saved.eContract || false)
  const [refusedPic, setRefusedPic] = useState(saved.refusedPic || false)
  // each photo keeps a File (just-picked) AND a url (once uploaded). Either counts as "have it".
  const [clientFile, setClientFile] = useState(null)
  const [clientUrl, setClientUrl] = useState(saved.clientUrl || null)
  const [contractFile, setContractFile] = useState(null)
  const [contractUrl, setContractUrl] = useState(saved.contractUrl || null)
  const [tradeFile, setTradeFile] = useState(null)
  const [tradeUrl, setTradeUrl] = useState(saved.tradeUrl || null)
  const [extraFiles, setExtraFiles] = useState([])
  const [extraUrls, setExtraUrls] = useState(saved.extraUrls || [])
  const [uploading, setUploading] = useState(0)
  const [busy, setBusy] = useState(false)

  // Auto-save the parts we safely can (urls + fields) so a reload doesn't wipe progress.
  useEffect(() => {
    const draft = { sig, ok, notes, tasks, eContract, refusedPic, clientUrl, contractUrl, tradeUrl, extraUrls }
    try { localStorage.setItem(KEY, JSON.stringify(draft)) } catch {}
  }, [sig, ok, notes, tasks, eContract, refusedPic, clientUrl, contractUrl, tradeUrl, extraUrls])

  const tog = (k) => () => setTasks(p => ({ ...p, [k]: !p[k] }))

  // Pick = remember the file right away (so it counts), then upload in the background.
  function pick(file, folder, setFile, setUrl) {
    if (!file) return
    setFile(file)
    setUploading(n => n + 1)
    uploadPhoto(file, folder).then(url => { setUploading(n => n - 1); if (url) setUrl(url) })
      .catch(() => setUploading(n => n - 1))
  }
  function pickExtra(files) {
    if (!files.length) return
    setExtraFiles(prev => [...prev, ...files])
    setUploading(n => n + 1)
    ;(async () => {
      const urls = []
      for (const f of files) { try { const u = await uploadPhoto(f, 'extra'); if (u) urls.push(u) } catch {} }
      setUploading(n => n - 1)
      setExtraUrls(prev => [...prev, ...urls])
    })()
  }

  // Make sure we end up with a real url: use the uploaded one, else upload the file now.
  async function ensure(url, file, folder) {
    if (url) return url
    if (file) { try { return await uploadPhoto(file, folder) } catch { return null } }
    return null
  }

  async function submit() {
    if (!sig) { toast('Driver signature required'); return }
    if (!ok) { toast('Confirm acceptable condition'); return }
    if (!clientFile && !clientUrl && !refusedPic) { toast('Client photo required (or mark Customer refused photo)'); return }
    if (!contractFile && !contractUrl && !eContract) { toast('Contract photo required (or mark E-Contract)'); return }
    if (d.is_trade && !tradeFile && !tradeUrl) { toast('Trade / lease return photo required'); return }
    setBusy(true)
    const client_photo_url = refusedPic ? null : await ensure(clientUrl, clientFile, 'client')
    const contract_photo_url = eContract ? null : await ensure(contractUrl, contractFile, 'contract')
    const trade_photo_url = d.is_trade ? await ensure(tradeUrl, tradeFile, 'trade') : null
    // extras: keep any already uploaded, plus upload any files not yet uploaded
    const already = extraUrls.length
    const extra_photos = [...extraUrls]
    for (let i = already; i < extraFiles.length; i++) { const u = await ensure(null, extraFiles[i], 'extra'); if (u) extra_photos.push(u) }
    if (!client_photo_url && !refusedPic) { setBusy(false); toast('Client photo did not upload - retry'); return }
    if (!contract_photo_url && !eContract) { setBusy(false); toast('Contract photo did not upload - retry'); return }
    if (d.is_trade && !trade_photo_url) { setBusy(false); toast('Trade photo did not upload - retry'); return }
    await onDone({
      driver_signature: sig, delivered_condition_ok: true,
      driver_notes: notes || null,
      client_photo_url, contract_photo_url, trade_photo_url,
      extra_photos,
      task_bluetooth: tasks.bt, task_lfg_box: tasks.box, task_app: tasks.app, task_review: tasks.review,
      task_photo_client: !!client_photo_url, task_photo_contract: !!contract_photo_url,
      e_contract: eContract, client_photo_refused: refusedPic,
    })
    try { localStorage.removeItem(KEY) } catch {}
    setBusy(false)
  }

  const photoRow = (label, file, url, onFile) => (
    <label className="fld"><span>{label}{url ? ' - uploaded' : file ? ' - selected' : ''}</span>
      <input type="file" accept="image/*" onChange={e => onFile(e.target.files[0])} />
      {url && <a href={url} target="_blank" rel="noreferrer" className="meta" style={{ color: '#9bd' }}>view photo</a>}
    </label>
  )

  const extraCount = Math.max(extraFiles.length, extraUrls.length)

  return (
    <Modal title="Complete Delivery" onClose={onClose}>
      <div className="sub">{d.customer_name} - {vehicleLabel(d)}</div>
      <label className="fld"><span>Driver Signature</span></label>
      <SignaturePad onChange={setSig} />
      {sig && <div className="meta" style={{ color: '#7bd88f', marginTop: -4 }}>Signature saved (sign again only if you need to redo it)</div>}
      <label className="check" style={{ margin: '14px 0' }}>
        <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> Delivered in acceptable condition
      </label>
      <div className="section-title">Delivery Tasks</div>
      <label className="check"><input type="checkbox" checked={tasks.bt} onChange={tog('bt')} /> Set up Bluetooth</label>
      <label className="check"><input type="checkbox" checked={tasks.box} onChange={tog('box')} /> Gave LFG Box</label>
      <label className="check"><input type="checkbox" checked={tasks.app} onChange={tog('app')} /> Installed Vehicle App</label>
      <label className="check"><input type="checkbox" checked={tasks.review} onChange={tog('review')} /> Asked for Review</label>
      <div style={{ height: 10 }} />
      <label className="check"><input type="checkbox" checked={eContract} onChange={e => setEContract(e.target.checked)} /> E-Contract (no paper contract to photo)</label>
      <label className="check"><input type="checkbox" checked={refusedPic} onChange={e => setRefusedPic(e.target.checked)} /> Customer refused photo</label>
      <div style={{ height: 10 }} />
      {!refusedPic && photoRow('Client Photo (required)', clientFile, clientUrl, f => pick(f, 'client', setClientFile, setClientUrl))}
      {!eContract && photoRow('Contract Photo (required)', contractFile, contractUrl, f => pick(f, 'contract', setContractFile, setContractUrl))}
      {d.is_trade && photoRow('Trade / Lease Return Photo (required)', tradeFile, tradeUrl, f => pick(f, 'trade', setTradeFile, setTradeUrl))}
      <label className="fld"><span>Additional Photos (optional - pick any from your phone){extraCount ? ` - ${extraCount} added` : ''}</span>
        <input type="file" accept="image/*" multiple onChange={e => pickExtra([...e.target.files])} /></label>
      <label className="fld"><span>Notes (optional)</span><textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <button className="btn green xl" onClick={submit} disabled={busy}>
        {busy ? 'Saving...' : uploading > 0 ? 'Confirm Delivered (photos finishing...)' : 'Confirm Delivered'}
      </button>
      <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(201,162,39,.12)', border: '1px solid #5a4a17', color: '#e8d9a8', fontSize: 13, textAlign: 'center', fontWeight: 700 }}>
        MUST COMPLETE IN FULL TO HAVE THIS DELIVERY ADDED TO THE TIMESHEET
      </div>
      <div className="meta" style={{ textAlign: 'center', marginTop: 8 }}>Your progress saves automatically - if you get a call or leave the app, reopen this delivery and it'll still be here.</div>
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
      <label className="fld"><span>Photo (optional)</span><input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} /></label>
      <button className="btn danger xl" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit Issue'}</button>
    </Modal>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { ISSUE_TYPES, vehicleLabel, fmtTime, fmtClock, custWindow, printDeliveryPacket } from '../lib/helpers'
import StatusPill from '../components/StatusPill'
import Modal from '../components/Modal'
import SignaturePad from '../components/SignaturePad'
import Closeout from '../components/Closeout'
import { PhoneAlerts, DriverAcknowledgment } from '../components/PushAlerts'
import { phoneRequest } from '../lib/push'
import useRefresh from '../hooks/useRefresh'
import { DISPATCH_PHONE, dayLabel, directions, driverNames, nextAction, tradeDestination, dateGroup } from '../lib/workflow'

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
  const [alertPhone, setAlertPhone] = useState(null)
  const [pushJobs, setPushJobs] = useState([])
  async function loadPushJobs() { if (alertPhone) { try { const result = await phoneRequest('jobs'); setPushJobs(result.jobs) } catch { /* Normal deliveries remain usable when alerts cannot refresh. */ } } }
  useRefresh(loadPushJobs)
  useEffect(() => { loadPushJobs() }, [alertPhone])
  const linkedDelivery = new URLSearchParams(window.location.search).get('delivery')
  useEffect(() => { if (linkedDelivery && rows.length) document.getElementById('delivery-' + linkedDelivery)?.scrollIntoView({ block: 'center' }) }, [linkedDelivery, rows.length])
  const [drivers, setDrivers] = useState([])
  const [pick, setPick] = useState(() => localStorage.getItem('lfg-driver-name') || 'all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const actor = pick !== 'all' && pick !== '__un__' ? pick : null
  useEffect(() => { localStorage.setItem('lfg-driver-name', pick) }, [pick])
  const [deliverFor, setDeliverFor] = useState(null)
  const [issueFor, setIssueFor] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('deliveries')
      .select('*').or('archived.eq.false,closeout_required.eq.true')
      .order('delivery_date', { ascending: true })
    if (error) { setLoadError('Could not load deliveries. Check your connection or contact Jess.'); setLoading(false); return }
    setLoadError(''); setLoading(false); setRows(data || [])
    const { data: drv } = await supabase.from('drivers_roster').select('*').order('name')
    setDrivers(drv || [])
  }
  useRefresh(load)

  // This driver's own pay total for the current Sat–Fri week
  const [payInfo, setPayInfo] = useState(null)
  useEffect(() => {
    const realName = (pick !== 'all' && pick !== '__un__') ? pick : null
    if (!realName) { setPayInfo(null); return }
    ;(async () => {
      const n = new Date(); const back = (n.getDay() + 1) % 7
      const start = new Date(n); start.setDate(n.getDate() - back); start.setHours(0, 0, 0, 0)
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999)
      const { data } = await supabase.from('deliveries')
        .select('pay_amount,pay_adjust,pay_exclude,driver1_name,driver2_name,delivered_at')
        .gte('delivered_at', start.toISOString()).lte('delivered_at', end.toISOString())
      let total = 0, count = 0
      ;(data || []).forEach(d => {
        if (d.pay_exclude) return
        if (d.driver1_name === realName || d.driver2_name === realName) {
          total += Number(d.pay_amount ?? 100) + Number(d.pay_adjust || 0); count++
        }
      })
      const { data: pd } = await supabase.from('payroll_paid').select('driver_name')
        .eq('driver_name', realName).eq('week_start', start.toISOString().slice(0, 10))
      setPayInfo({ total, count, paid: !!(pd && pd.length), label: `${start.toLocaleDateString()} – ${end.toLocaleDateString()}` })
    })()
  }, [pick, rows])

  async function logActivity(deliveryId, action) {
    await supabase.from('activity_log').insert({ delivery_id: deliveryId, user_id: profile.id, user_name: actor || userName, action })
  }

  const STATUS_LABEL = { assigned: 'Assigned', at_dealer: 'At Dealer', en_route: 'En Route', delivered: 'Delivered', issue: 'Issue' }

  async function setStatus(d, status, stampField) {
    if (!actor) { toast('Select your name first'); return }
    const label = STATUS_LABEL[status] || status
    if (!window.confirm(`Mark ${d.customer_name} as ${label}?`)) return
    const patch = { status }
    if (stampField) patch[stampField] = new Date().toISOString()
    setBusyId(d.id)
    const { error } = await supabase.from('deliveries').update(patch).eq('id', d.id)
    setBusyId(null)
    if (error) { toast('Error: ' + error.message); return }
    await logActivity(d.id, `marked ${d.customer_name} — ${label}`)
    toast('Updated'); load()
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
        <div className="page-heading"><div><div className="eyebrow">LFG driver operations</div><h1 className="h1">{actor ? `Your day, ${actor}.` : 'Your delivery day.'}</h1><p className="sub">Choose your name to record updates. Use controls only while parked.</p></div><a className="btn ghost sm" href={`tel:${DISPATCH_PHONE}`}>Contact dispatch · Jess</a></div>
        <label className="fld driver-picker"><span>Driver</span><select value={pick} onChange={e => setPick(e.target.value)}><option value="all">All drivers · view only</option>{drivers.map(dr => <option key={dr.id} value={dr.name}>{dr.name}</option>)}<option value="__un__">Unassigned · view only</option></select></label>
        <PhoneAlerts drivers={drivers} onPhone={name => { setAlertPhone(name); if (linkedDelivery) setPick(name) }} />
        {payInfo && <div className="earnings-bar"><div><strong>${payInfo.total.toFixed(2)} this week</strong><p className="meta">{payInfo.count} deliveries · {payInfo.label}</p></div><span>{payInfo.paid ? 'Paid' : 'Pending'}</span></div>}
        {loading && <p role="status">Loading deliveries…</p>}
        {loadError && <div className="error-banner" role="alert">{loadError}<button className="btn ghost sm" onClick={load}>Retry</button></div>}
        {(() => {
          const shown = rows.filter(d => (d.is_ready || d.closeout_required) && (d.id === linkedDelivery || pick === 'all' || (pick === '__un__' ? !driverNames(d).length : driverNames(d).includes(pick))))
          return <>{!loading && !loadError && !shown.length && <div className="empty-state">You’re all caught up. New live deliveries appear here automatically.</div>}
          {['Overdue', 'Today', 'Upcoming', 'Date needed', 'Finish your returns'].map(group => {
            const jobs = shown.filter(d => dateGroup(d) === group)
            if (!jobs.length) return null
            return <section key={group}><h2 className="section-title">{group} · {jobs.length}</h2><div className="driver-jobs">{jobs.map(d => <article id={"delivery-" + d.id} className="card driver-job" key={d.id}>
              <DriverAcknowledgment job={pushJobs.find(j => j.delivery_id === d.id && j.revision === d.push_revision)} phone={alertPhone} onSaved={loadPushJobs} />
              <div className="dcard"><div><div className="eyebrow">{dayLabel(d.delivery_date)}</div><h2 className="cn">{d.customer_name}</h2><p className="meta">{vehicleLabel(d)}{d.color ? ` · ${d.color}` : ''}</p></div><StatusPill status={d.status} /></div>
              {!d.delivered_at && <><div className="timing-grid"><div><span>Be at dealer by</span><strong>{fmtClock(d.dealer_by_time) || 'Time needed'}</strong><p>{d.dealership_name || 'Dealer needed'}</p></div><div><span>Customer window</span><strong>{custWindow(d) || 'Confirm with Jess'}</strong></div></div>
              <div className="trip-list"><div><span>01</span><div><strong>{d.dealership_name || 'Pickup'}</strong><p>{d.dealership_address || 'Pickup address not provided'}</p></div></div><div><span>02</span><div><strong>Customer handoff</strong><p>{d.delivery_address || 'Address needed'}</p></div></div>{d.is_trade && <div><span>03</span><div><strong>Trade / lease return</strong><p>{tradeDestination(d)}</p><p>{d.trade_notes}</p></div></div>}{d.return_plan && <div><span>→</span><div><strong>After this run</strong><p>{d.return_plan}</p></div></div>}</div>
              <div className="quick-actions">{d.dealership_address && <a className="btn ghost" href={directions(d.dealership_address)} target="_blank" rel="noreferrer">Navigate to dealer</a>}{d.delivery_address && <a className="btn ghost" href={directions(d.delivery_address)} target="_blank" rel="noreferrer">Navigate to customer</a>}{d.customer_phone && <a className="btn ghost" href={`tel:${d.customer_phone.replace(/[^+0-9]/g, '')}`}>Call customer</a>}</div>
              <p className="meta">VIN: {d.vin || 'Not provided'} · {driverNames(d).join(' & ') || 'Unassigned'}</p>
              {d.cod_required && <div className="payment-callout"><span>{d.cod_received ? 'COD collected' : 'Collect at handoff'}</span><strong>${d.cod_amount} · {d.cod_type}</strong><p>Payable to {d.cod_made_out_to}</p></div>}
              {d.admin_notes && <div className="driver-note">{d.admin_notes}</div>}
              <div className="next-step"><span className="eyebrow">Your next step</span><p>{nextAction(d)}</p></div>
              {d.status === 'assigned' && <button disabled={!actor || busyId === d.id} className="btn gold xl" onClick={() => setStatus(d, 'at_dealer', 'at_dealer_at')}>I’m at the dealer →</button>}
              {d.status === 'at_dealer' && <button disabled={!actor || busyId === d.id} className="btn gold xl" onClick={() => { if (confirm('Confirm VIN matches, vehicle condition checked, and keys / paperwork collected?')) setStatus(d, 'en_route', 'en_route_at') }}>Vehicle checked · En route →</button>}
              {d.status === 'en_route' && <button disabled={!actor} className="btn gold xl" onClick={() => setDeliverFor(d)}>Complete customer handoff →</button>}
              </>}
              {d.delivered_at && <Closeout delivery={d} actor={actor} onSaved={load} />}
              <div className="quick-actions"><button disabled={!actor} className="btn danger" onClick={() => setIssueFor(d)}>Report issue</button><a className="btn ghost" href={`tel:${DISPATCH_PHONE}`}>Call Jess</a><button className="btn ghost" onClick={() => printDeliveryPacket(d)}>Checklist PDF</button></div>
            </article>)}</div></section>
          })}</>
        })()}

      </div>

      {deliverFor && <DeliverModal d={deliverFor} onClose={() => setDeliverFor(null)}
        onDone={async (patch) => {
          const { error } = await supabase.from('deliveries').update({
            ...patch, status: 'delivered', delivered_at: new Date().toISOString(), archived: true, closeout_required: true, completed_by_name: actor,
          }).eq('id', deliverFor.id)
          if (error) { toast('Error: ' + error.message); return false }
          await logActivity(deliverFor.id, `completed ${deliverFor.customer_name}'s delivery`)
          toast('Customer handoff saved. Return tasks stay open.'); setDeliverFor(null); load(); return true
        }} />}

      {issueFor && <IssueModal d={issueFor} onClose={() => setIssueFor(null)}
        onDone={async ({ type, note, photo_url }) => {
          const { error: issueError } = await supabase.from('issues').insert({ delivery_id: issueFor.id, type, note, photo_url, created_by: profile.id, created_by_name: actor || userName })
          if (issueError) { toast('Issue could not be saved'); return }
          const patch = issueFor.delivered_at ? {} : { status: 'issue' }
          if (issueFor.status !== 'issue') patch.prev_status = issueFor.status
          if (!issueFor.delivered_at) await supabase.from('deliveries').update(patch).eq('id', issueFor.id)
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

  const [phase, setPhase] = useState(0)
  const [codReceived, setCodReceived] = useState(saved.codReceived ?? !!d.cod_received)
  const [codException, setCodException] = useState(saved.codException || '')
  const [tradeReceived, setTradeReceived] = useState(saved.tradeReceived ?? !!d.trade_picked_up_at)
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
    const draft = { codReceived, codException, tradeReceived, sig, ok, notes, tasks, eContract, refusedPic, clientUrl, contractUrl, tradeUrl, extraUrls }
    try { localStorage.setItem(KEY, JSON.stringify(draft)) } catch {}
  }, [codReceived, codException, tradeReceived, sig, ok, notes, tasks, eContract, refusedPic, clientUrl, contractUrl, tradeUrl, extraUrls])

  const tog = (k) => () => setTasks(p => ({ ...p, [k]: !p[k] }))

  // Pick = remember the file right away (so it counts), then upload in the background.
  function pick(file, folder, setFile, setUrl) {
    if (!file) return
    setFile(file)
    setUrl(null)
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
      for (const f of files) {
        try { const u = await uploadPhoto(f, 'extra'); if (u) urls.push(u) } catch {}
      }
      setUploading(n => n - 1)
      if (urls.length !== files.length) toast('Some additional photos failed. Please select the missing photos again.')
      setExtraFiles([])
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
    if (uploading) { toast('Wait for photo uploads to finish'); return }
    if (d.cod_required && !codReceived && !codException.trim()) { toast('Confirm COD collected or explain the payment issue'); return }
    if (d.is_trade && !tradeReceived) { toast('Confirm trade received or report an issue to Jess'); return }
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
    const success = await onDone({
      cod_received: codReceived, cod_exception: codReceived ? null : codException.trim() || null,
      trade_picked_up_at: d.is_trade ? d.trade_picked_up_at || new Date().toISOString() : null,
      driver_signature: sig, delivered_condition_ok: true,
      driver_notes: notes || null,
      client_photo_url, contract_photo_url, trade_photo_url,
      extra_photos,
      task_bluetooth: tasks.bt, task_lfg_box: tasks.box, task_app: tasks.app, task_review: tasks.review,
      task_photo_client: !!client_photo_url, task_photo_contract: !!contract_photo_url,
      e_contract: eContract, client_photo_refused: refusedPic,
    })
    if (success) { try { localStorage.removeItem(KEY) } catch {} }
    setBusy(false)
  }

  const photoRow = (label, file, url, onFile) => (
    <label className="fld"><span>{label}{url ? ' - uploaded' : file ? ' - selected' : ''}</span>
      <input type="file" accept="image/*" disabled={uploading > 0 || busy} onChange={e => onFile(e.target.files[0])} />
      {url && <a href={url} target="_blank" rel="noreferrer" className="meta" style={{ color: '#9bd' }}>view photo</a>}
    </label>
  )

  const extraCount = Math.max(extraFiles.length, extraUrls.length)

  return (
    <Modal title="Complete Delivery" onClose={onClose}>
      <div className="sub">{d.customer_name} - {vehicleLabel(d)}</div>
      <div className="handoff-tabs">{['Handoff', 'Photos', 'Sign off'].map((label, i) => <button key={label} className={'btn sm ' + (phase === i ? 'gold' : 'ghost')} onClick={() => setPhase(i)}>{i + 1}. {label}</button>)}</div>
      <div hidden={phase !== 2}>
      <label className="fld"><span>Driver Signature</span></label>
      {phase === 2 && <SignaturePad initialValue={sig} onChange={setSig} />}
      {sig && <div className="meta" style={{ color: '#7bd88f', marginTop: -4 }}>Signature saved (sign again only if you need to redo it)</div>}
      </div><div hidden={phase !== 0}>
      <label className="check" style={{ margin: '14px 0' }}>
        <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> Delivered in acceptable condition
      </label>
      {d.cod_required && <div className="payment-callout"><strong>Collect ${d.cod_amount} · {d.cod_type}</strong><p>Payable to {d.cod_made_out_to}</p><label className="check"><input type="checkbox" checked={codReceived} onChange={e => setCodReceived(e.target.checked)} />COD collected</label>{!codReceived && <label className="fld"><span>Payment issue (if not collected)</span><textarea value={codException} onChange={e => setCodException(e.target.value)} /></label>}</div>}
      {d.is_trade && <label className="check"><input type="checkbox" checked={tradeReceived} onChange={e => setTradeReceived(e.target.checked)} />Trade vehicle and keys received</label>}
      <div className="section-title">Delivery Tasks</div>
      <label className="check"><input type="checkbox" checked={tasks.bt} onChange={tog('bt')} /> Set up Bluetooth</label>
      <label className="check"><input type="checkbox" checked={tasks.box} onChange={tog('box')} /> Gave LFG Box</label>
      <label className="check"><input type="checkbox" checked={tasks.app} onChange={tog('app')} /> Installed Vehicle App</label>
      <label className="check"><input type="checkbox" checked={tasks.review} onChange={tog('review')} /> Asked for Review</label>
      <div style={{ height: 10 }} />
      </div><div hidden={phase !== 1}>
      <label className="check"><input type="checkbox" checked={eContract} onChange={e => setEContract(e.target.checked)} /> E-Contract (no paper contract to photo)</label>
      <label className="check"><input type="checkbox" checked={refusedPic} onChange={e => setRefusedPic(e.target.checked)} /> Customer refused photo</label>
      <div style={{ height: 10 }} />
      {!refusedPic && photoRow('Client Photo (required)', clientFile, clientUrl, f => pick(f, 'client', setClientFile, setClientUrl))}
      {!eContract && photoRow('Contract Photo (required)', contractFile, contractUrl, f => pick(f, 'contract', setContractFile, setContractUrl))}
      {d.is_trade && photoRow('Trade / Lease Return Photo (required)', tradeFile, tradeUrl, f => pick(f, 'trade', setTradeFile, setTradeUrl))}
      <label className="fld"><span>Additional Photos (optional - pick any from your phone){extraCount ? ` - ${extraCount} added` : ''}</span>
        <input type="file" accept="image/*" multiple disabled={uploading > 0 || busy} onChange={e => pickExtra([...e.target.files])} /></label>
      </div><div hidden={phase !== 2}>
      <label className="fld"><span>Notes (optional)</span><textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <button className="btn green xl" onClick={submit} disabled={busy || uploading > 0}>
        {busy ? 'Saving...' : uploading > 0 ? 'Confirm Delivered (photos finishing...)' : 'Confirm Delivered'}
      </button>
      </div>
      {phase < 2 && <button className="btn gold" onClick={() => setPhase(phase + 1)}>Continue →</button>}
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

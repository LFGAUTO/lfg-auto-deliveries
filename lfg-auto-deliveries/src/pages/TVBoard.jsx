import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUS, fmtTime, fmtClock, custWindow, vehicleLabel } from '../lib/helpers'
import { easternDay, driverNames, nextAction, PAPERWORK } from '../lib/workflow'
import useRefresh from '../hooks/useRefresh'
import LiveMap from './LiveMap'

export default function TVBoard() {
  const [rows, setRows] = useState([])
  const [now, setNow] = useState(new Date())
  const [range, setRange] = useState('daily')
  const [showMap, setShowMap] = useState(false)
  const [page, setPage] = useState(0)
  const [updated, setUpdated] = useState(null)
  const [error, setError] = useState('')
  const wrapRef = useRef(null)
  async function load() {
    const month = easternDay().slice(0,7) + '-01'
    const { data, error } = await supabase.from('deliveries').select('*').or(`archived.eq.false,closeout_required.eq.true,delivered_at.gte.${month}`).order('dealer_by_time')
    if (error) { setError('Connection interrupted · showing last successful update'); return }
    setRows(data || []); setUpdated(new Date()); setError('')
  }
  useRefresh(load)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const today = easternDay(now)
  const start = new Date(today + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  const weekStart = easternDay(start); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6); const weekEnd = easternDay(end)
  const board = rows.filter(d => {
    if (d.closeout_required) return true
    const date = d.delivered_at ? easternDay(d.delivered_at) : d.delivery_date
    if (range === 'monthly') return date?.slice(0,7) === today.slice(0,7)
    if (range === 'weekly') return date >= weekStart && date <= weekEnd
    return date === today || (!d.archived && (!date || date < today))
  }).sort((a,b) => (a.status === 'issue' ? -1 : b.status === 'issue' ? 1 : 0) || driverNames(a).join().localeCompare(driverNames(b).join()) || (a.dealer_by_time || '').localeCompare(b.dealer_by_time || ''))
  const pages = Math.max(1, Math.ceil(board.length / 4))
  useEffect(() => { setPage(0) }, [range, pages])
  useEffect(() => { const t = setInterval(() => setPage(p => (p + 1) % pages), 15000); return () => clearInterval(t) }, [pages])
  const visible = board.slice((page % pages) * 4, (page % pages) * 4 + 4)
  const issues = board.filter(d => d.status === 'issue')
  const closeout = board.filter(d => d.closeout_required)
  const stale = !updated || now - updated > 90000
  async function goFull() {
    try { if (!document.fullscreenElement) await wrapRef.current?.requestFullscreen?.(); else await document.exitFullscreen?.() } catch { setError('Fullscreen unavailable. Use your browser fullscreen control.') }
  }
  return <div className="tv tv-v2" ref={wrapRef}>
    <header className="tv-head"><div><div className="eyebrow">LFG AUTO · OFFICE OPERATIONS</div><h1 className="tv-title">{range === 'daily' ? 'Today’s deliveries' : range === 'weekly' ? 'This week’s deliveries' : 'This month’s deliveries'}</h1><p className="tv-clock">{now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET</p></div><div className="tv-controls"><div className="row">{[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l]) => <button key={v} className={'btn sm ' + (range === v && !showMap ? 'gold' : 'ghost')} onClick={() => { setRange(v); setShowMap(false) }}>{l}</button>)}<button className="btn ghost sm" onClick={() => setShowMap(!showMap)}>{showMap ? 'Deliveries' : 'Live map'}</button><button className="btn ghost sm" onClick={goFull}>Fullscreen</button></div></div></header>
    <div className="tv-totals"><span><b>{board.length}</b> Jobs</span><span><b>{board.filter(d => !!d.delivered_at).length}</b> Delivered</span><span><b>{issues.length}</b> Issues</span><span><b>{closeout.length}</b> Closeout pending</span></div>
    {(error || stale) && <div className="error-banner" role="alert">{error || (updated ? 'Updates are stale · check connection' : 'Loading delivery board…')}</div>}
    {!!issues.length && <div className="attention-banner"><strong>Needs attention</strong><span>{issues.map(d => driverNames(d).join(' & ') || 'Unassigned').join(' · ')} · Dispatch: Jess</span></div>}
    {showMap ? <LiveMap height="65vh" /> : <div className="tv-job-grid">{visible.map(d => <article className="tv-run" key={d.id} style={{ borderLeftColor: STATUS[d.status]?.color || '#888' }}><div className="row spread"><h2>{driverNames(d).join(' & ') || 'UNASSIGNED'}</h2><span className="tv-status">{d.is_ready || d.delivered_at ? STATUS[d.status]?.label : 'Draft'}</span></div><h3>{d.customer_name?.split(' ')[0] || 'Customer'} · {vehicleLabel(d)}</h3><p>{d.dealership_name || 'Pickup dealer needed'}</p><div className="tv-times"><span>Dealer by <b>{fmtClock(d.dealer_by_time) || '—'}</b></span><span>Customer <b>{custWindow(d) || '—'}</b></span></div><div className="tv-next"><span>NEXT ACTION</span><strong>{d.is_ready || d.delivered_at ? nextAction(d) : 'Jess to publish delivery'}</strong></div>{d.delivered_at && <p>{PAPERWORK[d.paperwork_status] || 'Legacy delivery record'}</p>}{range !== 'daily' && <p>{d.delivery_date}</p>}</article>)}{updated && !board.length && <div className="empty-state">No deliveries in this view. The board will update automatically.</div>}</div>}
    <footer className="tv-footer"><span>{updated ? `Last successful update ${fmtTime(updated)}` : 'Connecting…'} · {stale || error ? 'Check connection' : 'Auto-refresh every 30 seconds'}</span><span>Page {(page % pages) + 1} of {pages}{pages > 1 ? ' · Rotates every 15 seconds' : ''}</span></footer>
  </div>
}

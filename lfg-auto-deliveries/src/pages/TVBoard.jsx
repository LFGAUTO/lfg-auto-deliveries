import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUS, fmtTime, fmtClock, custWindow, vehicleLabel } from '../lib/helpers'
import { easternDay, driverNames, nextAction, PAPERWORK } from '../lib/workflow'
import useRefresh from '../hooks/useRefresh'

const BOARD_FILTERS = [['live', 'Live'], ['delivered', 'Delivered'], ['drafts', 'Drafts'], ['closeout', 'Closeout pending'], ['all', 'All']]
function daysOfWeek(today) {
  const monday = new Date(today + 'T12:00:00Z')
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday); day.setUTCDate(day.getUTCDate() + i)
    return { date: easternDay(day), label: day.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }), short: day.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) }
  })
}
const weeklyDate = d => d.delivery_date || (d.delivered_at ? easternDay(d.delivered_at) : '')
const FILTER_KEY = 'lfg-tv-status-filter'

export default function TVBoard() {
  const [rows, setRows] = useState([])
  const [now, setNow] = useState(new Date())
  const [range, setRange] = useState(() => { try { const saved = localStorage.getItem('lfg-tv-range'); return ['daily','weekly','monthly'].includes(saved) ? saved : 'weekly' } catch { return 'weekly' } })
  useEffect(() => { try { localStorage.setItem('lfg-tv-range', range) } catch {} }, [range])
  const [filter, setFilter] = useState(() => {
    try { const saved = localStorage.getItem(FILTER_KEY); return BOARD_FILTERS.some(([v]) => v === saved) ? saved : 'live' } catch { return 'live' }
  })
  useEffect(() => { try { localStorage.setItem(FILTER_KEY, filter) } catch {} }, [filter])
  const [page, setPage] = useState(0)
  const [updated, setUpdated] = useState(null)
  const [error, setError] = useState('')
  const wrapRef = useRef(null)
  async function load() {
    const today = easternDay()
    const month = today.slice(0,7) + '-01'
    const monday = daysOfWeek(today)[0].date
    const since = monday < month ? monday : month
    const { data, error } = await supabase.from('deliveries').select('*').or(`archived.eq.false,closeout_required.eq.true,delivered_at.gte.${since},delivery_date.gte.${monday}`).order('dealer_by_time')
    if (error) { setError('Connection interrupted · showing last successful update'); return }
    setRows(data || []); setUpdated(new Date()); setError('')
  }
  useRefresh(load)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const today = easternDay(now)
  const weekDays = daysOfWeek(today)
  const weekStart = weekDays[0].date, weekEnd = weekDays[6].date
  const board = rows.filter(d => {
    const delivered = !!d.delivered_at || d.status === 'delivered' || !!d.archived
    if (filter === 'live' && (!d.is_ready || delivered)) return false
    if (filter === 'delivered' && !delivered) return false
    if (filter === 'drafts' && (d.is_ready || delivered)) return false
    if (filter === 'closeout' && !d.closeout_required) return false
    if (d.closeout_required) return true
    const date = d.delivered_at ? easternDay(d.delivered_at) : d.delivery_date
    if (range === 'monthly') return date?.slice(0,7) === today.slice(0,7)
    if (range === 'weekly') return weeklyDate(d) >= weekStart && weeklyDate(d) <= weekEnd
    return date === today || (!d.archived && (!date || date < today))
  }).sort((a,b) => (a.status === 'issue' ? -1 : b.status === 'issue' ? 1 : 0) || driverNames(a).join().localeCompare(driverNames(b).join()) || (a.dealer_by_time || '').localeCompare(b.dealer_by_time || ''))
  const dayColumns = weekDays.map(day => ({ ...day, jobs: board.filter(d => weeklyDate(d) === day.date) }))
  const carryover = board.filter(d => weeklyDate(d) < weekStart || weeklyDate(d) > weekEnd)
  const pages = range === 'weekly' ? Math.max(1, ...dayColumns.map(day => Math.ceil(day.jobs.length / 3)), Math.ceil(carryover.length / 4)) : Math.max(1, Math.ceil(board.length / 4))
  useEffect(() => { setPage(0) }, [range, filter, pages])
  useEffect(() => { const t = setInterval(() => setPage(p => (p + 1) % pages), 15000); return () => clearInterval(t) }, [pages])
  const visible = board.slice((page % pages) * 4, (page % pages) * 4 + 4)
  const issues = board.filter(d => d.status === 'issue')
  const closeout = board.filter(d => d.closeout_required)
  const stale = !updated || now - updated > 90000
  async function goFull() {
    try { if (!document.fullscreenElement) await wrapRef.current?.requestFullscreen?.(); else await document.exitFullscreen?.() } catch { setError('Fullscreen unavailable. Use your browser fullscreen control.') }
  }
  return <div className="tv tv-v2" ref={wrapRef}>
    <header className="tv-head"><div><div className="eyebrow">LFG AUTO · OFFICE OPERATIONS</div><h1 className="tv-title">{range === 'daily' ? 'Today’s deliveries' : range === 'weekly' ? 'This week’s deliveries' : 'This month’s deliveries'}</h1><p className="tv-clock">{now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET</p></div><div className="tv-controls"><div className="row">{[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l]) => <button key={v} className={'btn sm ' + (range === v ? 'gold' : 'ghost')} onClick={() => { setRange(v) }}>{l}</button>)}<button className="btn ghost sm" onClick={goFull}>Fullscreen</button></div></div></header>
    <div className="row" role="group" aria-label="Delivery status filter" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {BOARD_FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={'btn sm ' + (filter === value ? 'gold' : 'ghost')} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    <div className="tv-totals"><span><b>{board.length}</b> Jobs</span><span><b>{board.filter(d => !!d.delivered_at).length}</b> Delivered</span><span><b>{issues.length}</b> Issues</span><span><b>{closeout.length}</b> Closeout pending</span></div>
    {(error || stale) && <div className="error-banner" role="alert">{error || (updated ? 'Updates are stale · check connection' : 'Loading delivery board…')}</div>}
    {!!issues.length && <div className="attention-banner"><strong>Needs attention</strong><span>{issues.map(d => driverNames(d).join(' & ') || 'Unassigned').join(' · ')} · Dispatch: Jess</span></div>}
    {range === 'weekly' ? <>
      <div className="tv-week-scroll"><div className="tv-week-grid">
        {dayColumns.map(day => <section key={day.date} className={'tv-day' + (day.date === today ? ' is-today' : '')} aria-label={day.label + ' ' + day.short}>
          <header className="tv-day-heading"><h2>{day.label}</h2><p>{day.short}{day.date === today ? ' · TODAY' : ''}</p><span>{day.jobs.length} {day.jobs.length === 1 ? 'delivery' : 'deliveries'}</span></header>
          {day.jobs.slice((page % pages) * 3, (page % pages) * 3 + 3).map(d => <RunCard key={d.id} d={d} range={range} />)}
          {!day.jobs.length && <p className="tv-day-empty">No deliveries</p>}
          {!!day.jobs.length && (page % pages) * 3 >= day.jobs.length && <p className="tv-day-empty">All {day.jobs.length} shown on earlier pages</p>}
        </section>)}
      </div></div>
      {!!carryover.length && <section><h2 className="section-title">Closeout from other dates · {carryover.length}</h2><div className="tv-job-grid">{carryover.slice((page % pages) * 4, (page % pages) * 4 + 4).map(d => <RunCard key={d.id} d={d} range={range} />)}</div></section>}
    </> : <div className="tv-job-grid">{visible.map(d => <RunCard key={d.id} d={d} range={range} />)}{updated && !board.length && <div className="empty-state">No deliveries match this filter and date range. The board will update automatically.</div>}</div>}

    <footer className="tv-footer"><span>{BOARD_FILTERS.find(([v]) => v === filter)?.[1]} view · {updated ? `Last successful update ${fmtTime(updated)}` : 'Connecting…'} · {stale || error ? 'Check connection' : 'Auto-refresh every 30 seconds'}</span><span>Page {(page % pages) + 1} of {pages}{pages > 1 ? ' · Rotates every 15 seconds' : ''}</span></footer>
  </div>
}

function RunCard({ d, range }) {
  return <article className="tv-run"  style={{ borderLeftColor: STATUS[d.status]?.color || '#888' }}><div className="row spread"><h2>{driverNames(d).join(' & ') || 'UNASSIGNED'}</h2><span className="tv-status">{d.is_ready || d.delivered_at ? STATUS[d.status]?.label : 'Draft'}</span></div><h3>{d.customer_name?.split(' ')[0] || 'Customer'} · {vehicleLabel(d)}</h3><p>{d.dealership_name || 'Pickup dealer needed'}</p><div className="tv-times"><span>Dealer by <b>{fmtClock(d.dealer_by_time) || '—'}</b></span><span>Customer <b>{custWindow(d) || '—'}</b></span></div><div className="tv-next"><span>NEXT ACTION</span><strong>{d.is_ready || d.delivered_at ? nextAction(d) : 'Jess to publish delivery'}</strong></div>{d.delivered_at && <p>{PAPERWORK[d.paperwork_status] || 'Legacy delivery record'}</p>}{range !== 'daily' && <p>{d.delivery_date}</p>}</article>
}

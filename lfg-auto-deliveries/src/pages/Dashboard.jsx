import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { fmtDateTime, fmtClock, custWindow, vehicleLabel } from '../lib/helpers'
import { easternDay, driverNames, dayLabel, nextAction, outstanding, tradeDestination } from '../lib/workflow'
import useRefresh from '../hooks/useRefresh'
import StatusPill from '../components/StatusPill'
import Closeout from '../components/Closeout'

export default function Dashboard() {
  const { profile, userName } = useAuth()
  const toast = useToast()
  const [deliveries, setDeliveries] = useState([])
  const [issues, setIssues] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [updated, setUpdated] = useState(null)
  async function load() {
    const since = new Date(Date.now() - 48 * 3600000).toISOString()
    const [d, i, a] = await Promise.all([
      supabase.from('deliveries').select('*').or(`archived.eq.false,closeout_required.eq.true,delivered_at.gte.${since}`).order('delivery_date').order('dealer_by_time'),
      supabase.from('issues').select('*, deliveries(customer_name)').eq('resolved', false).order('created_at', { ascending: false }),
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(8),
    ])
    setLoading(false)
    if (d.error || i.error || a.error) { setError('Unable to refresh operations. Showing the last available information.'); return }
    setError(''); setDeliveries(d.data || []); setIssues(i.data || []); setActivity(a.data || []); setUpdated(new Date())
  }
  useRefresh(load)
  async function resolve(i) {
    const solution = prompt('How was this resolved?')
    if (!solution?.trim()) return
    const { error } = await supabase.from('issues').update({ resolved: true, solution: solution.trim(), resolved_at: new Date().toISOString(), resolved_by: userName }).eq('id', i.id)
    if (error) { toast('Could not resolve issue'); return }
    const d = deliveries.find(d => d.id === i.delivery_id)
    if (d && !d.delivered_at && issues.filter(x => x.delivery_id === d.id && x.id !== i.id).length === 0) {
      const { error: statusError } = await supabase.from('deliveries').update({ status: d.prev_status || 'assigned' }).eq('id', d.id)
      if (statusError) toast('Issue resolved, but delivery status needs correction')
    }
    await supabase.from('activity_log').insert({ delivery_id: i.delivery_id, user_id: profile.id, user_name: userName, action: `resolved ${i.type}: ${solution.trim()}` })
    load()
  }
  const today = easternDay()
  const todayJobs = deliveries.filter(d => d.delivery_date === today)
  const deliveredToday = deliveries.filter(d => easternDay(d.delivered_at) === today)
  const pending = deliveries.filter(d => d.closeout_required)
  const runs = deliveries.filter(d => !d.archived && (!d.delivery_date || d.delivery_date <= today))
  const names = [...new Set(runs.flatMap(d => driverNames(d).length ? driverNames(d) : ['Unassigned']))]
  const focus = deliveries.find(d => d.id === selected)
  return <>
    <div className="page-heading"><div><div className="eyebrow">{dayLabel(today)} · Dispatch</div><h1 className="h1">Every delivery. In view.</h1><p className="sub">{updated ? `Updated ${fmtDateTime(updated)}` : 'Connecting to operations…'}</p></div><div className="row"><Link className="btn ghost sm" to="/board" target="_blank">Open TV board ↗</Link><Link className="btn gold sm" to="/deliveries">Manage deliveries →</Link></div></div>
    {error && <div className="error-banner" role="alert">{error}<button className="btn ghost sm" onClick={load}>Retry</button></div>}
    {loading ? <p role="status">Loading operations…</p> : <>
      <div className="kpis ops-kpis">{[['Scheduled today', todayJobs.length], ['Delivered today', deliveredToday.length], ['Awaiting closeout', pending.length], ['Open issues', issues.length]].map(([k,n]) => <div className="kpi" key={k}><div className="n">{n}</div><div className="k">{k}</div></div>)}</div>
      {!!issues.length && <section><h2 className="section-title">Needs attention</h2><div className="grid">{issues.map(i => <div className="attention-banner" key={i.id}><div><strong>{i.type} · {i.deliveries?.customer_name || 'Delivery'}</strong><p>{i.note}</p><span className="meta">{i.created_by_name} · {fmtDateTime(i.created_at)}</span></div><button className="btn ghost sm" onClick={() => resolve(i)}>Resolve</button></div>)}</div></section>}
      <h2 className="section-title">Today’s driver runs</h2>
      {!runs.length && <div className="empty-state">No active runs for today.</div>}
      <div className="dispatch-lanes">{names.map(name => <section className="dispatch-lane" key={name}><h2>{name}</h2>{runs.filter(d => name === 'Unassigned' ? !driverNames(d).length : driverNames(d).includes(name)).map(d => <button key={d.id} className={'dispatch-job' + (selected === d.id ? ' selected' : '')} onClick={() => setSelected(d.id)}><div className="row spread"><span className="eyebrow">{fmtClock(d.dealer_by_time) || 'Time needed'} · {dayLabel(d.delivery_date)}</span><StatusPill status={d.status} /></div><strong>{d.customer_name}</strong><p>{vehicleLabel(d)}</p><div className="route-caption">{d.dealership_name || 'Dealer needed'} → Customer{d.is_trade ? ` → ${tradeDestination(d)}` : ''}</div><p className="meta">Customer: {custWindow(d) || 'Window needed'}</p><span className="meta">{d.is_ready ? 'Live' : 'Draft'}{driverNames(d).length > 1 ? ' · Two-driver job' : ''}{d.cod_required && !d.cod_received ? ' · COD required' : ''}</span></button>)}</section>)}</div>
      {focus && <section className="card detail-panel"><div className="page-heading"><div><h2>{focus.customer_name}</h2><p>{nextAction(focus)}</p></div><Link className="btn ghost sm" to="/deliveries">Edit delivery</Link></div><div className="trip-list"><p>Pickup: {focus.dealership_name} · {focus.dealership_address || 'Address needed'}</p><p>Customer: {focus.delivery_address || 'Address needed'}</p>{focus.is_trade && <p>Trade: {tradeDestination(focus)}</p>}{focus.return_plan && <p>After this run: {focus.return_plan}</p>}</div></section>}
      {!!pending.length && <section><h2 className="section-title">Delivered · finish closeout</h2><div className="grid">{pending.map(d => <article className="card" key={d.id}><div className="dcard"><div><h3>{d.customer_name}</h3><p className="meta">{driverNames(d).join(' & ')} · {vehicleLabel(d)}</p></div><span className="meta">{outstanding(d).length} outstanding</span></div><Closeout delivery={d} onSaved={load} /></article>)}</div></section>}
      <h2 className="section-title">Upcoming deliveries</h2><div className="grid">{deliveries.filter(d => !d.archived && d.delivery_date > today).slice(0,8).map(d => <Link to="/deliveries" className="card dcard" key={d.id}><div><strong>{d.customer_name}</strong><p className="meta">{dayLabel(d.delivery_date)} · {driverNames(d).join(' & ') || 'Unassigned'}</p></div><StatusPill status={d.status} /></Link>)}</div>
      <details className="activity-details"><summary>Recent activity</summary>{activity.map(a => <div key={a.id} className="return-row"><strong>{a.user_name}</strong> {a.action}<p className="meta">{fmtDateTime(a.created_at)}</p></div>)}</details>
    </>}
  </>
}

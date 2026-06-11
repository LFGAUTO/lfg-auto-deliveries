import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { fmtDateTime, todayISO, vehicleLabel } from '../lib/helpers'
import StatusPill from '../components/StatusPill'

export default function Dashboard() {
  const { profile, userName } = useAuth()
  const toast = useToast()
  const [deliveries, setDeliveries] = useState([])
  const [activity, setActivity] = useState([])
  const [issues, setIssues] = useState([])

  async function load() {
    const today = todayISO()
    const { data: dels } = await supabase.from('deliveries')
      .select('*').eq('archived', false).order('delivery_date', { ascending: true })
    setDeliveries(dels || [])
    const { data: acts } = await supabase.from('activity_log')
      .select('*').order('created_at', { ascending: false }).limit(12)
    setActivity(acts || [])
    const { data: iss } = await supabase.from('issues')
      .select('*, deliveries(customer_name)').eq('resolved', false).order('created_at', { ascending: false }).limit(8)
    setIssues(iss || [])
  }
  useEffect(() => { load() }, [])

  async function resolveIssue(i) {
    const solution = prompt('How was it resolved? (solution)')
    if (solution === null) return
    if (!solution.trim()) { toast('Enter a solution'); return }
    await supabase.from('issues').update({
      resolved: true, solution, resolved_at: new Date().toISOString(), resolved_by: userName,
    }).eq('id', i.id)
    // restore the delivery's status to what it was before the issue
    const d = deliveries.find(x => x.id === i.delivery_id)
    if (d && !d.archived) {
      await supabase.from('deliveries').update({ status: d.prev_status || 'assigned' }).eq('id', d.id)
    }
    await supabase.from('activity_log').insert({ delivery_id: i.delivery_id, user_id: profile.id, user_name: userName, action: `resolved an issue for ${i.deliveries?.customer_name || 'a delivery'}: ${i.type}` })
    toast('Issue resolved'); load()
  }

  const today = todayISO()
  const todays = deliveries.filter(d => d.delivery_date === today)
  const count = (s) => todays.filter(d => d.status === s).length
  const upcoming = deliveries.filter(d => d.delivery_date && d.delivery_date > today).slice(0, 6)

  const kpis = [
    { k: "Today", n: todays.length },
    { k: 'Assigned', n: count('assigned') },
    { k: 'At Dealer', n: count('at_dealer') },
    { k: 'En Route', n: count('en_route') },
    { k: 'Delivered', n: count('delivered') },
    { k: 'Issues', n: count('issue'), issue: true },
  ]

  return (
    <>
      <div className="h1">Dashboard</div>
      <div className="sub">Live operations · {new Date().toLocaleDateString()}</div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {kpis.map(x => (
          <div key={x.k} className={'kpi' + (x.issue ? ' issue' : '')}>
            <div className="n">{x.n}</div><div className="k">{x.k}</div>
          </div>
        ))}
      </div>

      {issues.length > 0 && (
        <>
          <div className="section-title" style={{ color: '#e05757', borderColor: '#5a2222' }}>⚠ Issue Alerts</div>
          <div className="grid">
            {issues.map(i => (
              <div key={i.id} className="card" style={{ borderColor: '#5a2222' }}>
                <strong>{i.type}</strong> — {i.deliveries?.customer_name || 'Delivery'}
                <div className="muted" style={{ fontSize: 13 }}>{i.note}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{i.created_by_name} · {fmtDateTime(i.created_at)}</div>
                <div className="row" style={{ marginTop: 10 }}>
                  {i.photo_url && <a href={i.photo_url} target="_blank" rel="noreferrer"><button className="btn ghost sm">View Photo</button></a>}
                  <button className="btn green sm" onClick={() => resolveIssue(i)}>✓ Mark Resolved</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Upcoming Deliveries</div>
      <div className="grid">
        {upcoming.length === 0 && <div className="muted">No upcoming deliveries scheduled.</div>}
        {upcoming.map(d => (
          <div key={d.id} className="card dcard">
            <div>
              <div className="cn">{d.customer_name}</div>
              <div className="meta">{vehicleLabel(d)} · {d.delivery_date} {d.delivery_time}</div>
            </div>
            <StatusPill status={d.status} />
          </div>
        ))}
      </div>

      <div className="section-title">Recent Activity</div>
      <div className="card">
        {activity.length === 0 && <div className="muted">No activity yet.</div>}
        {activity.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span><strong className="gold">{a.user_name || 'Someone'}</strong> {a.action}</span>
            <span className="muted" style={{ fontSize: 12 }}>{fmtDateTime(a.created_at)}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 12 }} />
      <Link to="/deliveries"><button className="btn gold">+ Create a Delivery</button></Link>
    </>
  )
}

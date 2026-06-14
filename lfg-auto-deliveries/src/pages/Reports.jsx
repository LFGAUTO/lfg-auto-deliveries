import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { vehicleLabel, fmtDateTime, downloadCSV } from '../lib/helpers'

// week starting Sunday, offset in weeks (0 = this week, -1 = last week, +1 = next)
function weekBounds(offset = 0) {
  const n = new Date(); n.setDate(n.getDate() + offset * 7)
  const start = new Date(n); start.setDate(n.getDate() - n.getDay()); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999)
  return [start, end]
}
function monthBounds(offset = 0) {
  const n = new Date()
  const start = new Date(n.getFullYear(), n.getMonth() + offset, 1); start.setHours(0, 0, 0, 0)
  const end = new Date(n.getFullYear(), n.getMonth() + offset + 1, 0); end.setHours(23, 59, 59, 999)
  return [start, end]
}
const inDay = (iso, start, end) =>
  iso && iso >= start.toISOString().slice(0, 10) && iso <= end.toISOString().slice(0, 10)

export default function Reports() {
  const { profile, userName } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('timesheets')
  const [all, setAll] = useState([])
  const [issues, setIssues] = useState([])
  const [weekOff, setWeekOff] = useState(0)
  const [monthOff, setMonthOff] = useState(0)

  async function load() {
    const { data } = await supabase.from('deliveries').select('*')
    setAll(data || [])
    const { data: iss } = await supabase.from('issues')
      .select('*, deliveries(customer_name)').order('created_at', { ascending: false })
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
    const d = all.find(x => x.id === i.delivery_id)
    if (d && !d.archived) {
      await supabase.from('deliveries').update({ status: d.prev_status || 'assigned' }).eq('id', d.id)
    }
    await supabase.from('activity_log').insert({
      delivery_id: i.delivery_id, user_id: profile.id, user_name: userName,
      action: `resolved an issue for ${i.deliveries?.customer_name || 'a delivery'}: ${i.type}`,
    })
    toast('Issue resolved'); load()
  }

  // ----- TIMESHEETS (weekly, by completed delivery) -----
  const [wStart, wEnd] = weekBounds(weekOff)
  const weekDone = all.filter(d => d.delivered_at && inDay(d.delivered_at.slice(0, 10), wStart, wEnd))
  const tally = {}
  weekDone.forEach(d => [d.driver1_name, d.driver2_name].filter(Boolean)
    .forEach(name => { (tally[name] = tally[name] || []).push(d) }))
  const tallyNames = Object.keys(tally).sort()
  const weekLabel = `${wStart.toLocaleDateString()} – ${wEnd.toLocaleDateString()}`

  function exportWeek() {
    const rows = []
    tallyNames.forEach(name => tally[name].forEach(d => rows.push({
      Driver: name, Customer: d.customer_name, Vehicle: vehicleLabel(d), VIN: d.vin || '',
      Dealer: d.dealership_name || '',
      AtDealer: d.at_dealer_at ? new Date(d.at_dealer_at).toLocaleString() : '',
      Delivered: d.delivered_at ? new Date(d.delivered_at).toLocaleString() : '',
    })))
    if (!rows.length) { toast('No completed deliveries in this week'); return }
    downloadCSV(rows, `lfg-timesheet-${wStart.toISOString().slice(0, 10)}.csv`)
  }

  // ----- MONTHLY -----
  const [mStart, mEnd] = monthBounds(monthOff)
  const monthLabel = mStart.toLocaleString([], { month: 'long', year: 'numeric' })
  const monthDeliv = all.filter(d => inDay(d.delivery_date || (d.delivered_at ? d.delivered_at.slice(0, 10) : ''), mStart, mEnd))
  const monthDone = all.filter(d => d.delivered_at && inDay(d.delivered_at.slice(0, 10), mStart, mEnd))
  const monthByDriver = {}
  monthDone.forEach(d => [d.driver1_name, d.driver2_name].filter(Boolean)
    .forEach(n => { monthByDriver[n] = (monthByDriver[n] || 0) + 1 }))
  const mNames = Object.keys(monthByDriver).sort()
  const sCount = (s) => monthDeliv.filter(d => d.status === s).length

  const openIssues = issues.filter(i => !i.resolved)

  return (
    <>
      <div className="h1">Reports</div>
      <div className="sub">Timesheets, monthly totals, and the full issue log</div>

      <div className="row" style={{ gap: 8, margin: '12px 0 18px' }}>
        <button className={'btn sm ' + (tab === 'timesheets' ? 'gold' : 'ghost')} onClick={() => setTab('timesheets')}>🧾 Timesheets</button>
        <button className={'btn sm ' + (tab === 'monthly' ? 'gold' : 'ghost')} onClick={() => setTab('monthly')}>📅 Monthly</button>
        <button className={'btn sm ' + (tab === 'issues' ? 'gold' : 'ghost')} onClick={() => setTab('issues')}>⚠ Issues{openIssues.length ? ` (${openIssues.length})` : ''}</button>
      </div>

      {/* ---------------- TIMESHEETS ---------------- */}
      {tab === 'timesheets' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button className="btn ghost sm" onClick={() => setWeekOff(weekOff - 1)}>◀ Prev</button>
              <button className="btn ghost sm" onClick={() => setWeekOff(0)}>This Week</button>
              <button className="btn ghost sm" onClick={() => setWeekOff(weekOff + 1)}>Next ▶</button>
            </div>
            <button className="btn ghost sm" onClick={exportWeek}>⬇ CSV</button>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>{weekLabel} · {weekDone.length} completed</div>

          {tallyNames.length === 0 && <div className="muted" style={{ marginTop: 14 }}>No completed deliveries in this week.</div>}

          <div className="grid" style={{ marginTop: 14 }}>
            {tallyNames.map(name => (
              <div key={name} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong className="gold">{name}</strong>
                  <span className="pill">{tally[name].length} deliveries</span>
                </div>
                <hr />
                {tally[name].map(d => (
                  <div key={d.id} className="meta" style={{ marginTop: 6 }}>
                    • {d.customer_name} — {vehicleLabel(d)}<br />
                    <span style={{ color: '#9bd' }}>🏁 At dealer: {d.at_dealer_at ? fmtDateTime(d.at_dealer_at) : '—'} → ✅ Delivered: {d.delivered_at ? fmtDateTime(d.delivered_at) : '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {tallyNames.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <strong>Week summary</strong>
              <hr />
              {tallyNames.map(name => (
                <div key={name} className="meta" style={{ marginTop: 4 }}>{name} — {tally[name].length}</div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------------- MONTHLY ---------------- */}
      {tab === 'monthly' && (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <button className="btn ghost sm" onClick={() => setMonthOff(monthOff - 1)}>◀ Prev</button>
            <button className="btn ghost sm" onClick={() => setMonthOff(0)}>This Month</button>
            <button className="btn ghost sm" onClick={() => setMonthOff(monthOff + 1)}>Next ▶</button>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>{monthLabel}</div>

          <div className="kpis" style={{ marginTop: 14 }}>
            <div className="kpi"><div className="n">{monthDeliv.length}</div><div className="k">Total Deliveries</div></div>
            <div className="kpi green"><div className="n">{monthDone.length}</div><div className="k">Completed</div></div>
            <div className="kpi"><div className="n">{sCount('assigned')}</div><div className="k">Assigned</div></div>
            <div className="kpi"><div className="n">{sCount('at_dealer')}</div><div className="k">At Dealer</div></div>
            <div className="kpi"><div className="n">{sCount('en_route')}</div><div className="k">En Route</div></div>
            <div className="kpi danger"><div className="n">{sCount('issue')}</div><div className="k">Issues</div></div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <strong>Completed by driver — {monthLabel}</strong>
            <hr />
            {mNames.length === 0 && <div className="muted">No completed deliveries this month.</div>}
            {mNames.map(n => <div key={n} className="meta" style={{ marginTop: 4 }}>{n} — {monthByDriver[n]}</div>)}
          </div>
        </>
      )}

      {/* ---------------- ISSUES ---------------- */}
      {tab === 'issues' && (
        <>
          {issues.length === 0 && <div className="muted">No issues have been reported.</div>}
          <div className="grid">
            {issues.map(i => (
              <div key={i.id} className="card" style={{ borderColor: i.resolved ? undefined : '#5a2222' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{i.type} — {i.deliveries?.customer_name || 'Delivery'}</strong>
                  <span className="pill" style={{ color: i.resolved ? '#7bd88f' : '#e05757' }}>{i.resolved ? '✓ Resolved' : 'Open'}</span>
                </div>
                <div className="meta" style={{ marginTop: 4 }}>{i.note}</div>
                <div className="meta" style={{ marginTop: 4 }}>{i.created_by_name} · {fmtDateTime(i.created_at)}</div>
                {i.resolved && <div className="meta" style={{ marginTop: 4, color: '#7bd88f' }}>Solution: {i.solution} {i.resolved_by ? `(${i.resolved_by})` : ''}</div>}
                <div className="row" style={{ marginTop: 10 }}>
                  {i.photo_url && <a href={i.photo_url} target="_blank" rel="noreferrer"><button className="btn ghost sm">View Photo</button></a>}
                  {!i.resolved && <button className="btn green sm" onClick={() => resolveIssue(i)}>✓ Mark Resolved</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

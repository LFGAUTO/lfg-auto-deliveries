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
// pay week runs Saturday -> Friday, paid that Friday. offset in weeks.
function payWeekBounds(offset = 0) {
  const n = new Date(); n.setDate(n.getDate() + offset * 7)
  const back = (n.getDay() + 1) % 7            // days since the most recent Saturday
  const start = new Date(n); start.setDate(n.getDate() - back); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999)
  return [start, end]
}
const inDay = (iso, start, end) =>
  iso && iso >= start.toISOString().slice(0, 10) && iso <= end.toISOString().slice(0, 10)
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Reports() {
  const { profile, userName } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('timesheets')
  const [all, setAll] = useState([])
  const [issues, setIssues] = useState([])
  const [weekOff, setWeekOff] = useState(0)
  const [monthOff, setMonthOff] = useState(0)
  const [payOff, setPayOff] = useState(0)
  const [paid, setPaid] = useState([])

  async function load() {
    const { data } = await supabase.from('deliveries').select('*')
    setAll(data || [])
    const { data: iss } = await supabase.from('issues')
      .select('*, deliveries(customer_name)').order('created_at', { ascending: false })
    setIssues(iss || [])
    const { data: pd } = await supabase.from('payroll_paid').select('*')
    setPaid(pd || [])
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

  // ----- PAYROLL (Sat–Fri, pay per driver) -----
  const [pStart, pEnd] = payWeekBounds(payOff)
  const pStartISO = pStart.toISOString().slice(0, 10)
  const payLabel = `${pStart.toLocaleDateString()} – ${pEnd.toLocaleDateString()}`
  const payDone = all.filter(d => d.delivered_at && !d.pay_exclude && inDay(d.delivered_at.slice(0, 10), pStart, pEnd))
  const payTally = {}
  payDone.forEach(d => [d.driver1_name, d.driver2_name].filter(Boolean).forEach(name => {
    const line = { d, base: Number(d.pay_amount ?? 100), adj: Number(d.pay_adjust || 0) }
    ;(payTally[name] = payTally[name] || []).push(line)
  }))
  const payNames = Object.keys(payTally).sort()
  const driverTotal = (name) => (payTally[name] || []).reduce((s, l) => s + l.base + l.adj, 0)
  const grandTotal = payNames.reduce((s, n) => s + driverTotal(n), 0)
  const isPaid = (name) => paid.find(p => p.driver_name === name && p.week_start === pStartISO)

  async function markPaid(name) {
    const total = driverTotal(name)
    if (!confirm(`Mark ${name} PAID for ${payLabel}?\nTotal: ${money(total)} (${(payTally[name] || []).length} deliveries)`)) return
    const { error } = await supabase.from('payroll_paid').upsert({
      driver_name: name, week_start: pStartISO, amount: total,
      deliveries: (payTally[name] || []).length, paid_by: userName, paid_at: new Date().toISOString(),
    }, { onConflict: 'driver_name,week_start' })
    if (error) { toast("Couldn't mark paid — try again"); return }
    toast(`${name} marked paid`); load()
  }
  async function unmarkPaid(name) {
    if (!confirm(`Undo PAID for ${name} (${payLabel})?`)) return
    await supabase.from('payroll_paid').delete().eq('driver_name', name).eq('week_start', pStartISO)
    toast('Paid status removed'); load()
  }
  function exportPay() {
    const rows = []
    payNames.forEach(name => payTally[name].forEach(l => rows.push({
      Driver: name, Paid: isPaid(name) ? 'YES' : 'NO', Customer: l.d.customer_name,
      Vehicle: vehicleLabel(l.d), Delivered: l.d.delivered_at ? new Date(l.d.delivered_at).toLocaleString() : '',
      Value: l.base.toFixed(2), Adjust: l.adj.toFixed(2),
      LineTotal: (l.base + l.adj).toFixed(2), AdjustNote: l.d.pay_adjust_note || '',
    })))
    if (!rows.length) { toast('No payable deliveries this week'); return }
    downloadCSV(rows, `lfg-payroll-${pStartISO}.csv`)
  }
  function printPay() {
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const body = payNames.map(name => `
      <h3>${esc(name)} — ${money(driverTotal(name))} ${isPaid(name) ? '(PAID)' : ''}</h3>
      <table><tr><th>Customer</th><th>Vehicle</th><th>Delivered</th><th>Value</th><th>+/-</th><th>Total</th></tr>
      ${payTally[name].map(l => `<tr><td>${esc(l.d.customer_name)}</td><td>${esc(vehicleLabel(l.d))}</td>
        <td>${l.d.delivered_at ? new Date(l.d.delivered_at).toLocaleString() : ''}</td>
        <td>${money(l.base)}</td><td>${l.adj ? money(l.adj) : '-'}</td><td>${money(l.base + l.adj)}</td></tr>`).join('')}
      </table>`).join('')
    const html = `<!doctype html><meta charset=utf-8><title>Payroll ${payLabel}</title>
      <style>body{font-family:Arial;padding:28px;color:#111}h1{border-bottom:3px solid #c9a227;padding-bottom:8px}
      h3{margin:18px 0 4px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}
      th,td{border-bottom:1px solid #eee;padding:5px 8px;text-align:left}th{color:#666}
      .tot{font-size:18px;font-weight:800;margin-top:10px}</style>
      <h1>LFG AUTO — Driver Payroll</h1><div>Pay week (Sat–Fri): ${payLabel}</div>
      ${body}<div class="tot">Grand total: ${money(grandTotal)}</div>
      <script>window.onload=function(){window.print()}</script>`
    const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print'); return }
    w.document.write(html); w.document.close()
  }

  const openIssues = issues.filter(i => !i.resolved)

  return (
    <>
      <div className="h1">Reports</div>
      <div className="sub">Timesheets, monthly totals, and the full issue log</div>

      <div className="row" style={{ gap: 8, margin: '12px 0 18px' }}>
        <button className={'btn sm ' + (tab === 'timesheets' ? 'gold' : 'ghost')} onClick={() => setTab('timesheets')}>🧾 Timesheets</button>
        <button className={'btn sm ' + (tab === 'payroll' ? 'gold' : 'ghost')} onClick={() => setTab('payroll')}>💵 Payroll</button>
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
      {/* ---------------- PAYROLL ---------------- */}
      {tab === 'payroll' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button className="btn ghost sm" onClick={() => setPayOff(payOff - 1)}>◀ Prev</button>
              <button className="btn ghost sm" onClick={() => setPayOff(0)}>This Week</button>
              <button className="btn ghost sm" onClick={() => setPayOff(payOff + 1)}>Next ▶</button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost sm" onClick={exportPay}>⬇ CSV</button>
              <button className="btn ghost sm" onClick={printPay}>🖨 Print</button>
            </div>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>Pay week (Sat–Fri): {payLabel}</div>

          <div className="kpis" style={{ marginTop: 14 }}>
            <div className="kpi gold"><div className="n">{money(grandTotal)}</div><div className="k">Total owed this week</div></div>
            <div className="kpi"><div className="n">{payDone.length}</div><div className="k">Payable deliveries</div></div>
            <div className="kpi"><div className="n">{payNames.length}</div><div className="k">Drivers</div></div>
          </div>

          {payNames.length === 0 && <div className="muted" style={{ marginTop: 14 }}>No payable deliveries in this week.</div>}

          <div className="grid" style={{ marginTop: 14 }}>
            {payNames.map(name => {
              const p = isPaid(name)
              return (
                <div key={name} className="card" style={{ borderColor: p ? '#2f5d3a' : undefined }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="gold">{name}</strong>
                    <span className="pill" style={{ color: p ? '#7bd88f' : '#e8d9a8' }}>{money(driverTotal(name))}{p ? ' · PAID' : ''}</span>
                  </div>
                  <hr />
                  {payTally[name].map((l, idx) => (
                    <div key={idx} className="meta" style={{ marginTop: 4 }}>
                      • {l.d.customer_name} — {vehicleLabel(l.d)} · {money(l.base)}{l.adj ? ` ${l.adj > 0 ? '+' : ''}${money(l.adj)} (${l.d.pay_adjust_note || 'adj'})` : ''}
                    </div>
                  ))}
                  <div className="btnrow" style={{ marginTop: 10 }}>
                    {p
                      ? <button className="btn ghost sm" onClick={() => unmarkPaid(name)}>Undo Paid</button>
                      : <button className="btn green sm" onClick={() => markPaid(name)}>✓ Mark Paid ({money(driverTotal(name))})</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

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

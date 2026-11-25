import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { payrollSettlement } from '../lib/payroll'
import { vehicleLabel } from '../lib/helpers'

const money = value => Number(value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const date = value => new Date(value.length === 10 ? value + 'T12:00:00Z' : value).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })

export default function DriverPayroll() {
  const { userName, driverName, isAdmin, signOut } = useAuth()
  const [driver, setDriver] = useState(() => new URLSearchParams(window.location.search).get('driver') || '')
  const [roster, setRoster] = useState([])
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const request = useRef(0)
  useEffect(() => {
    if (!isAdmin) return
    let active = true
    supabase.from('drivers_roster').select('name').order('name').then(({ data, error }) => {
      if (!active) return
      if (error) setError('Could not load drivers. Refresh and try again.')
      else setRoster(data || [])
    })
    return () => { active = false }
  }, [isAdmin, refresh])
  useEffect(() => {
    const seq = ++request.current
    setData(null); setError('')
    if (isAdmin && !driver) { setLoading(false); return }
    setLoading(true)
    supabase.rpc('driver_payroll', { payload: { week_offset: offset, ...(isAdmin ? { driver_name: driver } : {}) } })
      .then(({ data, error }) => {
        if (seq !== request.current) return
        if (error || !data || !Array.isArray(data.entries)) setError('Could not load payroll. Please try again.')
        else setData(data)
      }).catch(() => { if (seq === request.current) setError('Could not load payroll. Please try again.') })
      .finally(() => { if (seq === request.current) setLoading(false) })
    return () => { request.current++ }
  }, [isAdmin, driver, offset, refresh])
  const settlement = data ? payrollSettlement(data.payment, data.total, data.count) : null
  return <div className="app">
    <div className="topbar"><div className="brand"><span className="mark">L</span> LFG <span className="gold">AUTO</span></div><div className="row"><span className="who">{userName}</span><button className="btn ghost sm" onClick={signOut}>Sign Out</button></div></div>
    <div className="content">
      <nav className="quick-actions" aria-label="Driver navigation"><a className="btn ghost" href="/driver">Deliveries</a><a className="btn gold" href="/driver/payroll" aria-current="page">Payroll</a></nav>
      <div className="page-heading"><div><h1 className="h1">Your payroll</h1><p className="sub">{isAdmin ? 'Preview a driver’s payroll.' : driverName} · Saturday–Friday · Eastern time</p></div><button className="btn ghost sm" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh payroll</button></div>
      {isAdmin && <label className="fld driver-picker"><span>Driver</span><select value={driver} onChange={e => { setData(null); setLoading(true); setDriver(e.target.value) }}><option value="">Choose driver</option>{roster.map(d => <option key={d.name}>{d.name}</option>)}</select></label>}
      <div className="quick-actions"><button className="btn ghost" disabled={offset <= -520} onClick={() => { setData(null); setLoading(true); setOffset(n => n - 1) }}>← Previous week</button><button className="btn ghost" disabled={offset === 0} onClick={() => { setData(null); setLoading(true); setOffset(0) }}>This week</button><button className="btn ghost" disabled={offset === 0} onClick={() => { setData(null); setLoading(true); setOffset(n => n + 1) }}>Next week →</button></div>
      {loading && <p role="status">Loading payroll…</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {!loading && isAdmin && !driver && <p>Choose a driver to see their payroll.</p>}
      {data && <>
        <h2 className="section-title">{data.label}</h2>
        <div className="earnings-bar"><div><strong>{money(data.total)} total pay</strong><p className="meta">{data.count} paid-eligible {data.count === 1 ? 'delivery' : 'deliveries'}{data.extras.length ? ` · ${data.extras.length} extra pay entries` : ''}</p></div><span>{settlement.settled ? 'Paid' : settlement.changed ? 'Adjusted after payment' : 'Pending'}</span></div>
        <div className="card"><p>Delivery pay: <strong>{money(data.delivery_total)}</strong></p><p>Extra pay: <strong>{money(data.extra_total)}</strong></p><p>Recorded paid: <strong>{money(settlement.paidAmount)}</strong>{data.payment?.paid_at ? ` · ${date(data.payment.paid_at)}` : ''}</p><p>{settlement.balance < 0 ? 'Overpayment to review' : 'Remaining balance'}: <strong>{money(Math.abs(settlement.balance))}</strong></p>{settlement.changed && <p className="meta">The delivery details changed after payment was recorded. Contact dispatch with questions.</p>}</div>
        <h2 className="section-title">Delivery breakdown</h2>
        {!data.entries.length && <p className="empty-state">No completed deliveries for this week.</p>}
        <div className="driver-jobs">{data.entries.map(d => <article className="card driver-payroll-line" key={d.id}>
          <div className="row spread"><h3>{d.customer_name || 'Customer'}</h3><strong className="gold">{money(d.amount)}</strong></div>
          <p className="meta">{vehicleLabel(d)} · Completed {date(d.delivered_at)}</p>
          {d.shared && <p className="meta">Two-driver run · this is your pay only</p>}
          {d.excluded ? <p>Excluded from payroll</p> : <p>Base {money(d.base)}{Number(d.adjustment) !== 0 ? ` · Adjustment ${money(d.adjustment)}` : ''}</p>}
          {d.adjustment_note && <p className="meta">{d.adjustment_note}</p>}
        </article>)}</div>
        {data.extras.length > 0 && <><h2 className="section-title">Extra pay</h2>{data.extras.map(x => <article className="card" key={x.id}><div className="row spread"><strong>{x.category}</strong><strong className="gold">{money(x.amount)}</strong></div><p className="meta">{date(x.work_date)}{x.description ? ` · ${x.description}` : ''}</p></article>)}</>}
      </>}
    </div>
  </div>
}

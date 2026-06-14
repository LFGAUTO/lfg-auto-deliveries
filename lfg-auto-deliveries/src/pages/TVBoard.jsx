import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUS, fmtTime, vehicleLabel, todayISO } from '../lib/helpers'
import LiveMap from './LiveMap'

const COLS = ['assigned', 'at_dealer', 'en_route', 'delivered', 'issue']

function weekBounds() {
  const n = new Date()
  const start = new Date(n); start.setDate(n.getDate() - n.getDay()); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999)
  return [start, end]
}

function monthBounds() {
  const n = new Date()
  const start = new Date(n.getFullYear(), n.getMonth(), 1); start.setHours(0, 0, 0, 0)
  const end = new Date(n.getFullYear(), n.getMonth() + 1, 0); end.setHours(23, 59, 59, 999)
  return [start, end]
}

export default function TVBoard() {
  const [rows, setRows] = useState([])
  const [now, setNow] = useState(new Date())
  const [range, setRange] = useState('daily')   // 'daily' | 'weekly' | 'monthly'
  const [showMap, setShowMap] = useState(false)
  const wrapRef = useRef(null)

  async function load() {
    // Pull active deliveries + anything delivered within this month, then filter by range.
    const [mStart] = monthBounds()
    const { data } = await supabase.from('deliveries')
      .select('*')
      .or(`archived.eq.false,delivered_at.gte.${mStart.toISOString()}`)
      .order('delivery_time', { ascending: true })
    setRows(data || [])
  }

  useEffect(() => {
    load()
    const refresh = setInterval(load, 30000)     // auto-refresh every 30s
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => { clearInterval(refresh); clearInterval(clock) }
  }, [])

  const today = todayISO()
  const [wStart, wEnd] = weekBounds()
  const [mStart, mEnd] = monthBounds()
  const inRange = (d) => {
    if (range === 'monthly') {
      const day = d.delivery_date || (d.delivered_at ? d.delivered_at.slice(0, 10) : '')
      return day >= mStart.toISOString().slice(0, 10) && day <= mEnd.toISOString().slice(0, 10)
    }
    if (range === 'weekly') {
      const day = d.delivery_date || (d.delivered_at ? d.delivered_at.slice(0, 10) : '')
      return day >= wStart.toISOString().slice(0, 10) && day <= wEnd.toISOString().slice(0, 10)
    }
    if (d.status === 'delivered') return d.delivered_at && d.delivered_at.slice(0, 10) === today
    return !d.delivery_date || d.delivery_date === today
  }

  const board = rows.filter(inRange)
  const count = (s) => board.filter(d => d.status === s).length
  const driverName = (d) => [d.driver1_name, d.driver2_name].filter(Boolean).join(' & ') || 'Unassigned'
  const unassignedCount = board.filter(d => !d.driver1_name && !d.driver2_name).length

  function goFull() {
    const el = wrapRef.current
    if (!document.fullscreenElement) el?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  const rangeLabel = range === 'monthly' ? 'This Month' : range === 'weekly' ? 'This Week' : 'Today'
  const summary = [
    { k: rangeLabel, n: board.length },
    { k: 'Unassigned', n: unassignedCount, c: '#e05757' },
    ...COLS.map(s => ({ k: STATUS[s].label, n: count(s), c: STATUS[s].color })),
  ]

  return (
    <div className="tv" ref={wrapRef}>
      <div className="tv-head">
        <div>
          <div className="tv-title">OPEN DELIVERY BOARD</div>
          <div className="tv-clock">LFG AUTO · {now.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className={'btn sm ' + (range !== 'weekly' && range !== 'monthly' && !showMap ? 'gold' : 'ghost')} onClick={() => { setRange('daily'); setShowMap(false) }}>Daily</button>
            <button className={'btn sm ' + (range === 'weekly' && !showMap ? 'gold' : 'ghost')} onClick={() => { setRange('weekly'); setShowMap(false) }}>Weekly</button>
            <button className={'btn sm ' + (range === 'monthly' && !showMap ? 'gold' : 'ghost')} onClick={() => { setRange('monthly'); setShowMap(false) }}>Monthly</button>
            <button className={'btn sm ' + (showMap ? 'gold' : 'ghost')} onClick={() => setShowMap(m => !m)}>🗺️ Live Map</button>
          </div>
        </div>
        <div className="tv-summary">
          {summary.map(s => (
            <div className="tv-sum" key={s.k}>
              <div className="n" style={s.c ? { color: s.c } : undefined}>{s.n}</div>
              <div className="k">{s.k}</div>
            </div>
          ))}
          <button className="btn gold sm" style={{ alignSelf: 'center' }} onClick={goFull}>⛶ Fullscreen</button>
        </div>
      </div>

      {showMap
        ? <div style={{ padding: 12 }}><LiveMap height="80vh" /></div>
        : (
      <div className="tv-cols">
        {COLS.map(s => (
          <div className="tv-col" key={s}>
            <h3 style={{ background: STATUS[s].color }}>{STATUS[s].label}</h3>
            {board.filter(d => d.status === s).map(d => (
              <div className="tv-card" key={d.id} style={{ borderLeftColor: STATUS[s].color }}>
                <div className="c">{d.customer_name}</div>
                <div className="v">{vehicleLabel(d)}</div>
                {(d.driver1_name || d.driver2_name)
                  ? <div className="l">🧑‍✈️ {driverName(d)}</div>
                  : <div className="l" style={{ color: '#e05757', fontWeight: 800 }}>⚠ UNASSIGNED</div>}
                {d.dealership_name && <div className="l">🏢 {d.dealership_name}</div>}
                <div className="l">🕒 {range === 'weekly' && d.delivery_date ? d.delivery_date + ' · ' : ''}{d.delivery_time || '—'} · updated {fmtTime(d.updated_at)}</div>
              </div>
            ))}
            {board.filter(d => d.status === s).length === 0 && <div className="l" style={{ textAlign: 'center', opacity: .5 }}>—</div>}
          </div>
        ))}
      </div>
        )}
    </div>
  )
}

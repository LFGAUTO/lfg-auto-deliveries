import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Shows a live OpenStreetMap with one pin per driver currently sharing location.
// Used on the admin Live Map page and on the TV Board.
export default function LiveMap({ height = '72vh' }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const markers = useRef({})
  const [count, setCount] = useState(0)
  const [ready, setReady] = useState(!!window.L)

  useEffect(() => {
    let cancelled = false
    let timer = null

    function start() {
      if (cancelled) return
      if (!window.L) { setTimeout(start, 300); return }   // wait for the map library
      setReady(true)
      const L = window.L
      const map = L.map(elRef.current, { zoomControl: true }).setView([40.26, -74.27], 10) // Freehold, NJ area
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(map)
      mapRef.current = map

      async function refresh() {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString() // last 5 min = "live"
        const { data } = await supabase.from('live_locations').select('*').gte('updated_at', cutoff)
        const rows = (data || []).filter(r => r.lat != null && r.lng != null)
        setCount(rows.length)
        const seen = new Set()
        rows.forEach(r => {
          seen.add(r.driver_name)
          const label = `${r.driver_name}${r.customer ? ' → ' + r.customer : ''}`
          if (markers.current[r.driver_name]) {
            markers.current[r.driver_name].setLatLng([r.lat, r.lng]).setTooltipContent(label)
          } else {
            markers.current[r.driver_name] = L.marker([r.lat, r.lng]).addTo(map)
              .bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10] })
          }
        })
        Object.keys(markers.current).forEach(name => {
          if (!seen.has(name)) { map.removeLayer(markers.current[name]); delete markers.current[name] }
        })
        const pts = rows.map(r => [r.lat, r.lng])
        if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 14 })
      }
      refresh()
      timer = setInterval(refresh, 20000)
    }
    start()

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      markers.current = {}
    }
  }, [])

  return (
    <div>
      <div className="sub" style={{ marginBottom: 8 }}>
        {count} driver{count === 1 ? '' : 's'} sharing location now
        {count === 0 && ' — a pin appears when a driver taps EN ROUTE (with their name selected).'}
      </div>
      <div ref={elRef} style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden', background: '#0e0e0e' }} />
      {!ready && <div className="muted" style={{ marginTop: 8 }}>Loading map…</div>}
    </div>
  )
}

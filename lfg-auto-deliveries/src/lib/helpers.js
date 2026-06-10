export const STATUS = {
  assigned:  { label: 'Assigned',  color: '#9a9a93' },
  at_dealer: { label: 'At Dealer', color: '#1d6bb6' },
  en_route:  { label: 'En Route',  color: '#f58426' },
  delivered: { label: 'Delivered', color: '#3fb56b' },
  issue:     { label: 'Issue',     color: '#e05757' },
}

export const ISSUE_TYPES = [
  'Dealer Delay', 'Vehicle Damage', 'Missing Paperwork',
  'Customer Delay', 'Payment Issue', 'Trade Issue', 'Other',
]

export function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
export function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
export function todayISO() {
  const d = new Date(); d.setHours(0,0,0,0)
  return d.toISOString().slice(0,10)
}
export function vehicleLabel(d) {
  return [d.vyear, d.make, d.model].filter(Boolean).join(' ') || '—'
}

// Build a CSV string from an array of objects and trigger a download.
export function downloadCSV(rows, filename) {
  if (!rows.length) { alert('Nothing to export yet.'); return }
  const cols = Object.keys(rows[0])
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

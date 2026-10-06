export const DISPATCH_PHONE = '+17325470333'
export const PAPERWORK = { pending: 'Paperwork pending', ups: 'Dropped off at UPS', dealer: 'Returned to dealer', office: 'With Jess / office', not_required: 'No originals to return' }
export function easternDay(value = new Date()) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
export function dayLabel(day) {
  if (!day) return 'Date needed'
  const today = easternDay()
  const next = new Date(today + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1)
  const label = day === today ? 'Today' : day === easternDay(next) ? 'Tomorrow' : ''
  const date = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' })
  return label ? `${label} · ${date}` : date
}
export const driverNames = d => [...new Set([d.driver1_name, d.driver2_name].filter(Boolean))]
export const tradeDestination = d => d.trade_destination === 'dealer' ? d.trade_return_dealer || 'Dealer destination needed' : 'LFG office'
export const directions = address => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
export function outstanding(d) {
  const items = []
  if (d.cod_required && !d.cod_received) items.push('COD collection')
  if (d.is_trade && !d.trade_returned_at) items.push('Trade return')
  if (!['ups', 'dealer', 'not_required'].includes(d.paperwork_status)) items.push(d.paperwork_status === 'office' ? 'Paperwork · Jess / office' : 'Paperwork return')
  return items
}
export function nextAction(d) {
  if (d.delivered_at) return d.closeout_required ? outstanding(d).join(' · ') : 'Run complete'
  if (d.status === 'issue') return 'Contact Jess · issue needs attention'
  if (d.status === 'at_dealer') return 'Check vehicle and start delivery'
  if (d.status === 'en_route') return 'Complete customer handoff'
  return 'Arrive at dealership'
}
export function dateGroup(d) {
  if (d.delivered_at) return 'Finish your returns'
  if (!d.delivery_date) return 'Date needed'
  const today = easternDay()
  if (d.delivery_date < today) return 'Overdue'
  if (d.delivery_date === today) return 'Today'
  return 'Upcoming'
}

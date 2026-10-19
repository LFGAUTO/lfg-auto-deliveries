export const BOARD_FILTERS = [
  ['scheduled', 'Live + Drafts'], ['live', 'Live'], ['drafts', 'Drafts'],
  ['delivered', 'Delivered'], ['closeout', 'Closeout pending'], ['all', 'All']
]

export const isBoardDelivered = d => !!d.delivered_at || d.status === 'delivered' || !!d.archived

export function matchesBoardFilter(d, filter) {
  const delivered = isBoardDelivered(d)
  if (filter === 'scheduled') return !delivered
  if (filter === 'live') return !!d.is_ready && !delivered
  if (filter === 'drafts') return !d.is_ready && !delivered
  if (filter === 'delivered') return delivered
  if (filter === 'closeout') return !!d.closeout_required
  return true
}

import { STATUS } from '../lib/helpers'
export default function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.assigned
  return <span className="pill" style={{ background: s.color }}>{s.label}</span>
}

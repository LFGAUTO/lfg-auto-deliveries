import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { PAPERWORK, tradeDestination, outstanding } from '../lib/workflow'
import { fmtDateTime } from '../lib/helpers'

export default function Closeout({ delivery: d, actor, onSaved, readOnly = false }) {
  const { profile, userName, isAdmin } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function save(patch, action) {
    if (!actor && !isAdmin) { toast('Select your name before recording a handoff.'); return }
    if (!window.confirm(`${action} for ${d.customer_name}?`)) return
    setBusy(true)
    try {
      const name = actor || userName
      const { error } = await supabase.from('deliveries').update(patch).eq('id', d.id)
      if (error) throw error
      const { error: logError } = await supabase.from('activity_log').insert({ delivery_id: d.id, user_id: profile.id, user_name: name, action: `${action} for ${d.customer_name}` })
      toast(logError ? 'Saved. Activity log could not be updated.' : 'Handoff saved')
      await onSaved?.()
    } catch (e) { toast('Could not save: ' + e.message) } finally { setBusy(false) }
  }
  function paperwork(status) {
    const recipient = status === 'dealer' ? window.prompt('Received by (optional)', '') : ''
    if (recipient === null) return
    save({ paperwork_status: status, paperwork_at: new Date().toISOString(), paperwork_by: actor || userName, paperwork_recipient: recipient || null }, PAPERWORK[status])
  }
  const pending = outstanding(d)
  return <section className="closeout">
    <div className="section-title">{d.closeout_required ? 'Finish this run' : 'Return record'}</div>
    {d.closeout_required && <p className="sub">Vehicle delivered. Still open: {pending.join(' · ')}.</p>}
    <div className="return-row"><strong>{PAPERWORK[d.paperwork_status] || 'Paperwork not recorded (legacy)'}</strong>
      {d.paperwork_at && <p className="meta">{d.paperwork_by} · {fmtDateTime(d.paperwork_at)}{d.paperwork_recipient ? ` · Received by ${d.paperwork_recipient}` : ''}</p>}
      {d.paperwork_status === 'office' && <p className="meta">Jess owns the remaining paperwork return.</p>}
    </div>
    {!readOnly && d.closeout_required && !['ups','dealer','not_required'].includes(d.paperwork_status) && (d.paperwork_status !== 'office' || isAdmin) && <div className="return-actions">
      <button disabled={busy} className="btn ghost" onClick={() => paperwork('ups')}>Dropped off at UPS</button>
      <button disabled={busy} className="btn ghost" onClick={() => paperwork('dealer')}>Returned to dealer</button>
      <button disabled={busy} className="btn ghost" onClick={() => paperwork('office')}>Handed to Jess / office</button>
    </div>}
    {d.is_trade && <div className="return-row"><strong>{d.trade_returned_at ? 'Trade returned' : `Trade return · ${tradeDestination(d)}`}</strong>
      {d.trade_returned_at ? <p className="meta">{d.trade_returned_by} · {fmtDateTime(d.trade_returned_at)}</p> : !readOnly && d.closeout_required && <button className="btn ghost" disabled={busy} onClick={() => save({ trade_returned_at: new Date().toISOString(), trade_returned_by: actor || userName }, `Returned trade to ${tradeDestination(d)}`)}>Confirm trade dropped off</button>}
    </div>}
    {d.cod_required && !d.cod_received && <div className="payment-callout"><strong>COD still outstanding · ${d.cod_amount}</strong><p>{d.cod_exception || 'Confirm collection with Jess.'}</p>{!readOnly && d.closeout_required && <button disabled={busy} className="btn gold" onClick={() => save({ cod_received: true }, 'Confirmed COD collected')}>Confirm COD collected</button>}</div>}
    {d.closeout_completed_at && <p className="meta">Run closed {fmtDateTime(d.closeout_completed_at)}</p>}
  </section>
}

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

// Open a clean one-page delivery packet in a new window and trigger the print
// dialog. From the print dialog the user can pick a real printer OR "Save as PDF".
export function printDeliveryPacket(d) {
  const esc = (v) => (v == null || v === '' ? '—' : String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
  const yes = (b) => (b ? '☑' : '☐')
  const veh = [d.vyear, d.make, d.model].filter(Boolean).join(' ') || '—'
  const driver = [d.driver1_name, d.driver2_name].filter(Boolean).join(' & ') || 'Unassigned'
  const row = (a, b) => `<tr><td class="l">${a}</td><td>${b}</td></tr>`
  const tradeBlock = d.is_trade ? `
    <h3>Trade / Lease Return</h3>
    <table>
      ${row('Vehicle', esc([d.trade_year, d.trade_make, d.trade_model].filter(Boolean).join(' ')))}
      ${row('VIN', esc(d.trade_vin))}
      ${row('Goes to', d.trade_destination === 'dealer' ? esc(d.trade_return_dealer || 'Dealer') : 'Back to Office')}
      ${d.trade_notes ? row('Notes', esc(d.trade_notes)) : ''}
    </table>` : ''
  const codBlock = d.cod_required ? `
    <h3>COD / Payment</h3>
    <table>
      ${row('Amount', esc(d.cod_amount))}
      ${row('Made out to', esc(d.cod_made_out_to))}
      ${row('Type', esc(d.cod_type))}
      ${row('Received', d.cod_received ? 'Yes' : 'No')}
    </table>` : ''

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Delivery Packet — ${esc(d.customer_name)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c9a227;padding-bottom:10px;margin-bottom:14px}
    .brand{font-size:22px;font-weight:800;letter-spacing:1px}.brand span{color:#c9a227}
    .sub{font-size:12px;color:#555}
    h3{margin:16px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#333;border-bottom:1px solid #ddd;padding-bottom:3px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    td{padding:4px 6px;vertical-align:top;border-bottom:1px solid #f0f0f0}
    td.l{width:170px;color:#666;font-weight:600}
    .vin{font-size:15px;font-weight:800;letter-spacing:1px}
    .check{font-size:13px;line-height:1.9}
    .sig{margin-top:26px}.sigline{margin-top:34px;border-top:1px solid #111;width:320px}.sigcap{font-size:11px;color:#666}
    .twocol{display:flex;gap:30px}.twocol>div{flex:1}
    @media print{body{padding:0}}
  </style></head><body>
    <div class="head">
      <div><div class="brand">LFG <span>AUTO</span></div><div class="sub">Delivery Packet</div></div>
      <div class="sub" style="text-align:right">Date: ${esc(d.delivery_date)}<br>Time: ${esc(d.delivery_time)}<br>Status: ${esc(d.status)}</div>
    </div>

    <div class="twocol">
      <div>
        <h3>Customer</h3>
        <table>
          ${row('Name', esc(d.customer_name))}
          ${row('Phone', esc(d.customer_phone))}
          ${row('Address', esc(d.delivery_address))}
          ${row('Driver(s)', esc(driver))}
        </table>
      </div>
      <div>
        <h3>Dealer</h3>
        <table>
          ${row('Dealership', esc(d.dealership_name))}
          ${row('Contact', esc(d.dealership_contact))}
          ${row('Phone', esc(d.dealership_phone))}
        </table>
      </div>
    </div>

    <h3>Vehicle</h3>
    <table>
      ${row('Vehicle', esc(veh))}
      ${row('Color', esc(d.color))}
      ${row('Contract', esc(d.contract_type))}
      <tr><td class="l">VIN</td><td class="vin">${esc(d.vin)}</td></tr>
    </table>

    ${tradeBlock}
    ${codBlock}

    <h3>Delivery Checklist</h3>
    <div class="check">
      ${yes(d.task_bluetooth)} Set up Bluetooth &nbsp;&nbsp; ${yes(d.task_lfg_box)} Gave LFG Box &nbsp;&nbsp;
      ${yes(d.task_app)} Installed Vehicle App &nbsp;&nbsp; ${yes(d.task_review)} Asked for Review<br>
      ${yes(d.client_photo_url)} Client Photo &nbsp;&nbsp; ${yes(d.contract_photo_url)} Contract Photo
      ${d.is_trade ? `&nbsp;&nbsp; ${yes(d.trade_photo_url)} Trade Photo` : ''}
    </div>

    ${d.admin_notes ? `<h3>Notes</h3><div style="font-size:13px">${esc(d.admin_notes)}</div>` : ''}

    <div class="sig">
      <div class="sigline"></div>
      <div class="sigcap">Customer / Driver signature</div>
    </div>

    <script>window.onload=function(){window.print()}</script>
  </body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Allow pop-ups to print the packet.'); return }
  w.document.write(html); w.document.close()
}

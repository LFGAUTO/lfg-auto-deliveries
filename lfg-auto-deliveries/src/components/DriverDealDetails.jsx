const text = value => value == null || String(value).trim() === '' ? 'Not provided' : String(value).trim()

export function dealMoney(value) {
  const saved = text(value)
  if (saved === 'Not provided') return saved
  const numeric = saved.replace(/[$,]/g, '')
  // Preserve notes such as “499 + tax”; never turn missing data into $0.
  return /^\d+(\.\d+)?$/.test(numeric)
    ? Number(numeric).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : saved
}

export default function DriverDealDetails({ delivery: d }) {
  const cash = /^cash$/i.test(String(d.contract_type || '').trim())
  const fields = [
    ['Monthly payment', cash ? 'Not applicable · cash purchase' : dealMoney(d.monthly_payment)],
    ['Contract type', text(d.contract_type)],
    ['Miles per year', text(d.miles_per_year)],
    ['Year / make', text([d.vyear, d.make].filter(Boolean).join(' '))],
    // The delivery bridge saves model and trim together in model.
    ['Model / trim', text(d.model)],
    ['Color', text(d.color)],
    ['VIN', text(d.vin)],
  ]
  const paperwork = { pending: 'Original paperwork to return', e_contracts: 'E-contracts · no originals to return', not_required: 'No originals to return', returned: 'Paperwork returned' }
  return <section className="driver-deal-details" aria-label="Deal details">
    <h3>Deal details</h3>
    <dl>{fields.map(([label, value]) => <div key={label} className={label === 'VIN' ? 'deal-wide' : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <dl className="deal-handoff-details">
      <div><dt>Dealer contact</dt><dd>{text(d.dealership_contact)}</dd></div>
      <div><dt>Salesman / broker</dt><dd>{text(d.dealership_phone)}</dd></div>
      <div className="deal-wide"><dt>Paperwork</dt><dd>{paperwork[d.paperwork_status] || text(d.paperwork_status)}</dd></div>
    </dl>
    {d.is_trade && <div className="deal-trade-details">
      <h4>{d.trade_kind === 'lease_return' ? 'Lease return vehicle' : 'Trade vehicle'}</h4>
      <p>{text([d.trade_year, d.trade_make, d.trade_model].filter(Boolean).join(' '))}</p>
      <p>VIN: {text(d.trade_vin)}</p>
    </div>}
  </section>
}

export const DRAFT_TEXT_FIELDS = ['customer_name','customer_phone','delivery_address','delivery_date','delivery_time','dealer_by_time','cust_window_start','cust_window_end','cust_window_text','dealership_name','dealership_address','dealership_contact','dealership_phone','driver1_name','driver2_name','vin','vyear','make','model','color','monthly_payment','miles_per_year','contract_type','trade_kind','trade_year','trade_make','trade_model','trade_vin','trade_notes','trade_destination','trade_return_dealer','return_plan','admin_notes','cod_amount','cod_made_out_to','cod_type'];
export function cleanDraft(input = {}) {
  const draft = {};
  for (const key of DRAFT_TEXT_FIELDS) {
    const value = input[key];
    if (value !== null && value !== undefined && !['string','number'].includes(typeof value)) throw Error('Invalid '+key.replaceAll('_',' '));
    const text = String(value ?? '').trim();
    if (text.length > (['admin_notes','trade_notes'].includes(key) ? 4000 : 500)) throw Error('Value too long: '+key.replaceAll('_',' '));
    draft[key] = text || null;
  }
  if (!draft.customer_name) throw Error('Customer name is required.');
  if (draft.delivery_date && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.delivery_date) || Number.isNaN(Date.parse(draft.delivery_date+'T12:00:00Z')) || new Date(draft.delivery_date+'T12:00:00Z').toISOString().slice(0,10) !== draft.delivery_date)) throw Error('Choose a valid delivery date.');
  for (const key of ['dealer_by_time','cust_window_start','cust_window_end']) if(draft[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft[key])) throw Error('Choose a valid time.');
  if (draft.cust_window_start && draft.cust_window_end && draft.cust_window_end < draft.cust_window_start) throw Error('Customer window ends before it starts.');
  if (draft.driver1_name && draft.driver1_name.toLowerCase() === draft.driver2_name?.toLowerCase()) throw Error('Choose two different drivers.');
  for (const key of ['is_trade','cod_required']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') throw Error('Invalid '+key);
    draft[key] = input[key] === true;
  }
  const pay = input.pay_amount === '' || input.pay_amount == null ? 100 : Number(input.pay_amount);
  if (!Number.isFinite(pay) || pay < 0 || pay > 100000 || Math.abs(Math.round(pay*100)-pay*100)>0.000001) throw Error('Enter valid pay per driver.');
  draft.pay_amount = pay;
  if (draft.trade_kind && !['trade','lease_return'].includes(draft.trade_kind)) throw Error('Choose trade or lease return.');
  if (draft.trade_destination && !['office','dealer'].includes(draft.trade_destination)) throw Error('Choose a valid trade destination.');
  if (draft.cod_required && (!draft.cod_amount || !Number.isFinite(Number(draft.cod_amount)) || Number(draft.cod_amount)<0)) throw Error('Enter a valid COD amount.');
  return draft;
}
export function deliveryPrefill(lead = {}) {
  const f = lead.customer_file || {}, deal = f.deal || {}, trade = f.trade || {};
  const text = v => v == null ? '' : String(v);
  return {
    customer_name: [lead.first_name,lead.last_name].filter(Boolean).join(' '), customer_phone: lead.phone || '',
    delivery_address: [lead.street,lead.city,[lead.state,lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    delivery_date: deal.expected || '', vin: deal.vin || '', vyear: text(deal.year), make: deal.make || '',
    model: [deal.model,deal.trim].filter(Boolean).join(' ') || lead.vehicle_interest || '', color: lead.color_specific || (lead.color_pref === 'Something specific' ? '' : lead.color_pref) || '',
    monthly_payment: text(deal.payment), miles_per_year: text(deal.miles), contract_type: deal.type || '',
    dealership_phone: lead.assigned_to || (lead.broker_name === 'Other' ? lead.broker_other : lead.broker_name) || '',
    is_trade: !!f.trade || /^yes$/i.test(lead.has_trade || ''), trade_kind: trade.kind === 'Lease return' ? 'lease_return' : 'trade',
    trade_year: text(trade.year || lead.trade_year), trade_make: trade.make || lead.trade_make || '', trade_model: trade.model || lead.trade_model || '',
    trade_vin: trade.vin || lead.trade_vin || '', trade_notes: trade.notes || '', trade_destination: 'office',
    admin_notes: `Landing lead #${lead.lead_number || ''}`, pay_amount: 100, cod_required: false,
  };
}
export const isDraftEditable = d => !!d && !d.is_ready && !d.archived && !d.delivered_at && d.status === 'assigned';
export const normalizedPhone = value => String(value || '').replace(/\D/g,'').slice(-10);
export const normalizedName = value => String(value || '').trim().replace(/\s+/g,' ').toLowerCase();
export function deliveryMatches(delivery, customer) {
  const phone = normalizedPhone(customer.phone);
  return (phone.length === 10 && phone === normalizedPhone(delivery.customer_phone))
    || (!!normalizedName(customer.name) && normalizedName(customer.name) === normalizedName(delivery.customer_name));
}

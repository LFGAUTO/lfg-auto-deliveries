import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PhotoGallery, deliveryPhotos } from '../components/DeliveryPhotos'

export default function Photos() {
  const [rows, setRows] = useState([]), [issues, setIssues] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(''), [kind, setKind] = useState('Customer'), [month, setMonth] = useState(''), [limit, setLimit] = useState(20)
  async function load() {
    setLoading(true); setError('')
    try {
      const all = [], reports = []
      for (const [table, target] of [['deliveries', all], ['issues', reports]]) {
        for (let start = 0; ; start += 500) {
          const { data, error } = await supabase.from(table).select('*').order('id').range(start, start + 499)
          if (error) throw Error(error.message)
          target.push(...(data || [])); if (!data || data.length < 500) break
        }
      }
      all.sort((a,b) => String(b.delivered_at || b.delivery_date || '').localeCompare(String(a.delivered_at || a.delivery_date || '')))
      setRows(all); setIssues(reports)
    } catch (e) { setError(e.message || 'Could not load photos. Try again.') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const visible = rows.filter(d => [d.customer_name,d.make,d.model,d.driver1_name,d.driver2_name].join(' ').toLowerCase().includes(query.toLowerCase()) && (!month || String(d.delivery_date || d.delivered_at || '').startsWith(month)) && deliveryPhotos(d, issues).some(p => kind === 'All' || p.category === 'Customer'))
  return <><h1 className="h1">Photos</h1><p className="sub">Customer photos first · active and archived deliveries</p>
    <div className="btnrow"><button className={'btn '+(kind === 'Customer'?'gold':'ghost')} onClick={() => {setKind('Customer');setLimit(20)}}>Customer photos</button><button className={'btn '+(kind === 'All'?'gold':'ghost')} onClick={() => {setKind('All');setLimit(20)}}>All delivery photos</button><button className="btn ghost" onClick={load} disabled={loading}>Refresh</button></div>
    <div className="fg2" style={{marginTop:16}}><label className="fld"><span>Search customer, vehicle or driver</span><input value={query} onChange={e => {setQuery(e.target.value);setLimit(20)}} /></label><label className="fld"><span>Delivery month</span><input type="month" value={month} onChange={e => {setMonth(e.target.value);setLimit(20)}} /></label></div>
    {error && <p role="alert">{error}</p>}{loading ? <p>Loading photos…</p> : <><p className="meta">{visible.length} deliveries with photos</p>{visible.slice(0,limit).map(d => <article className="card" style={{marginBottom:20}} key={d.id}><h2>{d.customer_name}</h2><p className="meta">{d.delivery_date || ''} · {[d.year,d.make,d.model].filter(Boolean).join(' ')} · {d.archived?'Archived':'Active'}</p><PhotoGallery key={`${d.id}-${kind}`} delivery={d} issues={issues} customerOnly={kind === 'Customer'}/></article>)}{visible.length>limit && <button className="btn gold" onClick={()=>setLimit(limit+20)}>Show more deliveries</button>}</>}
  </>
}

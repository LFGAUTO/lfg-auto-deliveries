import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PhotoGallery } from '../components/DeliveryPhotos'
import { outstanding, nextAction, easternDay } from '../lib/workflow'

export function auditItems(d) {
  const items=[]
  if(!d.is_ready&&!d.archived)items.push('Draft · not live')
  if(!d.driver1_name&&!d.driver2_name&&!d.archived)items.push('Driver needed')
  if(!d.delivery_date&&!d.archived)items.push('Delivery date needed')
  if(d.is_ready&&!d.delivered_at&&!d.archived&&d.delivery_date&&d.delivery_date<easternDay())items.push('Past scheduled delivery date')
  if(d.delivered_at){
    if(d.closeout_required)items.push(...outstanding(d))
    if(!d.client_photo_url&&!d.client_photo_refused)items.push('Customer photo missing')
    if(!d.task_photo_contract&&!d.e_contract)items.push('Contract photo missing')
  }
  if(d.status==='issue')items.push('Delivery issue needs review')
  return items
}
export default function ObserverPortal(){
 const {signOut}=useAuth(),[rows,setRows]=useState([]),[error,setError]=useState(''),[updated,setUpdated]=useState(''),[query,setQuery]=useState(''),[view,setView]=useState('Active'),[loading,setLoading]=useState(true),[limit,setLimit]=useState(30)
 useEffect(()=>{let active=true,working=false;async function refresh(){if(working)return;working=true;try{const {data,error}=await supabase.rpc('observer_deliveries');if(error)throw error;if(active){setRows(data||[]);setError('');setUpdated(new Date().toLocaleString())}}catch(e){if(active)setError(e.message||'Could not refresh deliveries')}finally{working=false;if(active)setLoading(false)}}refresh();const timer=setInterval(refresh,30000);return()=>{active=false;clearInterval(timer)}},[])
 const filtered=rows.filter(d=>[d.customer_name,d.make,d.model,d.driver1_name,d.driver2_name,d.dealership_name].join(' ').toLowerCase().includes(query.toLowerCase())&&(view==='All'||view==='Photos'&&d.client_photo_url||view==='Attention'&&auditItems(d).length||view==='Active'&&!d.archived))
 return <main className="app"><header className="topbar"><div className="brand">LFG <span className="gold">AUTO</span></div><button className="btn ghost sm" onClick={signOut}>Sign Out</button></header><div className="content"><h1>Delivery monitor</h1><p className="sub">Grokbot · read-only operations and customer photos</p><p className="meta">Refreshes every 30 seconds. Last successful refresh: {updated||'Waiting…'}</p><p className="meta">Edits and payroll are unavailable here. Photo downloads include customer photos only.</p><div className="btnrow">{['Active','Attention','Photos','All'].map(v=><button key={v} className={'btn '+(view===v?'gold':'ghost')} onClick={()=>{setView(v);setLimit(30)}}>{v}</button>)}</div><label className="fld" style={{marginTop:14}}><span>Search customer, vehicle, dealer or driver</span><input value={query} onChange={e=>{setQuery(e.target.value);setLimit(30)}}/></label>{error&&<p role="alert">Refresh failed: {error}. Previously loaded results may be out of date.</p>}{loading?<p>Loading…</p>:<><p>{filtered.length} deliveries</p>{filtered.slice(0,limit).map(d=><article className="card" key={d.id} style={{marginBottom:16}}><h2>{d.customer_name}</h2><p>{[d.year,d.make,d.model].filter(Boolean).join(' ')} · {d.delivery_date||'Date needed'}</p><p>{d.is_ready?'Live':'Draft'} · {d.status} · {d.archived?'Archived':'Active'} · {[d.driver1_name,d.driver2_name].filter(Boolean).join(' & ')||'Unassigned'}</p><p>Dealer: {d.dealership_name||'Not provided'}</p><p>Next action: {nextAction(d)}</p><p>Paperwork: {d.paperwork_status||'Pending'} · Trade: {d.is_trade?(d.trade_returned_at?'Returned':'Return pending'):'None'}</p>{auditItems(d).length>0&&<ul>{auditItems(d).map(item=><li key={item}>{item}</li>)}</ul>}{d.issues?.length>0&&<details><summary>Issue history ({d.issues.length})</summary>{d.issues.map((i,n)=><p key={n}>{i.type} · {i.created_at} · {i.resolved?'Resolved':'Check status'}</p>)}</details>}{d.client_photo_url?<PhotoGallery delivery={d} customerOnly/>:<p className="meta">{d.client_photo_refused?'Customer declined photo':'No customer photo yet'}</p>}</article>)}{filtered.length>limit&&<button className="btn gold" onClick={()=>setLimit(limit+30)}>Show more</button>}</>}</div></main>
}

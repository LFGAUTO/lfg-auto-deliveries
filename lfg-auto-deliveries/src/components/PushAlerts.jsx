import {useEffect,useState} from 'react'
import {enablePhone,needsHomeScreen,phoneIdentity,phoneRequest,preparePush,pushRequest} from '../lib/push'
import useRefresh from '../hooks/useRefresh'
const time=s=>s?new Date(s).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''
export function PhoneAlerts({drivers,onPhone}) {
 const [driver,setDriver]=useState(''),[phone,setPhone]=useState(null),[prepared,setPrepared]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const home=needsHomeScreen()
 const supported='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
 async function setup() {
  setError('')
  try {
   if(supported&&!home)setPrepared(await preparePush())
   if(phoneIdentity()){const d=await phoneRequest('device');setPhone(d);setDriver(d.driver_name);onPhone(d.driver_name)}
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{setup()},[])
 async function enable(){
  setBusy(true);setError('');setMessage('')
  try{await enablePhone(driver,prepared);setPhone({driver_name:driver,active:true});onPhone(driver);setMessage('Alerts enabled. Send a test alert next.')}
  catch(e){setError(Notification.permission==='denied'?'Notifications are blocked. Allow them in your phone’s Settings, then reopen this app.':e.message)}finally{setBusy(false)}
 }
 async function test(){setBusy(true);setError('');try{await phoneRequest('test');setMessage('Test accepted by push service. Check your notification screen.')}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function disable(){setBusy(true);try{await phoneRequest('disable');const sub=await prepared?.registration.pushManager.getSubscription();await sub?.unsubscribe();setPhone({...phone,active:false});setMessage('Alerts turned off for this phone.')}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="card" style={{marginBottom:16}}><h2 className="section-title">Alerts on this phone</h2>
 {home?<p>Add this app to your iPhone Home Screen: Share → Add to Home Screen. Open the new icon, sign in, then enable alerts here.</p>:!supported?<p>This browser does not support push alerts. Use an up-to-date phone browser.</p>:<>
 <p className="meta">{phone?.active?'Enabled for '+phone.driver_name:'Choose who uses this phone.'} Browsing another driver’s deliveries will not change these alerts.</p>
 <label className="fld"><span>This phone belongs to</span><select value={driver} disabled={busy||phone?.active} onChange={e=>setDriver(e.target.value)}><option value="">Choose driver</option>{drivers.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select></label>
 <div className="btnrow">{phone?.active?<><button className="btn gold" disabled={busy} onClick={test}>Send test alert</button><button className="btn ghost" disabled={busy} onClick={disable}>Turn off / change driver</button></>:<button className="btn gold" disabled={busy||!driver||!prepared} onClick={enable}>{busy?'Saving…':'Enable alerts'}</button>}{!prepared&&<button className="btn ghost" onClick={setup}>Retry setup</button>}</div></>}
 {message&&<p role="status">{message}</p>}{error&&<p className="error-banner" role="alert">{error}</p>}</section>
}
export function DriverAcknowledgment({job,phone,onSaved}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function ack(){setBusy(true);try{await phoneRequest('ack',{job_id:job.id});await onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(!phone||!job)return null
 return <div className="return-row">{job.acknowledged_at?<span>✓ {phone} acknowledged at {time(job.acknowledged_at)}</span>:<button className="btn gold" disabled={busy} onClick={ack}>Got it · {phone}</button>}{error&&<p role="alert">{error}</p>}</div>
}
export function DispatchAlerts(){
 const [jobs,setJobs]=useState([]),[error,setError]=useState(''),[phones,setPhones]=useState([])
 async function load(){try{const r=await pushRequest('status');setJobs(r.jobs);setPhones(r.phones);setError('')}catch(e){setError(e.message)}}
 useRefresh(load)
 const pending=jobs.filter(j=>!j.acknowledged_at&&j.status!=='cancelled')
 async function retry(j){try{await pushRequest('retry',{job_id:j.id});await pushRequest('drain');await load()}catch(e){setError(e.message)}}
 return <details className="activity-details" open={pending.length>0}><summary>Driver alerts · {pending.length} awaiting acknowledgment · {new Set(phones).size} drivers enabled</summary>
 {error&&<p role="alert">{error}</p>}{!jobs.length&&<p className="meta">Alerts will appear when a delivery is made live.</p>}
 {jobs.slice(0,40).map(j=><div className="return-row" key={j.id}><strong>{j.driver_name}</strong> · {j.acknowledged_at?'Acknowledged '+time(j.acknowledged_at):({queued:'Queued',sending:'Sending',accepted:'Push accepted · awaiting Got it',no_device:'No phone enabled',failed:'Send failed'})[j.status]}
 <p className="meta">Published {new Date(j.created_at).toLocaleString()} · {j.deliveries?.customer_name || "Delivery"}{!j.acknowledged_at&&Date.now()-Date.parse(j.created_at)>600000?' · Follow up with driver':''}</p>
 {['failed','no_device'].includes(j.status)&&!j.acknowledged_at&&<button className="btn ghost sm" onClick={()=>retry(j)}>Retry alert</button>}</div>)}</details>
}

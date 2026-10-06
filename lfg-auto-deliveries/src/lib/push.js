import { supabase } from './supabase'
const DEVICE_KEY='lfg-push-phone-v1'
export function phoneIdentity() {
 try { return JSON.parse(localStorage.getItem(DEVICE_KEY)) } catch { return null }
}
function newIdentity() {
 const bytes=crypto.getRandomValues(new Uint8Array(32))
 const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
 const identity={device_id:crypto.randomUUID(),device_token:token}
 localStorage.setItem(DEVICE_KEY,JSON.stringify(identity));return identity
}
export async function pushRequest(action,extra={}) {
 const {data,error}=await supabase.functions.invoke('driver-push',{body:{action,...extra}})
 if(error||data?.error){
  let reason=data?.error
  if(!reason&&error?.context){try{reason=(await error.context.json()).error}catch{}}
  throw new Error(reason||'Alert request failed. Check your connection and try again.')
 }
 return data
}
export function phoneRequest(action,extra={}) {return pushRequest(action,{...phoneIdentity(),...extra})}
export function needsHomeScreen() {
 return (/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone
}
export async function preparePush() {
 if(!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Push alerts are not supported by this browser.')
 const [{publicKey},registration]=await Promise.all([pushRequest('config'),navigator.serviceWorker.register('/sw.js')])
 await navigator.serviceWorker.ready
 const binary=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'))
 return {registration,key:Uint8Array.from(binary,c=>c.charCodeAt(0))}
}
export async function enablePhone(driver,prepared) {
 // Called immediately from the tap: keep subscribe within the iPhone user gesture.
 const sub=await prepared.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:prepared.key})
 const identity=phoneIdentity()||newIdentity()
 await pushRequest('register',{...identity,driver_name:driver,subscription:sub.toJSON()})
 return driver
}

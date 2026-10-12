import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'

test('arrival guides name selection, reports rejected saves, and updates before a slow audit',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/driver'})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.arrival={d:{id:'arrival',status:'assigned',is_ready:true,archived:false,customer_name:'Arrival Test',driver1_name:'Mike',delivery_date:'2026-10-12'},writes:[],fail:false,pending:null}
 const db=`export const supabase={from(table){let patch;const q={select(){return q},single(){return q},order(){return q},or(){return q},eq(){return q},gte(){return q},lte(){return q},update(p){patch=p;return q},insert(){return q},then(resolve,reject){const f=globalThis.arrival;if(table==='activity_log')return new Promise(()=>{});if(patch){f.writes.push(patch);if(f.fail)return Promise.resolve({error:{message:'Connection failed'}}).then(resolve,reject);return new Promise(r=>f.pending=()=>{f.d={...f.d,...patch};r({data:f.d})}).then(resolve,reject)}return Promise.resolve({data:table==='drivers_roster'?[{id:'m',name:'Mike'}]:table==='deliveries'?[f.d]:[]}).then(resolve,reject)}};return q}}`
 const dir=await mkdtemp(path.resolve('.ui-test-'))
 const bundle=await build({entryPoints:['src/pages/DriverPortal.jsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^react(?:\/|$)/},a=>({path:a.path,external:true}))
 b.onResolve({filter:/\/supabase$/},()=>({path:'db',namespace:'mock'}))
 b.onResolve({filter:/context\/AuthContext$/},()=>({path:'auth',namespace:'mock'}))
 b.onResolve({filter:/components\/Toast$/},()=>({path:'toast',namespace:'mock'}))
 b.onResolve({filter:/hooks\/useRefresh$/},()=>({path:'refresh',namespace:'mock'}))
 b.onResolve({filter:/components\/PushAlerts$/},()=>({path:'push',namespace:'mock'}))
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='db'?db:a.path==='auth'?`export const useAuth=()=>({profile:{id:'driver'},userName:'driver',signOut(){}})`:a.path==='toast'?`export const useToast=()=>()=>{}`:a.path==='push'?`export const PhoneAlerts=()=>null;export const DriverAcknowledgment=()=>null`:`import {useEffect} from 'react';export default function useRefresh(fn){useEffect(()=>{fn()},[])}`,loader:'js'}))
 }}]})
 const file=path.join(dir,'arrival.mjs');await writeFile(file,bundle.outputFiles[0].text)
 const {default:Driver}=await import(pathToFileURL(file));const root=createRoot(document.getElementById('root'))
 const button=()=>[...document.querySelectorAll('button')].find(b=>/dealer →|Saving arrival/.test(b.textContent))
 try{
 await act(async()=>root.render(React.createElement(Driver)))
 await act(async()=>button().click())
 assert.match(document.querySelector('[role="alert"]').textContent,/Choose your name/)
 assert.equal(arrival.writes.length,0)
 const picker=document.querySelector('.driver-picker select')
 await act(async()=>{picker.value='Mike';picker.dispatchEvent(new window.Event('change',{bubbles:true}))})
 arrival.fail=true
 await act(async()=>button().click())
 assert.match(document.querySelector('[role="alert"]').textContent,/Could not save At Dealer/)
 assert.equal(arrival.d.status,'assigned')
 assert.equal(button().disabled,false)
 arrival.fail=false
 await act(async()=>button().click())
 assert.equal(button().textContent,'Saving arrival…');assert.equal(button().disabled,true)
 await act(async()=>arrival.pending())
 assert.ok(document.body.textContent.includes('Vehicle checked · En route →'))
 assert.equal(arrival.d.status,'at_dealer')
 assert.ok(arrival.d.at_dealer_at)
 assert.equal(document.querySelector('[role="alert"]'),null)
 }finally{await act(async()=>root.unmount());await rm(dir,{recursive:true,force:true});dom.window.close()}
})

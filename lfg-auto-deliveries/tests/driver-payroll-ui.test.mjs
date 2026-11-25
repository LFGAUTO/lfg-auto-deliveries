import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

test('payroll shows own itemized pay, history, errors and no false loading totals', async () => {
  const dom = new JSDOM('<div id="root"></div>',{url:'https://test/driver/payroll?driver=AnotherDriver'})
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})
  globalThis.payrollTest={calls:[],resolve:null}
  const dir=await mkdtemp(path.resolve('.payroll-ui-'))
  const bundle=await build({entryPoints:['src/pages/DriverPayroll.jsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'fixture',setup(b){
    b.onResolve({filter:/context\/AuthContext$/},()=>({path:'auth',namespace:'mock'}))
    b.onResolve({filter:/\/supabase$/},()=>({path:'db',namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='auth'?`export const useAuth=()=>({userName:'Driver One',driverName:'Driver One',isAdmin:false,signOut(){}})`:`export const supabase={from(){throw Error('No table access allowed')},rpc(name,{payload}){globalThis.payrollTest.calls.push({name,payload});return new Promise(resolve=>globalThis.payrollTest.resolve=resolve)}}`,loader:'js'}))
  }}]})
  const f=path.join(dir,'page.mjs');await writeFile(f,bundle.outputFiles[0].text)
  const {default:Page}=await import(pathToFileURL(f));const root=createRoot(document.querySelector('#root'))
  const click=async label=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===label).click())
  try {
    await act(async()=>root.render(React.createElement(Page)))
    assert.ok(document.body.textContent.includes('Loading payroll'))
    assert.ok(!document.body.textContent.includes('$0'))
    assert.deepEqual(payrollTest.calls[0],{name:'driver_payroll',payload:{week_offset:0}})
    const data={label:'Nov 21 – Nov 27',count:1,total:145,delivery_total:125,extra_total:20,payment:{amount:100,deliveries:1},entries:[{id:'shared',customer_name:'Sample customer',make:'Nissan',model:'Pathfinder SL',delivered_at:'2026-11-24T16:00:00Z',base:100,adjustment:25,adjustment_note:'Long trip',amount:125,shared:true}],extras:[{id:'extra',work_date:'2026-11-24',category:'Waiting',amount:20}]}
    await act(async()=>payrollTest.resolve({data}))
    for(const text of ['Sample customer','$145.00','$125.00','$45.00','Two-driver run','your pay only','Long trip','Waiting','Adjusted after payment']) assert.ok(document.body.textContent.includes(text),text)
    await click('← Previous week')
    assert.equal(payrollTest.calls.at(-1).payload.week_offset,-1)
    assert.ok(!document.body.textContent.includes('Sample customer'),'stale details clear while loading')
    await act(async()=>payrollTest.resolve({error:{message:'offline'}}))
    assert.ok(document.querySelector('[role="alert"]'))
    assert.ok(!document.body.textContent.includes('$0'))
    await click('Refresh payroll')
    await act(async()=>payrollTest.resolve({data:{...data,entries:[],extras:[],payment:null,total:0,count:0,delivery_total:0,extra_total:0}}))
    assert.ok(document.body.textContent.includes('No completed deliveries'))
    assert.ok(payrollTest.calls.every(x=>!('driver_name' in x.payload)))
  } finally {await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});delete globalThis.payrollTest}
})

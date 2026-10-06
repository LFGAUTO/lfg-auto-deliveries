import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// Component integration test: no browser, live network, or production data.
test('driver handoff preserves its draft on failure and dispatch calls Jess', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/driver' })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.confirm = () => true
  const d = { id: 'test-job', status: 'en_route', is_ready: true, archived: false, customer_name: 'Test Customer', customer_phone: '5555555555', driver1_name: 'Mike', make: 'Nissan', model: 'Rogue', delivery_date: '2026-10-06', cod_required: true, cod_amount: '555', cod_type: 'Check', cod_made_out_to: 'LFG AUTO LLC', paperwork_status: 'pending' }
  globalThis.fixture = { d, writes: [], messages: [], fail: true }
  localStorage.setItem('lfg-driver-name', 'Mike')
  localStorage.setItem('lfg_deliver_draft_test-job', JSON.stringify({ sig: 'test-signature', ok: true, eContract: true, refusedPic: true }))
  const mockDB = `export const supabase = { from(table) { let patch, selection; const q = { select(s) {selection=s;return q}, order(){return q}, or(){return q}, eq(){return q}, gte(){return q}, lte(){return q}, delete(){return q}, upsert(){return q}, insert(p){patch=p;return q}, update(p){patch=p;return q}, then(resolve,reject) {const f=globalThis.fixture;if(patch){f.writes.push({table,patch});return Promise.resolve({error:table==='deliveries'&&f.fail?{message:'test failure'}:null,data:[]}).then(resolve,reject)}return Promise.resolve({data:table==='drivers_roster'?[{id:'m',name:'Mike'}]:table==='deliveries'?(selection?.startsWith('pay_amount')?[]:[f.d]):[],error:null}).then(resolve,reject)}};return q} };`
  const dir = await mkdtemp(path.resolve('.ui-test-'))
  const bundle = await build({ entryPoints: ['src/pages/DriverPortal.jsx'], bundle:true, write:false, format:'esm', platform:'node', packages:'external', jsx:'automatic', plugins:[{name:'offline-fixtures',setup(b){
    b.onResolve({filter:/^react(?:\/|$)/}, a=>({path:a.path,external:true}))
    b.onResolve({filter:/lib\/supabase$/},()=>({path:'db',namespace:'mock'}))
    b.onResolve({filter:/context\/AuthContext$/},()=>({path:'auth',namespace:'mock'}))
    b.onResolve({filter:/components\/Toast$/},()=>({path:'toast',namespace:'mock'}))
    b.onResolve({filter:/components\/SignaturePad$/},()=>({path:'signature',namespace:'mock'}))
    b.onResolve({filter:/hooks\/useRefresh$/},()=>({path:'refresh',namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='db'?mockDB:a.path==='auth'?`export const useAuth=()=>({profile:{id:'u'},userName:'driver',isAdmin:false,signOut:()=>{}})`:a.path==='toast'?`export const useToast=()=>message=>globalThis.fixture.messages.push(message)`:a.path==='refresh'?`import {useEffect} from 'react'; export default function useRefresh(load){useEffect(()=>{load()},[])}`:`export default function SignaturePad(){return null}`,loader:'js'}))
  }}] })
  const file = path.join(dir,'driver.mjs'); await writeFile(file,bundle.outputFiles[0].text)
  const {default:Driver} = await import(pathToFileURL(file))
  const root = createRoot(document.getElementById('root'))
  const click = async text => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,`button ${text}`); await act(async()=>b.click()) }
  try {
    await act(async()=>root.render(React.createElement(Driver)))
    assert.equal(document.querySelector('a[href="tel:+17325470333"]').textContent,'Contact dispatch · Jess')
    assert.ok(!document.body.textContent.includes('Call dealer'))
    await click('Complete customer handoff →')
    await click('3. Sign off')
    await click('Confirm Delivered')
    assert.ok(fixture.messages.at(-1).includes('Confirm COD'))
    await click('1. Handoff')
    const cod=[...document.querySelectorAll('label')].find(l=>l.textContent==='COD collected').querySelector('input')
    await act(async()=>cod.click())
    await click('3. Sign off')
    await click('Confirm Delivered')
    assert.ok(localStorage.getItem('lfg_deliver_draft_test-job'),'failed save keeps draft')
    assert.ok(fixture.messages.at(-1).includes('test failure'))
    fixture.fail=false
    await click('Confirm Delivered')
    assert.equal(localStorage.getItem('lfg_deliver_draft_test-job'),null)
    const patch=fixture.writes.filter(x=>x.table==='deliveries').at(-1).patch
    assert.equal(patch.cod_received,true)
    assert.equal(patch.closeout_required,true)
    assert.equal(patch.archived,true)
    assert.equal(patch.completed_by_name,'Mike')
  } finally { await act(async()=>root.unmount()); dom.window.close(); await rm(dir,{recursive:true,force:true}); delete globalThis.fixture }
})

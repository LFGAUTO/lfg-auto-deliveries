import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import React,{act} from 'react'

test('open delivery edits survive roster and record refreshes, then save the entered date',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/deliveries'})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const {createRoot}=await import('react-dom/client')
 globalThis.deliveryFormFixture={patch:null,closed:0}
 const dir=await mkdtemp(path.resolve('.ui-test-'))
 const bundle=await build({entryPoints:['src/components/DeliveryForm.jsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/\/supabase$/},()=>({path:'db',namespace:'mock'}))
 b.onResolve({filter:/context\/AuthContext$/},()=>({path:'auth',namespace:'mock'}))
 b.onResolve({filter:/\/Toast$/},()=>({path:'toast',namespace:'mock'}))
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='auth'?`export const useAuth=()=>({profile:{id:'admin'},userName:'Jess'})`:a.path==='toast'?`export const useToast=()=>()=>{}`:`export const supabase={from(){const q={update(p){globalThis.deliveryFormFixture.patch=p;return q},eq(){return q},select(){return q},order(){return q},range(){return Promise.resolve({data:[{dealership_name:'Test Dealer',dealership_address:'123 Test Street',dealership_contact:'Dealer contact',dealership_phone:'Test salesman',make:'Example',model:'SUV'}]})},single(){return Promise.resolve({data:{id:'delivery'}})},insert(){return Promise.resolve({})}};return q}}`,loader:'js'}))
 }}]})
 const file=path.join(dir,'form.mjs');await writeFile(file,bundle.outputFiles[0].text)
 const {default:Form}=await import(pathToFileURL(file));const root=createRoot(document.getElementById('root'))
 const existing={id:'delivery',customer_name:'Example customer',delivery_date:null,customer_phone:null}
 const render=async(record=existing)=>act(async()=>root.render(React.createElement(Form,{existing:record,drivers:[{id:'driver',name:'Example driver'}],onClose:()=>deliveryFormFixture.closed++,onSaved:()=>{}})))
 const field=label=>[...document.querySelectorAll('label')].find(l=>l.querySelector('span')?.textContent===label).querySelector('input,select')
 const set=async(label,value)=>{const input=field(label),key=Object.keys(input).find(k=>k.startsWith('__reactProps$'));await act(async()=>input[key].onChange({target:{value,type:input.type}}))}
 try{
 await render();await set('Dealership Name','Test Dealer');assert.equal(field('Dealer pickup address').value,'123 Test Street');assert.equal(field('Dealership Contact').value,'Dealer contact');await set('Salesman','Test salesman');await set('Delivery Date','2026-10-16');await set('Customer Phone','7325550100');await set('Driver 1','__other__');await set('Driver 1 Name (write in)','Temporary driver')
 const phone=field('Customer Phone');phone.focus()
 await render();await render({...existing})
 assert.equal(field('Delivery Date').value,'2026-10-16');assert.equal(field('Customer Phone').value,'7325550100');assert.equal(field('Driver 1 Name (write in)').value,'Temporary driver');assert.equal(document.activeElement,phone);assert.equal(deliveryFormFixture.closed,0)
 const save=[...document.querySelectorAll('button')].find(b=>/Save/.test(b.textContent));assert(save)
 await act(async()=>save.click());assert.equal(deliveryFormFixture.patch.dealership_address,'123 Test Street');assert.equal(deliveryFormFixture.patch.dealership_phone,'Test salesman');assert.equal(deliveryFormFixture.patch.delivery_date,'2026-10-16');assert.equal(deliveryFormFixture.patch.customer_phone,'7325550100');assert.equal(deliveryFormFixture.closed,1)
 await render({id:'other',customer_name:'Another customer',delivery_date:'2026-10-20'});assert.equal(field('Customer Name').value,'Another customer');assert.equal(field('Delivery Date').value,'2026-10-20')
 await render(null);await set('Customer Name','New customer');await set('Delivery Date','2026-10-16');await render(null);assert.equal(field('Customer Name').value,'New customer');assert.equal(field('Delivery Date').value,'2026-10-16')
 }finally{await act(async()=>root.unmount());await rm(dir,{recursive:true,force:true});dom.window.close()}
})

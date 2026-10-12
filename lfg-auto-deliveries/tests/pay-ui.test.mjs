import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
test('archived pay edit validates amounts and changes only payroll fields',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/archive'})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.payFixture={patch:null,saved:0}
 const dir=await mkdtemp(path.resolve('.ui-test-'))
 const bundle=await build({entryPoints:['src/components/DeliveryPay.jsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^react(?:\/|$)/},a=>({path:a.path,external:true}))
 b.onResolve({filter:/\/supabase$/},()=>({path:'db',namespace:'mock'}))
 b.onResolve({filter:/context\/AuthContext$/},()=>({path:'auth',namespace:'mock'}))
 b.onResolve({filter:/\/Toast$/},()=>({path:'toast',namespace:'mock'}))
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='auth'?`export const useAuth=()=>({isAdmin:true,profile:{id:'admin'},userName:'Jess'})`:a.path==='toast'?`export const useToast=()=>()=>{}`:`export const supabase={from(){const q={update(p){globalThis.payFixture.patch=p;return q},eq(){return q},select(){return q},single(){return Promise.resolve({data:{id:'delivery'}})},insert(){return Promise.resolve({})}};return q}}`,loader:'js'}))
 }}]})
 const file=path.join(dir,'pay.mjs');await writeFile(file,bundle.outputFiles[0].text)
 const {default:Pay}=await import(pathToFileURL(file));const root=createRoot(document.getElementById('root'))
 const click=async label=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===label);await act(async()=>b.click())}
 const set=async(input,value)=>{const props=Object.keys(input).find(k=>k.startsWith('__reactProps$'));await act(async()=>input[props].onChange({target:{value}}))}
 try{
 await act(async()=>root.render(React.createElement(Pay,{delivery:{id:'delivery',pay_amount:100,pay_adjust:0,pay_adjust_note:''},onSaved:()=>payFixture.saved++})))
 await click('Edit delivery pay');const [base,extra]=document.querySelectorAll('input')
 await click('Save delivery pay')
 assert.equal(payFixture.patch,null);assert.match(document.querySelector('[role=alert]').textContent,/reason/)
 await set(base,'150');await set(extra,'25');await set(document.querySelector('textarea'),'Long delivery')
 await click('Save delivery pay')
 assert.deepEqual(payFixture.patch,{pay_amount:150,pay_adjust:25,pay_adjust_note:'Long delivery'})
 assert.equal(payFixture.saved,1)
 assert.ok(!('status' in payFixture.patch));assert.ok(!('archived' in payFixture.patch))
 }finally{await act(async()=>root.unmount());await rm(dir,{recursive:true,force:true});dom.window.close()}
})

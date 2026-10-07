import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

test('push renews a rejected session once and never retries an uncertain send',async()=>{
 const source=(await readFile('src/lib/push.js','utf8')).replace("import { supabase } from './supabase'",'').replaceAll('export ','')+'\nglobalThis.request=pushRequest'
 let calls=[],refreshes=0,status=401
 const context=vm.createContext({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'old'}}}),refreshSession:async()=>{refreshes++;return {data:{session:{access_token:'fresh'}}}}},functions:{invoke:async(_,options)=>{calls.push(options);return calls.length===1?{error:{context:{status,json:async()=>({error:'Rejected'})}}}:{data:{ok:true}}}}}})
 vm.runInContext(source,context)
 assert.equal((await context.request('test')).ok,true)
 assert.equal(refreshes,1)
 assert.equal(calls[0].headers.Authorization,'Bearer old')
 assert.equal(calls[1].headers.Authorization,'Bearer fresh')
 calls=[];refreshes=0;status=500
 await assert.rejects(context.request('test'),/Rejected/)
 assert.equal(calls.length,1);assert.equal(refreshes,0)
})

test('auth event callback releases the auth lock before loading a profile',async()=>{
 const {transform}=await import('esbuild')
 let callback,cleanup,fromCalls=0
 const effects=[]
 const source=(await readFile('src/context/AuthContext.jsx','utf8')).replace(/^import .*$/gm,'').replaceAll('export ','')+'\nglobalThis.Provider=AuthProvider'
 const js=await transform(source,{loader:'jsx'})
 const context=vm.createContext({createContext:()=>({Provider:()=>null}),useContext:()=>{},useState:()=>[null,()=>{}],useEffect:fn=>effects.push(fn),React:{createElement:()=>null},supabase:{auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}}}},from:()=>{fromCalls++;throw Error('auth lock held')}}})
 vm.runInContext(js.code,context)
 context.Provider({children:null})
 cleanup=effects[0]()
 assert.equal(callback('TOKEN_REFRESHED',{user:{id:'driver'}}),undefined)
 assert.equal(fromCalls,0)
 cleanup()
})

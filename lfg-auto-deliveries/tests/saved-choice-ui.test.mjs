import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {JSDOM} from 'jsdom';import React,{act} from 'react';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import path from 'node:path';
test('saved choices show one field, replace dropdown with write-in, and retain new values across refreshes',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.querySelector('#root')),dir=await mkdtemp(path.resolve('.choice-ui-'));
 const b=await build({entryPoints:['src/components/SavedChoice.jsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic'});const f=path.join(dir,'choice.mjs');await writeFile(f,b.outputFiles[0].text);const {default:Choice}=await import(pathToFileURL(f));
 let change;
 function App({options=['BLACK','black','White'],label='Color',type='text'}){const [value,setValue]=React.useState('BLACK');change=setValue;return React.createElement(Choice,{label,type,value,onChange:setValue,options});}
 const render=options=>act(async()=>root.render(React.createElement(App,{options})));
 const changeControl=async(value)=>act(async()=>{const el=document.querySelector('input,select'),props=Object.keys(el).find(k=>k.startsWith('__reactProps$'));el[props].onChange({target:{value}})});
 const single=()=>assert.equal(document.querySelectorAll('input,select').length,1);
 try{
  await render();single();assert.equal(document.querySelector('select').value,'BLACK');assert.equal([...document.querySelectorAll('option')].filter(o=>o.textContent.toLowerCase()==='black').length,1);
  await changeControl('White');single();assert.equal(document.querySelector('select').value,'White');
  await changeControl([...document.querySelectorAll('option')].find(o=>o.textContent.includes('Type a new value')).value);single();assert.ok(document.querySelector('input'));assert.equal(document.activeElement,document.querySelector('input'));
  await changeControl('Granite Crystal');await render(['BLACK','White','Blue']);single();assert.equal(document.querySelector('input').value,'Granite Crystal');
  await act(async()=>document.querySelector('button').click());single();assert.equal(document.querySelector('select').value,'Granite Crystal');
  await changeControl('BLACK');single();assert.equal(document.querySelector('select').value,'BLACK');
  await act(async()=>change('Existing custom color'));single();assert.equal(document.querySelector('select').value,'Existing custom color');
  await changeControl('');single();assert.equal(document.querySelector('select').value,'');
 }finally{await act(async()=>root.unmount());await rm(dir,{recursive:true,force:true});dom.window.close();}
});

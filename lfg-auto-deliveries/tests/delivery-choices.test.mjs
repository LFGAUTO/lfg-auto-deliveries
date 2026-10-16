import test from 'node:test'
import assert from 'node:assert/strict'
import {compileDeliveryChoices,selectDealer,loadDeliveryChoices,uniqueChoices} from '../src/lib/deliveryChoices.js'
test('history groups dealer spelling variants and keeps branch addresses and contacts selectable',()=>{
 const c=compileDeliveryChoices([
  {dealership_name:'Bay Ridge Hyundai',dealership_address:'Address A',dealership_contact:'Silvana',dealership_phone:'Lester'},
  {dealership_name:' BAYRIDGE HYUNDAI ',dealership_address:null,dealership_contact:'silvana',dealership_phone:'LESTER'},
  {dealership_name:'Other Dealer',dealership_address:'Address B',dealership_contact:'Sam'},
  {dealership_name:'Other Dealer',dealership_address:'Address C',dealership_contact:'Alex'},
 ])
 assert.equal(c.dealers.length,2);assert.deepEqual(c.values('dealership_phone'),['Lester'])
 const filled=selectDealer({dealership_name:'Old',dealership_address:'Old address',dealership_contact:'Old contact',customer_name:'Customer',dealership_phone:'My broker'},'bayridge hyundai',c)
 assert.equal(filled.dealership_address,'Address A');assert.equal(filled.dealership_contact,'Silvana');assert.equal(filled.dealership_phone,'My broker');assert.equal(filled.customer_name,'Customer')
 const multiple=selectDealer(filled,'Other Dealer',c);assert.equal(multiple.dealership_address,'');assert.equal(multiple.dealership_contact,'')
 const typed=selectDealer(filled,'New dealer',c);assert.equal(typed.dealership_address,'');assert.equal(typed.dealership_contact,'')
 assert.deepEqual(uniqueChoices([100,'100','',null]),['100'])
})
test('all historical deliveries are loaded beyond the first thousand without an archive filter',async()=>{
 let pages=0;const db={from(name){assert.equal(name,'deliveries');const q={select(columns){assert(!columns.includes('customer_name'));return q},order(){return q},async range(start,end){assert.equal(end,start+999);pages++;return {data:start===0?Array.from({length:1000},()=>({dealership_name:'First dealer'})):[{dealership_name:'Archived dealer',dealership_address:'Saved address'}]}}};return q}}
 const c=await loadDeliveryChoices(db);assert.equal(pages,2);assert.equal(c.dealers.length,2);assert.equal(c.dealer('Archived dealer').rows[0].dealership_address,'Saved address')
})

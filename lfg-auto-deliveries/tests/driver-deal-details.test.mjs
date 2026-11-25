import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('driver deal summary renders saved terms and distinguishes missing amounts from zero', async () => {
  const dir = await mkdtemp(path.resolve('.deal-test-'))
  try {
    const bundle = await build({entryPoints:['src/components/DriverDealDetails.jsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic'})
    const file = path.join(dir,'details.mjs')
    await writeFile(file,bundle.outputFiles[0].text)
    const {default:Details,dealMoney} = await import(pathToFileURL(file))
    const render = delivery => renderToStaticMarkup(React.createElement(Details,{delivery}))
    const html = render({monthly_payment:'$599.50',contract_type:'Lease',miles_per_year:'12000',vyear:'2026',make:'Nissan',model:'Pathfinder SL',color:'Black',vin:'TESTVIN123',dealership_contact:'Dealer contact',dealership_phone:'Broker name',paperwork_status:'e_contracts',is_trade:true,trade_kind:'lease_return',trade_year:'2023',trade_make:'Toyota',trade_model:'Camry',trade_vin:'RETURNVIN',pay_amount:987654})
    for(const value of ['$599.50','12000','Pathfinder SL','Black','TESTVIN123','Broker name','E-contracts','Lease return vehicle','2023 Toyota Camry','RETURNVIN']) assert.ok(html.includes(value),value)
    assert.ok(!html.includes('987654'),'driver pay is not a customer deal term')
    assert.ok(render({}).includes('Not provided'))
    assert.ok(!render({}).includes('$0'))
    assert.ok(render({monthly_payment:0}).includes('$0.00'))
    assert.ok(render({contract_type:'Cash'}).includes('Not applicable'))
    assert.ok(!render({is_trade:false,trade_vin:'STALEVIN'}).includes('STALEVIN'))
    assert.equal(dealMoney('499 + tax'),'499 + tax')
    assert.equal(dealMoney(' '),'Not provided')
    assert.equal(dealMoney('1,250'),'$1,250.00')
    assert.ok(render({model:'<script>alert(1)</script>'}).includes('&lt;script&gt;'))
  } finally {await rm(dir,{recursive:true,force:true})}
})

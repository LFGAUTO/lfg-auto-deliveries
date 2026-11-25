import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { requiresCod } from '../src/lib/cod.js'
import { outstanding } from '../src/lib/workflow.js'

test('blank and zero COD do not require collection in UI or database closeout', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table deliveries (cod_required boolean, cod_received boolean default false, cod_amount text, delivered_at timestamptz default now(), closeout_required boolean default true, closeout_completed_at timestamptz, is_trade boolean default false, trade_returned_at timestamptz, paperwork_status text default 'office');`)
    await db.exec(await readFile(new URL('../supabase/zero-cod-closeout.sql',import.meta.url),'utf8'))
    await db.exec(`create trigger closeout before insert or update on deliveries for each row execute function compute_delivery_closeout()`)
    for (const [amount,required] of [[null,false],['',false],['  ',false],[0,false],['0.00',false],['$0.00',false],['$ 0',false],['250',true],['$1,250.00',true],['Confirm with Jess',true]]) {
      const d={cod_required:true,cod_amount:amount,paperwork_status:'office'}
      assert.equal(requiresCod(d),required,String(amount))
      assert.equal(outstanding(d).includes('COD collection'),required)
      const result=await db.query('insert into deliveries(cod_required,cod_amount) values (true,$1) returning closeout_required,cod_received',[amount])
      assert.equal(result.rows[0].closeout_required,required,String(amount))
      assert.equal(result.rows[0].cod_received,false,'no fabricated collection')
    }
    assert.equal(requiresCod({cod_required:false,cod_amount:'250'}),false)
    const result=await db.query("insert into deliveries(cod_required,cod_amount,is_trade) values(true,'0',true) returning closeout_required")
    assert.equal(result.rows[0].closeout_required,true,'trade returns still required')
  } finally {await db.close()}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { easternDay, outstanding, driverNames, nextAction } from '../src/lib/workflow.js'

test('Eastern date stays correct around midnight and daylight saving changes', () => {
  assert.equal(easternDay('2026-10-07T01:00:00Z'), '2026-10-06')
  assert.equal(easternDay('2026-11-01T05:30:00Z'), '2026-11-01')
  assert.equal(easternDay(null), '')
})
test('office handoff remains pending and two drivers do not duplicate themselves', () => {
  assert.deepEqual(outstanding({ paperwork_status: 'office' }), ['Paperwork · Jess / office'])
  assert.deepEqual(driverNames({ driver1_name: 'Mike', driver2_name: 'Mike' }), ['Mike'])
  assert.equal(nextAction({ status: 'issue' }), 'Contact Jess · issue needs attention')
})
test('database closeout survives staged returns, is rerunnable, and preserves historic payroll', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table public.deliveries (id integer primary key, archived boolean default false, delivered_at timestamptz, cod_required boolean default false, cod_received boolean default false, is_trade boolean default false, pay_amount numeric default 100);`)
    await db.exec(`insert into deliveries(id, archived, delivered_at) values (1,true,'2026-10-01T12:00:00Z')`)
    const sql = await readFile(new URL('../supabase/operations-v2.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const row = async id => (await db.query('select * from deliveries where id=$1', [id])).rows[0]
    assert.equal((await row(1)).closeout_required, false)
    assert.equal((await row(1)).paperwork_status, null)
    await db.exec(`insert into deliveries(id, delivered_at, archived, is_trade, cod_required, closeout_required) values(2,now(),true,true,true,true)`)
    assert.equal((await row(2)).closeout_required, true)
    await db.exec(`update deliveries set paperwork_status='office' where id=2`)
    assert.equal((await row(2)).closeout_required, true)
    await db.exec(`update deliveries set paperwork_status='ups', paperwork_by='Jess', paperwork_at=now() where id=2`)
    assert.equal((await row(2)).closeout_required, true)
    await db.exec(`update deliveries set trade_returned_at=now(), trade_returned_by='Mike' where id=2`)
    assert.equal((await row(2)).closeout_required, true)
    await db.exec(`update deliveries set cod_received=true where id=2`)
    assert.equal((await row(2)).closeout_required, false)
    assert.ok((await row(2)).closeout_completed_at)
    assert.equal((await row(2)).archived, true)
    assert.equal(Number((await row(2)).pay_amount), 100)
    assert.equal((await db.query('select count(*)::int n from deliveries where delivered_at is not null')).rows[0].n, 2)
    await db.exec(`update deliveries set cod_received=false where id=2`)
    assert.equal((await row(2)).closeout_required, true)
    assert.equal((await row(2)).closeout_completed_at, null)
    await db.exec(`insert into deliveries(id, delivered_at, archived, paperwork_status, closeout_required) values(3,now(),true,'not_required',true)`)
    assert.equal((await row(3)).closeout_required, false)
    await db.exec(`insert into deliveries(id, delivered_at, archived, paperwork_status, closeout_required) values(4,now(),true,'dealer',true)`)
    assert.equal((await row(4)).closeout_required, false)
  } finally { await db.close() }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { payrollSettlement } from '../src/lib/payroll.js'

test('adding a delivery after a paid week exposes the extra amount without forgetting previous pay', () => {
  const paid = { amount: 300, deliveries: 3 }
  assert.equal(payrollSettlement(paid, 300, 3).settled, true)
  assert.deepEqual(payrollSettlement(paid, 400, 4), { paidAmount: 300, balance: 100, changed: true, settled: false })
  assert.equal(payrollSettlement(null, 100, 1).settled, false)
  assert.equal(payrollSettlement(paid, 200, 2).balance, -100)
  assert.equal(payrollSettlement(paid, 300, 4).settled, false)
})

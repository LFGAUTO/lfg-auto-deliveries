// Keep the recorded payment intact when a delivery is corrected later.
export function payrollSettlement(record, total, count) {
  const paidAmount = record ? Number(record.amount || 0) : 0
  const balance = Math.round((Number(total) - paidAmount) * 100) / 100
  const changed = Boolean(record) && (balance !== 0 || Number(record.deliveries) !== count)
  return { paidAmount, balance, changed, settled: Boolean(record) && !changed }
}

// Only an explicitly blank or zero amount cancels a requested collection.
// Preserve unrecognized text as a collection task for dispatch to clarify.
export function requiresCod(delivery) {
  if (!delivery.cod_required) return false
  const amount = String(delivery.cod_amount ?? '').replace(/[$,\s]/g, '')
  return amount !== '' && !/^0+(?:\.0+)?$/.test(amount)
}

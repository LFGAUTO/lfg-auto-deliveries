export function customerPhotoStatus(delivery) {
  if (delivery.client_photo_url) return 'Photo received'
  if (delivery.client_photo_pending) return 'Customer will send their own photo — awaiting photo'
  if (delivery.client_photo_refused) return 'Customer declined a photo'
  return 'Customer photo missing'
}

// Remove only the generated CRM reference line; retain actual delivery instructions.
export function driverVisibleNotes(notes) {
  return String(notes || '').split(/\r?\n/).filter(line => !/^\s*Landing lead\s*#\s*\d*\s*$/i.test(line)).join('\n').trim()
}

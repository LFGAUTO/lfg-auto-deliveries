import test from 'node:test'
import assert from 'node:assert/strict'
import {customerPhotoStatus,driverVisibleNotes} from '../src/lib/customerPhoto.js'
import {deliveryPrefill} from '../supabase/functions/landing-delivery-bridge/model.js'
test('driver notes omit only generated CRM references; new drafts do not add them',()=>{
 assert.equal(driverVisibleNotes('Landing lead #0028'),'')
 assert.equal(driverVisibleNotes('Landing lead #0028\r\nCall before arrival\nCollect keys'),'Call before arrival\nCollect keys')
 assert.equal(driverVisibleNotes('Ask office about Landing lead #28'),'Ask office about Landing lead #28')
 assert.equal(deliveryPrefill({lead_number:28}).admin_notes,'')
})
test('promised photo stays pending, distinct from refusal, until a photo is received',()=>{
 assert.match(customerPhotoStatus({client_photo_pending:true}),/awaiting photo/)
 assert.match(customerPhotoStatus({client_photo_refused:true}),/declined/)
 assert.equal(customerPhotoStatus({client_photo_pending:true,client_photo_url:'https://test/photo.jpg'}),'Photo received')
})

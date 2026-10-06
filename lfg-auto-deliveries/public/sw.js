self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const raw=data.url||'/driver';let url='/driver'
 try{const u=new URL(raw,self.location.origin);if(u.origin===self.location.origin&&u.pathname==='/driver')url=u.pathname+u.search}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'LFG AUTO',{body:data.body||'A delivery update is ready.',icon:'/icon-192.png',badge:'/icon-192.png',tag:data.tag||'lfg-alert',data:{url}}))
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 const url=new URL(event.notification.data?.url||'/driver',self.location.origin)
 if(url.origin!==self.location.origin||url.pathname!=='/driver')return
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(w=>new URL(w.url).origin===self.location.origin);if(existing){await existing.navigate(url.href);await existing.focus()}else await self.clients.openWindow(url.href)})())
})
// No fetch handler: app updates are never held in an offline cache.

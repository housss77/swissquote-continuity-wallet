// Network-only wallet. Never cache accounts, balances, API responses, signatures
// or transactions, and never queue/retry a financial operation in the background.
self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()))
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET' || event.request.mode!=='navigate')return
  event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continuity — Offline</title><body style="font-family:system-ui;background:#f7f7f5;padding:32px;line-height:1.6"><h1>You’re offline</h1><p>Your wallet and passkey are preserved. Reconnect to check balances or send. Nothing will be automatically submitted.</p><a href="/">Try again</a></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'},status:503})))
})

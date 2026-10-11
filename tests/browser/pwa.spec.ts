import {test,expect} from '@playwright/test'
test.use({serviceWorkers:'allow'})
test('installed app never caches wallet data or queues offline transactions',async({page,context})=>{
 let sends=0;page.on('request',req=>{try{if(req.postDataJSON()?.method==='eth_sendUserOperation')sends++}catch{}})
 await page.goto('/login');await page.evaluate(async()=>{await navigator.serviceWorker.ready})
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
 expect(await page.evaluate(()=>caches.keys())).toEqual([])
 await context.setOffline(true);await page.goto('/login')
 await expect(page.getByRole('heading',{name:'You’re offline'})).toBeVisible();await expect(page.getByText(/Nothing will be automatically submitted/)).toBeVisible();expect(sends).toBe(0)
 await context.setOffline(false);await page.goto('/login');await expect(page.getByRole('button',{name:'Continue with passkey'})).toBeVisible();expect(sends).toBe(0)
})

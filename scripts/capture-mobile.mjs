import {chromium} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
const label=process.argv[2] || 'pass1'
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid screenshot label')
const root=path.resolve('.dist','mobile-design',label);await fs.mkdir(root,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const [name,width,height] of [['iphone',390,844],['small-phone',360,800],['desktop',1440,900]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage()
  for(const [route,slug] of [['/login','login'],['/','welcome'],['/install','install'],['/demo','demo']]){
   await page.goto(`http://localhost:3000${route}`,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();await page.waitForTimeout(700);await page.screenshot({path:path.join(root,`${name}-${slug}.png`),fullPage:true})
  }
  await page.evaluate(()=>localStorage.setItem('continuity-customer-safe-v1',JSON.stringify({version:1,safe:'0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06'})))
  for(const [route,slug] of [['/','wallet'],['/send','send'],['/receive','receive']]){
   await page.goto(`http://localhost:3000${route}`,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();await page.waitForTimeout(500);await page.getByText(/Checking your wallet on Sepolia|Reading (your )?wallet/).waitFor({state:'hidden',timeout:45000}).catch(()=>{});await page.waitForTimeout(1600);await page.screenshot({path:path.join(root,`${name}-${slug}.png`),fullPage:true})
  }
  await context.close()
 }
 console.log(`Read-only screenshots: ${path.relative(process.cwd(),root)}`)
}finally{await browser.close()}

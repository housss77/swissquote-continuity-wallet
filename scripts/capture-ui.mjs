import {chromium} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
const pass=process.argv[2] || 'final'
if(!/^[a-z0-9-]+$/.test(pass))throw new Error('Invalid screenshot label')
const root=path.resolve('test-results',`design-${pass}`)
await fs.mkdir(root,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 for(const [label,width,height] of [['desktop',1440,900],['laptop',1280,800],['mobile',390,844],['small-mobile',360,800]]) {
  const context=await browser.newContext({viewport:{width,height}})
  const page=await context.newPage()
  // Public selection only; never attach to the customer's browser or sign.
  await page.addInitScript(()=>localStorage.setItem('continuity-customer-safe-v1',JSON.stringify({version:1,safe:'0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06'})))
  for(const [name,route] of [['wallet','/'],['protection','/protection'],['recovery','/recovery'],['send','/send'],['demo','/demo'],['safety','/lab/safety']]) {
   await page.goto(`http://localhost:3000${route}`,{waitUntil:'domcontentloaded',timeout:60000})
   await page.locator('h1').waitFor({timeout:30000})
   await page.locator('.wallet-loading').waitFor({state:'hidden',timeout:30000}).catch(()=>{})
   await page.getByText('Checking onchain protection…',{exact:true}).waitFor({state:'hidden',timeout:30000}).catch(()=>{})
   await page.getByText('Reading wallet…',{exact:true}).waitFor({state:'hidden',timeout:30000}).catch(()=>{})
   await page.getByText('Checking recovery on Sepolia…',{exact:true}).waitFor({state:'hidden',timeout:30000}).catch(()=>{})
   await page.screenshot({path:path.join(root,`${label}-${name}.png`),fullPage:true})
  }
  await context.close()
  const fresh=await browser.newContext({viewport:{width,height}})
  const freshPage=await fresh.newPage()
  await freshPage.goto('http://localhost:3000',{waitUntil:'domcontentloaded'})
  await freshPage.getByRole('button',{name:'Create wallet',exact:true}).waitFor()
  await freshPage.screenshot({path:path.join(root,`${label}-fresh-wallet.png`),fullPage:true})
  await fresh.close()
 }
 console.log(`Read-only screenshots: ${path.relative(process.cwd(),root)}`)
} finally {await browser.close()}

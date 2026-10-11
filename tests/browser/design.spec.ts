import {test,expect,type Page} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {walletFixture} from './product-fixtures'
import {PENDING_KEY} from '../../lib/constants'
import {DEMO_SAFE} from '../../lib/product'

// Screenshots use explicitly synthetic RPC data, never live acceptance evidence.
async function capture(page:Page,name:string){
  const pass=process.env.DESIGN_SCREENSHOTS
  if(!pass)return
  if(!/^[a-z0-9-]+$/.test(pass))throw Error('Invalid screenshot label')
  const dir=path.resolve('.dist','banking-design',pass)
  await mkdir(dir,{recursive:true})
  await page.screenshot({path:path.join(dir,`${name}.png`),fullPage:true,animations:'disabled'})
}
async function fits(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}

for(const [name,width,height] of [['desktop',1440,900],['laptop',1280,800],['iphone',390,844],['small-phone',360,800]] as const){
  test(`banking workspace fits ${name} and preserves balance, guardian and transfer states`,async({page})=>{
    test.setTimeout(60_000)
    await page.setViewportSize({width,height})
    const fixture=await walletFixture(page,{balance:12_345_678n})
    await page.goto('/')
    await expect(page.locator('.balance')).toHaveText('12.345678 USDC')
    await expect(page.getByText('Recovery enabled — 2 of 3 approvals required',{exact:true})).toBeVisible()
    // A bounding box alone misses occlusion by a header; hit-test the badge.
    expect(await page.locator('.network-label').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})).toBe(true)
    await fits(page);await capture(page,`${name}-wallet`)
    await page.getByRole('main').getByRole('link',{name:'Send',exact:true}).click()
    await expect(page.getByText('Balance: 12.345678 USDC',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Review transfer'})).toBeDisabled()
    await page.getByLabel('Recipient address').fill('0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86')
    await page.getByRole('button',{name:'Max',exact:true}).click()
    await expect(page.getByLabel('Amount in USDC')).toHaveValue('12.345678')
    await expect(page.getByRole('button',{name:'Review transfer'})).toBeEnabled()
    // Fill/Max are UI-only; preparing/signing is never triggered here.
    await fits(page);await capture(page,`${name}-send`)
    await page.goto('/protection');await expect(page.getByText('Registered',{exact:true})).toHaveCount(3)
    await fits(page);await capture(page,`${name}-protection`)
    await page.goto('/activity');await expect(page.getByText('No live USDC transfer has been verified in this evidence set.')).toHaveCount(1)
    await fits(page);await capture(page,`${name}-activity`)
    await page.goto('/login');await expect(page.getByRole('button',{name:'Continue with passkey',exact:true})).toBeVisible()
    await fits(page);await capture(page,`${name}-login`)
    await page.goto('/demo');await expect(page.getByRole('button',{name:'Next scene'})).toBeVisible()
    await fits(page);await capture(page,`${name}-demo`)
    expect(fixture.sends()).toBe(0)
  })
}

test('zero balance has a visible funding route, exact copy feedback and keyboard navigation',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write'])
  const fixture=await walletFixture(page)
  await page.goto('/send');await expect(page.getByText('Balance: 0 USDC')).toBeVisible()
  await expect(page.getByRole('link',{name:'Get free test USDC ↗'})).toHaveAttribute('href','/receive')
  await page.getByRole('button',{name:'Copy',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Wallet address copied')
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(DEMO_SAFE)
  await page.getByLabel('Recipient address').focus();await page.keyboard.press('Tab')
  await expect(page.getByRole('button',{name:'Review transfer'})).not.toBeFocused() // Disabled with no balance.
  await fits(page);await capture(page,'zero-balance-send')
  expect(fixture.sends()).toBe(0)
})

test('unverified stored inclusion is never styled or labelled as confirmed',async({page})=>{
  const fixture=await walletFixture(page)
  await page.addInitScript(({key,safe})=>localStorage.setItem(key,JSON.stringify({kind:'usdc',description:'Send 1 test USDC',userOperationHash:`0x${'11'.repeat(32)}`,safeAddress:safe,state:'included',acceptance:'yes',usdcIntent:{chainId:11155111,safe,recipient:'0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86',token:'0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',amount:'1000000'}})),{key:PENDING_KEY,safe:DEMO_SAFE})
  await page.goto('/send');await expect(page.getByRole('region',{name:'Saved operation'})).toContainText('Unresolved')
  await expect(page.locator('.transfer-result.confirmed')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Check confirmation'})).toBeVisible()
  await fits(page);await capture(page,'unresolved-send')
  expect(fixture.sends()).toBe(0)
})

test('transfer labels, guidance and navigation retain AA text contrast',async({page})=>{
  await walletFixture(page,{balance:2_000_000n});await page.goto('/send')
  await expect(page.getByLabel('Amount in USDC')).toBeVisible()
  const failures=await page.locator('.lede, .nav-caption, nav a, .send-form label, .field-help, .amount-balance, .transfer-steps li, .fee-line span, .fee-line strong, .test-notice').evaluateAll(nodes=>{
    const rgb=(s:string)=>s.match(/[\d.]+/g)!.map(Number)
    const luminance=(c:number[])=>{const v=c.slice(0,3).map(x=>{const n=x/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722}
    return nodes.filter(n=>n.getClientRects().length).flatMap(n=>{
      let el:Element|null=n,bg=[255,255,255]
      while(el){const candidate=rgb(getComputedStyle(el).backgroundColor);if(candidate.length===3 || candidate[3]===1){bg=candidate;break}el=el.parentElement}
      const fg=rgb(getComputedStyle(n).color),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05)
      return ratio>=4.5?[]:[{element:n.className || n.tagName,ratio}]
    })
  })
  expect(failures).toEqual([])
})

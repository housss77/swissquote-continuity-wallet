import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {walletFixture} from './product-fixtures'
import {CUSTOMER_PASSKEY_KEY} from '../../lib/product'

async function capture(page:import('@playwright/test').Page,name:string){if(!process.env.DESIGN_SCREENSHOTS)return;await mkdir('.dist/onboarding-design',{recursive:true});await page.screenshot({path:`.dist/onboarding-design/${name}.png`,fullPage:true,animations:'disabled'})}
test('Swissquote account step is explicit simulation and cannot trigger passkey or wallet writes',async({page})=>{
  let authWrites=0
  await page.route('**/api/auth',async route=>{if(route.request().method()==='POST')authWrites++;await route.fulfill({json:{account:null}})})
  await page.goto('/onboarding')
  await expect(page.getByText('SWISSQUOTE ACCOUNT · DEMO CONNECTION',{exact:true})).toBeVisible()
  await expect(page.getByText('Simulated account connection.',{exact:false})).toBeVisible()
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  await page.getByRole('button',{name:'Continue with demo account'}).click()
  await expect(page.getByRole('button',{name:'Create wallet with passkey',exact:true})).toBeVisible()
  expect(authWrites).toBe(0)
  await page.getByRole('button',{name:'Back to account'}).click()
  await expect(page.getByLabel('Demo client ID')).toHaveValue('DEMO-1001')
})
test('onboarding preserves an existing public passkey instead of generating a replacement',async({page})=>{
  let authWrites=0
  await page.addInitScript(key=>localStorage.setItem(key,JSON.stringify({rawId:'11'.repeat(32),coordinates:{x:`0x${'22'.repeat(32)}`,y:`0x${'33'.repeat(32)}`}})),CUSTOMER_PASSKEY_KEY)
  await page.route('**/api/auth',async route=>{if(route.request().method()==='POST')authWrites++;await route.fulfill({json:{account:null}})})
  await page.goto('/onboarding');await page.getByRole('button',{name:'Continue with demo account'}).click();await page.getByRole('button',{name:'Create wallet with passkey'}).click()
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await expect(page.getByRole('link',{name:'Connect your existing passkey'})).toBeVisible()
  expect(authWrites).toBe(0)
  expect(await page.evaluate(key=>!!localStorage.getItem(key),CUSTOMER_PASSKEY_KEY)).toBe(true)
})
test('asset picker shows real fixture ETH balance without enabling unsupported sending',async({page})=>{
  const fixture=await walletFixture(page,{balance:2_000_000n})
  await page.goto('/send');await page.getByLabel('Asset',{exact:true}).selectOption('ETH')
  await expect(page.getByText('0 ETH',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Review transfer'})).toHaveCount(0)
  await page.getByRole('button',{name:'Choose USDC to send'}).click()
  await expect(page.getByText('Balance: 2 USDC',{exact:true})).toBeVisible()
  expect(fixture.sends()).toBe(0)
})
test('guided setup refuses changes to the preserved acceptance wallet',async({page})=>{
  const fixture=await walletFixture(page,{protectedWallet:false})
  await page.goto('/setup')
  await expect(page.getByRole('heading',{name:'This acceptance wallet is preserved.'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Create backup passkey'})).toHaveCount(0)
  expect(fixture.sends()).toBe(0)
})
test('new unprotected wallet has focused backup setup and keeps operator authentication private',async({page})=>{
  const fixture=await walletFixture(page,{safe:'0x1234567890123456789012345678901234567890',protectedWallet:false})
  let writes=0
  await page.route('**/api/recovery?*',route=>route.fulfill({json:{bank:'0xbED556C6B6F68815B506EC7cF962C8C483602aC1',backup:null,replacement:null,transactions:[]}}))
  await page.route('**/api/recovery',route=>{writes++;return route.abort()})
  await page.goto('/setup')
  await expect(page.getByRole('button',{name:'Create backup passkey',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Enable recovery with passkey'})).toHaveCount(0)
  await capture(page,'guided-backup')
  await page.getByText('Demo operator setup',{exact:true}).click()
  await expect(page.getByLabel('Demo operator credential')).toHaveValue('')
  expect(writes).toBe(0);expect(fixture.sends()).toBe(0)
})
for(const width of [1440,390,360])test(`onboarding fits ${width}px with readable real wallet and recovery choices`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:844})
  await page.goto('/onboarding');await expect(page.getByLabel('Demo client ID')).toBeVisible()
  await page.evaluate(()=>document.fonts.ready)
  expect(await page.locator('.product').evaluate(e=>getComputedStyle(e).fontFamily)).toContain('manrope')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await capture(page,`${width}-account`)
  await page.getByRole('button',{name:'Continue with demo account'}).click()
  await expect(page.getByRole('button',{name:'Create wallet with passkey'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await capture(page,`${width}-passkey`)
})

import {test,expect} from '@playwright/test'
import {walletFixture} from './product-fixtures'
test('fresh customer has a clear next step and no fabricated balance or transaction',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your wallet',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Create wallet',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Connect passkey',exact:true})).toBeVisible()
 await expect(page.getByText('Confirmed',{exact:true})).toHaveCount(0)
 await expect(page.getByText('Sepolia testnet',{exact:true})).toBeVisible()
})
test('existing wallet displays actual fixture balance and onchain protection without signing',async({page})=>{
 const fixture=await walletFixture(page,{balance:1234567n});await page.goto('/')
 await expect(page.locator('.balance')).toHaveText('1.234567 USDC')
 await expect(page.getByText('Recovery enabled — 2 of 3 approvals required',{exact:true})).toBeVisible()
 await expect(page.getByText('Viewing public wallet information.',{exact:true})).toBeVisible()
 expect(fixture.sends()).toBe(0)
})
test('unconfigured and unavailable recovery never imply enabled protection',async({page})=>{
 await walletFixture(page,{protectedWallet:false});await page.goto('/protection')
 await expect(page.getByText('Not configured',{exact:true})).toBeVisible()
 await expect(page.getByText('Registered',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Check backup access',exact:true})).toBeDisabled()
})
test('unavailable network displays an actionable error rather than an invented zero balance',async({page})=>{
 const fixture=await walletFixture(page,{unavailable:true});await page.goto('/')
 await expect(page.getByRole('main').getByRole('alert')).toContainText('RPC')
 await expect(page.locator('.balance')).toHaveCount(0);expect(fixture.sends()).toBe(0)
})
test('verified recovery wallet is preserved and no configuration action is offered in the customer wizard',async({page})=>{
 const fixture=await walletFixture(page);await page.goto('/recovery')
 await expect(page.getByText('This acceptance wallet is preserved.',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Finalize recovery'})).toHaveCount(0)
 expect(fixture.sends()).toBe(0)
})
test('mobile wallet navigation and input layout fit 390 pixels',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/')
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
test('cancelled customer passkey creation preserves the empty session and shows actionable guidance',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'credentials',{value:{create:()=>Promise.reject(new DOMException('Cancelled','NotAllowedError')),get:()=>Promise.reject(new DOMException('Cancelled','NotAllowedError'))}}))
 await page.goto('/');await page.getByRole('button',{name:'Create wallet',exact:true}).click()
 await expect(page.getByRole('main').getByRole('alert')).toContainText('cancelled')
 expect(await page.evaluate(()=>localStorage.getItem('continuity-customer-created-passkey-v1'))).toBeNull()
})

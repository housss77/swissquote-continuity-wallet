import {test,expect} from '@playwright/test'
import {walletFixture} from './product-fixtures'
import {PENDING_KEY} from '../../lib/constants'
import {DEMO_SAFE} from '../../lib/product'
const recipient='0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86'
test('zero USDC shows faucet funding and blocks review without requesting a signature',async({page})=>{
 const f=await walletFixture(page);await page.goto('/send');await expect(page.getByText('Balance: 0 USDC')).toBeVisible()
 await expect(page.getByRole('link',{name:'Get free test USDC ↗'})).toHaveAttribute('href','https://faucet.circle.com/')
 await expect(page.getByRole('button',{name:'Review transfer'})).toBeDisabled();expect(f.sends()).toBe(0)
})
test('Max preserves six decimals and invalid input never prepares or broadcasts',async({page})=>{
 const f=await walletFixture(page,{balance:1_234_567n});await page.goto('/send')
 await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByLabel('Amount in USDC')).toHaveValue('1.234567')
 await page.getByLabel('Recipient address').fill(recipient);await page.getByLabel('Amount in USDC').fill('1.1234567');await page.getByRole('button',{name:'Review transfer'}).click()
 await expect(page.getByRole('main').getByRole('alert')).toContainText('6 decimal places');expect(f.sends()).toBe(0)
})
test('valid transfer requires current customer credentials; viewing a funded wallet cannot send',async({page})=>{
 const f=await walletFixture(page,{balance:2_000_000n});await page.route('**/api/recovery?*',r=>r.fulfill({json:{replacement:null}}))
 await page.goto('/send?demo=1');await expect(page.getByLabel('Recipient address')).toHaveValue(recipient)
 await page.getByRole('button',{name:'Review transfer'}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Continuity Replacement')
 await expect(page.getByRole('button',{name:'Confirm with passkey'})).toHaveCount(0);expect(f.sends()).toBe(0)
})
test('pending transfer survives reload and blocks a duplicate transfer without claiming success',async({page})=>{
 const f=await walletFixture(page,{balance:2_000_000n})
 await page.addInitScript(({key,safe,recipient})=>localStorage.setItem(key,JSON.stringify({kind:'usdc',description:'Send 1 test USDC',userOperationHash:`0x${'11'.repeat(32)}`,safeAddress:safe,state:'accepted',acceptance:'yes',usdcIntent:{chainId:11155111,safe,recipient,token:'0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',amount:'1000000'}})),{key:PENDING_KEY,safe:DEMO_SAFE,recipient})
 await page.goto('/send');await expect(page.getByRole('region',{name:'Saved operation'})).toContainText('Submitted')
 await expect(page.getByRole('button',{name:'Review transfer'})).toHaveCount(0)
 await page.reload();await expect(page.getByRole('button',{name:'Check confirmation'})).toBeVisible();await expect(page.getByText('CONFIRMED ON SEPOLIA',{exact:true})).toHaveCount(0);expect(f.sends()).toBe(0)
})

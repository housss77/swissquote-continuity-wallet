import {test,expect} from '@playwright/test'
import evidence from '../../lib/demo-evidence.json'
test('six-scene presentation labels completed recovery as historical and never signs or broadcasts',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator.credentials,'get',{value:async()=>{throw Error('DEMO_MUST_NOT_SIGN')}});Object.defineProperty(navigator.credentials,'create',{value:async()=>{throw Error('DEMO_MUST_NOT_CREATE')}})})
 await page.goto('/demo');await expect(page.getByRole('button',{name:'Back',exact:true})).toBeDisabled()
 await expect(page.getByText('Scene 1 of 6',{exact:false})).toBeVisible()
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'Next scene',exact:true}).click()
 await expect(page.getByRole('heading',{name:'New access. Same wallet.',exact:true})).toBeVisible()
 await expect(page.getByText('Verified earlier on Sepolia — not a recovery happening live.',{exact:true})).toBeVisible()
 for(const t of evidence.transactions)await expect(page.locator(`a[href="https://sepolia.etherscan.io/tx/${t.hash}"]`)).toBeVisible()
 await page.getByRole('button',{name:'Next scene',exact:true}).click();await page.getByRole('button',{name:'Next scene',exact:true}).click()
 await expect(page.getByRole('button',{name:'Next scene',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Back',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Helpful checks. Honest limits.',exact:true})).toBeVisible()
})
test('network fallback preserves historical labels and does not invent refreshed state',async({page})=>{
 await page.route('**/api/demo',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}))
 await page.goto('/demo');await page.getByText('Live verification and evidence provenance',{exact:true}).click()
 await page.getByRole('button',{name:'Check live state (read-only)',exact:true}).click()
 await expect(page.getByRole('main').getByRole('status')).toContainText('stored historical evidence')
 await expect(page.getByText('Live read-only report:',{exact:false})).toHaveCount(0)
})

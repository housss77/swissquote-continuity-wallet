import {test,expect,type Page} from '@playwright/test'
import evidence from '../../lib/demo-evidence.json'

const initialSpend='0x512f35b9d95d590aa0076a9331ba47313e7f6e1349113649f2f357b168fe6050'
const headings=[
  'Your Swissquote account. Your own wallet.',
  'Your wallet starts with your passkey.',
  'A backup. A bank guardian. A trusted friend.',
  'Your approval. Sponsored network fees.',
  'A lost device doesn’t mean a lost wallet.',
  'New access. Same wallet.',
]

async function openProof(page:Page,button:string,hash:string){
  await page.getByRole('button',{name:button,exact:true}).click()
  const dialog=page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Verified earlier on Sepolia')
  await expect(dialog).toContainText('No transaction was submitted by this walkthrough.')
  await expect(dialog.locator(`a[href="https://sepolia.etherscan.io/tx/${hash}"]`)).toBeVisible()
  return dialog
}

test('six-scene customer journey labels simulation and preserves forward/back navigation',async({page})=>{
  await page.goto('/demo')
  await expect(page.getByText('Simulated customer journey',{exact:false}).first()).toBeVisible()
  await expect(page.getByRole('button',{name:'Back',exact:true})).toBeDisabled()
  await expect(page.getByRole('heading',{name:headings[0],exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Continue with Swissquote (demo)',exact:true}).click()
  await expect(page.getByRole('heading',{name:headings[1],exact:true})).toBeVisible()
  for(let scene=2;scene<6;scene++){
    await page.getByRole('button',{name:'Next scene',exact:true}).click()
    await expect(page.getByRole('heading',{name:headings[scene],exact:true})).toBeVisible()
    await expect(page.getByText(`Scene ${scene+1} of 6`,{exact:false})).toBeVisible()
  }
  await expect(page.getByRole('button',{name:'Next scene',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'Back',exact:true}).click()
  await expect(page.getByRole('heading',{name:headings[4],exact:true})).toBeVisible()
})

test('each simulated approval opens its genuine historical transaction proof',async({page})=>{
  await page.goto('/demo')
  await page.getByRole('button',{name:'Next scene',exact:true}).click()
  await openProof(page,'Create wallet (demo)',initialSpend)
  await page.getByRole('button',{name:'Close proof',exact:true}).click()
  await page.getByRole('button',{name:'Next scene',exact:true}).click()
  await openProof(page,'Enable recovery (demo)',evidence.transactions[0].hash)
  await page.getByRole('button',{name:'Close proof',exact:true}).click()
  await page.getByRole('button',{name:'Next scene',exact:true}).click()
  const spend=await openProof(page,'Approve transaction (demo)',initialSpend)
  await expect(spend).toContainText('NFT')
  await expect(spend).toContainText('not a USDC transfer')
  await page.getByRole('button',{name:'Close proof',exact:true}).click()
  await page.getByRole('button',{name:'Next scene',exact:true}).click()
  await page.getByRole('button',{name:'Recover wallet (demo)',exact:true}).click()
  await openProof(page,'Restore access (demo)',evidence.transactions[2].hash)
  await page.getByRole('button',{name:'Close proof',exact:true}).click()
  for(const [label,index] of [['View recovery initiation proof',1],['View owner rotation proof',2],['View recovered transaction proof',3]] as const){
    await openProof(page,label,evidence.transactions[index].hash)
    await page.getByRole('button',{name:'Close proof',exact:true}).click()
  }
})

test('proof dialog closes with Escape and returns focus to the triggering action',async({page})=>{
  await page.goto('/demo');await page.getByRole('button',{name:'Next scene',exact:true}).click()
  const trigger=page.getByRole('button',{name:'Create wallet (demo)',exact:true})
  await openProof(page,'Create wallet (demo)',initialSpend)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('walkthrough cannot invoke WebAuthn, send requests, collect credentials or mutate wallet storage',async({page})=>{
  await page.addInitScript(()=>{
    const record={create:0,get:0}
    Object.defineProperty(window,'demoCredentialCalls',{value:record})
    Object.defineProperty(navigator.credentials,'get',{value:async()=>{record.get++;throw Error('DEMO_MUST_NOT_SIGN')}})
    Object.defineProperty(navigator.credentials,'create',{value:async()=>{record.create++;throw Error('DEMO_MUST_NOT_CREATE')}})
  })
  const writes:string[]=[]
  page.on('request',request=>{if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(`${request.method()} ${new URL(request.url()).pathname}`)})
  await page.goto('/demo')
  const snapshot=()=>page.evaluate(()=>({local:Object.entries(localStorage),session:Object.entries(sessionStorage)}))
  const before=await snapshot()
  await expect(page.locator('input[type="password"],input[type="email"]')).toHaveCount(0)
  await page.getByRole('button',{name:'Continue with Swissquote (demo)',exact:true}).click()
  await openProof(page,'Create wallet (demo)',initialSpend);await page.getByRole('button',{name:'Close proof',exact:true}).click()
  await page.getByRole('button',{name:'Next scene',exact:true}).click()
  await openProof(page,'Enable recovery (demo)',evidence.transactions[0].hash);await page.getByRole('button',{name:'Close proof',exact:true}).click()
  await page.getByRole('button',{name:'Next scene',exact:true}).click()
  await openProof(page,'Approve transaction (demo)',initialSpend);await page.getByRole('button',{name:'Close proof',exact:true}).click()
  await page.getByRole('button',{name:'Next scene',exact:true}).click()
  await page.getByRole('button',{name:'Recover wallet (demo)',exact:true}).click()
  await openProof(page,'Restore access (demo)',evidence.transactions[2].hash);await page.getByRole('button',{name:'Close proof',exact:true}).click()
  expect(await page.evaluate(()=>(window as unknown as {demoCredentialCalls:{create:number,get:number}}).demoCredentialCalls)).toEqual({create:0,get:0})
  expect(await snapshot()).toEqual(before)
  expect(writes).toEqual([])
})

test('network fallback preserves historical labels and never invents refreshed state',async({page})=>{
  await page.route('**/api/demo',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}))
  await page.goto('/demo');await page.getByText('Live verification and evidence provenance',{exact:true}).click()
  await page.getByRole('button',{name:'Check live state (read-only)',exact:true}).click()
  await expect(page.getByRole('main').getByRole('status')).toContainText('stored historical evidence')
  await expect(page.getByText('Live read-only report:',{exact:false})).toHaveCount(0)
})

test('all customer scenes and proof dialogs fit a 390px phone',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/demo')
  for(let scene=0;scene<6;scene++){
    await expect(page.getByRole('heading',{name:headings[scene],exact:true})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    if(scene===1){
      const dialog=await openProof(page,'Create wallet (demo)',initialSpend)
      const box=await dialog.boundingBox();expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.getByRole('button',{name:'Close proof',exact:true}).click()
    }
    if(scene<5)await page.getByRole('button',{name:'Next scene',exact:true}).click()
  }
})

import { test, expect } from '@playwright/test'

test('new verified customer sign-in initializes and restores the same wallet using live reads only',async({page,context})=>{
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable')
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
 let sends=0;page.on('request',req=>{try{if(req.postDataJSON()?.method==='eth_sendUserOperation')sends++}catch{}})
 try{
  await page.goto('/login');await page.getByRole('button',{name:'Create wallet',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Your wallet',exact:true})).toBeVisible({timeout:60000});await expect(page.getByRole('link',{name:'Activate wallet'})).toBeVisible({timeout:60000})
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('continuity-customer-safe-v1')!).safe)
  const account=await page.request.get('/api/auth');expect((await account.json()).account.safe).toBe(first)
  await page.request.post('/api/auth',{headers:{origin:'http://localhost:3000'},data:{action:'logout'}})
  // Only this isolated virtual test context is emptied. No real profile/storage.
  await page.evaluate(()=>localStorage.clear());await page.goto('/login');await page.getByRole('button',{name:'Continue with passkey',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Your wallet',exact:true})).toBeVisible({timeout:60000})
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('continuity-customer-safe-v1')!).safe)).toBe(first);expect(sends).toBe(0)
  await expect(page.getByRole('heading',{name:'Confirmed on Sepolia'})).toHaveCount(0)
 }finally{await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});await cdp.send('WebAuthn.disable')}
})

test('public customer wallet balance reads work through the actual server gateway',async({page})=>{
 let sends=0;page.on('request',req=>{try{if(req.postDataJSON()?.method==='eth_sendUserOperation')sends++}catch{}})
 await page.addInitScript(()=>localStorage.setItem('continuity-customer-safe-v1',JSON.stringify({version:1,safe:'0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06'})))
 await page.goto('/');await expect(page.locator('.balance')).toContainText('USDC',{timeout:60000});await expect(page.getByText('Recovery enabled — 2 of 3 approvals required',{exact:true})).toBeVisible({timeout:60000});expect(sends).toBe(0)
})

test('live Sepolia reads initialize a virtual-passkey Safe without broadcasting', async ({ page, context }) => {
  // Optional provider integration check: real RPC reads, virtual authenticator.
  // No transaction is signed or sent. This does not satisfy live user acceptance.
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Create passkey and initialize Safe' }).click()
  const accountHeading = page.getByRole('heading', { name: '2. Safe account', exact: true })
  const error = page.getByRole('main').getByRole('alert')
  await expect(accountHeading.or(error)).toBeVisible({ timeout: 60_000 })
  expect(await error.count(), await error.count() ? await error.innerText() : '').toBe(0)
  await expect(accountHeading).toBeVisible()
  const safePanel = page.locator('section').filter({ has: page.getByRole('heading', { name: '2. Safe account', exact: true }) })
  await expect(safePanel.getByText('Ethereum Sepolia (11155111)', { exact: true })).toBeVisible()
  await expect(safePanel.getByText('Predicted address: not yet deployed', { exact: true })).toBeVisible()
  const safeAddress = await safePanel.locator('dd code').first().textContent()
  expect(safeAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
})

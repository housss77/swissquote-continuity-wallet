import { test, expect } from '@playwright/test'
import { decodeFunctionData, encodeFunctionResult, domainSeparator, type Address } from 'viem'
import { expectedModuleCode, recoveryAbi, safeAbi, factoryAbi } from '../../lib/recovery/contracts'
import { intentHash } from '../../lib/recovery/signatures'

test('replacement refresh preserves the new signer and guardian file loading invalidates stale previews',async({page})=>{
  // Synthetic public fixtures only. No signing, broadcasting or chain-success
  // claim: reproduce the metadata refresh between deployment and preparation.
  const safe='0x1111111111111111111111111111111111111111',oldOwner='0x2222222222222222222222222222222222222222',newOwner='0x3333333333333333333333333333333333333333'
  const guardians=['0x4444444444444444444444444444444444444444','0x5555555555555555555555555555555555555555','0x6666666666666666666666666666666666666666']
  const record=(signer:string,x:string)=>({credential:{role:'replacement',rpId:'localhost',signer,passkey:{rawId:'11'.repeat(32),coordinates:{x:`0x${x.repeat(32)}`,y:`0x${'22'.repeat(32)}`}}},signature:'0x11'})
  const fresh=record(newOwner,'11'),previous=record(oldOwner,'33')
  const backup={...record(guardians[0],'44'),credential:{...record(guardians[0],'44').credential,role:'customer_backup'}}
  await page.addInitScript(({safe,fresh,backup})=>localStorage.setItem('continuity-recovery-public-draft-v1',JSON.stringify({safe,backup,replacement:fresh})),{safe,fresh,backup})
  let sends=0,signs=0
  let heldChainRead:Promise<void>|null=null
  await page.addInitScript(()=>{Object.defineProperty(navigator.credentials,'get',{value:async()=>{throw new Error('TEST_MUST_NOT_SIGN')}})})
  const abi=[...safeAbi,...recoveryAbi,...factoryAbi]
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.hostname==='localhost') {
      if(url.pathname==='/api/recovery') {
        if(request.method()==='POST') {expect(request.postDataJSON().action).toBe('publish_metadata');return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'RECOVERY_INVALID_METADATA_PROOF'})})}
        return route.fulfill({contentType:'application/json',body:JSON.stringify({bank:guardians[1],backup:null,replacement:previous,transactions:[]} )})
      }
      return route.continue()
    }
    const body=request.postDataJSON()
    if(body.method==='eth_chainId' && heldChainRead)await heldChainRead
    let result:unknown
    if(body.method==='eth_chainId')result='0xaa36a7'
    else if(body.method==='eth_getCode')result=expectedModuleCode(180)
    else if(body.method==='eth_getBlockByNumber')result={number:'0x1',timestamp:'0x100',hash:`0x${'11'.repeat(32)}`,transactions:[]}
    else if(body.method==='eth_call') {
      const call=decodeFunctionData({abi,data:body.params[0].data}),name=call.functionName
      const values:Record<string,string|bigint|boolean|unknown[]>={VERSION:body.params[0].to.toLowerCase()===safe?'1.4.1':'0.2.0',getOwners:[oldOwner],getThreshold:1n,isModuleEnabled:true,getGuardians:guardians,threshold:2n,nonce:4n,
        getRecoveryRequest:[0n,0n,0n,0n,[]],
        domainSeparator:domainSeparator({domain:{name:'Social Recovery Module',version:'0.2.0',chainId:11155111,verifyingContract:body.params[0].to as Address}}),
        getSigner:call.args?.[0]===BigInt(fresh.credential.passkey.coordinates.x)?newOwner:call.args?.[0]===BigInt(backup.credential.passkey.coordinates.x)?guardians[0]:oldOwner}
      if(name==='getRecoveryHash')values[name]=intentHash({chainId:11155111,moduleVersion:'0.2.0',module:body.params[0].to as Address,safe:call.args?.[0] as Address,newOwner:(call.args?.[1] as Address[])[0],newThreshold:'1',nonce:String(call.args?.[3])})
      result=encodeFunctionResult({abi,functionName:name,result:values[name]})
    } else {if(body.method==='eth_sendUserOperation' || body.method==='eth_sendRawTransaction')sends++;if(body.method.includes('sign'))signs++;throw new Error(`Unexpected preparation RPC ${body.method}`)}
    await route.fulfill({contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:body.id,result})})
  })
  await page.goto('/recovery');await page.getByLabel('Safe address',{exact:true}).fill(safe)
  await page.getByRole('button',{name:'Find wallet',exact:true}).click()
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Prepare replacement access',exact:true})})
  await expect(panel.getByText(newOwner,{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Register public backup metadata',exact:true}).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('RECOVERY_INVALID_METADATA_PROOF')
  await expect(page.getByRole('status')).not.toContainText('public credential metadata verified')
  await page.getByRole('button',{name:'Refresh recovery state',exact:true}).click()
  await expect(page.getByRole('button',{name:'Refresh recovery state',exact:true})).toBeEnabled()
  await expect(panel.getByText(newOwner,{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Prepare recovery preview',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Replacement owner preview prepared')
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  expect(sends).toBe(0);expect(signs).toBe(0)
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('continuity-recovery-public-draft-v1')!).replacement.credential.signer)).toBe(newOwner)
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download request for independent guardian',exact:true}).click()])
  const stream=await download.createReadStream(),chunks:Buffer[]=[]
  for await(const chunk of stream)chunks.push(chunk)
  const intent=JSON.parse(Buffer.concat(chunks).toString())
  await page.goto('/guardian')
  const upload=page.getByLabel('Public enrollment or recovery request',{exact:true})
  await upload.setInputFiles({name:'first.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(intent))})
  const approve=page.getByRole('button',{name:'Sign and download verified public approval',exact:true})
  await expect(approve).toBeEnabled()
  let releaseRead:()=>void=()=>{}
  heldChainRead=new Promise(resolve=>{releaseRead=resolve})
  const pendingRead=page.waitForRequest(request=>{try{return new URL(request.url()).hostname!=='localhost' && request.postDataJSON()?.method==='eth_chainId'}catch{return false}})
  await upload.setInputFiles({name:'new-invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...intent,newOwner:guardians[0]}))})
  await pendingRead
  try {await expect(approve).toHaveCount(0)}finally{releaseRead();heldChainRead=null}
  await expect(page.getByRole('main').getByRole('alert')).toContainText('RECOVERY_STALE_OR_CHANGED_INTENT')
  expect(sends).toBe(0);expect(signs).toBe(0)
})

test('recovery opens from a clean browser without an original wallet session',async ({page})=>{
  await page.goto('/recovery')
  await expect(page.getByRole('heading',{name:'Recover your Continuity Wallet'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Find wallet',exact:true})).toBeDisabled()
  expect(await page.evaluate(()=>localStorage.length)).toBe(0)
  await expect(page.getByText('Owner rotation confirmed',{exact:false})).toHaveCount(0)
})

test('backup deployment explains missing operator and server rejection without signing or changing identity',async({page})=>{
  // Synthetic public draft and read-only RPC fixtures; no real deployment call.
  const safe='0x1111111111111111111111111111111111111111',owner='0x2222222222222222222222222222222222222222',signer='0x3333333333333333333333333333333333333333'
  const backup={credential:{role:'customer_backup',rpId:'localhost',signer,passkey:{rawId:'11'.repeat(32),coordinates:{x:`0x${'11'.repeat(32)}`,y:`0x${'22'.repeat(32)}`}}},signature:'0x11'}
  await page.addInitScript(({safe,backup})=>{
    localStorage.setItem('continuity-recovery-public-draft-v1',JSON.stringify({safe,backup}))
    Object.defineProperty(navigator.credentials,'get',{value:async()=>{throw new Error('TEST_MUST_NOT_SIGN')}})
    Object.defineProperty(navigator.credentials,'create',{value:async()=>{throw new Error('TEST_MUST_NOT_CREATE')}})
  },{safe,backup})
  const abi=[...safeAbi,...recoveryAbi,...factoryAbi]
  let posts=0,broadcasts=0,apiError='RECOVERY_OPERATOR_UNAUTHORIZED'
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.hostname==='localhost') {
      if(url.pathname!=='/api/recovery')return route.continue()
      if(request.method()==='POST') {
        posts++;expect(request.postDataJSON().action).toBe('deploy_credential')
        return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:apiError})})
      }
      return route.fulfill({contentType:'application/json',body:JSON.stringify({bank:'0x4444444444444444444444444444444444444444',backup:null,replacement:null,transactions:[]})})
    }
    const body=request.postDataJSON();let result:unknown
    if(body.method==='eth_chainId')result='0xaa36a7'
    else if(body.method==='eth_getCode')result=expectedModuleCode(180)
    else if(body.method==='eth_getBlockByNumber')result={number:'0x1',timestamp:'0x100',hash:`0x${'11'.repeat(32)}`,transactions:[]}
    else if(body.method==='eth_call') {
      const call=decodeFunctionData({abi,data:body.params[0].data})
      const values:Record<string,string|bigint|boolean|unknown[]>={VERSION:body.params[0].to.toLowerCase()===safe?'1.4.1':'0.2.0',getOwners:[owner],getThreshold:1n,isModuleEnabled:false,getGuardians:[],threshold:0n,nonce:0n,getRecoveryRequest:[0n,0n,0n,0n,[]],getSigner:signer,
        domainSeparator:domainSeparator({domain:{name:'Social Recovery Module',version:'0.2.0',chainId:11155111,verifyingContract:body.params[0].to as Address}})}
      result=encodeFunctionResult({abi,functionName:call.functionName,result:values[call.functionName]})
    } else {broadcasts++;throw new Error('Unexpected RPC in rejected provisioning test')}
    await route.fulfill({contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:body.id,result})})
  })
  await page.goto('/recovery');const storageBefore=await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort()))
  await page.getByLabel('Safe address',{exact:true}).fill(safe)
  await page.getByRole('button',{name:'Find wallet',exact:true}).click()
  const deploy=page.getByRole('button',{name:'Deploy backup identity',exact:true}),alert=page.getByRole('main').getByRole('alert')
  await deploy.click()
  await expect(alert).toContainText('Enter the demo operator credential')
  await expect(alert).toContainText('not your Windows Hello PIN')
  expect(posts).toBe(0)
  await page.getByLabel('Demo operator credential',{exact:true}).fill('incorrect-test-only-operator')
  await deploy.click()
  await expect(alert).toContainText('RECOVERY_OPERATOR_UNAUTHORIZED')
  await expect(alert).toContainText('before signing or sending')
  expect(posts).toBe(1)
  apiError='RECOVERY_SAFE_NOT_ALLOWLISTED'
  await deploy.click()
  await expect(alert).toContainText('RECOVERY_ALLOWED_SAFE_ADDRESSES')
  await expect(alert).toContainText('restart the server')
  expect(posts).toBe(2);expect(broadcasts).toBe(0)
  expect(await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort()))).toBe(storageBefore)
  await expect(page.getByText(signer,{exact:true})).toBeVisible()
  await expect(page.getByText('Verified Sepolia transaction:',{exact:false})).toHaveCount(0)
})
test('anonymous demo bank approval is rejected before any signing or RPC action',async ({page})=>{
  await page.goto('/recovery')
  const reply=await page.evaluate(async()=>{
    const response=await fetch('/api/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'bank_approve',verifiedDemoIdentity:true})})
    return {status:response.status,body:await response.json()}
  })
  expect(reply.status).toBe(400)
  expect(reply.body.error).toBe('RECOVERY_OPERATOR_UNAUTHORIZED')
})

test('recovery preserves original RPC submission errors instead of claiming enrollment success',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('continuity-recovery-operations-v1',JSON.stringify({kind:'recovery',description:'Rejected enrollment fixture',safeAddress:'0x1111111111111111111111111111111111111111',userOperationHash:`0x${'11'.repeat(32)}`,state:'rejected',acceptance:'no',submissionError:{stage:'submit',httpStatus:200,rpcCode:-32500,message:'AA23 verification reverted',acceptance:'no'}})))
  await page.goto('/recovery')
  await expect(page.getByText('AA23 verification reverted',{exact:true})).toBeVisible()
  await expect(page.getByText('-32500',{exact:true})).toBeVisible()
  await expect(page.getByText('Owner rotation confirmed',{exact:false})).toHaveCount(0)
})

test('startup shows Sepolia and never shows a fabricated success', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Swissquote Continuity Wallet', exact: true })).toBeVisible()
  await expect(page.getByText('Ethereum Sepolia only')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create passkey and initialize Safe' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
})

test('unsupported WebAuthn blocks creation with actionable guidance', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined }) })
  await page.goto('/')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('WebAuthn ES256 passkeys are unavailable')
  await expect(page.getByRole('button', { name: 'Create passkey and initialize Safe' })).toBeDisabled()
})

test('a rejected browser prompt does not create account metadata or claim success', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.credentials, 'create', {
      value: async () => { throw new DOMException('Cancelled', 'NotAllowedError') },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create passkey and initialize Safe' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('cancelled, rejected, or timed out')
  expect(await page.evaluate(() => localStorage.length)).toBe(0)
})

test('virtual authenticator stores public metadata even when the network fails', async ({ page, context }) => {
  // Automation only: this does NOT prove a real user authenticator or onchain operation.
  // No successful blockchain response is mocked and no operation is broadcast.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === 'localhost') await route.continue()
    else await route.fulfill({ status: 503, body: 'offline test' })
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create passkey and initialize Safe' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible({ timeout: 30_000 })
  const keys = await page.evaluate(() => {
    const raw = localStorage.getItem('continuity-wallet-sepolia-passkey-v1')
    if (!raw) return []
    return Object.keys(JSON.parse(raw)).sort()
  })
  expect(keys).toEqual(['coordinates', 'rawId'])
  await expect(page.getByRole('button', { name: 'Authenticate and connect Safe' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
})

test('legacy pending metadata is labelled unknown with no submission acknowledgement', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('continuity-wallet-sepolia-pending-v1', JSON.stringify({
      userOperationHash: `0x${'11'.repeat(32)}`, safeAddress: '0x1111111111111111111111111111111111111111', kind: 'mint', description: 'Legacy unit fixture',
    }))
  })
  await page.goto('/')
  await expect(page.getByText('Unknown/unresolved; acceptance or confirmation is uncertain.')).toBeVisible()
  await expect(page.getByText('No submission acknowledgement recorded.', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create passkey and initialize Safe' })).toBeDisabled()
})

test('read-only checks preserve submission diagnostics and never broadcast', async ({ page }) => {
  let broadcasts = 0
  await page.addInitScript(() => {
    localStorage.setItem('continuity-wallet-sepolia-pending-v1', JSON.stringify({
      userOperationHash: `0x${'11'.repeat(32)}`, safeAddress: '0x1111111111111111111111111111111111111111', kind: 'mint', description: 'Rejected unit fixture', state: 'rejected', acceptance: 'no',
      submissionError: { stage: 'submit', at: '2026-01-01T00:00:00Z', message: 'AA24 signature error', httpStatus: 200, rpcCode: -32507, acceptance: 'no' },
    }))
  })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === 'localhost') return route.continue()
    const body = route.request().postDataJSON() as { id: number; method: string }
    if (body.method === 'eth_sendUserOperation') broadcasts++
    const result = body.method === 'eth_chainId' ? '0xaa36a7' : body.method === 'pimlico_getUserOperationStatus' ? { status: 'not_found', transactionHash: null } : null
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Check pending operation' }).click()
  await expect(page.getByText('Latest read-only checks:', { exact: false })).toBeVisible()
  await expect(page.getByText('AA24 signature error', { exact: true })).toBeVisible()
  await expect(page.getByText('-32507', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  expect(broadcasts).toBe(0)
})

test('preparation diagnostic failure cannot prompt a passkey, broadcast, or change stored identity/history', async ({ page }) => {
  let broadcasts = 0
  await page.addInitScript(() => {
    // Isolated public metadata fixture; not a real passkey or wallet identity.
    localStorage.setItem('continuity-wallet-sepolia-passkey-v1', JSON.stringify({ rawId: '00', coordinates: { x: `0x${'11'.repeat(32)}`, y: `0x${'22'.repeat(32)}` } }))
    localStorage.setItem('continuity-wallet-sepolia-pending-v1', JSON.stringify({
      userOperationHash: `0x${'11'.repeat(32)}`, safeAddress: '0x1111111111111111111111111111111111111111', kind: 'mint',
      description: 'Tutorial NFT mint: token 7 to this Safe. Zero ETH transferred.', state: 'rejected', acceptance: 'no',
      submissionError: { stage: 'submit', at: '2026-01-01T00:00:00Z', message: 'Gas limit rejected', httpStatus: 200, rpcCode: -32602, acceptance: 'no' },
    }))
    localStorage.setItem('continuity-wallet-sepolia-pending-v1-history', '[{"description":"Preserved test history"}]')
    Object.defineProperty(navigator.credentials, 'get', { value: async () => { throw new Error('Preparation must never request passkey signing') } })
    Object.defineProperty(navigator.credentials, 'create', { value: async () => { throw new Error('Preparation must never create a passkey') } })
  })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === 'localhost') return route.continue()
    const body = route.request().postDataJSON() as { method?: string }
    if (body?.method === 'eth_sendUserOperation') broadcasts++
    await route.fulfill({ status: 503, body: 'offline preparation fixture' })
  })
  await page.goto('/')
  const storageBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))
  await page.getByRole('button', { name: 'Diagnose NFT sponsorship (no signing or sending)' }).click()
  const report = page.getByRole('region', { name: 'Preparation-only sponsorship diagnostic' }).locator('pre')
  await expect(report).toContainText('"valid": false', { timeout: 30_000 })
  await expect(report).toContainText('"stage": "prepare"')
  await expect(report).toContainText('"acceptance": "no"')
  await expect(report).not.toContainText('Preparation must never')
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(storageBefore)
  expect(broadcasts).toBe(0)
  await expect(page.getByText('Gas limit rejected', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
})

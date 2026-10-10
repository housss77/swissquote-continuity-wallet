// Opt-in real Sepolia test. Virtual authenticators are clearly distinguished
// from a human's devices. Never reads an existing browser profile or exports keys.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fork, spawn, execFileSync } from 'node:child_process'
import { chromium, expect } from '@playwright/test'
import { build } from 'esbuild'
import { createPublicClient, http, parseAbi, decodeEventLog, keccak256, hashTypedData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { preimageSafeTransactionHash } from '@safe-global/protocol-kit'
import artifact from '../lib/recovery/artifact.json' with {type:'json'}

if(process.argv[2]!=='--disposable-sepolia-only')throw new Error('Explicit --disposable-sepolia-only required; this test sends real transactions.')
execFileSync('git',['check-ignore','-q','.env.local'],{stdio:'pipe'})
process.loadEnvFile('.env.local')
const forbidden='0x6f7c9faba9b6039255f2301935d891ffe6065e8c'
const evidenceFile='.recovery-data/live-recovery-test.json'
try {await fs.access(evidenceFile);throw new Error('EXISTING_LIVE_TEST_RECORD_REVIEW_BEFORE_ANOTHER_TEST')}catch(e){if(e.code!=='ENOENT')throw e}
const rpc=process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const client=createPublicClient({chain:sepolia,transport:http(rpc,{timeout:15000,retryCount:0})})
const module=process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS
const delay=Number(process.env.NEXT_PUBLIC_RECOVERY_DELAY_SECONDS)
if(!module || delay!==180)throw new Error('Verified test-only module required')
const bank=privateKeyToAccount(process.env.RECOVERY_INSTITUTIONAL_PRIVATE_KEY).address
const relayer=privateKeyToAccount(process.env.RECOVERY_RELAYER_PRIVATE_KEY).address
assert.notEqual(bank.toLowerCase(),relayer.toLowerCase())
const safeAbi=parseAbi(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function nonce() view returns(uint256)',
  'function getModulesPaginated(address,uint256) view returns(address[],address)','function checkSignatures(bytes32,bytes,bytes) view'])
const nft='0xBb9ebb7b8Ee75CDBf64e5cE124731A89c2BC4A07'
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)'])
const userOpAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
let server,browser,thirdWorker,stage='preflight',safe,backupGuardian,third,original,customerContext,customerPage,freshContext,freshPage
const report={environment:'REAL_ETHEREUM_SEPOLIA',chainId:11155111,authenticator:'Chrome virtual WebAuthn; not a human hardware acceptance test',organizationalIndependence:'Simulated; third-party key isolated in a separate process',module,delay,transactions:[],rounds:[],tests:[],startedAt:new Date().toISOString()}
const persist=async()=>{await fs.mkdir('.recovery-data',{recursive:true});await fs.writeFile(evidenceFile,JSON.stringify(report,null,2))}
const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args})
async function originalSnapshot() {
  return {owners:await read(forbidden,safeAbi,'getOwners'),threshold:String(await read(forbidden,safeAbi,'getThreshold')),
    nonce:String(await read(forbidden,safeAbi,'nonce')),modules:(await read(forbidden,safeAbi,'getModulesPaginated',['0x0000000000000000000000000000000000000001',100n]))[0]}
}
const json=v=>JSON.stringify(v,(_,value)=>typeof value==='bigint'?value.toString():value)
async function startServer() {
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','localhost'],{env:process.env,windowsHide:true,stdio:'ignore'})
  for(let i=0;i<100;i++) {
    if(server.exitCode!==null)throw new Error('LIVE_TEST_SERVER_START_FAILED_OR_PORT_OCCUPIED')
    try {if((await fetch('http://localhost:3000',{signal:AbortSignal.timeout(1000)})).ok)return}catch{}
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  throw new Error('LIVE_TEST_SERVER_NOT_READY')
}
async function stopServer() {
  if(!server)return
  const current=server;current.kill();await new Promise(resolve=>current.once('exit',resolve));server=null
}
async function isolatedCustomer() {
  const context=await browser.newContext(),page=await context.newPage(),cdp=await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  return {context,page}
}
async function uiClick(page,name) {
  await expect(page.getByRole('button',{name,exact:true})).toBeEnabled({timeout:30000})
  await page.getByRole('button',{name,exact:true}).click() // ONE explicit click; no retries.
  await page.waitForTimeout(200)
  const idle=page.url().includes('/recovery')?'Refresh recovery state':'Authenticate and connect Safe'
  await expect(page.getByRole('button',{name:idle,exact:true})).toBeEnabled({timeout:180000})
  const error=await page.getByRole('alert').allTextContents()
  if(error.length)throw new Error(`LIVE_UI_ERROR: ${error.join(' ').slice(0,500)}`)
}
async function confirmedNative(page,kind) {
  const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Relayer submission',exact:true})})
  const link=section.locator('a[href*="/tx/"]'),hash=(await link.getAttribute('href')).split('/tx/')[1]
  await uiClick(page,'Check transaction receipt and recovery state')
  const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120000})
  assert.equal(receipt.status,'success')
  report.transactions.push({kind,hash,block:String(receipt.blockNumber)})
  await persist();console.log(json({confirmed:kind,transactionHash:hash}))
  return receipt
}
async function confirmedSponsored(page,kind,key='continuity-recovery-operations-v1') {
  const pending=await page.evaluate(key=>JSON.parse(localStorage.getItem(key) || 'null'),key)
  if(!pending || pending.state!=='included' || !pending.transactionHash)throw new Error('SPONSORED_ATTEMPT_NOT_CONFIRMED_NO_RETRY')
  assert.equal(pending.safeAddress.toLowerCase(),safe.toLowerCase())
  const receipt=await client.waitForTransactionReceipt({hash:pending.transactionHash,confirmations:2,timeout:120000})
  assert.equal(receipt.status,'success')
  let event
  for(const log of receipt.logs) {
    if(log.address.toLowerCase()!=='0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789')continue
    try {const decoded=decodeEventLog({abi:userOpAbi,data:log.data,topics:log.topics});if(decoded.args.userOpHash===pending.userOperationHash)event=decoded.args}catch{}
  }
  assert.ok(event?.success);assert.equal(event.sender.toLowerCase(),safe.toLowerCase());assert.equal(event.paymaster.toLowerCase(),pending.paymasterAddress.toLowerCase())
  const entry={kind,hash:receipt.transactionHash,userOperationHash:pending.userOperationHash,paymaster:event.paymaster,block:String(receipt.blockNumber)}
  if(kind.includes('NFT')) {
    let token
    for(const log of receipt.logs)if(log.address.toLowerCase()===nft.toLowerCase()) {
      try {const decoded=decodeEventLog({abi:transferAbi,data:log.data,topics:log.topics});if(decoded.args.to.toLowerCase()===safe.toLowerCase())token=decoded.args.tokenId}catch{}
    }
    assert.ok(token!==undefined);entry.tokenId=String(token)
    assert.equal((await read(nft,parseAbi(['function ownerOf(uint256) view returns(address)']),'ownerOf',[token])).toLowerCase(),safe.toLowerCase())
  }
  report.transactions.push(entry);await persist();console.log(json({confirmed:kind,transactionHash:entry.hash,userOperationHash:entry.userOperationHash}))
  return receipt
}
async function archive(page) {
  if(await page.getByRole('heading',{name:'Preserved sponsored recovery attempt',exact:true}).count())await uiClick(page,'Preserve completed attempt and enable manual next operation')
}
async function find(page) {
  await page.goto('http://localhost:3000/recovery')
  await page.getByLabel('Safe address',{exact:true}).fill(safe)
  await uiClick(page,'Find wallet')
}
async function nativeSignature(page) {
  const draft=await page.evaluate(()=>({replacement:JSON.parse(localStorage.getItem('continuity-recovery-public-draft-v1') || 'null')?.replacement?.credential?.passkey,
    original:JSON.parse(localStorage.getItem('continuity-wallet-sepolia-passkey-v1') || 'null')}))
  const pk=draft.replacement || draft.original
  await page.addScriptTag({path:path.resolve('.dist/recovery-test/browser.js')})
  const signed=await page.evaluate(({pk,safe,rpc})=>window.signProbeSafeTransaction(pk,safe,[{to:safe,value:'0',data:'0x'}],rpc),{pk,safe,rpc})
  const preimage=preimageSafeTransactionHash(safe,signed.data,'1.4.1',11155111n),digest=keccak256(preimage)
  await read(safe,safeAbi,'checkSignatures',[digest,preimage,signed.signatures])
  return {signed,preimage,digest}
}
async function guardianSign(typed) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('INDEPENDENT_GUARDIAN_TIMEOUT')),15000)
    thirdWorker.once('message',value=>{clearTimeout(timer);value.error?reject(new Error(value.error)):resolve(value.signature)})
    thirdWorker.send({id:1,typed:JSON.parse(json(typed))})
  })
}
async function independentPage() {
  const context=await browser.newContext(),page=await context.newPage()
  await page.exposeBinding('independentRequest',async(_,payload)=>{
    if(payload.method==='eth_requestAccounts')return [third]
    if(payload.method==='eth_chainId')return '0xaa36a7'
    if(payload.method==='eth_signTypedData_v4')return guardianSign(JSON.parse(payload.params[1]))
    throw new Error('INDEPENDENT_WALLET_METHOD_REJECTED')
  })
  await page.addInitScript(()=>{window.ethereum={request:payload=>window.independentRequest(payload)}})
  await page.goto('http://localhost:3000/guardian')
  return {context,page}
}
async function signedFile(guardianPage,request) {
  await guardianPage.getByLabel('Public enrollment or recovery request',{exact:true}).setInputFiles({name:'request.json',mimeType:'application/json',buffer:Buffer.from(json(request))})
  const [download]=await Promise.all([guardianPage.waitForEvent('download',{timeout:30000}),guardianPage.getByRole('button',{name:'Sign and download verified public approval',exact:true}).click()])
  const stream=await download.createReadStream(),chunks=[]
  for await(const chunk of stream)chunks.push(chunk)
  return Buffer.concat(chunks)
}
async function main() {
  assert.equal(await client.getChainId(),11155111)
  assert.ok(await client.getBalance({address:relayer})>0n)
  assert.equal(await read(module,artifact.abi,'VERSION'),'0.2.0')
  let code=artifact.deployedBytecode.slice(2)
  for(const refs of Object.values(artifact.immutableReferences))for(const ref of refs)code=code.slice(0,ref.start*2)+BigInt(delay).toString(16).padStart(ref.length*2,'0')+code.slice((ref.start+ref.length)*2)
  assert.equal(keccak256(await client.getCode({address:module})),keccak256(`0x${code}`))
  original=await originalSnapshot();report.originalSafeBefore=original
  const env=Object.fromEntries(['PATH','SystemRoot','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))
  thirdWorker=fork(path.resolve('tests/recovery/guardian-worker.cjs'),[],{env,windowsHide:true,silent:true})
  third=await new Promise(resolve=>thirdWorker.once('message',v=>resolve(v.address)))
  report.bank=bank;report.third=third;report.relayer=relayer
  assert.ok(new Set([bank,third,relayer].map(a=>a.toLowerCase())).size===3)
  await build({entryPoints:['tests/recovery/browser.js'],bundle:true,platform:'browser',format:'iife',inject:['tests/recovery/polyfills.js'],
    alias:{buffer:path.resolve('node_modules/buffer/index.js'),assert:path.resolve('node_modules/assert/build/assert.js'),stream:path.resolve('node_modules/stream-browserify/index.js'),events:path.resolve('node_modules/events/events.js')},outfile:'.dist/recovery-test/browser.js'})
  await startServer();browser=await chromium.launch({channel:'chrome',headless:true})
  const initial=await isolatedCustomer();customerContext=initial.context;customerPage=initial.page
  await customerPage.goto('http://localhost:3000')
  stage='create disposable spending passkey'
  await uiClick(customerPage,'Create passkey and initialize Safe')
  const codes=await customerPage.locator('section').filter({has:customerPage.getByRole('heading',{name:'2. Safe account',exact:true})}).locator('code').allTextContents()
  safe=codes.find(value=>/^0x[a-fA-F0-9]{40}$/.test(value))
  assert.ok(safe);assert.notEqual(safe.toLowerCase(),forbidden);report.safe=safe;await persist()
  stage='sponsored disposable Safe deployment NFT'
  await uiClick(customerPage,'Sign and send sponsored NFT mint')
  await confirmedSponsored(customerPage,'initial sponsored NFT deployment','continuity-wallet-sepolia-pending-v1')
  const oldOwner=(await read(safe,safeAbi,'getOwners'))[0];report.initialOwner=oldOwner
  // Extend the allowlist only with this newly created disposable Safe.
  const allowed=(process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES || '').split(',').filter(Boolean)
  assert.ok(allowed.every(a=>a.toLowerCase()!==forbidden))
  process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES=[...new Set([...allowed,safe])].join(',')
  let contents=await fs.readFile('.env.local','utf8')
  const line=`RECOVERY_ALLOWED_SAFE_ADDRESSES=${process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES}`
  contents=/^RECOVERY_ALLOWED_SAFE_ADDRESSES=.*$/m.test(contents)?contents.replace(/^RECOVERY_ALLOWED_SAFE_ADDRESSES=.*$/m,line):contents.trimEnd()+'\n'+line+'\n'
  await fs.writeFile('.env.local',contents)
  await stopServer();await startServer()
  const guardian=await independentPage()
  await find(customerPage);await customerPage.getByLabel('Demo operator credential',{exact:true}).fill(process.env.RECOVERY_DEMO_OPERATOR_TOKEN)
  stage='backup guardian WebAuthn enrollment'
  await uiClick(customerPage,'Create recovery passkey')
  await uiClick(customerPage,'Deploy backup identity')
  await confirmedNative(customerPage,'backup guardian proxy deployment')
  const draft=await customerPage.evaluate(()=>JSON.parse(localStorage.getItem('continuity-recovery-public-draft-v1')))
  backupGuardian=draft.backup.credential.signer;report.backupGuardian=backupGuardian
  await customerPage.getByLabel('Independent guardian address',{exact:true}).fill(third)
  const preview={kind:'guardian_enrollment',chainId:11155111,safe,module,backup:backupGuardian,bank,third,threshold:2,delay}
  const proof=await signedFile(guardian.page,preview)
  await customerPage.getByLabel('Import guardian enrollment proof',{exact:true}).setInputFiles({name:'proof.json',mimeType:'application/json',buffer:proof})
  stage='atomic sponsored enrollment'
  await uiClick(customerPage,'Simulate and sign atomic protection setup')
  await confirmedSponsored(customerPage,'atomic sponsored guardian enrollment')
  const guardians=await read(module,artifact.abi,'getGuardians',[safe]);assert.equal(await read(module,artifact.abi,'threshold',[safe]),2n)
  assert.deepEqual([...guardians].map(a=>a.toLowerCase()).sort(),[backupGuardian,bank,third].map(a=>a.toLowerCase()).sort())
  assert.deepEqual(await read(safe,safeAbi,'getOwners'),[oldOwner]);assert.equal(await read(safe,safeAbi,'getThreshold'),1n)
  report.tests.push('Atomic enrollment leaves exactly 3 distinct non-spending guardians, threshold 2, unchanged spending owner')
  await archive(customerPage)
  for(const [round,pair] of [['A+B',['backup','bank']],['A+C',['backup','third']],['B+C',['bank','third']]]) {
    let page=customerPage
    if(round==='B+C') {
      // Permanently destroy both original customer contexts/credentials. Never
      // use WebAuthn.getCredentials, storageState or key export/import.
      await customerContext.close();customerContext=null
      const fresh=await isolatedCustomer();freshContext=fresh.context;freshPage=fresh.page;page=freshPage
      await page.goto('http://localhost:3000/recovery');assert.equal(await page.evaluate(()=>localStorage.length),0)
      report.tests.push('Original customer browser and all original customer passkeys destroyed before B+C recovery')
      await find(page)
    }
    stage=`${round}: new replacement passkey`
    await page.getByLabel('Demo operator credential',{exact:true}).fill(process.env.RECOVERY_DEMO_OPERATOR_TOKEN)
    const currentOld=(await read(safe,safeAbi,'getOwners'))[0]
    const previous=round==='B+C'?null:await nativeSignature(page)
    await uiClick(page,'Create replacement spending passkey');await uiClick(page,'Deploy replacement identity')
    await confirmedNative(page,`${round} replacement proxy deployment`)
    await uiClick(page,'Prepare recovery preview')
    const publicDraft=await page.evaluate(()=>JSON.parse(localStorage.getItem('continuity-recovery-public-draft-v1')))
    const owner=publicDraft.replacement.credential.signer,nonce=await read(module,artifact.abi,'nonce',[safe])
    const intent={chainId:11155111,moduleVersion:'0.2.0',safe,module,newOwner:owner,newThreshold:'1',nonce:String(nonce)}
    if(pair.includes('backup'))await uiClick(page,'Approve with backup passkey')
    if(pair.includes('bank')) {
      await page.getByLabel('Demo bank verification completed by operator (simulated identity check)',{exact:true}).check()
      await uiClick(page,'Request demo bank approval')
    }
    if(pair.includes('third')) {
      const approval=await signedFile(guardian.page,intent)
      await page.getByLabel('Or import independently signed public approval file',{exact:true}).setInputFiles({name:'approval.json',mimeType:'application/json',buffer:approval})
    }
    // Module-side negative checks: native eth_call simulation, no broadcast.
    let earlyFailed=false
    stage=`${round}: real guardian initiation`
    await uiClick(page,'Start delayed recovery')
    const initiation=await confirmedNative(page,`${round} recovery initiation`)
    const request=await read(module,artifact.abi,'getRecoveryRequest',[safe])
    assert.equal(request.newOwners[0].toLowerCase(),owner.toLowerCase());assert.equal(request.newThreshold,1n);assert.equal(request.nonce,nonce)
    const startBlock=await client.getBlock({blockNumber:initiation.blockNumber});assert.equal(request.executableAt,startBlock.timestamp+180n)
    try{await client.simulateContract({address:module,abi:artifact.abi,functionName:'finalizeRecovery',args:[safe],account:relayer})}catch{earlyFailed=true}
    assert.equal(earlyFailed,true)
    console.log(json({round,status:'delay enforced; waiting for real Sepolia block time',executableAt:String(request.executableAt)}))
    stage=`${round}: real chain delay`
    while((await client.getBlock()).timestamp<request.executableAt)await new Promise(resolve=>setTimeout(resolve,12000))
    await uiClick(page,'Refresh recovery state')
    stage=`${round}: real finalization`
    await uiClick(page,'Finalize recovery');const finalized=await confirmedNative(page,`${round} recovery finalization`)
    const owners=await read(safe,safeAbi,'getOwners');assert.deepEqual(owners.map(a=>a.toLowerCase()),[owner.toLowerCase()]);assert.equal(await read(safe,safeAbi,'getThreshold'),1n)
    assert.ok(!owners.some(a=>a.toLowerCase()===currentOld.toLowerCase()))
    if(previous) {
      let rejected=false;try{await read(safe,safeAbi,'checkSignatures',[previous.digest,previous.preimage,previous.signed.signatures])}catch{rejected=true}assert.equal(rejected,true)
    }
    for(const item of report.transactions.filter(t=>t.tokenId))assert.equal((await read(nft,parseAbi(['function ownerOf(uint256) view returns(address)']),'ownerOf',[BigInt(item.tokenId)])).toLowerCase(),safe.toLowerCase())
    // Reload proves metadata/event restoration rather than relying on rotated UI state.
    await find(page);await uiClick(page,'Check transaction receipt and recovery state')
    await archive(page)
    stage=`${round}: real new-passkey sponsored transaction`
    await uiClick(page,'Sign and send test NFT with replacement passkey')
    const post=await confirmedSponsored(page,`${round} post-recovery sponsored NFT`)
    await archive(page)
    report.rounds.push({pair:round,initiation:initiation.transactionHash,finalization:finalized.transactionHash,postRecoveryTransaction:post.transactionHash,newOwner:owner,
      originalOwnerRevoked:true,delayEnforced:true,sameSafeAndAssetsPreserved:true,oldSignatureRejected:previous?true:'Not signed from destroyed original context; verified previous rounds and onchain owner removal',withoutOriginalCustomerCredentials:round==='B+C'})
    await persist();console.log(json({round,passed:true,finalization:finalized.transactionHash}))
  }
  // Complete the loss case by replacing the unavailable backup with a newly
  // enrolled authenticator guardian, authorized by the recovered spending owner.
  stage='restore backup guardian after loss'
  await freshPage.getByLabel('Demo operator credential',{exact:true}).fill(process.env.RECOVERY_DEMO_OPERATOR_TOKEN)
  await uiClick(freshPage,'Create recovery passkey');await uiClick(freshPage,'Deploy backup identity')
  await confirmedNative(freshPage,'replacement backup proxy deployment')
  await uiClick(freshPage,'Sign replacement of backup guardian')
  await confirmedSponsored(freshPage,'atomic sponsored backup guardian repair')
  await uiClick(freshPage,'Verify backup access')
  const repaired=await read(module,artifact.abi,'getGuardians',[safe]);assert.equal(repaired.length,3);assert.ok(!repaired.some(a=>a.toLowerCase()===backupGuardian.toLowerCase()));assert.equal(await read(module,artifact.abi,'threshold',[safe]),2n)
  report.tests.push('Unavailable backup guardian replaced atomically by recovered passkey; new backup access verified')
  report.originalSafeAfter=await originalSnapshot();assert.deepEqual(report.originalSafeAfter,original)
  report.tests.push('Accepted existing Safe owner, threshold, nonce and enabled modules unchanged')
  report.relayerRemainingWei=String(await client.getBalance({address:relayer}));report.complete=true;report.finishedAt=new Date().toISOString()
  await persist();console.log(json(report))
}
main().catch(async e=>{
  let sanitized=String(e.shortMessage || e.message || 'Live recovery failed').replace(/https?:\/\/[^\s]+/g,'[URL]')
  for(const [name,value] of Object.entries(process.env))if(/PRIVATE_KEY|TOKEN|API_KEY|POLICY_ID|RPC_URL/.test(name) && value?.length>8)sanitized=sanitized.split(value).join('[REDACTED]')
  sanitized=sanitized.slice(0,700)
  report.complete=false;report.failure={stage,error:sanitized};await persist();console.log(json({verifiedComplete:false,stage,error:sanitized,publicEvidence:evidenceFile}));process.exitCode=1
}).finally(async()=>{await browser?.close();thirdWorker?.kill();await stopServer()})

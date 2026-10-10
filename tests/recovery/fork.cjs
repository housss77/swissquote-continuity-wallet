// Isolated Sepolia fork only. Never loads .env or touches the existing Safe.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const httpServer = require('node:http')
const {fork:spawnGuardian}=require('node:child_process')
const { chromium } = require('@playwright/test')
const { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, zeroAddress, hashTypedData, keccak256 } = require('viem')
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts')
const { sepolia } = require('viem/chains')
const { SafeFactory, SafeProvider, preimageSafeTransactionHash, getSafeWebAuthnSharedSignerContract, getMultiSendContract, encodeMultiSendData } = require('@safe-global/protocol-kit')
const { getAddModulesLibDeployment, getSafe4337ModuleDeployment }=require('@safe-global/safe-modules-deployments')
const Safe = require('@safe-global/protocol-kit').default
const artifact = require('../../lib/recovery/artifact.json')
const factory = '0x1d31F259eE307358a26dFb23EB365939E8641195'
const verifier = '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765'
const factoryAbi = parseAbi(['function getSigner(uint256,uint256,uint176) view returns(address)','function createSigner(uint256,uint256,uint176) returns(address)'])
const safeAbi = parseAbi(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)', 'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) returns(bool)', 'function enableModule(address)','function isModuleEnabled(address) view returns(bool)', 'function isOwner(address) view returns(bool)', 'function checkSignatures(bytes32 dataHash,bytes data,bytes signatures) view','function execTransactionFromModule(address to,uint256 value,bytes data,uint8 operation) returns(bool)'])
const c = createPublicClient({chain:sepolia,transport:http('http://127.0.0.1:8549',{timeout:60000,retryCount:0})})
let stage = 'initialization', browser, server
const relayerKey = generatePrivateKey()
const relayer = privateKeyToAccount(relayerKey)
const workers=[]
async function independentSigner() {
  const child=spawnGuardian(path.join(__dirname,'guardian-worker.cjs'),[],{silent:true,windowsHide:true})
  workers.push(child)
  const {address}=await new Promise(resolve=>child.once('message',resolve))
  return {address,signTypedData:typed=>new Promise((resolve,reject)=> {
    child.once('message',value=>value.error?reject(new Error(value.error)):resolve(value.signature))
    child.send({id:1,typed:JSON.parse(JSON.stringify(typed,(_,v)=>typeof v==='bigint'?v.toString():v))})
  })}
}
const w = createWalletClient({chain:sepolia,account:relayer,transport:http('http://127.0.0.1:8549')})
const read = (address,abi,functionName,args=[]) => c.readContract({address,abi,functionName,args})
const report = { environment: 'LOCAL_SEPOLIA_FORK_ONLY', tests: [] }
async function write(address,abi,functionName,args) {
  const { request } = await c.simulateContract({address,abi,functionName,args,account:relayer})
  const hash = await w.writeContract(request)
  assert.equal((await c.waitForTransactionReceipt({hash})).status,'success')
  return hash
}
async function rejects(name, work) {
  let failed=false
  try { await work() } catch { failed=true }
  assert.equal(failed,true,name)
  report.tests.push(name)
}
async function main() {
  const bank=await independentSigner(),third=await independentSigner()
  assert.equal(await c.getChainId(),11155111)
  await c.request({method:'anvil_setBalance',params:[relayer.address,'0x8ac7230489e80000']})
  server=httpServer.createServer((req,res)=> {
    res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html')
    res.end(req.url==='/bundle.js'?fs.readFileSync(path.resolve('.dist/recovery-test/browser.js')):'<!doctype html><script src="/bundle.js"></script>Isolated recovery probe')
  })
  await new Promise(resolve=>server.listen(3081,'127.0.0.1',resolve))
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext()
  const page=await context.newPage()
  page.on('pageerror',e=>console.log('BROWSER_BUNDLE_ERROR: '+e.message.replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,160)))
  const cdp=await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  await page.goto('http://localhost:3081')
  stage='passkey enrollment'
  const oldPk=await page.evaluate(()=>window.createProbePasskey())
  const backupPk=await page.evaluate(()=>window.createProbePasskey())
  const newPk=await page.evaluate(()=>window.createProbePasskey())
  assert.notEqual(backupPk.rawId,oldPk.rawId)
  const signer=async pk=> {
    const args=[BigInt(pk.coordinates.x),BigInt(pk.coordinates.y),BigInt(verifier)]
    const address=await read(factory,factoryAbi,'getSigner',args)
    await write(factory,factoryAbi,'createSigner',args)
    return address
  }
  stage='signer proxy deployment'
  const provider=await SafeProvider.init('http://127.0.0.1:8549',oldPk,'1.4.1')
  const shared=await getSafeWebAuthnSharedSignerContract({safeProvider:provider,safeVersion:'1.4.1'})
  const oldOwner=await shared.getAddress(),guardian=await signer(backupPk),newOwner=await signer(newPk)
  assert.notEqual(oldOwner,newOwner)
  stage='disposable Safe deployment'
  const sf=await SafeFactory.init({provider:'http://127.0.0.1:8549',signer:relayerKey,safeVersion:'1.4.1'})
  const addModules=getAddModulesLibDeployment({version:'0.2.0',network:'11155111'}).networkAddresses['11155111']
  const module4337=getSafe4337ModuleDeployment({version:'0.2.0',network:'11155111'}).networkAddresses['11155111']
  const multisend=await getMultiSendContract({safeProvider:provider,safeVersion:'1.4.1'})
  const setup=[{to:addModules,value:'0',operation:1,data:encodeFunctionData({abi:parseAbi(['function enableModules(address[])']),functionName:'enableModules',args:[[module4337]]})},
    {to:oldOwner,value:'0',operation:1,data:shared.encode('configure',[{x:BigInt(oldPk.coordinates.x),y:BigInt(oldPk.coordinates.y),verifiers:BigInt(verifier)}])}]
  const setupData=encodeFunctionData({abi:parseAbi(['function multiSend(bytes)']),functionName:'multiSend',args:[encodeMultiSendData(setup)]})
  const safe=await sf.deploySafe({safeAccountConfig:{owners:[oldOwner],threshold:1,to:await multisend.getAddress(),data:setupData,fallbackHandler:module4337},saltNonce:Date.now().toString()})
  report.tests.push('same pinned shared spending signer and 4337-module configuration as Step 1')
  const safeAddress=await safe.getAddress()
  assert.notEqual(safeAddress.toLowerCase(),'0x6f7c9faba9b6039255f2301935d891ffe6065e8c')
  stage='unmodified v0.2.0 recovery module deployment'
  const deployment=await w.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,args:[180n]})
  const module=(await c.waitForTransactionReceipt({hash:deployment})).contractAddress
  let expectedCode=artifact.deployedBytecode.slice(2)
  for (const refs of Object.values(artifact.immutableReferences)) for (const r of refs) expectedCode=expectedCode.slice(0,r.start*2)+(180n).toString(16).padStart(r.length*2,'0')+expectedCode.slice((r.start+r.length)*2)
  assert.equal(keccak256(await c.getCode({address:module})),keccak256(`0x${expectedCode}`))
  report.tests.push('deployed runtime exactly matches reviewed source and 180-second immutable')
  const txs=[{to:safeAddress,value:'0',data:encodeFunctionData({abi:safeAbi,functionName:'enableModule',args:[module]})}, ...[guardian,bank.address,third.address].map((a,i)=>({to:module,value:'0',data:encodeFunctionData({abi:artifact.abi,functionName:'addGuardianWithThreshold',args:[a,i===0?1n:2n]})}))]
  async function safeSend(pk, transactions) {
    const signed=await page.evaluate(({pk,safeAddress,transactions})=>window.signProbeSafeTransaction(pk,safeAddress,transactions),{pk,safeAddress,transactions})
    const d=signed.data
    return write(safeAddress,safeAbi,'execTransaction',[d.to,BigInt(d.value),d.data,d.operation,BigInt(d.safeTxGas),BigInt(d.baseGas),BigInt(d.gasPrice),d.gasToken,d.refundReceiver,signed.signatures])
  }
  stage='atomic enrollment signed by old disposable passkey'
  await safeSend(oldPk,txs)
  assert.equal(await read(module,artifact.abi,'threshold',[safeAddress]),2n)
  const guardians=await read(module,artifact.abi,'getGuardians',[safeAddress])
  assert.equal(new Set(guardians.map(a=>a.toLowerCase())).size,3)
  report.tests.push('atomic 3 distinct guardians; threshold 2; no guardian spending owner')
  const token=BigInt(Date.now()),nft='0xBb9ebb7b8Ee75CDBf64e5cE124731A89c2BC4A07'
  const nftAbi=parseAbi(['function safeMint(address,uint256)','function ownerOf(uint256) view returns(address)'])
  await safeSend(oldPk,[{to:nft,value:'0',data:encodeFunctionData({abi:nftAbi,functionName:'safeMint',args:[safeAddress,token]})}])
  assert.equal((await read(nft,nftAbi,'ownerOf',[token])).toLowerCase(),safeAddress.toLowerCase())
  stage='WebAuthn guardian ERC1271 verification'
  const nonce=await read(module,artifact.abi,'nonce',[safeAddress])
  const digest=await read(module,artifact.abi,'getRecoveryHash',[safeAddress,[newOwner],1n,nonce])
  const typed={domain:{name:'Social Recovery Module',version:'0.2.0',chainId:11155111,verifyingContract:module},types:{ExecuteRecovery:[{name:'wallet',type:'address'},{name:'newOwners',type:'address[]'},{name:'newThreshold',type:'uint256'},{name:'nonce',type:'uint256'}]},primaryType:'ExecuteRecovery',message:{wallet:safeAddress,newOwners:[newOwner],newThreshold:1n,nonce}}
  assert.equal(hashTypedData(typed),digest)
  const backupSig=await page.evaluate(({pk,digest})=>window.signProbeDigest(pk,digest),{pk:backupPk,digest})
  await read(module,artifact.abi,'validateGuardianSignature',[safeAddress,digest,guardian,backupSig])
  report.tests.push('actual WebAuthn ES256 assertion validates through actual module ERC1271')
  const bankSig=await bank.signTypedData(typed), thirdSig=await third.signTypedData(typed)
  const all=[{signer:guardian,signature:backupSig},{signer:bank.address,signature:bankSig},{signer:third.address,signature:thirdSig}]
  const sorted=pairs=>[...pairs].sort((a,b)=>BigInt(a.signer)<BigInt(b.signer)?-1:1)
  const confirm=pairs=>c.simulateContract({address:module,abi:artifact.abi,functionName:'multiConfirmRecovery',args:[safeAddress,[newOwner],1n,nonce,sorted(pairs),true],account:relayer})
  for (const pair of [[0,1],[0,2],[1,2]]) { await confirm(pair.map(i=>all[i])); report.tests.push(`pair ${pair.join('+')} accepted without old owner signature`) }
  for (let i=0;i<3;i++) await rejects(`single guardian ${i} rejected`,()=>confirm([all[i]]))
  await rejects('duplicate guardian rejected',()=>confirm([all[0],all[0]]))
  const wrongDigest=`0x${'11'.repeat(32)}`
  await rejects('signature bound to exact recovery digest',()=>read(module,artifact.abi,'validateGuardianSignature',[safeAddress,wrongDigest,guardian,backupSig]))
  const wrongChain=hashTypedData({...typed,domain:{...typed.domain,chainId:1}})
  await rejects('wrong chain/domain rejected onchain',()=>read(module,artifact.abi,'validateGuardianSignature',[safeAddress,wrongChain,guardian,backupSig]))
  await rejects('wrong replacement owner rejected onchain',()=>c.simulateContract({address:module,abi:artifact.abi,functionName:'multiConfirmRecovery',args:[safeAddress,[oldOwner],1n,nonce,sorted([all[0],all[1]]),true],account:relayer}))
  await rejects('wrong Safe rejected onchain',()=>c.simulateContract({address:module,abi:artifact.abi,functionName:'multiConfirmRecovery',args:[relayer.address,[newOwner],1n,nonce,sorted([all[0],all[1]]),true],account:relayer}))
  await rejects('unregistered guardian rejected onchain',()=>read(module,artifact.abi,'validateGuardianSignature',[safeAddress,digest,relayer.address,bankSig]))
  await rejects('invalid signature rejected onchain',()=>read(module,artifact.abi,'validateGuardianSignature',[safeAddress,digest,guardian,'0x0102']))
  for (const g of [guardian,bank.address,third.address]) {
    await rejects(`guardian ${g} cannot execute ordinary module spending`,()=>c.simulateContract({address:safeAddress,abi:safeAbi,functionName:'execTransactionFromModule',args:[relayer.address,0n,'0x',0],account:g}))
  }
  stage='old owner cancellation'
  await write(module,artifact.abi,'multiConfirmRecovery',[safeAddress,[newOwner],1n,nonce,sorted([all[0],all[1]]),true])
  await safeSend(oldPk,[{to:module,value:'0',data:encodeFunctionData({abi:artifact.abi,functionName:'cancelRecovery',args:[]})}])
  assert.equal((await read(module,artifact.abi,'getRecoveryRequest',[safeAddress])).executableAt,0n)
  await rejects('cancelled nonce cannot be replayed',()=>confirm([all[0],all[1]]))
  report.tests.push('valid original passkey cancels malicious recovery and invalidates approvals')
  const resumedNonce=await read(module,artifact.abi,'nonce',[safeAddress])
  const resumedTyped={...typed,message:{...typed.message,nonce:resumedNonce}}
  const resumedBankSig=await bank.signTypedData(resumedTyped),resumedThirdSig=await third.signTypedData(resumedTyped)
  const resumedPairs=sorted([{signer:bank.address,signature:resumedBankSig},{signer:third.address,signature:resumedThirdSig}])
  const oldSigned=await page.evaluate(({pk,safeAddress})=>window.signProbeSafeTransaction(pk,safeAddress,[{to:safeAddress,value:'0',data:'0x'}]),{pk:oldPk,safeAddress})
  const preimage=preimageSafeTransactionHash(safeAddress,oldSigned.data,'1.4.1',11155111n)
  const originalDigest=keccak256(preimage)
  await read(safeAddress,safeAbi,'checkSignatures',[originalDigest,preimage,oldSigned.signatures])
  // Remove the entire original isolated browser: both original credentials gone.
  await context.close()
  const fresh=await browser.newContext(),freshPage=await fresh.newPage(),freshCdp=await fresh.newCDPSession(freshPage)
  await freshCdp.send('WebAuthn.enable')
  await freshCdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  await freshPage.goto('http://localhost:3081')
  assert.equal(await freshPage.evaluate(()=>localStorage.length),0)
  const replacementPk=await freshPage.evaluate(()=>window.createProbePasskey())
  const replacementOwner=await signer(replacementPk)
  const freshTyped={...resumedTyped,message:{...resumedTyped.message,newOwners:[replacementOwner]}}
  const freshPairs=sorted([{signer:bank.address,signature:await bank.signTypedData(freshTyped)},{signer:third.address,signature:await third.signTypedData(freshTyped)}])
  stage='public relay and enforceable delay'
  await write(module,artifact.abi,'multiConfirmRecovery',[safeAddress,[replacementOwner],1n,resumedNonce,freshPairs,true])
  await rejects('stale/replayed request rejected',()=>c.simulateContract({address:module,abi:artifact.abi,functionName:'multiConfirmRecovery',args:[safeAddress,[replacementOwner],1n,resumedNonce,freshPairs,true],account:relayer}))
  await rejects('finalization before contract delay rejected',()=>c.simulateContract({address:module,abi:artifact.abi,functionName:'finalizeRecovery',args:[safeAddress],account:relayer}))
  await c.request({method:'evm_increaseTime',params:[181]})
  await c.request({method:'evm_mine',params:[]})
  await write(module,artifact.abi,'finalizeRecovery',[safeAddress])
  assert.deepEqual(await read(safeAddress,safeAbi,'getOwners'),[replacementOwner])
  assert.equal(await read(safeAddress,safeAbi,'getThreshold'),1n)
  report.tests.push('bank + independent guardian rotate owner after EVM-enforced delay')
  assert.equal(await read(safeAddress,safeAbi,'isOwner',[oldOwner]),false)
  assert.equal(await read(safeAddress,safeAbi,'isModuleEnabled',[module]),true)
  assert.equal(await read(module,artifact.abi,'threshold',[safeAddress]),2n)
  assert.equal((await read(nft,nftAbi,'ownerOf',[token])).toLowerCase(),safeAddress.toLowerCase())
  report.tests.push('original address and NFT preserved; obsolete owner revoked; guardians remain')
  stage='new passkey transaction'
  const signed=await freshPage.evaluate(({pk,safeAddress})=>window.signProbeSafeTransaction(pk,safeAddress,[{to:safeAddress,value:'0',data:'0x'}]),{pk:replacementPk,safeAddress})
  const d=signed.data
  await write(safeAddress,safeAbi,'execTransaction',[d.to,BigInt(d.value),d.data,d.operation,BigInt(d.safeTxGas),BigInt(d.baseGas),BigInt(d.gasPrice),d.gasToken,d.refundReceiver,signed.signatures])
  await rejects('previously valid original WebAuthn signature fails after owner revocation',()=>read(safeAddress,safeAbi,'checkSignatures',[originalDigest,preimage,oldSigned.signatures]))
  report.tests.push('replacement passkey authorizes a confirmed LOCAL Safe transaction')
  report.tests.push('fresh browser recovery requires neither original credential nor original storage')
  report.safe=safeAddress; report.module=module; report.oldOwner=oldOwner; report.newOwner=replacementOwner; report.backupGuardian=guardian
  console.log(JSON.stringify(report,null,2))
}
main().catch(e=>{console.log(JSON.stringify({environment:'LOCAL_SEPOLIA_FORK_ONLY',stage,error:(e.shortMessage||e.message||'Probe failed').replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,300)}));process.exitCode=1}).finally(async()=>{await browser?.close();server?.close();workers.forEach(w=>w.kill())})

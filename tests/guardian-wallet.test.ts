import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getAddress, type PublicClient } from 'viem'
import { assertGuardianConnection, independentWallet, readGuardianConnection, type ExternalWallet } from '../lib/recovery/providers'
import { discoverGuardianWallets } from '../lib/recovery/wallet-discovery'
import { recoveryErrorMessage } from '../lib/recovery/errors'

const guardian=getAddress('0x419d08ffdd36ae0ebcc5d652d029d50c33cfdd86')
const other=getAddress('0x1111111111111111111111111111111111111111')
test('wallet account normalization accepts the same lowercase and checksummed guardian',async()=>{
  const methods:string[]=[]
  const wallet:ExternalWallet={request:async({method})=>{methods.push(method);return method==='eth_chainId'?'0xAA36A7':[guardian.toLowerCase()]}}
  const read=await readGuardianConnection(wallet)
  assert.deepEqual(read,{accounts:[guardian],chainId:11155111})
  assert.equal(assertGuardianConnection(read,guardian),guardian)
  assert.deepEqual(methods,['eth_accounts','eth_chainId'])
  await readGuardianConnection(wallet,true)
  assert.deepEqual(methods.slice(2),['eth_requestAccounts','eth_chainId'])
  const differentCasing='0x419D08ffDD36aE0Ebcc5d652D029D50c33Cfdd86'
  const casedWallet:ExternalWallet={request:async({method})=>method==='eth_chainId'?'0xaa36a7':[differentCasing]}
  assert.equal(assertGuardianConnection(await readGuardianConnection(casedWallet),differentCasing),guardian)
})
test('matching account on a wrong network is a chain error and never requests a signature',async()=>{
  const methods:string[]=[]
  const wallet:ExternalWallet={request:async({method})=>{methods.push(method);return method==='eth_chainId'?'0x1':[guardian]}}
  await assert.rejects(()=>independentWallet({} as PublicClient,wallet,guardian).approve({} as never),/RECOVERY_THIRD_PARTY_WRONG_CHAIN/)
  assert.ok(!methods.includes('eth_signTypedData_v4'))
  assert.match(recoveryErrorMessage('RECOVERY_THIRD_PARTY_WRONG_CHAIN'),/Ethereum Sepolia/)
})
test('account validation uses the first authorized account and fails closed for missing or different accounts',()=>{
  assert.throws(()=>assertGuardianConnection({chainId:11155111,accounts:[]},guardian),/ACCOUNT_UNAVAILABLE/)
  assert.throws(()=>assertGuardianConnection({chainId:11155111,accounts:[other,guardian]},guardian),/WRONG_THIRD_PARTY_ACCOUNT/)
  assert.match(recoveryErrorMessage('RECOVERY_WRONG_THIRD_PARTY_ACCOUNT'),/authorize it for localhost/)
})
test('malformed wallet responses do not become a valid guardian connection',async()=>{
  for(const result of [{accounts:null,chain:'0xaa36a7'},{accounts:[12],chain:'0xaa36a7'},{accounts:[guardian],chain:11155111},{accounts:[guardian],chain:'0xz'},{accounts:[guardian],chain:'0xffffffffffffffff'}]) {
    const wallet={request:async({method}:{method:string})=>method==='eth_chainId'?result.chain:result.accounts}
    await assert.rejects(()=>readGuardianConnection(wallet),/INVALID_WALLET_RESPONSE/)
  }
})
test('EIP-6963 discovery keeps MetaMask distinct from a conflicting default provider, deduplicates and handles late announcements',()=>{
  const metamask:ExternalWallet={request:async()=>{throw Error('DISCOVERY_MUST_NOT_CONNECT')}},defaultWallet:ExternalWallet={request:async()=>{throw Error('DISCOVERY_MUST_NOT_CONNECT')}}
  const scope=Object.assign(new EventTarget(),{ethereum:defaultWallet})
  let options:Parameters<Parameters<typeof discoverGuardianWallets>[1]>[0]=[]
  const announce=(name:string,provider:ExternalWallet)=>scope.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{name,rdns:name==='MetaMask'?'io.metamask':'other.wallet'},provider}}))
  scope.addEventListener('eip6963:requestProvider',()=>{announce('Other',defaultWallet);announce('MetaMask',metamask)})
  const stop=discoverGuardianWallets(scope,v=>{options=v})
  assert.equal(options.length,2)
  assert.equal(options.find(v=>v.label.startsWith('MetaMask'))?.provider,metamask)
  assert.ok(options.every(v=>v.source==='eip6963'))
  const id=options.find(v=>v.provider===metamask)?.id
  announce('MetaMask',metamask)
  assert.equal(options.length,2);assert.equal(options.find(v=>v.provider===metamask)?.id,id)
  announce('Late', {request:async()=>null})
  assert.equal(options.length,3)
  stop();announce('After unmount',{request:async()=>null});assert.equal(options.length,3)
})
test('legacy provider arrays expose each wallet rather than silently selecting the default',()=>{
  const first={request:async()=>null},metamask={request:async()=>null,isMetaMask:true}
  const scope=Object.assign(new EventTarget(),{ethereum:{...first,providers:[first,metamask]}})
  let options:Parameters<Parameters<typeof discoverGuardianWallets>[1]>[0]=[]
  const stop=discoverGuardianWallets(scope,v=>{options=v})
  assert.equal(options.length,2);assert.equal(options[1].provider,metamask)
  assert.ok(options.every(v=>v.source==='legacy'));stop()
})

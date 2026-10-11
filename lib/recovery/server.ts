import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, hashMessage, type Address, type Hash, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { RPC_URL } from '../constants'
import { scrubMessage } from '../diagnostics'
import { address, assertDisposableSafe, factoryAbi, recoveryAbi, recoveryCall, P256_VERIFIER, SIGNER_FACTORY } from './contracts'
import { recoveryState, verifyModule } from './onchain'
import { metadataDigest, verifyCredentialBinding, verifyMetadataProof, verifyFreshCredential } from './passkey'
import { intentHash, typedIntent, validateIntent, verifyApprovals } from './signatures'
import type { GuardianApproval, PublicCredential, RecoveryIntent } from './types'

export const recoveryClient=createPublicClient({chain:sepolia,transport:http(RPC_URL,{timeout:15000,retryCount:0})})
const secretAccount=(key:string|undefined)=>{
  if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) throw new Error('RECOVERY_SERVER_SIGNER_UNAVAILABLE')
  return privateKeyToAccount(key as Hex)
}
export const bankAddress=()=>secretAccount(process.env.RECOVERY_INSTITUTIONAL_PRIVATE_KEY).address
export function allowedSafe(value:string):Address {
  const safe=address(value)
  assertDisposableSafe(safe)
  let allow:string[]
  try {
    allow=(process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES || '').split(',').filter(Boolean).map(a=>address(a.trim()).toLowerCase())
  } catch { throw new Error('RECOVERY_INVALID_SAFE_ALLOWLIST') }
  if (!allow.includes(safe.toLowerCase())) throw new Error('RECOVERY_SAFE_NOT_ALLOWLISTED')
  return safe
}
const attempts=new Map<string,{count:number;until:number}>()
export function checkBrowserOrigin(request:Request) {
  const origin=request.headers.get('origin'),url=new URL(request.url)
  if (url.hostname!=='localhost' || origin!==url.origin) throw new Error('RECOVERY_ORIGIN_REJECTED')
  const previous=attempts.get('operator'),now=Date.now()
  const slot=previous && previous.until>now ? previous : {count:0,until:now+60000}
  attempts.set('operator',slot)
  if (++slot.count>10) throw new Error('RECOVERY_OPERATOR_RATE_LIMIT')
}
export function authenticateOperator(request:Request) {
  const expected=process.env.RECOVERY_DEMO_OPERATOR_TOKEN,header=request.headers.get('authorization')
  if (!expected || expected.length<32 || !header?.startsWith('Bearer ')) throw new Error('RECOVERY_OPERATOR_UNAUTHORIZED')
  const provided=Buffer.from(header.slice(7)),known=Buffer.from(expected)
  if (provided.length!==known.length || !timingSafeEqual(provided,known)) throw new Error('RECOVERY_OPERATOR_UNAUTHORIZED')
}
async function verifyReplacement(intent:RecoveryIntent,credential:PublicCredential,signature:Hex) {
  if (credential.role!=='replacement' || credential.signer.toLowerCase()!==intent.newOwner.toLowerCase()) throw new Error('RECOVERY_INVALID_REPLACEMENT')
  await verifyMetadataProof(recoveryClient,intent.safe,intent.module,credential,signature)
  const state=await recoveryState(recoveryClient,intent.safe)
  await verifyFreshCredential(recoveryClient,state.safe,state.owners,state.guardians,credential)
}
export async function institutionalApproval(input:unknown,verifiedDemoIdentity:boolean,credential:PublicCredential,signature:Hex):Promise<GuardianApproval> {
  if (verifiedDemoIdentity!==true) throw new Error('RECOVERY_DEMO_IDENTITY_CHECK_REQUIRED')
  const {intent,state,digest}=await validateIntent(recoveryClient,input)
  allowedSafe(intent.safe)
  await verifyReplacement(intent,credential,signature)
  const bank=secretAccount(process.env.RECOVERY_INSTITUTIONAL_PRIVATE_KEY)
  if (!state.guardians.some(g=>g.toLowerCase()===bank.address.toLowerCase())) throw new Error('RECOVERY_BANK_NOT_REGISTERED')
  const approval={signer:bank.address,signature:await bank.signTypedData(typedIntent(intent)),intentHash:digest}
  await verifyApprovals(recoveryClient,intent,[approval],false)
  return approval
}
type RelayRecord={hash:Hash;state:'broadcasting'|'accepted'|'unknown';safe:Address;action:string;createdAt:string}
const root=path.resolve('.recovery-data/relay')
const credentialFile=(signer:Address)=>path.resolve('.recovery-data/credentials',`${signer.toLowerCase()}.json`)
export async function relayRecords(safeValue:string):Promise<RelayRecord[]> {
  const safe=address(safeValue)
  let names:string[]
  try {names=await fs.readdir(root)} catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw new Error('RECOVERY_RELAY_RECORD_UNAVAILABLE')}
  const records:RelayRecord[]=[]
  for (const name of names.filter(n=>/^0x[a-f0-9]{64}\.json$/.test(n))) {
    const value=JSON.parse(await fs.readFile(path.join(root,name),'utf8')) as RelayRecord
    if (value.safe?.toLowerCase()===safe.toLowerCase())records.push({hash:value.hash,safe:value.safe,state:value.state,action:value.action,createdAt:value.createdAt})
  }
  return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10)
}
export async function replacementMetadata(safeValue:string) {
  const state=await recoveryState(recoveryClient,safeValue)
  const signer=state.request.executableAt>0n?state.request.newOwners[0]:state.owners[0]
  if (!signer)return null
  try {
    const record=JSON.parse(await fs.readFile(credentialFile(signer),'utf8')) as {safe:Address;credential:PublicCredential;signature:Hex}
    if (record.safe.toLowerCase()!==state.safe.toLowerCase() || record.credential.role!=='replacement' || record.credential.signer.toLowerCase()!==signer.toLowerCase())return null
    await verifyMetadataProof(recoveryClient,state.safe,state.module,record.credential,record.signature)
    return {credential:record.credential,signature:record.signature}
  } catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('RECOVERY_REPLACEMENT_METADATA_UNAVAILABLE')}
}
let locked=false
// A public transaction hash is persisted before one raw submission. A duplicate
// HTTP action returns the record and never signs/sends another transaction.
async function relayOnce(safe:Address,action:string,target:Address,data:Hex):Promise<RelayRecord> {
  if (locked) throw new Error('RECOVERY_RELAYER_BUSY')
  locked=true
  try {
    await verifyModule(recoveryClient)
    const id=hashMessage(JSON.stringify({chainId:11155111,safe,target,action}))
    await fs.mkdir(root,{recursive:true})
    const file=path.join(root,`${id}.json`)
    try { return JSON.parse(await fs.readFile(file,'utf8')) as RelayRecord } catch (e) { if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw new Error('RECOVERY_RELAY_RECORD_INVALID') }
    const account=secretAccount(process.env.RECOVERY_RELAYER_PRIVATE_KEY)
    const state=await recoveryState(recoveryClient,safe)
    if ([...state.owners,...state.guardians,bankAddress()].some(a=>a.toLowerCase()===account.address.toLowerCase())) throw new Error('RECOVERY_RELAYER_IDENTITY_NOT_INDEPENDENT')
    const wallet=createWalletClient({chain:sepolia,account,transport:http(RPC_URL,{timeout:30000,retryCount:0})})
    await recoveryClient.call({account:account.address,to:target,data,value:0n})
    const prepared=await wallet.prepareTransactionRequest({account,to:target,data,value:0n,type:'eip1559'})
    if (prepared.chainId!==11155111) throw new Error('RECOVERY_WRONG_RELAYER_CHAIN')
    const raw=await account.signTransaction(prepared),hash=keccak256(raw)
    let record:RelayRecord={hash,state:'broadcasting',safe,action,createdAt:new Date().toISOString()}
    // Exclusive create also prevents concurrent processes from broadcasting twice.
    await fs.writeFile(file,JSON.stringify(record),{flag:'wx'})
    try {
      const returned=await wallet.sendRawTransaction({serializedTransaction:raw})
      if (returned!==hash) throw new Error('RECOVERY_TRANSACTION_HASH_MISMATCH')
      record={...record,state:'accepted'}
    } catch { record={...record,state:'unknown'} }
    await fs.writeFile(file,JSON.stringify(record))
    return record
  } finally {locked=false}
}
export async function deployCredential(safeValue:string,credential:PublicCredential,signature:Hex) {
  const safe=allowedSafe(safeValue),{module}=await verifyModule(recoveryClient)
  const c=await verifyCredentialBinding(recoveryClient,credential,false)
  const state=await recoveryState(recoveryClient,safe)
  await verifyFreshCredential(recoveryClient,safe,state.owners,state.guardians,c)
  if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(signature) || signature.length>18000) throw new Error('RECOVERY_INVALID_METADATA_PROOF')
  const args=[BigInt(c.passkey.coordinates.x),BigInt(c.passkey.coordinates.y),BigInt(P256_VERIFIER)] as const
  const magic=await recoveryClient.readContract({address:SIGNER_FACTORY,abi:factoryAbi,functionName:'isValidSignatureForSigner',args:[metadataDigest(safe,module,c),signature,...args]})
  if (magic!=='0x1626ba7e') throw new Error('RECOVERY_INVALID_METADATA_PROOF')
  await fs.mkdir(path.dirname(credentialFile(c.signer)),{recursive:true})
  await fs.writeFile(credentialFile(c.signer),JSON.stringify({safe,credential:c,signature}))
  const code=await recoveryClient.getCode({address:c.signer})
  if (code && code!=='0x') return {deployed:true,signer:c.signer}
  return {deployed:false,signer:c.signer,transaction:await relayOnce(safe,`deploy signer ${c.signer}`,SIGNER_FACTORY,encodeFunctionData({abi:factoryAbi,functionName:'createSigner',args}))}
}
export async function initiate(input:unknown,approvals:GuardianApproval[],credential:PublicCredential,signature:Hex) {
  const {intent}=await validateIntent(recoveryClient,input)
  const safe=allowedSafe(intent.safe),sorted=await verifyApprovals(recoveryClient,intent,approvals)
  await verifyReplacement(intent,credential,signature)
  const data=recoveryCall('multiConfirmRecovery',[safe,[intent.newOwner],1n,BigInt(intent.nonce),sorted.map(a=>({signer:a.signer,signature:a.signature})),true])
  return relayOnce(safe,`initiate recovery ${intentHash(intent)}`,intent.module,data)
}
export async function finalize(safeValue:string) {
  const safe=allowedSafe(safeValue),state=await recoveryState(recoveryClient,safe)
  if (!state.protected || state.request.executableAt===0n || state.timestamp<state.request.executableAt) throw new Error('RECOVERY_DELAY_NOT_ELAPSED')
  // Bind relay id to the current request, rather than finalize calldata alone.
  return relayOnce(safe,`finalize recovery nonce ${state.request.nonce}`,state.module,recoveryCall('finalizeRecovery',[safe]))
}
export const publicError=(e:unknown)=>scrubMessage(e instanceof Error?e.message.split('\n')[0]:'Recovery request failed').slice(0,240)

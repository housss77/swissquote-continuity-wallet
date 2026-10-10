import { hashTypedData, isHex, type Address, type PublicClient } from 'viem'
import { address, recoveryAbi } from './contracts'
import { recoveryState } from './onchain'
import type { GuardianApproval, RecoveryIntent, RecoveryState } from './types'
const exactKeys=['chainId','module','safe','newOwner','newThreshold','nonce','moduleVersion']
export function parseIntent(input:unknown):RecoveryIntent {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('RECOVERY_INVALID_INTENT')
  const v=input as Record<string,unknown>
  if (Object.keys(v).length!==exactKeys.length || exactKeys.some(k=>!(k in v)) || v.chainId!==11155111 || v.moduleVersion!=='0.2.0' || v.newThreshold!=='1'
    || typeof v.nonce!=='string' || !/^(0|[1-9][0-9]*)$/.test(v.nonce) || BigInt(v.nonce)>=2n**256n) throw new Error('RECOVERY_INVALID_INTENT')
  return {...v,safe:address(String(v.safe)),module:address(String(v.module)),newOwner:address(String(v.newOwner))} as RecoveryIntent
}
export const typedIntent=(v:RecoveryIntent)=>({domain:{name:'Social Recovery Module',version:'0.2.0',chainId:11155111,verifyingContract:v.module},
  types:{ExecuteRecovery:[{name:'wallet',type:'address'},{name:'newOwners',type:'address[]'},{name:'newThreshold',type:'uint256'},{name:'nonce',type:'uint256'}]},
  primaryType:'ExecuteRecovery' as const,message:{wallet:v.safe,newOwners:[v.newOwner],newThreshold:1n,nonce:BigInt(v.nonce)}})
export const intentHash=(v:RecoveryIntent)=>hashTypedData(typedIntent(v))
export function makeIntent(state:RecoveryState,newOwner:Address):RecoveryIntent {
  if (!state.protected || state.request.executableAt!==0n || state.owners.some(o=>o.toLowerCase()===newOwner.toLowerCase()) || state.guardians.some(g=>g.toLowerCase()===newOwner.toLowerCase())) throw new Error('RECOVERY_INVALID_REPLACEMENT')
  return {chainId:11155111,module:state.module,safe:state.safe,newOwner:address(newOwner),newThreshold:'1',nonce:state.nonce.toString(),moduleVersion:'0.2.0'}
}
export async function validateIntent(client:PublicClient,input:unknown) {
  const v=parseIntent(input),state=await recoveryState(client,v.safe)
  if (!state.protected || state.module.toLowerCase()!==v.module.toLowerCase() || state.nonce!==BigInt(v.nonce)
    || state.request.executableAt!==0n || state.owners.some(a=>a.toLowerCase()===v.newOwner.toLowerCase()) || state.guardians.some(a=>a.toLowerCase()===v.newOwner.toLowerCase())) throw new Error('RECOVERY_STALE_OR_CHANGED_INTENT')
  const code=await client.getCode({address:v.newOwner})
  if (!code || code==='0x') throw new Error('RECOVERY_REPLACEMENT_NOT_DEPLOYED')
  const digest=await client.readContract({address:v.module,abi:recoveryAbi,functionName:'getRecoveryHash',args:[v.safe,[v.newOwner],1n,BigInt(v.nonce)]})
  if (digest!==intentHash(v)) throw new Error('RECOVERY_DIGEST_MISMATCH')
  return {intent:v,state,digest:intentHash(v)}
}
export async function verifyApprovals(client:PublicClient,intent:RecoveryIntent,approvals:GuardianApproval[],requireTwo=true) {
  const {state,digest}=await validateIntent(client,intent)
  if (!Array.isArray(approvals) || approvals.length>3 || (requireTwo && approvals.length<2)) throw new Error('RECOVERY_NEEDS_TWO_GUARDIANS')
  const unique=new Set<string>()
  for (const a of approvals) {
    const signer=address(a.signer).toLowerCase()
    if (unique.has(signer)) throw new Error('RECOVERY_DUPLICATE_GUARDIAN')
    unique.add(signer)
    if (!state.guardians.some(g=>g.toLowerCase()===signer) || a.intentHash!==digest || !isHex(a.signature,{strict:true})
      || a.signature.length%2!==0 || a.signature.length<4 || a.signature.length>18000) throw new Error('RECOVERY_INVALID_APPROVAL')
    await client.readContract({address:intent.module,abi:recoveryAbi,functionName:'validateGuardianSignature',args:[intent.safe,digest,address(a.signer),a.signature]})
  }
  return [...approvals].sort((a,b)=>BigInt(a.signer)<BigInt(b.signer)?-1:1)
}

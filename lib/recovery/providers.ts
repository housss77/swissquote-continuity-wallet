import type { Address, Hex, PublicClient } from 'viem'
import { address } from './contracts'
import { intentHash, typedIntent, verifyApprovals } from './signatures'
import type { GuardianApproval, RecoveryIntent } from './types'

export interface IndependentGuardian {
  identityType:'trusted_contact'|'organization'
  approve(intent:RecoveryIntent):Promise<GuardianApproval>
}
type ExternalWallet={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>}
export function independentWallet(client:PublicClient,wallet:ExternalWallet,expected:Address):IndependentGuardian {
  return {identityType:'trusted_contact',async approve(intent) {
    if (await wallet.request({method:'eth_chainId'})!=='0xaa36a7') throw new Error('RECOVERY_THIRD_PARTY_WRONG_CHAIN')
    const accounts=await wallet.request({method:'eth_requestAccounts'}) as string[]
    if (!accounts?.[0] || address(accounts[0]).toLowerCase()!==expected.toLowerCase()) throw new Error('RECOVERY_WRONG_THIRD_PARTY_ACCOUNT')
    const typed=typedIntent(intent)
    const data=JSON.stringify({...typed,types:{...typed.types,EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}]}},(_,v)=>typeof v==='bigint'?v.toString():v)
    const approval={signer:expected,intentHash:intentHash(intent),signature:await wallet.request({method:'eth_signTypedData_v4',params:[expected,data]}) as Hex}
    await verifyApprovals(client,intent,[approval],false)
    return approval
  }}
}
export interface InstitutionalGuardian {
  // Operator authentication and demo identity verification are mandatory; no anonymous sign route.
  approve(intent:RecoveryIntent,operatorToken:string,verifiedDemoIdentity:boolean):Promise<GuardianApproval>
}

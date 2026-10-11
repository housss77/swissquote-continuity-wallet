import type { Address, Hex, PublicClient } from 'viem'
import { address } from './contracts'
import { intentHash, typedIntent, verifyApprovals } from './signatures'
import type { GuardianApproval, RecoveryIntent } from './types'

export interface IndependentGuardian {
  identityType:'trusted_contact'|'organization'
  approve(intent:RecoveryIntent):Promise<GuardianApproval>
}
export type ExternalWallet={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>}
export type GuardianConnection={accounts:Address[];chainId:number}
export async function readGuardianConnection(wallet:ExternalWallet,requestAccess=false):Promise<GuardianConnection> {
  const accounts=await wallet.request({method:requestAccess?'eth_requestAccounts':'eth_accounts'})
  const chain=await wallet.request({method:'eth_chainId'})
  if (!Array.isArray(accounts) || accounts.some(a=>typeof a!=='string') || typeof chain!=='string' || !/^0x[0-9a-f]+$/i.test(chain)
    || BigInt(chain)>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('RECOVERY_INVALID_WALLET_RESPONSE')
  // RPC accounts are 20-byte hex addresses; their casing is not an identity.
  return {accounts:accounts.map(a=>address(a.toLowerCase())),chainId:Number(BigInt(chain))}
}
export function assertGuardianConnection(connection:GuardianConnection,expected?:Address):Address {
  if(connection.chainId!==11155111)throw new Error('RECOVERY_THIRD_PARTY_WRONG_CHAIN')
  const signer=connection.accounts[0]
  if(!signer)throw new Error('RECOVERY_GUARDIAN_ACCOUNT_UNAVAILABLE')
  if(expected && address(signer.toLowerCase()).toLowerCase()!==address(expected.toLowerCase()).toLowerCase())throw new Error('RECOVERY_WRONG_THIRD_PARTY_ACCOUNT')
  return signer
}
export function independentWallet(client:PublicClient,wallet:ExternalWallet,expected:Address):IndependentGuardian {
  return {identityType:'trusted_contact',async approve(intent) {
    assertGuardianConnection(await readGuardianConnection(wallet,true),expected)
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

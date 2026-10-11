import { hashTypedData, type Address, type Hex, type PublicClient } from 'viem'
import { address } from './contracts'
import type { GuardianApproval, RecoveryState } from './types'
export type EnrollmentPreview={kind:'guardian_enrollment';chainId:11155111;safe:Address;module:Address;backup:Address;bank:Address;third:Address;threshold:2;delay:number}
export function enrollmentPreview(state:RecoveryState,backup:Address,bank:Address,third:Address):EnrollmentPreview {
  return {kind:'guardian_enrollment',chainId:11155111,safe:state.safe,module:state.module,backup,bank,third,threshold:2,delay:state.delay}
}
export const enrollmentTyped=(p:EnrollmentPreview)=>({domain:{name:'Continuity Guardian Enrollment',version:'1',chainId:11155111,verifyingContract:p.module},
  types:{GuardianEnrollment:[{name:'safe',type:'address'},{name:'backup',type:'address'},{name:'bank',type:'address'},{name:'third',type:'address'},{name:'threshold',type:'uint256'},{name:'delay',type:'uint256'}]},primaryType:'GuardianEnrollment' as const,
  message:{safe:p.safe,backup:p.backup,bank:p.bank,third:p.third,threshold:2n,delay:BigInt(p.delay)}})
// This checks structure and binding only. UI state stores a proof only after
// verifyEnrollmentProof has also verified its actual cryptographic signature.
export function enrollmentProofMatches(p:EnrollmentPreview,input:unknown):input is GuardianApproval {
  if(!input || typeof input!=='object' || Array.isArray(input) || p.kind!=='guardian_enrollment' || p.chainId!==11155111
    || p.threshold!==2 || !Number.isSafeInteger(p.delay) || p.delay<=0)return false
  const proof=input as Record<string,unknown>
  if(Object.keys(proof).length!==3 || typeof proof.signer!=='string' || typeof proof.intentHash!=='string' || typeof proof.signature!=='string'
    || !/^0x[a-fA-F0-9]{64}$/.test(proof.intentHash) || !/^0x(?:[a-fA-F0-9]{2})+$/.test(proof.signature) || proof.signature.length>18000)return false
  try {
    for(const value of [p.safe,p.module,p.backup,p.bank,p.third])address(value)
    return address(proof.signer).toLowerCase()===p.third.toLowerCase() && proof.intentHash.toLowerCase()===hashTypedData(enrollmentTyped(p))
  }catch{return false}
}
export async function verifyEnrollmentProof(client:PublicClient,p:EnrollmentPreview,input:unknown):Promise<GuardianApproval> {
  if(!enrollmentProofMatches(p,input)
    || !await client.verifyTypedData({address:p.third,...enrollmentTyped(p),signature:input.signature}))throw new Error('RECOVERY_THIRD_PARTY_POSSESSION_NOT_PROVEN')
  return {signer:address(input.signer),intentHash:hashTypedData(enrollmentTyped(p)),signature:input.signature}
}
export function downloadPublicJson(value:unknown,name:string) {
  const blob=new Blob([JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)
}

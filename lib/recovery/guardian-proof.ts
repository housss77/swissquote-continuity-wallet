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
export async function verifyEnrollmentProof(client:PublicClient,p:EnrollmentPreview,proof:GuardianApproval) {
  if (address(proof.signer).toLowerCase()!==p.third.toLowerCase() || proof.intentHash!==hashTypedData(enrollmentTyped(p))
    || !await client.verifyTypedData({address:p.third,...enrollmentTyped(p),signature:proof.signature as Hex}))throw new Error('RECOVERY_THIRD_PARTY_POSSESSION_NOT_PROVEN')
}
export function downloadPublicJson(value:unknown,name:string) {
  const blob=new Blob([JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)
}

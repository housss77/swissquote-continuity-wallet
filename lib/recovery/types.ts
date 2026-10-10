import type { Address, Hex } from 'viem'
import type { PasskeyArgType } from '@safe-global/protocol-kit'
export type GuardianRole = 'customer_backup' | 'institutional' | 'third_party'
export type PublicCredential = { passkey:PasskeyArgType; signer:Address; rpId:string; role:'customer_backup' | 'replacement' }
export type RecoveryIntent = {
  chainId:11155111; module:Address; safe:Address; newOwner:Address; newThreshold:'1'; nonce:string; moduleVersion:'0.2.0'
}
export type GuardianApproval = { signer:Address; signature:Hex; intentHash:Hex }
export type RecoveryState = {
  safe:Address; module:Address; delay:number; enabled:boolean; guardians:Address[]; threshold:bigint;
  owners:Address[]; spendingThreshold:bigint; nonce:bigint; timestamp:bigint; protected:boolean;
  request:{ guardiansApprovalCount:bigint; newThreshold:bigint; nonce:bigint; executableAt:bigint; newOwners:Address[] }
}
export type Enrollment = { safe:Address; backup:PublicCredential; bank:Address; third:Address }

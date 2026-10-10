import type { EthSafeOperation, Safe4337Pack } from '@safe-global/relay-kit'
import { assertOperationBudget } from '../gas'
import { operationHash, submitOperation, confirmOperation } from '../wallet'
import type { PendingOperation } from '../operations'
import type { Address } from 'viem'
const key='continuity-recovery-operations-v1'
export function loadRecoveryAttempt():PendingOperation|null {
  const raw=localStorage.getItem(key)
  return raw ? JSON.parse(raw) as PendingOperation : null
}
export async function sendPreparedRecovery(pack:Safe4337Pack,operation:EthSafeOperation,safe:Address,paymaster:Address,description:string,
  update:(value:PendingOperation)=>void) {
  if (loadRecoveryAttempt()) throw new Error('RECOVERY_CHECK_PREVIOUS_ATTEMPT_FIRST')
  const hash=operationHash(operation.toUserOperation())
  const signed=await pack.signSafeOperation(operation)
  assertOperationBudget(signed.toUserOperation())
  if (operationHash(signed.toUserOperation())!==hash) throw new Error('SPONSORSHIP_SIGNED_MISMATCH')
  const record=(value:PendingOperation)=>{localStorage.setItem(key,JSON.stringify(value));update(value)}
  const pending:PendingOperation={kind:'recovery',safeAddress:safe,paymasterAddress:paymaster,description,userOperationHash:hash,state:'prepared',acceptance:'no',createdAt:new Date().toISOString()}
  record(pending)
  const acknowledged=await submitOperation(signed,pending,record)
  if (acknowledged.state!=='accepted') return null
  return confirmOperation(acknowledged,record)
}
export async function checkRecoveryAttempt(update:(value:PendingOperation)=>void) {
  const pending=loadRecoveryAttempt()
  if (!pending) return null
  return confirmOperation(pending,value=>{localStorage.setItem(key,JSON.stringify(value));update(value)})
}
export function archiveRecoveryAttempt() {
  const pending=loadRecoveryAttempt()
  if (!pending || !['included','rejected','failed'].includes(pending.state)) throw new Error('RECOVERY_PREVIOUS_ATTEMPT_UNRESOLVED')
  const history=JSON.parse(localStorage.getItem(`${key}-history`) || '[]')
  localStorage.setItem(`${key}-history`,JSON.stringify([...history,pending]))
  localStorage.removeItem(key)
}

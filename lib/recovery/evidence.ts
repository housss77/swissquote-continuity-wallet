import { decodeEventLog, type Address, type TransactionReceipt } from 'viem'
import { recoveryAbi } from './contracts'
import { intentHash, parseIntent } from './signatures'
import type { RecoveryIntent } from './types'

// Recover public intent from the actual event, including after all local state
// is lost. Never derive confirmation from a server status or a UI boolean.
export function recoveryReceiptIntent(receipt:TransactionReceipt,module:Address,safe:Address,
  event:'RecoveryExecuted'|'RecoveryFinalized',expected?:RecoveryIntent|null):RecoveryIntent {
  if (receipt.status!=='success' || receipt.to?.toLowerCase()!==module.toLowerCase()) throw new Error('RECOVERY_EVENT_EVIDENCE_MISMATCH')
  for (const log of receipt.logs) {
    if (log.address.toLowerCase()!==module.toLowerCase())continue
    try {
      const decoded=decodeEventLog({abi:recoveryAbi,data:log.data,topics:log.topics})
      if (decoded.eventName!==event)continue
      const args=decoded.args as unknown as {wallet:Address;recoveryHash:string;newOwners:Address[];newThreshold:bigint;nonce:bigint}
      if (args.wallet.toLowerCase()!==safe.toLowerCase() || args.newOwners.length!==1 || args.newThreshold!==1n)continue
      const intent=parseIntent({chainId:11155111,moduleVersion:'0.2.0',safe,module,newOwner:args.newOwners[0],newThreshold:'1',nonce:args.nonce.toString()})
      if (intentHash(intent)!==args.recoveryHash || expected && intentHash(expected)!==intentHash(intent))continue
      return intent
    } catch { /* A malformed or unrelated event provides no evidence. */ }
  }
  throw new Error('RECOVERY_EVENT_EVIDENCE_MISMATCH')
}

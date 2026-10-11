import { decodeEventLog, parseAbi, zeroAddress, type Address, type Hash, type TransactionReceipt } from 'viem'
import { ENTRY_POINT } from './constants'
import type { TransferProof } from './usdc'

export const ENTRY_POINT_ABI = parseAbi([
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
])

export type ConfirmedProof = {
  userOperationHash: Hash
  transactionHash: Hash
  safeAddress: Address
  blockNumber: string
  paymaster: Address
  actualGasCost: string
  transfer?: TransferProof
}

export function verifyReceipt(
  receipt: Pick<TransactionReceipt, 'status' | 'transactionHash' | 'blockNumber' | 'logs'>,
  userOperationHash: Hash,
  safeAddress: Address,
  expectedPaymaster?: Address,
): ConfirmedProof {
  if (receipt.status !== 'success') throw new Error('OPERATION_REVERTED')
  if (!/^0x[a-fA-F0-9]{64}$/.test(receipt.transactionHash)
    || !/^0x[a-fA-F0-9]{64}$/.test(userOperationHash) || receipt.blockNumber <= 0n) {
    throw new Error('EVIDENCE_MISMATCH')
  }
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ENTRY_POINT.toLowerCase()) continue
    let decoded
    try { decoded = decodeEventLog({ abi: ENTRY_POINT_ABI, data: log.data, topics: log.topics }) }
    catch { continue }
    const args = decoded.args
    if (args.userOpHash.toLowerCase() !== userOperationHash.toLowerCase()) continue
    // New attempts bind to their validated sponsor. Historical records without
    // that field can establish a nonzero sponsor only from the matching chain event.
    if (args.sender.toLowerCase() !== safeAddress.toLowerCase() || args.paymaster.toLowerCase() === zeroAddress
      || (expectedPaymaster && args.paymaster.toLowerCase() !== expectedPaymaster.toLowerCase())) {
      throw new Error('EVIDENCE_MISMATCH')
    }
    if (!args.success) throw new Error('OPERATION_REVERTED')
    return {
      userOperationHash,
      transactionHash: receipt.transactionHash,
      safeAddress,
      blockNumber: receipt.blockNumber.toString(),
      paymaster: args.paymaster,
      actualGasCost: args.actualGasCost.toString(),
    }
  }
  throw new Error('EVIDENCE_MISMATCH')
}

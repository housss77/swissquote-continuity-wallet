import type { EthSafeOperation } from '@safe-global/relay-kit'
import { encodeFunctionData, parseAbi, zeroAddress, type Address, type Hex } from 'viem'

type UserOperation = ReturnType<EthSafeOperation['toUserOperation']>
const BASIS_POINTS = 10_000n
export const OBSERVED_BUNDLER_GAS_LIMIT = 16_000_000n
export const EXECUTOR_RESERVE_BPS = 1_000n
const handleOpsAbi = parseAbi([
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)',
])

export function verificationAllowanceBps(value = process.env.NEXT_PUBLIC_VERIFICATION_GAS_BPS): number {
  const text = value?.trim() || '12000'
  if (!/^\d+$/.test(text)) throw new Error('INVALID_VERIFICATION_GAS_BPS')
  const bps = Number(text)
  if (!Number.isInteger(bps) || bps < 11_500 || bps > 12_000) throw new Error('INVALID_VERIFICATION_GAS_BPS')
  return bps
}

export function adjustedVerificationGas(raw: bigint, bps: number): bigint {
  verificationAllowanceBps(String(bps))
  if (raw <= 0n || raw >= 2n ** 256n) throw new Error('GAS_INVALID_ESTIMATE')
  // Round up, never reduce a provider estimate or clamp it to the bundler limit.
  const adjusted = (raw * BigInt(bps) + BASIS_POINTS - 1n) / BASIS_POINTS
  if (adjusted >= 2n ** 256n) throw new Error('GAS_INVALID_ESTIMATE')
  return adjusted
}

// Conservative single-op v0.6 Alto budget model, not a provider acknowledgement.
// Charge every encoded byte as nonzero so the unknown executor beneficiary and
// different signature bytes cannot make the modeled calldata charge too small.
// Preparation uses Relay Kit's padded dummy; after signing, check the real size.
export function operationBudget(operation: UserOperation) {
  const calldata = encodeFunctionData({ abi: handleOpsAbi, functionName: 'handleOps', args: [[{
    ...operation, sender: operation.sender as Address, nonce: BigInt(operation.nonce),
    initCode: operation.initCode as Hex, callData: operation.callData as Hex,
    paymasterAndData: operation.paymasterAndData as Hex, signature: operation.signature as Hex,
  }], zeroAddress] })
  const calldataBytes = BigInt((calldata.length - 2) / 2)
  const calldataGasUpperBound = calldataBytes * 16n
  const floor = operation.callGasLimit + 2n * operation.verificationGasLimit + 35_000n
  const beforeReserve = floor + calldataGasUpperBound
  const executorReserve = (beforeReserve * EXECUTOR_RESERVE_BPS + BASIS_POINTS - 1n) / BASIS_POINTS
  const estimatedBudget = beforeReserve + executorReserve
  return {
    observedBundlerLimit: OBSERVED_BUNDLER_GAS_LIMIT.toString(),
    aa95FloorBeforeCalldata: floor.toString(), calldataBytes: calldataBytes.toString(),
    calldataGasUpperBound: calldataGasUpperBound.toString(), executorReserveBps: Number(EXECUTOR_RESERVE_BPS),
    executorReserve: executorReserve.toString(), estimatedBudget: estimatedBudget.toString(),
    estimatedHeadroom: (OBSERVED_BUNDLER_GAS_LIMIT - estimatedBudget).toString(),
    fits: estimatedBudget <= OBSERVED_BUNDLER_GAS_LIMIT,
    providerExecutorPaddingVerified: false as const,
    realSignatureValidated: false as const,
  }
}

export function assertOperationBudget(operation: UserOperation) {
  const budget = operationBudget(operation)
  if (!budget.fits) throw new Error('GAS_BUDGET_EXCEEDED')
  return budget
}

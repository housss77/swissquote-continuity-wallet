import { PimlicoFeeEstimator, type EthSafeOperation, type Safe4337Pack } from '@safe-global/relay-kit'
import { userOperationToHexValues } from '@safe-global/relay-kit/dist/src/packs/safe-4337/utils'
import { decodeFunctionData, getAddress, parseAbi, zeroAddress, type Address, type Hex } from 'viem'
import { assertSepolia, ENTRY_POINT, providerConfig } from './constants'
import { diagnose, type Diagnostic } from './diagnostics'
import { rpcRequest, type OperationRpc } from './operations'
import { adjustedVerificationGas, operationBudget, verificationAllowanceBps } from './gas'

type SponsorRequest = Parameters<PimlicoFeeEstimator['getPaymasterEstimation']>[0]
type AdjustmentRequest = Parameters<PimlicoFeeEstimator['adjustEstimation']>[0]
type UserOperation = SponsorRequest['userOperation']
type Transaction = Parameters<Safe4337Pack['createTransaction']>[0]['transactions'][number]
export type IntentValidator = (operation: UserOperation, safe: Address, transaction: Transaction) => void
// This capability excludes both signing and broadcasting, including in the probe.
type PreparationPack = Pick<Safe4337Pack, 'createTransaction' | 'getChainId'>
const gasFields = ['callGasLimit', 'verificationGasLimit', 'preVerificationGas'] as const
const feeFields = ['maxFeePerGas', 'maxPriorityFeePerGas'] as const
const responseFields = ['paymasterAndData', ...gasFields, ...feeFields, 'verificationGas'] as const
const executeAbi = parseAbi(['function executeUserOp(address to, uint256 value, bytes data, uint8 operation)'])
const isBytes = (value: unknown): value is Hex => typeof value === 'string' && /^0x(?:[a-fA-F0-9]{2})*$/.test(value)

type GasSnapshot = Record<typeof gasFields[number], { decimal: string; hex: string }>
export type GasTrace = {
  adjustmentPolicy: 'bounded-verification'
  verificationAllowanceBps: number
  rawEstimate?: GasSnapshot
  adjustments: Array<{ before: GasSnapshot; after: GasSnapshot }>
  sponsorshipRequest?: GasSnapshot
  sponsorshipResponse?: GasSnapshot
  finalSerialized?: GasSnapshot
  actualPaymasterEstimate?: GasSnapshot
  estimateWithinQuotedGas?: Record<typeof gasFields[number], boolean>
  verificationMarginPreserved?: boolean
  budgetCheck?: ReturnType<typeof operationBudget>
  traceComplete: boolean
  budgetReference?: {
    observedBundlerLimit: string
    altoV06FloorBeforeCalldataAndExecutorMargin: string
    floorExceedsObservedLimit: boolean
    exactRejectedBudgetReconstructed: false
  }
}

export type SponsorshipReport = {
  paymasterAddress?: Address
  httpStatus?: number
  responseStructure?: Partial<Record<typeof responseFields[number], string>>
  checks: Partial<Record<'chain' | 'entryPoint' | 'sender' | 'intent' | 'response' | 'paymasterCode' | 'paymasterEntryPoint' | 'preparedBinding', 'passed'>>
  valid: boolean
  error?: Diagnostic
  preparation?: { safeAddress: Address; chainId: number; entryPoint: Address; target: Address; valueWei: string; deploymentRequired?: boolean; tokenId?: string; reusedPendingMint?: boolean }
  gasTrace?: GasTrace
}
export type SponsorshipReads = {
  getChainId: () => Promise<number>
  getCode: (address: Address) => Promise<Hex | undefined>
  getPaymasterEntryPoint: (address: Address) => Promise<Address>
}

function positiveQuantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]+$/.test(value)) throw new Error('SPONSORSHIP_INVALID_GAS')
  const quantity = BigInt(value)
  if (quantity <= 0n || quantity >= 2n ** 256n) throw new Error('SPONSORSHIP_INVALID_GAS')
  return quantity
}

// Only these three public gas quantities may escape the SDK hook. BigInt values
// are the SDK's parsed RPC estimates; their hex form is normalized. At the final
// stage we preserve the exact hex produced by Relay Kit's submission serializer.
function gasSnapshot(value: object): GasSnapshot {
  const fields = value as Record<string, unknown>
  return Object.fromEntries(gasFields.map(key => {
    const input = fields[key]
    const quantity = typeof input === 'bigint' ? positiveQuantity(`0x${input.toString(16)}`) : positiveQuantity(input)
    return [key, { decimal: quantity.toString(), hex: typeof input === 'string' ? input : `0x${quantity.toString(16)}` }]
  })) as GasSnapshot
}

export function extractPaymaster(value: unknown): Address {
  if (!isBytes(value) || value.length < 42) throw new Error('SPONSORSHIP_INVALID_PAYMASTER_DATA')
  const address = getAddress(value.slice(0, 42).toLowerCase())
  if (address === zeroAddress) throw new Error('SPONSORSHIP_ZERO_PAYMASTER')
  return address
}

// v0.6 returns combined address/data plus gas quantities, not v0.7 split fields.
export function validateSponsorResponse(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SPONSORSHIP_INVALID_RESPONSE')
  const response = value as Record<string, unknown>
  if (Object.keys(response).some(key => !(responseFields as readonly string[]).includes(key))) throw new Error('SPONSORSHIP_UNEXPECTED_RESPONSE_FIELDS')
  const paymasterAddress = extractPaymaster(response.paymasterAndData)
  // A bare estimation address is not a Pimlico sponsorship authorization.
  if ((response.paymasterAndData as string).length === 42) throw new Error('SPONSORSHIP_MISSING_DATA')
  const gas = Object.fromEntries(gasFields.map(key => [key, positiveQuantity(response[key])])) as Record<typeof gasFields[number], bigint>
  const fees: Partial<Record<typeof feeFields[number], bigint>> = {}
  for (const key of feeFields) if (response[key] !== undefined) fees[key] = positiveQuantity(response[key])
  if (fees.maxFeePerGas !== undefined && fees.maxPriorityFeePerGas !== undefined && fees.maxFeePerGas < fees.maxPriorityFeePerGas) throw new Error('SPONSORSHIP_INVALID_FEES')
  if (response.verificationGas !== undefined && positiveQuantity(response.verificationGas) !== gas.verificationGasLimit) throw new Error('SPONSORSHIP_CONFLICTING_GAS')
  return { paymasterAddress, estimation: { paymasterAndData: response.paymasterAndData as Hex, ...gas, ...fees } }
}

export function validateIntent(userOperation: UserOperation, safeAddress: Address, transaction: Transaction) {
  if (userOperation.sender.toLowerCase() !== safeAddress.toLowerCase()) throw new Error('SPONSORSHIP_SENDER_MISMATCH')
  let decoded
  try { decoded = decodeFunctionData({ abi: executeAbi, data: userOperation.callData as Hex }) }
  catch { throw new Error('SPONSORSHIP_INTENT_MISMATCH') }
  const [recipient, value, data, operation] = decoded.args
  if (recipient.toLowerCase() !== transaction.to.toLowerCase() || value !== BigInt(transaction.value)
    || data.toLowerCase() !== transaction.data.toLowerCase() || operation !== 0 || (transaction.operation ?? 0) !== 0) {
    throw new Error('SPONSORSHIP_INTENT_MISMATCH')
  }
  if (!isBytes(userOperation.initCode) || BigInt(userOperation.nonce) < 0n) throw new Error('SPONSORSHIP_INVALID_OPERATION')
}

export async function validatePaymasterContract(address: Address, reads: SponsorshipReads, report: SponsorshipReport) {
  assertSepolia(await reads.getChainId())
  report.checks.chain = 'passed'
  const code = await reads.getCode(address)
  if (!isBytes(code) || code === '0x' || /^0x(?:00)+$/.test(code)) throw new Error('SPONSORSHIP_PAYMASTER_NOT_DEPLOYED')
  report.checks.paymasterCode = 'passed'
  let entryPoint: Address
  try { entryPoint = await reads.getPaymasterEntryPoint(address) }
  catch { throw new Error('SPONSORSHIP_PAYMASTER_ENTRYPOINT_UNVERIFIED') }
  if (entryPoint.toLowerCase() !== ENTRY_POINT.toLowerCase()) throw new Error('SPONSORSHIP_PAYMASTER_ENTRYPOINT_MISMATCH')
  report.checks.paymasterEntryPoint = 'passed'
}

// The supported SDK hook changes verification padding only, before sponsorship.
// The SDK still supplies its call/pre-verification margins and dummy signature.
class ValidatingPimlicoEstimator extends PimlicoFeeEstimator {
  request?: UserOperation
  estimation?: ReturnType<typeof validateSponsorResponse>['estimation']
  constructor(private safe: Address, private transaction: Transaction, private reads: SponsorshipReads,
    private report: SponsorshipReport, private rpc: OperationRpc, private allowanceBps: number, private checkIntent:IntentValidator = validateIntent) {
    super()
    this.report.gasTrace = { adjustmentPolicy: 'bounded-verification', verificationAllowanceBps: allowanceBps, adjustments: [], traceComplete: false }
  }

  override async adjustEstimation(props: AdjustmentRequest) {
    const trace = this.report.gasTrace!
    if (trace.adjustments.length !== 0) throw new Error('GAS_ADJUSTMENT_REPEATED')
    const before = gasSnapshot(props.userOperation)
    trace.rawEstimate ??= before
    const adjusted = await super.adjustEstimation(props)
    adjusted.verificationGasLimit = adjustedVerificationGas(props.userOperation.verificationGasLimit, this.allowanceBps)
    trace.adjustments.push({ before, after: gasSnapshot(adjusted) })
    return adjusted
  }

  override async getPaymasterEstimation(props: SponsorRequest) {
    const config = providerConfig(true)
    if (props.paymasterUrl !== config.paymasterUrl || props.sponsorshipPolicyId !== config.sponsorshipPolicyId) throw new Error('SPONSORSHIP_PROVIDER_MISMATCH')
    if (props.entryPoint.toLowerCase() !== ENTRY_POINT.toLowerCase()) throw new Error('SPONSORSHIP_ENTRYPOINT_MISMATCH')
    this.report.checks.entryPoint = 'passed'
    this.checkIntent(props.userOperation, this.safe, this.transaction)
    this.report.checks.sender = 'passed'
    this.report.checks.intent = 'passed'
    this.report.gasTrace!.sponsorshipRequest = gasSnapshot(props.userOperation)
    this.report.preparation!.deploymentRequired = props.userOperation.initCode !== '0x'
    this.request = { ...props.userOperation }
    const { result, httpStatus } = await this.rpc<unknown>('pm_sponsorUserOperation', [
      userOperationToHexValues(props.userOperation), ENTRY_POINT, { sponsorshipPolicyId: config.sponsorshipPolicyId },
    ])
    this.report.httpStatus = httpStatus
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const fields = result as Record<string, unknown>
      this.report.responseStructure = Object.fromEntries(responseFields.filter(key => key in fields).map(key => [key, typeof fields[key]]))
      try { this.report.paymasterAddress = extractPaymaster(fields.paymasterAndData) } catch { /* Validation below retains the error. */ }
    }
    const validated = validateSponsorResponse(result)
    this.report.gasTrace!.sponsorshipResponse = gasSnapshot(result as object)
    this.report.paymasterAddress = validated.paymasterAddress
    this.report.checks.response = 'passed'
    await validatePaymasterContract(validated.paymasterAddress, this.reads, this.report)
    this.estimation = validated.estimation
    return validated.estimation
  }
}

export function validatePreparedBinding(operation: EthSafeOperation, request: UserOperation,
  estimation: ReturnType<typeof validateSponsorResponse>['estimation'], safe: Address, transaction: Transaction, checkIntent:IntentValidator = validateIntent) {
  assertSepolia(operation.chainId)
  if (operation.data.entryPoint.toLowerCase() !== ENTRY_POINT.toLowerCase()) throw new Error('SPONSORSHIP_ENTRYPOINT_MISMATCH')
  const prepared = operation.toUserOperation()
  checkIntent(prepared, safe, transaction)
  if (prepared.initCode.toLowerCase() !== request.initCode.toLowerCase() || BigInt(prepared.nonce) !== BigInt(request.nonce)
    || prepared.callData.toLowerCase() !== request.callData.toLowerCase()
    || prepared.paymasterAndData.toLowerCase() !== estimation.paymasterAndData.toLowerCase()) throw new Error('SPONSORSHIP_PREPARED_MISMATCH')
  for (const key of gasFields) if (prepared[key] !== estimation[key]) throw new Error('SPONSORSHIP_PREPARED_MISMATCH')
  for (const key of feeFields) if (prepared[key] !== (estimation[key] ?? request[key]) || prepared[key] <= 0n || prepared[key] >= 2n ** 256n) throw new Error('SPONSORSHIP_INVALID_FEES')
  if (prepared.maxFeePerGas < prepared.maxPriorityFeePerGas) throw new Error('SPONSORSHIP_INVALID_FEES')
}

export async function prepareSponsoredTransaction(pack: PreparationPack, safe: Address, transaction: Transaction,
  reads: SponsorshipReads, report: SponsorshipReport = { checks: {}, valid: false }, rpc?: OperationRpc, checkIntent:IntentValidator = validateIntent) {
  const allowanceBps = verificationAllowanceBps()
  assertSepolia(BigInt(await pack.getChainId()))
  assertSepolia(await reads.getChainId())
  report.checks.chain = 'passed'
  report.preparation = { safeAddress: safe, chainId: 11155111, entryPoint: ENTRY_POINT, target: transaction.to as Address, valueWei: transaction.value }
  const { paymasterUrl } = providerConfig(true)
  const operationRpc: OperationRpc = rpc ?? ((method, params) => rpcRequest(paymasterUrl, method, params))
  const estimator = new ValidatingPimlicoEstimator(safe, transaction, reads, report, operationRpc, allowanceBps, checkIntent)
  const operation = await pack.createTransaction({ transactions: [{ ...transaction }], options: { feeEstimator: estimator } })
  if (!estimator.request || !estimator.estimation || !report.paymasterAddress) throw new Error('SPONSORSHIP_RESPONSE_MISSING')
  if (operation.signatures.size !== 0) throw new Error('SPONSORSHIP_UNEXPECTED_SIGNATURE')
  validatePreparedBinding(operation, estimator.request, estimator.estimation, safe, transaction, checkIntent)
  report.checks.preparedBinding = 'passed'
  const trace = report.gasTrace!
  trace.finalSerialized = gasSnapshot(userOperationToHexValues(operation.toUserOperation()))
  trace.traceComplete = !!trace.rawEstimate && trace.adjustments.length > 0 && !!trace.sponsorshipRequest && !!trace.sponsorshipResponse
  // Current Alto's v0.6 AA95 floor: call + 2*verification + 35,000,
  // before variable calldata cost and provider-specific executor padding.
  // This is diagnostic arithmetic, NOT a gas cap, a submission preflight, or
  // reconstruction of the original signed operation's 43,985,430 budget.
  const floor = BigInt(trace.finalSerialized.callGasLimit.decimal) + 2n * BigInt(trace.finalSerialized.verificationGasLimit.decimal) + 35_000n
  const observedLimit = 16_000_000n // Reported by the user's prior -32602 response.
  trace.budgetReference = { observedBundlerLimit: observedLimit.toString(),
    altoV06FloorBeforeCalldataAndExecutorMargin: floor.toString(), floorExceedsObservedLimit: floor > observedLimit,
    exactRejectedBudgetReconstructed: false }
  // Use the actual authorization with Relay Kit's existing padded dummy. The
  // quote's fields stay untouched; no second sponsorship or adjustment is tried.
  const estimatedOperation = { ...operation.toUserOperation(), signature: estimator.request.signature }
  trace.budgetCheck = operationBudget(estimatedOperation)
  if (!trace.budgetCheck.fits) throw new Error('GAS_BUDGET_EXCEEDED')
  const { result } = await operationRpc<unknown>('eth_estimateUserOperationGas', [
    userOperationToHexValues(estimatedOperation), ENTRY_POINT,
  ])
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('SPONSORSHIP_INVALID_GAS')
  trace.actualPaymasterEstimate = gasSnapshot(result)
  trace.estimateWithinQuotedGas = Object.fromEntries(gasFields.map(key => [key,
    BigInt(trace.actualPaymasterEstimate![key].decimal) <= BigInt(trace.finalSerialized![key].decimal),
  ])) as Record<typeof gasFields[number], boolean>
  if (Object.values(trace.estimateWithinQuotedGas).some(within => !within)) throw new Error('SPONSORSHIP_QUOTE_GAS_INSUFFICIENT')
  trace.verificationMarginPreserved = adjustedVerificationGas(BigInt(trace.actualPaymasterEstimate.verificationGasLimit.decimal), allowanceBps)
    <= BigInt(trace.finalSerialized.verificationGasLimit.decimal)
  if (!trace.verificationMarginPreserved) throw new Error('GAS_VERIFICATION_MARGIN_INSUFFICIENT')
  // Validate again after the read so an SDK mutation cannot pass the signing gate.
  if (operation.signatures.size !== 0) throw new Error('SPONSORSHIP_UNEXPECTED_SIGNATURE')
  validatePreparedBinding(operation, estimator.request, estimator.estimation, safe, transaction, checkIntent)
  report.valid = true
  return { operation, paymasterAddress: report.paymasterAddress, report }
}

// Deliberately returns only a public report, never an operation or signature.
// It has no signing, submission, or storage capability.
export async function diagnoseSponsorship(pack: PreparationPack, safe: Address, transaction: Transaction,
  reads: SponsorshipReads, rpc?: OperationRpc): Promise<SponsorshipReport> {
  const report: SponsorshipReport = { checks: {}, valid: false }
  try { await prepareSponsoredTransaction(pack, safe, transaction, reads, report, rpc) }
  catch (error) { report.valid = false; report.error = diagnose(error, 'prepare', 'no') }
  return report
}

import { PimlicoFeeEstimator, type EthSafeOperation, type Safe4337Pack } from '@safe-global/relay-kit'
import { userOperationToHexValues } from '@safe-global/relay-kit/dist/src/packs/safe-4337/utils'
import { decodeFunctionData, getAddress, parseAbi, zeroAddress, type Address, type Hex } from 'viem'
import { assertSepolia, ENTRY_POINT, providerConfig } from './constants'
import { diagnose, type Diagnostic } from './diagnostics'
import { rpcRequest, type OperationRpc } from './operations'

type SponsorRequest = Parameters<PimlicoFeeEstimator['getPaymasterEstimation']>[0]
type UserOperation = SponsorRequest['userOperation']
type Transaction = Parameters<Safe4337Pack['createTransaction']>[0]['transactions'][number]
// This capability excludes both signing and broadcasting, including in the probe.
type PreparationPack = Pick<Safe4337Pack, 'createTransaction' | 'getChainId'>
const gasFields = ['callGasLimit', 'verificationGasLimit', 'preVerificationGas'] as const
const feeFields = ['maxFeePerGas', 'maxPriorityFeePerGas'] as const
const responseFields = ['paymasterAndData', ...gasFields, ...feeFields, 'verificationGas'] as const
const executeAbi = parseAbi(['function executeUserOp(address to, uint256 value, bytes data, uint8 operation)'])
const isBytes = (value: unknown): value is Hex => typeof value === 'string' && /^0x(?:[a-fA-F0-9]{2})*$/.test(value)

export type SponsorshipReport = {
  paymasterAddress?: Address
  httpStatus?: number
  responseStructure?: Partial<Record<typeof responseFields[number], string>>
  checks: Partial<Record<'chain' | 'entryPoint' | 'sender' | 'intent' | 'response' | 'paymasterCode' | 'paymasterEntryPoint' | 'preparedBinding', 'passed'>>
  valid: boolean
  error?: Diagnostic
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

// Keep Relay Kit 3.1.0's gas-price/adjustment and dummy-signature flow. Only its
// sponsorship hook uses the same SDK serializer with observable, single RPC.
class ValidatingPimlicoEstimator extends PimlicoFeeEstimator {
  request?: UserOperation
  estimation?: ReturnType<typeof validateSponsorResponse>['estimation']
  constructor(private safe: Address, private transaction: Transaction, private reads: SponsorshipReads,
    private report: SponsorshipReport, private rpc: OperationRpc) { super() }

  override async getPaymasterEstimation(props: SponsorRequest) {
    const config = providerConfig(true)
    if (props.paymasterUrl !== config.paymasterUrl || props.sponsorshipPolicyId !== config.sponsorshipPolicyId) throw new Error('SPONSORSHIP_PROVIDER_MISMATCH')
    if (props.entryPoint.toLowerCase() !== ENTRY_POINT.toLowerCase()) throw new Error('SPONSORSHIP_ENTRYPOINT_MISMATCH')
    this.report.checks.entryPoint = 'passed'
    validateIntent(props.userOperation, this.safe, this.transaction)
    this.report.checks.sender = 'passed'
    this.report.checks.intent = 'passed'
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
    this.report.paymasterAddress = validated.paymasterAddress
    this.report.checks.response = 'passed'
    await validatePaymasterContract(validated.paymasterAddress, this.reads, this.report)
    this.estimation = validated.estimation
    return validated.estimation
  }
}

export function validatePreparedBinding(operation: EthSafeOperation, request: UserOperation,
  estimation: ReturnType<typeof validateSponsorResponse>['estimation'], safe: Address, transaction: Transaction) {
  assertSepolia(operation.chainId)
  if (operation.data.entryPoint.toLowerCase() !== ENTRY_POINT.toLowerCase()) throw new Error('SPONSORSHIP_ENTRYPOINT_MISMATCH')
  const prepared = operation.toUserOperation()
  validateIntent(prepared, safe, transaction)
  if (prepared.initCode.toLowerCase() !== request.initCode.toLowerCase() || BigInt(prepared.nonce) !== BigInt(request.nonce)
    || prepared.callData.toLowerCase() !== request.callData.toLowerCase()
    || prepared.paymasterAndData.toLowerCase() !== estimation.paymasterAndData.toLowerCase()) throw new Error('SPONSORSHIP_PREPARED_MISMATCH')
  for (const key of gasFields) if (prepared[key] !== estimation[key]) throw new Error('SPONSORSHIP_PREPARED_MISMATCH')
  for (const key of feeFields) if (prepared[key] !== (estimation[key] ?? request[key]) || prepared[key] <= 0n || prepared[key] >= 2n ** 256n) throw new Error('SPONSORSHIP_INVALID_FEES')
  if (prepared.maxFeePerGas < prepared.maxPriorityFeePerGas) throw new Error('SPONSORSHIP_INVALID_FEES')
}

export async function prepareSponsoredTransaction(pack: PreparationPack, safe: Address, transaction: Transaction,
  reads: SponsorshipReads, report: SponsorshipReport = { checks: {}, valid: false }, rpc?: OperationRpc) {
  assertSepolia(BigInt(await pack.getChainId()))
  assertSepolia(await reads.getChainId())
  report.checks.chain = 'passed'
  const { paymasterUrl } = providerConfig(true)
  const estimator = new ValidatingPimlicoEstimator(safe, transaction, reads, report,
    rpc ?? ((method, params) => rpcRequest(paymasterUrl, method, params)))
  const operation = await pack.createTransaction({ transactions: [{ ...transaction }], options: { feeEstimator: estimator } })
  if (!estimator.request || !estimator.estimation || !report.paymasterAddress) throw new Error('SPONSORSHIP_RESPONSE_MISSING')
  if (operation.signatures.size !== 0) throw new Error('SPONSORSHIP_UNEXPECTED_SIGNATURE')
  validatePreparedBinding(operation, estimator.request, estimator.estimation, safe, transaction)
  report.checks.preparedBinding = 'passed'
  report.valid = true
  return { operation, paymasterAddress: report.paymasterAddress, report }
}

// Deliberately returns only a public report, never an operation or signature.
// It has no signing, submission, or storage capability.
export async function diagnoseSponsorship(pack: PreparationPack, safe: Address, transaction: Transaction,
  reads: SponsorshipReads, rpc?: OperationRpc): Promise<SponsorshipReport> {
  const report: SponsorshipReport = { checks: {}, valid: false }
  try { await prepareSponsoredTransaction(pack, safe, transaction, reads, report, rpc) }
  catch (error) { report.error = diagnose(error, 'prepare', 'no') }
  return report
}

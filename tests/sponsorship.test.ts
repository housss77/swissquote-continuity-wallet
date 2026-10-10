import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { EthSafeOperation, type PimlicoFeeEstimator, type Safe4337Pack } from '@safe-global/relay-kit'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, getAddress, parseAbi, zeroAddress, type Address, type Hash, type Hex } from 'viem'
import { ENTRY_POINT, NFT_ADDRESS, PAYMASTER_ADDRESS, providerConfig } from '../lib/constants'
import { RpcFailure } from '../lib/diagnostics'
import { ENTRY_POINT_ABI, verifyReceipt } from '../lib/proof'
import { diagnoseSponsorship, extractPaymaster, prepareSponsoredTransaction, validateSponsorResponse, type SponsorshipReads } from '../lib/sponsorship'
import type { OperationRpc } from '../lib/operations'

// Synthetic fixtures only; the different address is from Pimlico's documented
// v0.6 response example, not evidence about our live wallet or a trust allowlist.
const safe = '0x1111111111111111111111111111111111111111' as const
const differentPaymaster = getAddress('0x0000000000000039cd5e8aE05257CE51C473ddd1')
const transaction = { to: NFT_ADDRESS, value: '0', data: encodeFunctionData({
  abi: parseAbi(['function safeMint(address to, uint256 tokenId)']), functionName: 'safeMint', args: [safe, 7n],
}) }
const executeAbi = parseAbi(['function executeUserOp(address to, uint256 value, bytes data, uint8 operation)'])
const response = () => ({ paymasterAndData: `${differentPaymaster}abcd`, callGasLimit: '0x13880', verificationGasLimit: '0x52503', preVerificationGas: '0xdf55' })
const reads: SponsorshipReads = { getChainId: async () => 11155111, getCode: async () => '0x6000', getPaymasterEntryPoint: async () => ENTRY_POINT }
type Transaction = Parameters<Safe4337Pack['createTransaction']>[0]['transactions'][number]
type SponsorRequest = Parameters<PimlicoFeeEstimator['getPaymasterEstimation']>[0]

before(() => {
  process.env.NEXT_PUBLIC_PIMLICO_API_KEY = 'unit-only-key'
  process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID = 'unit-only-policy'
})

function fixtureOperation(tx: Transaction = transaction) {
  return new EthSafeOperation({ sender: safe, nonce: '0x0', initCode: '0xabcd',
    callData: encodeFunctionData({ abi: executeAbi, functionName: 'executeUserOp', args: [tx.to as Address, BigInt(tx.value), tx.data as Hex, tx.operation ?? 0] }),
    callGasLimit: 1n, verificationGasLimit: 1n, preVerificationGas: 1n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n,
    paymasterAndData: PAYMASTER_ADDRESS, signature: '0x',
  }, { chainId: 11155111n, entryPoint: ENTRY_POINT, moduleAddress: safe })
}

function fixturePack(modify?: (props: SponsorRequest) => void, after?: (operation: EthSafeOperation) => void) {
  return {
    getChainId: async () => '0xaa36a7',
    createTransaction: async ({ transactions, options }: Parameters<Safe4337Pack['createTransaction']>[0]) => {
      const operation = fixtureOperation(transactions[0])
      const config = providerConfig(true)
      const props = { userOperation: operation.toUserOperation(), paymasterUrl: config.paymasterUrl, entryPoint: ENTRY_POINT, sponsorshipPolicyId: config.sponsorshipPolicyId }
      modify?.(props)
      const estimation = await options!.feeEstimator!.getPaymasterEstimation!(props)
      operation.data.paymasterAndData = estimation.paymasterAndData
      operation.addEstimations(estimation)
      after?.(operation)
      return operation
    },
    signSafeOperation: () => { throw new Error('Signing is forbidden in preparation') },
    executeTransaction: () => { throw new Error('Broadcasting is forbidden in preparation') },
  }
}
const rpcWith = (value: unknown, observe?: (method: string, params: unknown[]) => void): OperationRpc => async <T>(method: string, params: unknown[]) => {
  observe?.(method, params)
  return { result: value as T, httpStatus: 200 }
}

test('regression: SDK v0.6 response differing from the estimation seed is validated and bound', async () => {
  assert.throws(() => { if (!response().paymasterAndData.toLowerCase().startsWith(PAYMASTER_ADDRESS.toLowerCase())) throw new Error('SPONSORSHIP_UNEXPECTED_PAYMASTER') }, /SPONSORSHIP_UNEXPECTED_PAYMASTER/)
  let requests = 0
  const result = await prepareSponsoredTransaction(fixturePack(), safe, transaction, reads, undefined, rpcWith(response(), (method, params) => {
    requests++
    assert.equal(method, 'pm_sponsorUserOperation')
    assert.equal(params[1], ENTRY_POINT)
    assert.deepEqual(params[2], { sponsorshipPolicyId: 'unit-only-policy' })
    assert.equal((params[0] as { callGasLimit: string }).callGasLimit, '0x01', 'Pinned SDK serializes v0.6 quantities')
  }))
  assert.equal(requests, 1)
  assert.equal(result.paymasterAddress, differentPaymaster)
  assert.equal(result.operation.data.callGasLimit, 80000n)
  assert.equal(result.operation.data.verificationGasLimit, 337155n)
  assert.equal(result.operation.data.preVerificationGas, 57173n)
  assert.equal(result.report.valid, true)
  assert.deepEqual(Object.keys(result.report.checks).sort(), ['chain', 'entryPoint', 'intent', 'paymasterCode', 'paymasterEntryPoint', 'preparedBinding', 'response', 'sender'])
})

test('malformed, missing, zero-address, v0.7, and overridden identity responses are rejected', () => {
  const invalid = [null, [], {}, { ...response(), paymasterAndData: '0x' }, { ...response(), paymasterAndData: `${differentPaymaster}a` },
    { ...response(), paymasterAndData: PAYMASTER_ADDRESS }, { ...response(), paymasterAndData: `${zeroAddress}abcd` },
    { ...response(), sender: safe }, { ...response(), paymaster: differentPaymaster, paymasterData: '0xabcd' }]
  for (const value of invalid) assert.throws(() => validateSponsorResponse(value), /SPONSORSHIP_/)
  assert.equal(extractPaymaster(differentPaymaster), differentPaymaster, 'A complete address can be decoded, but address-only sponsorship is rejected')
})

test('required gas fields are positive v0.6 hex quantities and conflicting aliases/fees fail', () => {
  for (const field of ['callGasLimit', 'verificationGasLimit', 'preVerificationGas']) {
    for (const value of [undefined, null, 123, '123', '-1', '0x0', `0x1${'0'.repeat(64)}`]) {
      assert.throws(() => validateSponsorResponse({ ...response(), [field]: value }), /SPONSORSHIP_INVALID_GAS/)
    }
  }
  assert.throws(() => validateSponsorResponse({ ...response(), verificationGas: '0x1' }), /SPONSORSHIP_CONFLICTING_GAS/)
  assert.throws(() => validateSponsorResponse({ ...response(), maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x2' }), /SPONSORSHIP_INVALID_FEES/)
})

test('wrong chain, undeployed paymaster, and incompatible contract EntryPoint stop preparation', async () => {
  for (const [overrides, message] of [
    [{ getChainId: async () => 1 }, 'WRONG_CHAIN'],
    [{ getCode: async () => '0x' as Hex }, 'SPONSORSHIP_PAYMASTER_NOT_DEPLOYED'],
    [{ getPaymasterEntryPoint: async () => zeroAddress }, 'SPONSORSHIP_PAYMASTER_ENTRYPOINT_MISMATCH'],
    [{ getPaymasterEntryPoint: async () => { throw new Error('Unsupported getter') } }, 'SPONSORSHIP_PAYMASTER_ENTRYPOINT_UNVERIFIED'],
  ] as const) {
    const result = await diagnoseSponsorship(fixturePack(), safe, transaction, { ...reads, ...overrides }, rpcWith(response()))
    assert.equal(result.valid, false)
    assert.equal(result.error?.message, message)
    assert.equal(result.error?.acceptance, 'no')
  }
})

test('provider, policy, EntryPoint, Safe sender, recipient, NFT data, value, and delegatecall changes fail', async () => {
  const modifiers: Array<(props: SponsorRequest) => void> = [
    props => { props.paymasterUrl = 'https://unit.invalid' },
    props => { props.sponsorshipPolicyId = 'wrong-policy' },
    props => { props.entryPoint = zeroAddress },
    props => { props.userOperation.sender = zeroAddress },
    props => { props.userOperation.callData = fixtureOperation({ ...transaction, to: safe }).data.callData },
    props => { props.userOperation.callData = fixtureOperation({ ...transaction, data: '0x' }).data.callData },
    props => { props.userOperation.callData = fixtureOperation({ ...transaction, value: '1' }).data.callData },
    props => { props.userOperation.callData = fixtureOperation({ ...transaction, operation: 1 }).data.callData },
  ]
  for (const modify of modifiers) {
    let calls = 0
    const result = await diagnoseSponsorship(fixturePack(modify), safe, transaction, reads, rpcWith(response(), () => { calls++ }))
    assert.equal(result.valid, false)
    assert.equal(calls, 0, 'Invalid context fails before the sponsorship RPC')
  }
})

test('SDK mutation after sponsorship fails binding before any signing', async () => {
  for (const mutate of [
    (operation: EthSafeOperation) => { operation.data.initCode = '0x' },
    (operation: EthSafeOperation) => { operation.data.nonce = 1n },
    (operation: EthSafeOperation) => { operation.data.callGasLimit = 1n },
    (operation: EthSafeOperation) => { operation.data.paymasterAndData = `${PAYMASTER_ADDRESS}abcd` },
    (operation: EthSafeOperation) => { operation.data.maxFeePerGas = 3n },
  ]) {
    const result = await diagnoseSponsorship(fixturePack(undefined, mutate), safe, transaction, reads, rpcWith(response()))
    assert.equal(result.valid, false)
  }
})

test('preparation-only report contains public validation metadata and never returns an operation', async () => {
  const result = await diagnoseSponsorship(fixturePack(), safe, transaction, reads, rpcWith(response()))
  assert.equal(result.valid, true)
  const text = JSON.stringify(result)
  assert.doesNotMatch(text, /signature|unit-only-key|unit-only-policy|https:|callData|initCode|abcd|userOperation/)
  assert.equal(result.paymasterAddress, differentPaymaster)
  assert.equal(result.httpStatus, 200)
  const failed = await diagnoseSponsorship(fixturePack(), safe, transaction, reads, async () => {
    throw new RpcFailure('Policy denied https://unit.invalid?apikey=unit-only-key payload={signature:never-print}', 403, -32501)
  })
  assert.equal(failed.error?.httpStatus, 403)
  assert.equal(failed.error?.rpcCode, -32501)
  assert.equal(failed.error?.acceptance, 'no')
  assert.doesNotMatch(JSON.stringify(failed), /unit.invalid|unit-only-key|never-print/)
})

test('independent chain proof accepts the bound returned paymaster and rejects a different or zero sponsor', () => {
  const hash = `0x${'11'.repeat(32)}` as Hash
  const makeReceipt = (paymaster: Address) => ({ status: 'success' as const, transactionHash: `0x${'22'.repeat(32)}` as Hash, blockNumber: 123n,
    logs: [{ address: ENTRY_POINT, topics: encodeEventTopics({ abi: ENTRY_POINT_ABI, eventName: 'UserOperationEvent', args: { userOpHash: hash, sender: safe, paymaster } }),
      data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }], [0n, true, 100n, 50n]) }] }) as Parameters<typeof verifyReceipt>[0]
  assert.equal(verifyReceipt(makeReceipt(differentPaymaster), hash, safe, differentPaymaster).paymaster.toLowerCase(), differentPaymaster.toLowerCase())
  assert.throws(() => verifyReceipt(makeReceipt(PAYMASTER_ADDRESS), hash, safe, differentPaymaster), /EVIDENCE_MISMATCH/)
  assert.throws(() => verifyReceipt(makeReceipt(zeroAddress), hash, safe), /EVIDENCE_MISMATCH/)
})

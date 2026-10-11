import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { createServer } from 'node:http'
import { EthSafeOperation, Safe4337Pack, PimlicoFeeEstimator } from '@safe-global/relay-kit'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, getAddress, parseAbi, zeroAddress, type Address, type Hash, type Hex } from 'viem'
import { ENTRY_POINT, NFT_ADDRESS, PAYMASTER_ADDRESS, providerConfig } from '../lib/constants'
import { RpcFailure } from '../lib/diagnostics'
import { ENTRY_POINT_ABI, verifyReceipt } from '../lib/proof'
import { diagnoseSponsorship, extractPaymaster, prepareSponsoredTransaction, validateSponsorResponse, type SponsorshipReads } from '../lib/sponsorship'
import type { OperationRpc } from '../lib/operations'
import { diagnosticMintTransaction } from '../lib/transactions'

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
  delete process.env.NEXT_PUBLIC_VERIFICATION_GAS_BPS
})

function fixtureOperation(tx: Transaction = transaction) {
  return new EthSafeOperation({ sender: safe, nonce: '0x0', initCode: '0xabcd',
    callData: encodeFunctionData({ abi: executeAbi, functionName: 'executeUserOp', args: [tx.to as Address, BigInt(tx.value), tx.data as Hex, tx.operation ?? 0] }),
    callGasLimit: 1n, verificationGasLimit: 1n, preVerificationGas: 1n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n,
    paymasterAndData: PAYMASTER_ADDRESS, signature: '0x',
  }, { chainId: 11155111n, entryPoint: ENTRY_POINT, moduleAddress: safe })
}

function fixturePack(modify?: (props: SponsorRequest) => void, after?: (operation: EthSafeOperation) => void,
  traceOptions: { rawGas?: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint }; adjustmentCalls?: number } = {}) {
  return {
    getChainId: async () => '0xaa36a7',
    createTransaction: async ({ transactions, options }: Parameters<Safe4337Pack['createTransaction']>[0]) => {
      const operation = fixtureOperation(transactions[0])
      const config = providerConfig(true)
      // Isolated synthetic RPC-estimate boundary. Exercise the real pinned SDK
      // estimator method, including its rounding, before the sponsorship hook.
      if (traceOptions.rawGas) operation.addEstimations(traceOptions.rawGas)
      for (let i = 0; i < (traceOptions.adjustmentCalls ?? 1); i++) {
        operation.addEstimations(await options!.feeEstimator!.adjustEstimation!({
          userOperation: operation.toUserOperation(), bundlerUrl: config.bundlerUrl, entryPoint: ENTRY_POINT,
        }))
      }
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
  return { result: (method === 'pm_sponsorUserOperation' ? value : {
    callGasLimit: '0x13880', verificationGasLimit: '0x186a0', preVerificationGas: '0xdf55',
  }) as T, httpStatus: 200 }
}

test('regression: SDK v0.6 response differing from the estimation seed is validated and bound', async () => {
  assert.throws(() => { if (!response().paymasterAndData.toLowerCase().startsWith(PAYMASTER_ADDRESS.toLowerCase())) throw new Error('SPONSORSHIP_UNEXPECTED_PAYMASTER') }, /SPONSORSHIP_UNEXPECTED_PAYMASTER/)
  let requests = 0
  const result = await prepareSponsoredTransaction(fixturePack(), safe, transaction, reads, undefined, rpcWith(response(), (method, params) => {
    requests++
    assert.equal(params[1], ENTRY_POINT)
    if (method === 'pm_sponsorUserOperation') {
      assert.deepEqual(params[2], { sponsorshipPolicyId: 'unit-only-policy' })
      assert.equal((params[0] as { callGasLimit: string }).callGasLimit, '0x01', 'Pinned SDK serializes v0.6 quantities')
    } else assert.equal(method, 'eth_estimateUserOperationGas')
  }))
  assert.equal(requests, 2)
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

test('gas diagnostic observes each real SDK adjustment and final sponsored serialization without altering gas', async () => {
  // Synthetic raw estimates; not a reconstruction of the user's missing log.
  const rawGas = { callGasLimit: 500_001n, verificationGasLimit: 5_000_000n, preVerificationGas: 60_001n }
  const sponsored = { ...response(), callGasLimit: '0x1410d2', verificationGasLimit: '0x5b8d80', preVerificationGas: '0x1409e' }
  let calls = 0
  const result = await prepareSponsoredTransaction(fixturePack(undefined, undefined, { rawGas }), safe, transaction, reads, undefined, rpcWith(sponsored, (method, params) => {
    calls++
    assert.ok(['pm_sponsorUserOperation', 'eth_estimateUserOperationGas'].includes(method), 'No signing or submission RPC')
    if (method !== 'pm_sponsorUserOperation') return
    const request = params[0] as Record<string, string>
    assert.equal(BigInt(request.verificationGasLimit), 6_000_000n)
    assert.equal(BigInt(request.callGasLimit), 750_001n)
    assert.equal(BigInt(request.preVerificationGas), 63_001n)
  }))
  const trace = result.report.gasTrace!
  assert.equal(calls, 2)
  assert.equal(trace.adjustments.length, 1)
  assert.equal(trace.rawEstimate?.verificationGasLimit.decimal, '5000000')
  assert.equal(trace.adjustments[0].after.verificationGasLimit.decimal, '6000000')
  assert.deepEqual(trace.sponsorshipRequest, trace.adjustments[0].after)
  assert.equal(trace.sponsorshipResponse?.verificationGasLimit.hex, sponsored.verificationGasLimit)
  assert.equal(trace.finalSerialized?.verificationGasLimit.decimal, '6000000')
  assert.equal(trace.finalSerialized?.preVerificationGas.hex, '0x01409e', 'Preserve the SDK serializer\'s byte-aligned quantity spelling')
  assert.equal(result.operation.data.verificationGasLimit, BigInt(sponsored.verificationGasLimit), 'Diagnostics never lower or multiply the final quote')
  assert.equal(trace.traceComplete, true)
  assert.equal(trace.budgetReference?.altoV06FloorBeforeCalldataAndExecutorMargin, '13350026')
  assert.equal(trace.budgetReference?.floorExceedsObservedLimit, false)
  assert.equal(trace.budgetCheck?.fits, true)
  assert.equal(trace.budgetReference?.exactRejectedBudgetReconstructed, false)
  assert.equal(result.operation.signatures.size, 0)
  assert.deepEqual(result.report.preparation, { safeAddress: safe, chainId: 11155111, entryPoint: ENTRY_POINT, target: NFT_ADDRESS, valueWei: '0', deploymentRequired: true })
  assert.doesNotMatch(JSON.stringify(result.report), /signature|unit-only-key|unit-only-policy|https:|callData|initCode|abcd/)
})

test('a repeated SDK adjustment stops preparation without a second multiplier or quote', async () => {
  const result = await diagnoseSponsorship(fixturePack(undefined, undefined, {
    rawGas: { callGasLimit: 100n, verificationGasLimit: 100n, preVerificationGas: 100n }, adjustmentCalls: 2,
  }), safe, transaction, reads, rpcWith(response()))
  assert.equal(result.valid, false)
  assert.equal(result.error?.message, 'GAS_ADJUSTMENT_REPEATED')
  assert.equal(result.gasTrace?.adjustments.length, 1)
  assert.equal(result.gasTrace?.rawEstimate?.verificationGasLimit.decimal, '100')
  assert.equal(result.gasTrace?.adjustments[0].after.verificationGasLimit.decimal, '120')
  assert.equal(result.gasTrace?.finalSerialized, undefined)
})

test('failed sponsorship retains raw and adjusted estimates with a sanitized error and incomplete trace', async () => {
  const result = await diagnoseSponsorship(fixturePack(), safe, transaction, reads, async () => {
    throw new RpcFailure('Denied https://unit.invalid?apikey=unit-only-key params={signature:private}', 403, -32501)
  })
  assert.equal(result.valid, false)
  assert.equal(result.gasTrace?.rawEstimate?.verificationGasLimit.decimal, '1')
  assert.equal(result.gasTrace?.adjustments[0].after.verificationGasLimit.decimal, '2')
  assert.equal(result.gasTrace?.sponsorshipRequest?.verificationGasLimit.decimal, '2')
  assert.equal(result.gasTrace?.sponsorshipResponse, undefined)
  assert.equal(result.gasTrace?.finalSerialized, undefined)
  assert.equal(result.gasTrace?.traceComplete, false)
  assert.equal(result.error?.rpcCode, -32501)
  assert.doesNotMatch(JSON.stringify(result), /unit.invalid|unit-only-key|private/)
})

test('diagnostic replays the exact original NFT token without changing its saved attempt', () => {
  const tokenId = '57236640691412597184328746396250277574326717036406938234663933459999263743829'
  const attempt = Object.freeze({ kind: 'mint', description: `Tutorial NFT mint: token ${tokenId} to this Safe. Zero ETH transferred.` })
  const before = JSON.stringify(attempt)
  const result = diagnosticMintTransaction(safe, attempt)
  assert.equal(result.reusedPendingMint, true)
  assert.equal(result.tokenId, tokenId)
  assert.equal(result.transaction.data, encodeFunctionData({ abi: parseAbi(['function safeMint(address to, uint256 tokenId)']), functionName: 'safeMint', args: [safe, BigInt(tokenId)] }))
  assert.equal(JSON.stringify(attempt), before)
  assert.throws(() => diagnosticMintTransaction(safe, { kind: 'mint', description: 'Unrecoverable intent' }), /MINT_DIAGNOSTIC_INTENT_UNAVAILABLE/)
  assert.throws(() => diagnosticMintTransaction(safe, { kind: 'mint', description: `Tutorial NFT mint: token ${2n ** 256n} to this Safe. Zero ETH transferred.` }), /INVALID_MINT_TOKEN_ID/)
})

test('pinned Relay Kit gas-estimation pipeline calls the observed adjustment once before sponsorship', async t => {
  // A local, test-only RPC supplies gas prices. No real provider, credential,
  // passkey, wallet, or UserOperation submission is involved in this regression.
  const methods: string[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: number; method: string } | Array<{ id: number; method: string }>
      const reply = (item: { id: number; method: string }) => {
        methods.push(item.method)
        if (item.method === 'eth_chainId') return { jsonrpc: '2.0', id: item.id, result: '0xaa36a7' }
        if (item.method === 'pimlico_getUserOperationGasPrice') return { jsonrpc: '2.0', id: item.id, result: { fast: { maxFeePerGas: '0x2', maxPriorityFeePerGas: '0x1' } } }
        return { jsonrpc: '2.0', id: item.id, error: { code: -32601, message: 'Forbidden test RPC' } }
      }
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(Array.isArray(body) ? body.map(reply) : reply(body)))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const raw = { callGasLimit: '0x13880', verificationGasLimit: '0x186a0', preVerificationGas: '0xea60' }
  let estimateCalls = 0
  let sponsorCalls = 0
  let sponsoredEstimateCalls = 0
  const options = providerConfig(true)
  type PackOptions = ConstructorParameters<typeof Safe4337Pack>[0]
  const sdk = new Safe4337Pack({
    protocolKit: { getThreshold: async () => 1 } as PackOptions['protocolKit'],
    bundlerClient: { send: async (method: string) => {
      assert.equal(method, 'eth_estimateUserOperationGas')
      estimateCalls++
      return raw
    } } as unknown as PackOptions['bundlerClient'],
    bundlerUrl: `http://127.0.0.1:${address.port}`, chainId: 11155111n,
    paymasterOptions: { isSponsored: true, paymasterUrl: options.paymasterUrl, sponsorshipPolicyId: options.sponsorshipPolicyId },
    entryPointAddress: ENTRY_POINT, safe4337ModuleAddress: safe, safeWebAuthnSharedSignerAddress: safe,
  })
  const pack = { getChainId: async () => '0xaa36a7',
    createTransaction: async (props: Parameters<Safe4337Pack['createTransaction']>[0]) => sdk.getEstimateFee({
      safeOperation: fixtureOperation(props.transactions[0]), feeEstimator: props.options?.feeEstimator,
    }),
  }
  const result = await diagnoseSponsorship(pack, safe, transaction, reads, rpcWith(response(), (method, params) => {
    const request = params[0] as Record<string, string>
    if (method === 'pm_sponsorUserOperation') {
      sponsorCalls++
      assert.equal(BigInt(request.verificationGasLimit), 120_000n)
    } else {
      assert.equal(method, 'eth_estimateUserOperationGas')
      sponsoredEstimateCalls++
      assert.equal(BigInt(request.verificationGasLimit), 337_155n)
      assert.equal(request.paymasterAndData, response().paymasterAndData)
      assert.ok(request.signature.length > 26, 'The actual SDK supplies a well-formed dummy signature')
    }
  }))
  assert.equal(result.valid, true)
  assert.equal(estimateCalls, 1)
  assert.equal(sponsorCalls, 1)
  assert.equal(sponsoredEstimateCalls, 1)
  assert.equal(result.gasTrace?.adjustments.length, 1)
  assert.equal(result.gasTrace?.rawEstimate?.verificationGasLimit.decimal, '100000')
  assert.equal(result.gasTrace?.sponsorshipRequest?.verificationGasLimit.decimal, '120000')
  assert.equal(result.gasTrace?.finalSerialized?.verificationGasLimit.decimal, '337155', 'The SDK applies the sponsor response without another multiplier')
  assert.equal(result.gasTrace?.traceComplete, true)
  assert.ok(methods.every(method => ['eth_chainId', 'pimlico_getUserOperationGasPrice'].includes(method)))
})

test('existing Safe estimation must bind the SDK dummy contract signature to its actual passkey owner',async()=> {
  type Options=ConstructorParameters<typeof Safe4337Pack>[0]
  for(const owner of ['0x94a4F6affBd8975951142c3999aEAB7ecee555c2',safe]) {
    let estimatedSignature=''
    const sdk=new Safe4337Pack({protocolKit:{getThreshold:async()=>1} as Options['protocolKit'],
      bundlerClient:{send:async(method:string,params:Array<{signature:string}>)=>{assert.equal(method,'eth_estimateUserOperationGas');estimatedSignature=params[0].signature;return {callGasLimit:'0x100',verificationGasLimit:'0x200',preVerificationGas:'0x300'}}} as unknown as Options['bundlerClient'],
      bundlerUrl:'http://localhost:1',chainId:11155111n,entryPointAddress:ENTRY_POINT,safe4337ModuleAddress:safe,safeWebAuthnSharedSignerAddress:owner})
    await sdk.getEstimateFee({safeOperation:fixtureOperation(),feeEstimator:{setupEstimation:async()=>({}),adjustEstimation:async()=>({})}})
    // SDK prepends two uint48 validity fields, then the Safe contract-signature
    // static word. This is the owner whose verification gas is exercised.
    assert.equal(estimatedSignature.slice(26+24,26+64).toLowerCase(),owner.slice(2).toLowerCase())
    assert.ok(estimatedSignature.length>26+130)
  }
})

test('measured gas regression: bounded allowance replaces stock 4x without changing the fresh quote or serialization', async () => {
  // Public measurements from the user's preparation-only probe. Replayed in an
  // isolated fixture; this test does not contact Pimlico or submit an operation.
  const rawGas = { callGasLimit: 876_684n, verificationGasLimit: 5_065_294n, preVerificationGas: 78_170n }
  // The new quote is a synthetic projection; its live response must be checked
  // separately. The raw estimate and second-estimate quantities were measured.
  const sponsored = { ...response(), callGasLimit: '0x1410d2', verificationGasLimit: `0x${6_078_353n.toString(16)}`, preVerificationGas: '0x1409e' }
  const stock = await new PimlicoFeeEstimator().adjustEstimation({ userOperation: { ...fixtureOperation().toUserOperation(), ...rawGas },
    bundlerUrl: 'https://unit.invalid', entryPoint: ENTRY_POINT })
  assert.equal(stock.verificationGasLimit, 20_261_176n, 'Reproduce the pinned SDK defect without editing SDK files')
  const actual = { callGasLimit: '0x5ad08', verificationGasLimit: '0x4cee1f', preVerificationGas: '0x13c25' }
  let prepared: EthSafeOperation | undefined
  const methods: string[] = []
  const result = await diagnoseSponsorship(fixturePack(undefined, operation => { prepared = operation }, { rawGas }),
    safe, transaction, reads, async <T>(method: string, params: unknown[]) => {
      methods.push(method)
      const request = params[0] as Record<string, string>
      assert.equal(params[1], ENTRY_POINT)
      assert.equal(BigInt(request.verificationGasLimit), 6_078_353n)
      if (method === 'pm_sponsorUserOperation') return { result: sponsored as T, httpStatus: 200 }
      assert.equal(method, 'eth_estimateUserOperationGas', 'Only preparation and estimation are allowed')
      assert.equal(request.paymasterAndData, sponsored.paymasterAndData)
      assert.equal(request.sender, safe)
      assert.equal(request.callData, prepared!.data.callData)
      // Replay the user's second read-only measurement with actual paymaster
      // data; no live RPC or signature validation occurs inside this test.
      return { result: actual as T, httpStatus: 200 }
    })
  const trace = result.gasTrace!
  assert.deepEqual(methods, ['pm_sponsorUserOperation', 'eth_estimateUserOperationGas'])
  assert.equal(trace.rawEstimate?.verificationGasLimit.decimal, '5065294')
  assert.equal(trace.adjustments.length, 1)
  assert.equal(trace.adjustments[0].after.verificationGasLimit.decimal, '6078353')
  assert.deepEqual(trace.sponsorshipRequest, trace.sponsorshipResponse)
  assert.equal(trace.finalSerialized?.verificationGasLimit.decimal, '6078353')
  assert.equal(trace.finalSerialized?.callGasLimit.decimal, '1315026')
  assert.equal(trace.finalSerialized?.preVerificationGas.decimal, '82078')
  assert.equal(trace.budgetReference?.altoV06FloorBeforeCalldataAndExecutorMargin, '13506732')
  assert.equal(trace.verificationAllowanceBps, 12000)
  assert.equal(trace.verificationMarginPreserved, true)
  assert.equal(trace.budgetCheck?.fits, true)
  assert.ok(BigInt(trace.budgetCheck!.estimatedHeadroom) > 1_000_000n)
  assert.equal(trace.budgetReference?.exactRejectedBudgetReconstructed, false)
  assert.equal(trace.actualPaymasterEstimate?.verificationGasLimit.decimal, '5041695')
  assert.equal(trace.actualPaymasterEstimate?.callGasLimit.decimal, '371976')
  assert.equal(trace.actualPaymasterEstimate?.preVerificationGas.decimal, '80933')
  assert.deepEqual(trace.estimateWithinQuotedGas, { callGasLimit: true, verificationGasLimit: true, preVerificationGas: true })
  assert.equal(prepared!.data.verificationGasLimit, 6_078_353n, 'Re-estimation never changes the signed sponsorship gas')
  assert.equal(prepared!.signatures.size, 0)
})

test('actual paymaster re-estimation rejects inadequate quotes without changing the prepared operation', async () => {
  let prepared: EthSafeOperation | undefined
  const result = await diagnoseSponsorship(fixturePack(undefined, operation => { prepared = operation }),
    safe, transaction, reads, async <T>(method: string) => ({ httpStatus: 200,
      result: (method === 'pm_sponsorUserOperation' ? response() : { ...response(), verificationGasLimit: '0x52504' }) as T,
    }))
  assert.equal(result.valid, false)
  assert.equal(result.error?.message, 'SPONSORSHIP_QUOTE_GAS_INSUFFICIENT')
  assert.equal(result.error?.acceptance, 'no')
  assert.equal(result.gasTrace?.estimateWithinQuotedGas?.verificationGasLimit, false)
  assert.equal(result.gasTrace?.actualPaymasterEstimate?.verificationGasLimit.decimal, '337156')
  assert.equal(prepared!.data.verificationGasLimit, 337_155n)
  assert.equal(prepared!.signatures.size, 0)
})

test('failed or malformed actual paymaster estimate retains the trace and sanitized read-only error', async () => {
  for (const malformed of [false, true]) {
    const result = await diagnoseSponsorship(fixturePack(), safe, transaction, reads, async <T>(method: string) => {
      if (method === 'pm_sponsorUserOperation') return { result: response() as T, httpStatus: 200 }
      assert.equal(method, 'eth_estimateUserOperationGas')
      if (malformed) return { result: { verificationGasLimit: '0x1' } as T, httpStatus: 200 }
      throw new RpcFailure('Estimate denied https://unit.invalid?apikey=unit-only-key params={signature:private}', 400, -32500)
    })
    assert.equal(result.valid, false)
    assert.equal(result.gasTrace?.traceComplete, true)
    assert.equal(result.gasTrace?.finalSerialized?.verificationGasLimit.decimal, '337155')
    assert.equal(result.gasTrace?.actualPaymasterEstimate, undefined)
    assert.equal(result.error?.acceptance, 'no')
    if (malformed) assert.equal(result.error?.message, 'SPONSORSHIP_INVALID_GAS')
    else { assert.equal(result.error?.httpStatus, 400); assert.equal(result.error?.rpcCode, -32500) }
    assert.doesNotMatch(JSON.stringify(result), /unit.invalid|unit-only-key|private|signature|abcd|"paymasterAndData":"0x/)
  }
})

test('fresh estimate must retain the selected margin even when it barely fits the quote', async () => {
  let prepared: EthSafeOperation | undefined
  const methods: string[] = []
  const result = await diagnoseSponsorship(fixturePack(undefined, operation => { prepared = operation }), safe, transaction, reads,
    async <T>(method: string) => {
      methods.push(method)
      return { httpStatus: 200, result: (method === 'pm_sponsorUserOperation' ? response() : {
        ...response(), verificationGasLimit: '0x493e0',
      }) as T }
    })
  assert.equal(result.valid, false)
  assert.equal(result.error?.message, 'GAS_VERIFICATION_MARGIN_INSUFFICIENT')
  assert.equal(result.error?.acceptance, 'no')
  assert.equal(result.gasTrace?.estimateWithinQuotedGas?.verificationGasLimit, true)
  assert.equal(result.gasTrace?.verificationMarginPreserved, false)
  assert.equal(prepared!.data.verificationGasLimit, 337155n, 'No post-sponsorship gas adjustment')
  assert.equal(prepared!.signatures.size, 0)
  assert.deepEqual(methods, ['pm_sponsorUserOperation', 'eth_estimateUserOperationGas'], 'No smaller allowance, retry or broadcast')
})

test('oversized sponsored budget stops before re-estimation without clamping or another quote', async () => {
  let prepared: EthSafeOperation | undefined
  const methods: string[] = []
  const sponsored = { ...response(), callGasLimit: '0x1410d2', verificationGasLimit: '0x1352938', preVerificationGas: '0x1409e' }
  const result = await diagnoseSponsorship(fixturePack(undefined, operation => { prepared = operation }), safe, transaction, reads,
    rpcWith(sponsored, method => { methods.push(method) }))
  assert.equal(result.valid, false)
  assert.equal(result.error?.message, 'GAS_BUDGET_EXCEEDED')
  assert.equal(result.error?.acceptance, 'no')
  assert.equal(result.gasTrace?.budgetCheck?.fits, false)
  assert.ok(BigInt(result.gasTrace!.budgetCheck!.estimatedHeadroom) < 0n)
  assert.equal(result.gasTrace?.actualPaymasterEstimate, undefined)
  assert.equal(prepared!.data.verificationGasLimit, 20261176n)
  assert.equal(prepared!.signatures.size, 0)
  assert.deepEqual(methods, ['pm_sponsorUserOperation'])
})

test('prepared intent binding is rechecked after the asynchronous actual-paymaster estimate', async () => {
  let prepared: EthSafeOperation | undefined
  const result = await diagnoseSponsorship(fixturePack(undefined, operation => { prepared = operation }), safe, transaction, reads,
    async <T>(method: string) => {
      if (method === 'eth_estimateUserOperationGas') prepared!.data.callGasLimit++
      return { httpStatus: 200, result: (method === 'pm_sponsorUserOperation' ? response() : {
        callGasLimit: '0x13880', verificationGasLimit: '0x186a0', preVerificationGas: '0xdf55',
      }) as T }
    })
  assert.equal(result.valid, false)
  assert.equal(result.error?.message, 'SPONSORSHIP_PREPARED_MISMATCH')
  assert.equal(prepared!.signatures.size, 0)
})

test('invalid allowance blocks preparation before provider access and is never silently replaced', async () => {
  process.env.NEXT_PUBLIC_VERIFICATION_GAS_BPS = '11000'
  let calls = 0
  try {
    const result = await diagnoseSponsorship(fixturePack(), safe, transaction, reads, async () => {
      calls++
      throw new Error('Must not request sponsorship')
    })
    assert.equal(result.valid, false)
    assert.equal(result.error?.message, 'INVALID_VERIFICATION_GAS_BPS')
    assert.equal(calls, 0)
  } finally { delete process.env.NEXT_PUBLIC_VERIFICATION_GAS_BPS }
})

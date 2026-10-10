import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeAbiParameters, encodeEventTopics, type Hash } from 'viem'
import { ENTRY_POINT, PAYMASTER_ADDRESS } from '../lib/constants'
import { diagnose, RpcFailure } from '../lib/diagnostics'
import { broadcastOperation, inspectOperation, pollOperation, rpcRequest, type BundlerReceipt, type OperationRpc, type PendingOperation } from '../lib/operations'
import { ENTRY_POINT_ABI, verifyReceipt } from '../lib/proof'

// Synthetic unit fixtures only: never presented as actual blockchain evidence.
const hash = `0x${'11'.repeat(32)}` as Hash
const tx = `0x${'22'.repeat(32)}` as Hash
const safe = '0x1111111111111111111111111111111111111111' as const
const prepared = (): PendingOperation => ({ userOperationHash: hash, safeAddress: safe, kind: 'mint', description: 'Unit fixture', state: 'prepared', acceptance: 'no' })
const receipt: BundlerReceipt = { userOpHash: hash, sender: safe, success: true, receipt: { transactionHash: tx } }
const successfulChainReceipt = {
  status: 'success' as const, transactionHash: tx, blockNumber: 123n,
  logs: [{ address: ENTRY_POINT, topics: encodeEventTopics({ abi: ENTRY_POINT_ABI, eventName: 'UserOperationEvent', args: { userOpHash: hash, sender: safe, paymaster: PAYMASTER_ADDRESS } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }], [0n, true, 100n, 50n]) }],
}
const rpcWith = (values: Record<string, unknown>): OperationRpc => async <T>(method: string) => ({ result: values[method] as T, httpStatus: 200 })
const emptyRpc = rpcWith({ eth_getUserOperationReceipt: null, eth_getUserOperationByHash: null, pimlico_getUserOperationStatus: { status: 'not_found', transactionHash: null } })

test('rejected submission preserves HTTP/RPC diagnostics and makes exactly one POST', async () => {
  let posts = 0
  const stages: string[] = []
  const result = await broadcastOperation(prepared(), () => rpcRequest<Hash>('https://unit.invalid', 'eth_sendUserOperation', [], async () => {
    posts++
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32507, message: 'AA24 signature error' } }), { status: 200 })
  }), value => stages.push(value.state))
  assert.equal(posts, 1)
  assert.deepEqual(stages, ['broadcasting', 'rejected'])
  assert.equal(result.acknowledgement, undefined)
  assert.equal(result.acceptance, 'no')
  assert.equal(result.submissionError?.httpStatus, 200)
  assert.equal(result.submissionError?.rpcCode, -32507)
  assert.equal(result.submissionError?.message, 'AA24 signature error')
})

test('acknowledgement is recorded only after the bundler returns the matching hash', async () => {
  let waiting: PendingOperation | undefined
  const accepted = await broadcastOperation(prepared(), async () => {
    assert.equal(waiting?.state, 'broadcasting')
    assert.equal(waiting?.acknowledgement, undefined)
    return { result: hash, httpStatus: 200 }
  }, value => { waiting = value })
  assert.equal(accepted.state, 'accepted')
  assert.equal(accepted.acknowledgement?.hash, hash)
  assert.equal(accepted.acceptance, 'yes')
  assert.equal(accepted.transactionHash, undefined)
})

test('a transport failure or mismatched acknowledgement remains unresolved without retry', async () => {
  let calls = 0
  const unknown = await broadcastOperation(prepared(), () => rpcRequest<Hash>('https://unit.invalid', 'eth_sendUserOperation', [], async () => { calls++; throw new TypeError('Failed to fetch') }), () => {})
  assert.equal(calls, 1)
  assert.equal(unknown.state, 'unknown')
  assert.equal(unknown.acceptance, 'unknown')
  const mismatch = await broadcastOperation(prepared(), async () => ({ result: tx, httpStatus: 200 }), () => {})
  assert.equal(mismatch.state, 'unknown')
  assert.equal(mismatch.acknowledgement?.hash, tx)
  assert.equal(mismatch.acceptance, 'yes')
})

test('already-known errors do not incorrectly prove that nothing was accepted', async () => {
  const result = await broadcastOperation(prepared(), async () => { throw new RpcFailure('UserOperation already known', 200, -32602) }, () => {})
  assert.equal(result.state, 'unknown')
  assert.equal(result.acceptance, 'unknown')
  assert.equal(result.submissionError?.rpcCode, -32602)
})

test('failure to persist broadcasting aborts before the first POST', async () => {
  let calls = 0
  await assert.rejects(broadcastOperation(prepared(), async () => { calls++; return { result: hash, httpStatus: 200 } }, () => { throw new Error('Storage full') }), /Storage full/)
  assert.equal(calls, 0)
})

test('pending checks use all three read methods; pending does not become included', async () => {
  const methods: string[] = []
  const values = rpcWith({ eth_getUserOperationReceipt: null, eth_getUserOperationByHash: { userOperation: { sender: safe }, entryPoint: ENTRY_POINT, transactionHash: null }, pimlico_getUserOperationStatus: { status: 'submitted', transactionHash: tx } })
  const result = await inspectOperation(prepared(), async (method, params) => { methods.push(method); return values(method, params) }, ENTRY_POINT)
  assert.deepEqual(methods, ['eth_getUserOperationReceipt', 'eth_getUserOperationByHash', 'pimlico_getUserOperationStatus'])
  assert.equal(result.operation.state, 'accepted')
  assert.equal(result.operation.acceptance, 'yes')
  assert.equal(result.operation.acknowledgement, undefined)
  assert.equal(result.receipt, null)
})

test('not_found and unavailable status remain ambiguous and preserve the original rejection', async () => {
  const original = diagnose(new RpcFailure('AA24 signature error', 200, -32507), 'submit', 'no')
  const result = await inspectOperation({ ...prepared(), state: 'rejected', submissionError: original }, emptyRpc, ENTRY_POINT)
  assert.equal(result.operation.state, 'rejected')
  assert.deepEqual(result.operation.submissionError, original)
  const unknown = await inspectOperation({ ...prepared(), state: 'unknown', acceptance: 'unknown' }, emptyRpc, ENTRY_POINT)
  assert.equal(unknown.operation.state, 'unknown')
  const fallback = await inspectOperation(prepared(), async <T>(method: string) => {
    if (method === 'pimlico_getUserOperationStatus') throw new RpcFailure('Method not found', 200, -32601)
    return { result: null as T, httpStatus: 200 }
  }, ENTRY_POINT)
  assert.equal(fallback.operation.checks?.status, 'unavailable')
  assert.equal(fallback.operation.state, 'unknown')
})

test('successful inclusion waits for independent successful chain evidence', async () => {
  const states: string[] = []
  let verified = false
  const proof = await pollOperation(prepared(), {
    inspect: value => inspectOperation(value, rpcWith({ eth_getUserOperationReceipt: receipt, eth_getUserOperationByHash: null, pimlico_getUserOperationStatus: { status: 'included', transactionHash: tx } }), ENTRY_POINT),
    verify: async (value, returned) => {
      assert.equal(states.at(-1), 'accepted')
      assert.equal(returned?.receipt.transactionHash, tx)
      verified = true
      return verifyReceipt(successfulChainReceipt as Parameters<typeof verifyReceipt>[0], value.userOperationHash, value.safeAddress)
    },
    update: value => { if (value.state === 'included') assert.equal(verified, true); states.push(value.state) },
  })
  assert.equal(proof?.transactionHash, tx)
  assert.deepEqual(states, ['accepted', 'included'])
})

test('failed chain verification cannot produce successful inclusion', async () => {
  let latest = prepared()
  const result = await pollOperation(latest, {
    inspect: async value => ({ operation: { ...value, state: 'accepted', acceptance: 'yes' }, receipt }),
    verify: async value => verifyReceipt({ ...successfulChainReceipt, status: 'reverted' } as Parameters<typeof verifyReceipt>[0], value.userOperationHash, value.safeAddress),
    update: value => { latest = value },
  })
  assert.equal(result, null)
  assert.equal(latest.state, 'failed')
  assert.equal(latest.lastError?.message, 'OPERATION_REVERTED')
})

test('status transaction hash can be independently verified when bundler receipt is null', async () => {
  let latest = prepared()
  const result = await pollOperation(latest, {
    inspect: value => inspectOperation(value, rpcWith({ eth_getUserOperationReceipt: null, eth_getUserOperationByHash: null, pimlico_getUserOperationStatus: { status: 'included', transactionHash: tx } }), ENTRY_POINT),
    verify: async (value, returned) => {
      assert.equal(returned, null)
      assert.equal(value.transactionHash, tx)
      return verifyReceipt(successfulChainReceipt as Parameters<typeof verifyReceipt>[0], value.userOperationHash, value.safeAddress)
    },
    update: value => { latest = value },
  })
  assert.equal(result?.transactionHash, tx)
  assert.equal(latest.state, 'included')
})

test('timeout preserves acknowledgement and submission error; no resend occurs', async () => {
  let time = 0
  let latest = { ...prepared(), state: 'accepted' as const, acceptance: 'yes' as const, acknowledgement: { hash, at: '2026-01-01T00:00:00Z', httpStatus: 200 }, submissionError: diagnose(new Error('Earlier diagnostic'), 'submit', 'yes') } as PendingOperation
  const original = latest.submissionError
  const result = await pollOperation(latest, {
    inspect: value => inspectOperation(value, emptyRpc, ENTRY_POINT),
    verify: async () => { throw new Error('Must not verify absent receipt') },
    update: value => { latest = value }, now: () => time, sleep: async ms => { time += ms }, timeoutMs: 6_000,
  })
  assert.equal(result, null)
  assert.equal(latest.state, 'unknown')
  assert.equal(latest.acceptance, 'yes')
  assert.equal(latest.acknowledgement?.hash, hash)
  assert.equal(latest.lastError?.message, 'CONFIRMATION_TIMEOUT')
  assert.deepEqual(latest.submissionError, original)
})

test('SDK diagnostics recover nested RPC codes without exposing credentials or request data', () => {
  process.env.NEXT_PUBLIC_PIMLICO_API_KEY = 'unit-only-configured-key'
  try {
    const value = diagnose({ code: 'UNKNOWN_ERROR', message: 'could not coalesce error', info: { error: { code: -32501, message: 'AA33 paymaster failed https://unit.invalid?apikey=unit-only-configured-key payload={signature:secret-base64}' }, payload: { signature: 'never-display' } } }, 'prepare', 'no')
    assert.equal(value.rpcCode, -32501)
    assert.equal(value.sdkCode, 'UNKNOWN_ERROR')
    assert.match(value.message, /AA33 paymaster failed/)
    assert.doesNotMatch(JSON.stringify(value), /unit-only-configured-key|unit.invalid|secret-base64|never-display/)
  } finally { delete process.env.NEXT_PUBLIC_PIMLICO_API_KEY }
})

test('HTTP rejection retains the real status even for a non-JSON response', async () => {
  await assert.rejects(rpcRequest('https://unit.invalid', 'eth_sendUserOperation', [], async () => new Response('Forbidden', { status: 403 })), error => error instanceof RpcFailure && error.httpStatus === 403)
})

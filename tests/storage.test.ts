import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PENDING_KEY, STORAGE_KEY } from '../lib/constants'
import { diagnose, RpcFailure } from '../lib/diagnostics'
import { archivePending, loadPending, savePending } from '../lib/wallet'

test('legacy records stay unresolved and manual archive preserves the passkey and attempt diagnostics', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: () => { throw new Error('Storage deletion is forbidden') },
    clear: () => { throw new Error('Storage clearing is forbidden') },
  } })
  try {
    const identity = 'unit fixture representing unchanged public passkey metadata'
    values.set(STORAGE_KEY, identity)
    values.set(PENDING_KEY, JSON.stringify({ userOperationHash: `0x${'11'.repeat(32)}`, safeAddress: '0x1111111111111111111111111111111111111111', kind: 'mint', description: 'Legacy unit fixture' }))
    const legacy = loadPending()!
    assert.equal(legacy.state, 'unknown')
    assert.equal(legacy.acceptance, 'unknown')
    assert.equal(legacy.acknowledgement, undefined)
    savePending({ ...legacy, state: 'included', acceptance: 'yes' })
    assert.equal(loadPending()?.state, 'unknown', 'Reload requires fresh independent receipt verification')
    const original = diagnose(new RpcFailure('AA24 signature error', 200, -32507), 'submit', 'no')
    savePending({ ...legacy, state: 'rejected', acceptance: 'no', submissionError: original, lastError: diagnose(new Error('CONFIRMATION_TIMEOUT'), 'confirm', 'no') })
    assert.deepEqual(JSON.parse(JSON.stringify(loadPending()?.submissionError)), original)
    archivePending(loadPending()!)
    assert.equal(loadPending(), null)
    assert.equal(values.get(STORAGE_KEY), identity)
    const archived = JSON.parse(values.get(`${PENDING_KEY}-history`)!)
    assert.equal(archived[0].userOperationHash, legacy.userOperationHash)
    assert.equal(archived[0].submissionError.rpcCode, -32507)
    assert.equal(archived[0].lastError.message, 'CONFIRMATION_TIMEOUT')
    assert.equal(values.get(PENDING_KEY), 'null')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

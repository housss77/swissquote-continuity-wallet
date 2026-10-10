import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adjustedVerificationGas, assertOperationBudget, operationBudget, verificationAllowanceBps } from '../lib/gas'

test('verification allowance is bounded, defaults to 1.20x, and rounds upward', () => {
  assert.equal(verificationAllowanceBps(''), 12000)
  assert.equal(verificationAllowanceBps('11500'), 11500)
  assert.equal(verificationAllowanceBps('12000'), 12000)
  for (const input of ['11499', '12001', '20000', 'NaN', '-12000', '12000.5', '1.2e4']) {
    assert.throws(() => verificationAllowanceBps(input), /INVALID_VERIFICATION_GAS_BPS/)
  }
  assert.equal(adjustedVerificationGas(5_065_294n, 12000), 6_078_353n)
  assert.equal(adjustedVerificationGas(5_065_294n, 11500), 5_825_089n)
  assert.equal(adjustedVerificationGas(1n, 12000), 2n)
  for (const raw of [0n, -1n, 2n ** 256n, 2n ** 256n - 1n]) {
    assert.throws(() => adjustedVerificationGas(raw, 12000), /GAS_INVALID_ESTIMATE/)
  }
})

// Synthetic serialization fixture only. No authenticator or network access.
const operation = {
  sender: '0x1111111111111111111111111111111111111111', nonce: '0x0', initCode: '0xabcd', callData: '0xabcd',
  callGasLimit: 1_315_026n, verificationGasLimit: 6_078_353n, preVerificationGas: 82_078n,
  maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, paymasterAndData: '0xabcd', signature: '0xabcd',
}

test('budget covers v0.6 AA95 floor, all serialized calldata bytes and a 10% executor reserve', () => {
  const original = { ...operation }
  const budget = assertOperationBudget(operation)
  assert.equal(budget.aa95FloorBeforeCalldata, '13506732')
  assert.equal(BigInt(budget.calldataGasUpperBound), BigInt(budget.calldataBytes) * 16n)
  const beforeReserve = BigInt(budget.aa95FloorBeforeCalldata) + BigInt(budget.calldataGasUpperBound)
  assert.equal(BigInt(budget.executorReserve), (beforeReserve + 9n) / 10n)
  assert.equal(BigInt(budget.estimatedBudget), beforeReserve + BigInt(budget.executorReserve))
  assert.equal(BigInt(budget.estimatedHeadroom), 16_000_000n - BigInt(budget.estimatedBudget))
  assert.equal(budget.fits, true)
  assert.equal(budget.providerExecutorPaddingVerified, false)
  assert.equal(budget.realSignatureValidated, false)
  assert.deepEqual(operation, original)
  assert.doesNotMatch(JSON.stringify(budget), /0xabcd|0x1111|"signature"|"paymasterAndData"/)
})

test('larger real assertion size is checked before broadcast without changing sponsored gas', () => {
  const largeAssertion = { ...operation, signature: `0x${'ff'.repeat(100_000)}` }
  const budget = operationBudget(largeAssertion)
  assert.equal(budget.fits, false)
  assert.throws(() => assertOperationBudget(largeAssertion), /GAS_BUDGET_EXCEEDED/)
  assert.equal(largeAssertion.verificationGasLimit, operation.verificationGasLimit)
  assert.equal(largeAssertion.callGasLimit, operation.callGasLimit)
  assert.equal(largeAssertion.preVerificationGas, operation.preVerificationGas)
})

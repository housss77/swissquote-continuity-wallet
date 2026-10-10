import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseEther, zeroAddress } from 'viem'
import { assertSepolia } from '../lib/constants'
import { friendlyError } from '../lib/errors'
import { verifyReceipt } from '../lib/proof'
import { transferTransaction } from '../lib/transactions'

const safe = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'

test('Sepolia gate rejects mainnet and other testnets', () => {
  assert.doesNotThrow(() => assertSepolia(11155111))
  for (const chain of [1, 10, 8453, 17000]) assert.throws(() => assertSepolia(chain), /WRONG_CHAIN/)
})

test('a transfer cannot target the Safe, zero address, or an invalid address', () => {
  for (const target of [safe, zeroAddress, 'invalid']) {
    assert.throws(() => transferTransaction(safe, target, '0.1', parseEther('1')), /INVALID_RECIPIENT/)
  }
})

test('gas sponsorship does not allow transferring ETH the Safe does not hold', () => {
  assert.throws(() => transferTransaction(safe, recipient, '0.1', 0n), /INSUFFICIENT_FUNDS/)
})

test('amount validation rejects rounding, zero, negatives, and exponent notation', () => {
  for (const amount of ['0', '-1', '1e-3', '.01', '1.0000000000000000001']) {
    assert.throws(() => transferTransaction(safe, recipient, amount, parseEther('2')), /INVALID_AMOUNT/)
  }
})

test('a valid distinct-recipient transfer preserves the exact wei amount', () => {
  const transfer = transferTransaction(safe, recipient, '0.000000000000000001', 1n)
  assert.equal(transfer.value, '1')
  assert.equal(transfer.to.toLowerCase(), recipient)
  assert.equal(transfer.data, '0x')
})

test('raw provider errors cannot expose keys, URLs, or signed request payloads', () => {
  const raw = new Error('paymaster failed https://provider.invalid?apikey=do-not-expose signed-secret-payload')
  const displayed = friendlyError(raw, 'prepare')
  assert.match(displayed, /Sponsorship failed/)
  assert.doesNotMatch(displayed, /do-not-expose|signed-secret-payload|provider.invalid/)
})

test('nested rejected passkey requests and bundler failures have distinct guidance', () => {
  const nested = { cause: { name: 'NotAllowedError', message: 'cancelled' } }
  assert.match(friendlyError(nested, 'sign'), /cancelled, rejected, or timed out/)
  assert.match(friendlyError(new Error('unknown'), 'submit'), /bundler rejected/)
  assert.match(friendlyError(new Error('Failed to fetch'), 'initialize'), /unreachable/)
})

test('unconfirmed or missing evidence never becomes successful', () => {
  // Intentionally invalid empty hash placeholders; never successful blockchain fixtures.
  const empty = { status: 'success' as const, transactionHash: '0x' as const, blockNumber: 0n, logs: [] }
  assert.throws(() => verifyReceipt(empty, '0x', safe), /EVIDENCE_MISMATCH/)
  assert.throws(() => verifyReceipt({ ...empty, status: 'reverted' }, '0x', safe), /OPERATION_REVERTED/)
  assert.match(friendlyError(new Error('CONFIRMATION_TIMEOUT'), 'confirm'), /still unknown/)
})

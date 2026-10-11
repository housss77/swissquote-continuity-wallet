import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { allowedSafe, authenticateOperator, checkBrowserOrigin } from '../../lib/recovery/server'
import { EXISTING_SAFE } from '../../lib/recovery/contracts'
test('institutional approval requires the exact operator secret and rejects anonymous callers',()=> {
  const previous=process.env.RECOVERY_DEMO_OPERATOR_TOKEN
  process.env.RECOVERY_DEMO_OPERATOR_TOKEN=randomBytes(32).toString('hex')
  try {
    assert.throws(()=>authenticateOperator(new Request('http://localhost:3000/api/recovery')),/UNAUTHORIZED/)
    assert.throws(()=>authenticateOperator(new Request('http://localhost:3000/api/recovery',{headers:{Authorization:'Bearer incorrect'}})),/UNAUTHORIZED/)
    assert.doesNotThrow(()=>authenticateOperator(new Request('http://localhost:3000/api/recovery',{headers:{Authorization:`Bearer ${process.env.RECOVERY_DEMO_OPERATOR_TOKEN}`}})))
  } finally {if(previous===undefined)delete process.env.RECOVERY_DEMO_OPERATOR_TOKEN;else process.env.RECOVERY_DEMO_OPERATOR_TOKEN=previous}
})
test('cross-origin and non-local demo requests are rejected before signing',()=> {
  assert.doesNotThrow(()=>checkBrowserOrigin(new Request('http://localhost:3000/api/recovery',{headers:{Origin:'http://localhost:3000'}})))
  assert.throws(()=>checkBrowserOrigin(new Request('http://localhost:3000/api/recovery',{headers:{Origin:'https://attacker.example'}})),/ORIGIN/)
  assert.throws(()=>checkBrowserOrigin(new Request('https://public.example/api/recovery',{headers:{Origin:'https://public.example'}})),/ORIGIN/)
})
test('test relayer cannot touch the accepted Safe or an address outside its allowlist',()=> {
  const previous=process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES
  process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES='0x1111111111111111111111111111111111111111'
  try {
    assert.throws(()=>allowedSafe(EXISTING_SAFE),/APPROVAL/)
    assert.throws(()=>allowedSafe('0x2222222222222222222222222222222222222222'),/ALLOWLISTED/)
    assert.equal(allowedSafe('0x1111111111111111111111111111111111111111'),'0x1111111111111111111111111111111111111111')
  } finally {if(previous===undefined)delete process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES;else process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES=previous}
})

test('a malformed unrelated allowlist entry fails closed with a configuration-specific error',()=> {
  const previous=process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES
  const target='0x1111111111111111111111111111111111111111'
  // This older disposable address has the same bytes as the canonical address,
  // but its mixed-case checksum is invalid. It previously obscured the cause.
  const invalidChecksum='0xC6EfE07F9D421C0DAE6d4e198767425612c8eC22'
  try {
    process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES=`${target},${invalidChecksum}`
    assert.throws(()=>allowedSafe(target),/^Error: RECOVERY_INVALID_SAFE_ALLOWLIST$/)
    assert.throws(()=>allowedSafe(EXISTING_SAFE),/APPROVAL/)
    process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES=`${target},${invalidChecksum.toLowerCase()}`
    assert.equal(allowedSafe(target),target)
    assert.equal(allowedSafe(invalidChecksum.toLowerCase()).toLowerCase(),invalidChecksum.toLowerCase())
    assert.throws(()=>allowedSafe('0x2222222222222222222222222222222222222222'),/ALLOWLISTED/)
    // Invalid submitted identities retain the address error, not a config error.
    assert.throws(()=>allowedSafe(invalidChecksum),/^Error: RECOVERY_INVALID_ADDRESS$/)
  } finally {if(previous===undefined)delete process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES;else process.env.RECOVERY_ALLOWED_SAFE_ADDRESSES=previous}
})

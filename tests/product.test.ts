import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DEMO_SAFE,ORIGINAL_SAFE,assertConfigurationWritable,assertCustomerSpendingAllowed,sameAddress} from '../lib/product'
test('both verified wallets reject configuration writes; only human-approved demo spending remains possible',()=>{
 for(const safe of [DEMO_SAFE,ORIGINAL_SAFE])assert.throws(()=>assertConfigurationWritable(safe),/CONFIGURATION_LOCKED/)
 assert.throws(()=>assertCustomerSpendingAllowed(ORIGINAL_SAFE),/READ_ONLY/)
 assert.doesNotThrow(()=>assertCustomerSpendingAllowed(DEMO_SAFE))
 assert.doesNotThrow(()=>assertConfigurationWritable('0x1111111111111111111111111111111111111111'))
 assert.equal(sameAddress(DEMO_SAFE,DEMO_SAFE.toLowerCase()),true)
})

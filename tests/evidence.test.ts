import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import evidence from '../lib/demo-evidence.json'
test('every presentation receipt is published in the human acceptance document, never synthetic evidence',()=>{
 const source=fs.readFileSync(evidence.source,'utf8')
 for(const t of [evidence.initialSpend,...evidence.transactions]){assert.match(t.hash,/^0x[a-f0-9]{64}$/);assert.ok(source.includes(t.hash));assert.ok(source.includes(String(t.block)))}
 assert.equal(evidence.chainId,11155111);assert.equal(evidence.spendingThreshold,1);assert.equal(evidence.recoveryThreshold,2)
 assert.equal(evidence.guardians.length,3);assert.equal(new Set(evidence.guardians.map(g=>g.address.toLowerCase())).size,3)
 assert.ok(evidence.observedWaitSeconds>=evidence.delaySeconds)
 assert.ok(evidence.limitations.some(l=>l.includes('No live USDC')))
 assert.equal(JSON.stringify(evidence).includes('rawId'),false)
})

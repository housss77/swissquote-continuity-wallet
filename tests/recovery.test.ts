import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeFunctionData, encodeEventTopics, encodeAbiParameters, parseAbi, getAddress, type PublicClient, type TransactionReceipt } from 'viem'
import { assertDisposableSafe, expectedModuleCodeHash, expectedModuleCode, EXISTING_SAFE, SHARED_SIGNER } from '../lib/recovery/contracts'
import { isRecoveryProtected, verifyModule } from '../lib/recovery/onchain'
import { TypedDataEncoder } from 'ethers'
import { intentHash, parseIntent } from '../lib/recovery/signatures'
import { batchIntentValidator, enrollmentCalls } from '../lib/recovery/enrollment'
import { validateCredential, verifyFreshCredential } from '../lib/recovery/passkey'
import { recoveryReceiptIntent } from '../lib/recovery/evidence'
import { enrollmentPreview, enrollmentTyped, enrollmentProofMatches, verifyEnrollmentProof } from '../lib/recovery/guardian-proof'
import { hashTypedData, verifyTypedData } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { recoveryErrorMessage } from '../lib/recovery/errors'
const a=getAddress('0x1111111111111111111111111111111111111111'),b=getAddress('0x2222222222222222222222222222222222222222'),c=getAddress('0x3333333333333333333333333333333333333333'),d=getAddress('0x4444444444444444444444444444444444444444')
const intent={chainId:11155111 as const,module:a,safe:b,newOwner:c,newThreshold:'1' as const,nonce:'3',moduleVersion:'0.2.0' as const}

test('operator and allowlist failures explain the existing setup without replacing credentials',()=> {
  for(const code of ['RECOVERY_OPERATOR_REQUIRED','RECOVERY_OPERATOR_UNAUTHORIZED']) {
    const message=recoveryErrorMessage(code)
    assert.match(message,/RECOVERY_DEMO_OPERATOR_TOKEN/)
    assert.match(message,/not your Windows Hello PIN/)
  }
  assert.match(recoveryErrorMessage('RECOVERY_SAFE_NOT_ALLOWLISTED'),/RECOVERY_ALLOWED_SAFE_ADDRESSES/)
  assert.match(recoveryErrorMessage('RECOVERY_SAFE_NOT_ALLOWLISTED'),/restart the server/)
  assert.match(recoveryErrorMessage('RECOVERY_INVALID_SAFE_ALLOWLIST'),/correct checksums or lowercase/)
  assert.match(recoveryErrorMessage('RECOVERY_INVALID_SAFE_ALLOWLIST'),/before signing or sending/)
  assert.equal(recoveryErrorMessage('RECOVERY_INVALID_METADATA_PROOF'),'RECOVERY_INVALID_METADATA_PROOF')
})
test('recovery protected requires onchain 3 distinct non-owner guardians and threshold two',()=> {
  const s={enabled:true,owners:[a],spendingThreshold:1n,guardians:[b,c,d],threshold:2n}
  assert.equal(isRecoveryProtected(s),true)
  for(const v of [{...s,enabled:false},{...s,threshold:1n},{...s,guardians:[b,b,d]},{...s,guardians:[a,c,d]},{...s,owners:[a,b]}])assert.equal(isRecoveryProtected(v),false)
})
test('canonical intent rejects wrong chain, arbitrary fields, bad nonce and threshold',()=> {
  assert.deepEqual(parseIntent(intent),intent)
  for (const v of [{...intent,chainId:1},{...intent,newThreshold:'2'},{...intent,nonce:'-1'},{...intent,nonce:'03'},{...intent,nonce:(2n**256n).toString()},{...intent,extra:'injected'}])assert.throws(()=>parseIntent(v),/RECOVERY_INVALID_INTENT/)
  for(const v of [{...intent,safe:c},{...intent,newOwner:d},{...intent,module:b},{...intent,nonce:'4'}])assert.notEqual(intentHash(v),intentHash(intent))
})
test('existing accepted Safe is blocked from all installation writes',()=>assert.throws(()=>assertDisposableSafe(EXISTING_SAFE),/APPROVAL/))
test('delay variants produce different immutable contract bytecode hashes',()=>assert.notEqual(expectedModuleCodeHash(180),expectedModuleCodeHash(259200)))

test('module verification supplies explicit viem EIP712Domain types and checks the onchain separator',async()=> {
  const previousModule=process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS,previousDelay=process.env.NEXT_PUBLIC_RECOVERY_DELAY_SECONDS
  process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS=a;process.env.NEXT_PUBLIC_RECOVERY_DELAY_SECONDS='180'
  try {
    let separator=TypedDataEncoder.hashDomain({name:'Social Recovery Module',version:'0.2.0',chainId:11155111,verifyingContract:a})
    const client={getChainId:async()=>11155111,getCode:async()=>expectedModuleCode(180),readContract:async(v:{functionName:string})=>v.functionName==='VERSION'?'0.2.0':separator} as unknown as PublicClient
    assert.deepEqual(await verifyModule(client),{module:a,delay:180})
    separator=`0x${'11'.repeat(32)}`
    await assert.rejects(()=>verifyModule(client),/DOMAIN_MISMATCH/)
  } finally {
    if(previousModule===undefined)delete process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS;else process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS=previousModule
    if(previousDelay===undefined)delete process.env.NEXT_PUBLIC_RECOVERY_DELAY_SECONDS;else process.env.NEXT_PUBLIC_RECOVERY_DELAY_SECONDS=previousDelay
  }
})
test('atomic installation keeps spending owners untouched and ends with threshold two',()=> {
  const backup={role:'customer_backup' as const,rpId:'localhost',signer:b,passkey:{rawId:'11'.repeat(32),coordinates:{x:`0x${'22'.repeat(32)}`,y:`0x${'33'.repeat(32)}`}}}
  const calls=enrollmentCalls(a,{safe:d,backup,bank:c,third:a})
  assert.equal(calls.length,4)
  assert.ok(calls.every(call=>call.value==='0'))
  assert.throws(()=>enrollmentCalls(a,{safe:d,backup,bank:b,third:a}),/DISTINCT/)
  assert.deepEqual(Object.keys(validateCredential(backup)).sort(),['passkey','role','rpId','signer'])
  assert.throws(()=>validateCredential({...backup,passkey:{...backup.passkey,customVerifierAddress:a}}),/INVALID_PUBLIC_CREDENTIAL/)
})
test('recovery sponsorship accepts only the exact trusted atomic batch',()=> {
  const expected={to:a,value:'0',operation:1 as const,data:'0x1234' as const}
  const validate=batchIntentValidator(expected)
  const abi=parseAbi(['function executeUserOp(address,uint256,bytes,uint8)'])
  const valid={sender:b,nonce:'0',initCode:'0x',callData:encodeFunctionData({abi,functionName:'executeUserOp',args:[a,0n,'0x1234',1]})}
  assert.doesNotThrow(()=>validate(valid,b))
  for(const args of [[c,0n,'0x1234',1],[a,1n,'0x1234',1],[a,0n,'0xabcd',1],[a,0n,'0x1234',0]] as const)assert.throws(()=>validate({...valid,callData:encodeFunctionData({abi,functionName:'executeUserOp',args})},b),/INTENT_MISMATCH/)
})

test('a proxy with the old shared-owner public key is rejected even with a different address',async()=> {
  const credential={role:'replacement' as const,rpId:'localhost',signer:c,passkey:{rawId:'11'.repeat(32),coordinates:{x:`0x${'22'.repeat(32)}`,y:`0x${'33'.repeat(32)}`}}}
  const client={getChainId:async()=>11155111,readContract:async(v:{functionName:string})=>v.functionName==='getSigner'?c:{x:BigInt(credential.passkey.coordinates.x),y:BigInt(credential.passkey.coordinates.y),verifiers:0n}} as unknown as PublicClient
  await assert.rejects(()=>verifyFreshCredential(client,b,[SHARED_SIGNER],[d],credential),/OLD_PUBLIC_KEY_REUSED/)
  await assert.doesNotReject(()=>verifyFreshCredential(client,b,[a],[d],credential))
  await assert.rejects(()=>verifyFreshCredential(client,b,[c],[d],credential),/NOT_DISTINCT/)
})

test('fresh browser reconstructs finalization intent only from matching successful module event',()=> {
  const event=parseAbi(['event RecoveryFinalized(address indexed wallet,bytes32 indexed recoveryHash,address[] newOwners,uint256 newThreshold,uint256 nonce)'])
  const log={address:a,topics:encodeEventTopics({abi:event,eventName:'RecoveryFinalized',args:{wallet:b,recoveryHash:intentHash(intent)}}),data:encodeAbiParameters([{type:'address[]'},{type:'uint256'},{type:'uint256'}],[[c],1n,3n])}
  const receipt={status:'success',to:a,logs:[log]} as unknown as TransactionReceipt
  assert.deepEqual(recoveryReceiptIntent(receipt,a,b,'RecoveryFinalized'),intent)
  for(const changed of [{...receipt,status:'reverted'}, {...receipt,to:d}, {...receipt,logs:[]}, {...receipt,logs:[{...log,address:d}]}])assert.throws(()=>recoveryReceiptIntent(changed as TransactionReceipt,a,b,'RecoveryFinalized'),/EVIDENCE_MISMATCH/)
  assert.throws(()=>recoveryReceiptIntent(receipt,a,b,'RecoveryFinalized',{...intent,newOwner:d}),/EVIDENCE_MISMATCH/)
})

test('third-party enrollment proof is bound to the complete configuration and cannot authorize recovery',async()=> {
  const preview=enrollmentPreview({safe:b,module:a,delay:180} as never,c,d,a)
  const proof={signer:a,signature:'0x1234' as const,intentHash:hashTypedData(enrollmentTyped(preview))}
  const client={verifyTypedData:async()=>true} as unknown as PublicClient
  await assert.doesNotReject(()=>verifyEnrollmentProof(client,preview,proof))
  await assert.rejects(()=>verifyEnrollmentProof(client,{...preview,delay:259200},proof),/POSSESSION/)
  await assert.rejects(()=>verifyEnrollmentProof(client,preview,{...proof,signer:d}),/POSSESSION/)
  assert.notEqual(proof.intentHash,intentHash(intent))
})

test('real enrollment signatures bind every configuration field and malformed imports fail closed',async()=>{
  // Ephemeral local test identity only; no real guardian key, network or storage.
  const guardian=privateKeyToAccount(generatePrivateKey())
  const preview=enrollmentPreview({safe:b,module:a,delay:180} as never,c,d,guardian.address)
  const typed=enrollmentTyped(preview)
  const proof={signer:guardian.address,intentHash:hashTypedData(typed),signature:await guardian.signTypedData(typed)}
  const client={verifyTypedData:async(v:Parameters<typeof verifyTypedData>[0])=>{
    // The public-client verifier returns false for invalid crypto signatures;
    // the local-only utility used by this test throws on malformed r/s values.
    try{return await verifyTypedData(v)}catch{return false}
  }} as unknown as PublicClient
  assert.deepEqual(await verifyEnrollmentProof(client,preview,proof),proof)
  for(const changed of [{...preview,safe:d},{...preview,module:b},{...preview,backup:b},{...preview,bank:c},{...preview,third:a},
    {...preview,delay:259200},{...preview,threshold:1},{...preview,chainId:1}]){
    assert.equal(enrollmentProofMatches(changed as never,proof),false)
    await assert.rejects(()=>verifyEnrollmentProof(client,changed as never,proof),/POSSESSION/)
  }
  for(const invalid of [null,[],preview,{...proof,extra:true},{...proof,signature:'0x0'},{...proof,signature:'not hex'},
    {...proof,signature:`0x${'00'.repeat(9000)}`},{...proof,intentHash:'0x00'},{...proof,signer:a}]){
    await assert.rejects(()=>verifyEnrollmentProof(client,preview,invalid),/POSSESSION/)
  }
  await assert.rejects(()=>verifyEnrollmentProof(client,preview,{...proof,signature:`0x${'00'.repeat(65)}`}),/POSSESSION/)
})

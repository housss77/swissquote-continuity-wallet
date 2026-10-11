import {test} from 'node:test'
import assert from 'node:assert/strict'
import {encodeFunctionData,parseAbi} from 'viem'
import {checkAppOrigin,deploymentOrigin,validPasskeyRp} from '../lib/app-origin'
import {validateSponsorOperation} from '../lib/sponsor-policy'
import {ENTRY_POINT,NFT_ADDRESS} from '../lib/constants'
import {USDC_ADDRESS,tokenAbi,ORIGINAL_SAFE,DEMO_SAFE} from '../lib/product'
const sender='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222'
const execute=parseAbi(['function executeUserOp(address to,uint256 value,bytes data,uint8 operation)'])
const nft=parseAbi(['function safeMint(address to,uint256 tokenId)'])
function operation(target=USDC_ADDRESS,data=encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[recipient,1000000n]})){
 return {sender,nonce:'0x0',initCode:'0x',callData:encodeFunctionData({abi:execute,functionName:'executeUserOp',args:[target,0n,data,0]}),callGasLimit:'0x100',verificationGasLimit:'0x100',preVerificationGas:'0x100',maxFeePerGas:'0x100',maxPriorityFeePerGas:'0x1',paymasterAndData:'0x',signature:'0x11'}
}
test('fixed HTTPS deployment origin rejects host injection and cross-site requests',()=>{
 const previous=process.env.APP_ORIGIN;process.env.APP_ORIGIN='https://wallet.example'
 try{
  assert.equal(deploymentOrigin(),'https://wallet.example')
  assert.doesNotThrow(()=>checkAppOrigin(new Request('https://wallet.example/api/auth',{headers:{origin:'https://wallet.example'}})))
  assert.doesNotThrow(()=>checkAppOrigin(new Request('http://wallet.example/api/auth',{headers:{origin:'https://wallet.example',host:'wallet.example'}})))
  assert.throws(()=>checkAppOrigin(new Request('https://attacker.example/api/auth',{headers:{origin:'https://wallet.example'}})))
  assert.throws(()=>checkAppOrigin(new Request('https://wallet.example/api/auth',{headers:{origin:'https://attacker.example'}})))
  assert.throws(()=>deploymentOrigin('http://wallet.example'))
  assert.throws(()=>deploymentOrigin('https://wallet.example/path'))
 }finally{if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous}
})
test('recovery RP allows only localhost and the configured deployed hostname',()=>{
 const old=process.env.NEXT_PUBLIC_PASSKEY_RP_ID;process.env.NEXT_PUBLIC_PASSKEY_RP_ID='wallet.example'
 try{assert.equal(validPasskeyRp('localhost'),true);assert.equal(validPasskeyRp('wallet.example'),true);assert.equal(validPasskeyRp('attacker.example'),false)}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_PASSKEY_RP_ID;else process.env.NEXT_PUBLIC_PASSKEY_RP_ID=old}
})
test('sponsorship is bound to session Safe, v0.6 EntryPoint and the exact supported transfer',()=>{
 const op=operation();assert.equal(validateSponsorOperation(op,ENTRY_POINT,sender).kind,'usdc')
 assert.throws(()=>validateSponsorOperation(op,ENTRY_POINT,recipient),/SESSION_WALLET/)
 assert.throws(()=>validateSponsorOperation(op,recipient,sender),/ENTRYPOINT/)
 assert.throws(()=>validateSponsorOperation({...op,sender:ORIGINAL_SAFE},ENTRY_POINT),/SENDER/)
 assert.throws(()=>validateSponsorOperation({...op,callGasLimit:'-1'},ENTRY_POINT),/INVALID/)
 assert.throws(()=>validateSponsorOperation(operation(recipient),ENTRY_POINT),/TARGET/)
})
test('sponsor refuses approvals, self-transfer, zero transfer and oversized demo amounts',()=>{
 assert.throws(()=>validateSponsorOperation(operation(USDC_ADDRESS,encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[recipient,2n**256n-1n]})),ENTRY_POINT),/APPROVAL/)
 for(const [to,amount] of [[sender,1n],[recipient,0n],[recipient,100000001n]] as const)assert.throws(()=>validateSponsorOperation(operation(USDC_ADDRESS,encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[to,amount]})),ENTRY_POINT),/TRANSFER_POLICY/)
})
test('NFT sponsorship mints only to the submitting Safe and protected configuration cannot be sponsored',()=>{
 const data=encodeFunctionData({abi:nft,functionName:'safeMint',args:[sender,1n]});assert.equal(validateSponsorOperation(operation(NFT_ADDRESS,data),ENTRY_POINT).kind,'mint')
 assert.throws(()=>validateSponsorOperation(operation(NFT_ADDRESS,encodeFunctionData({abi:nft,functionName:'safeMint',args:[recipient,1n]})),ENTRY_POINT),/NFT_RECIPIENT/)
 const callData=encodeFunctionData({abi:execute,functionName:'executeUserOp',args:[recipient,0n,'0x',1]})
 assert.throws(()=>validateSponsorOperation({...operation(),sender:DEMO_SAFE,callData},ENTRY_POINT,undefined,true),/CONFIGURATION_LOCKED/)
})

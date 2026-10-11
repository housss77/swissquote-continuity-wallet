import {test} from 'node:test'
import assert from 'node:assert/strict'
import {decodeFunctionData,encodeAbiParameters,encodeEventTopics,maxUint256,parseAbi,type TransactionReceipt,type Hash} from 'viem'
import {usdcTransfer,verifyUsdcTransfer,reconcileBalance,validateUsdcIntent} from '../lib/usdc'
import {DEMO_SAFE,USDC_ADDRESS,tokenAbi} from '../lib/product'
import {ENTRY_POINT} from '../lib/constants'
import {ENTRY_POINT_ABI,verifyReceipt} from '../lib/proof'
import {transactionReview} from '../lib/transaction-review'
import {assertFreshQuote,withSendLock} from '../lib/send-session'
const recipient='0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86' as const,hash=`0x${'11'.repeat(32)}` as Hash
const transfer=usdcTransfer(DEMO_SAFE,recipient,'1.000001',2_000_000n)
const log=(address:string,topics:unknown,data:string,index:number)=>({address,topics,data,logIndex:index}) as TransactionReceipt['logs'][number]
function operationEvent(h=hash,index=3) {return log(ENTRY_POINT,encodeEventTopics({abi:ENTRY_POINT_ABI,eventName:'UserOperationEvent',args:{userOpHash:h,sender:DEMO_SAFE,paymaster:'0x6666666666667849c56f2850848cE1C4da65c68b'}}),encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[1n,true,1n,1n]),index)}
function tokenEvent(value=1_000_001n,index=2,token=USDC_ADDRESS){return log(token,encodeEventTopics({abi:tokenAbi,eventName:'Transfer',args:{from:DEMO_SAFE,to:recipient}}),encodeAbiParameters([{type:'uint256'}],[value]),index)}
const before=log(ENTRY_POINT,encodeEventTopics({abi:parseAbi(['event BeforeExecution()']),eventName:'BeforeExecution'}),'0x',1)
const receipt={status:'success' as const,transactionHash:`0x${'22'.repeat(32)}` as Hash,blockNumber:4n,logs:[before,tokenEvent(),operationEvent()]}
test('USDC uses exact six decimals, transfer selector and zero native value',()=>{
 assert.equal(transfer.intent.amount,'1000001');assert.equal(transfer.transaction.value,'0');assert.equal(transfer.transaction.to,USDC_ADDRESS)
 assert.deepEqual(decodeFunctionData({abi:tokenAbi,data:transfer.transaction.data}),{functionName:'transfer',args:[recipient,1_000_001n]})
 for(const input of ['0','-1','1e2','0.0000001','1.1234567','Infinity'])assert.throws(()=>usdcTransfer(DEMO_SAFE,recipient,input,10_000_000n),/USDC_INVALID_AMOUNT/)
 assert.throws(()=>usdcTransfer(DEMO_SAFE,recipient,'3',2_000_000n),/INSUFFICIENT_USDC/)
 for(const address of [DEMO_SAFE,'0x0000000000000000000000000000000000000000','bad'])assert.throws(()=>usdcTransfer(DEMO_SAFE,address,'1',2_000_000n),/INVALID_RECIPIENT/)
})
test('USDC intent rejects different chain, token, sender/recipient or invalid amount',()=>{
 for(const changed of [{chainId:1},{token:recipient},{recipient:DEMO_SAFE},{amount:'01'},{amount:(2n**256n).toString()}])assert.throws(()=>validateUsdcIntent({...transfer.intent,...changed}),/USDC_INVALID_INTENT/)
})
test('matching AA receipt plus matching USDC event is required before inclusion',()=>{
 assert.equal(verifyReceipt(receipt,hash,DEMO_SAFE).transactionHash,receipt.transactionHash)
 assert.equal(verifyUsdcTransfer(receipt,hash,transfer.intent).amount,'1000001')
 for(const logs of [[before,operationEvent()],[before,tokenEvent(1n),operationEvent()],[before,tokenEvent(1_000_001n,2,recipient),operationEvent()],[before,tokenEvent(),tokenEvent(1_000_001n,2),operationEvent()]])assert.throws(()=>verifyUsdcTransfer({...receipt,logs},hash,transfer.intent),/USDC_TRANSFER_UNVERIFIED/)
 assert.throws(()=>verifyUsdcTransfer({...receipt,status:'reverted'},hash,transfer.intent),/OPERATION_REVERTED/)
})
test('another UserOperation transfer in the same bundle cannot satisfy this intent',()=>{
 const logs=[before,tokenEvent(),operationEvent(`0x${'33'.repeat(32)}`,3),operationEvent(hash,4)]
 assert.throws(()=>verifyUsdcTransfer({...receipt,logs},hash,transfer.intent),/USDC_TRANSFER_UNVERIFIED/)
 assert.throws(()=>verifyUsdcTransfer({...receipt,logs:[tokenEvent(),operationEvent()]},hash,transfer.intent),/USDC_TRANSFER_UNVERIFIED/)
})
test('balance reconciliation accounts for other funding and transfers in the block',()=>{
 const all=[{from:DEMO_SAFE,to:recipient,value:1_000_001n},{from:recipient,to:DEMO_SAFE,value:200_000n}]
 reconcileBalance(2_000_000n,1_199_999n,DEMO_SAFE,all);reconcileBalance(0n,800_001n,recipient,all)
 assert.throws(()=>reconcileBalance(2_000_000n,999_999n,DEMO_SAFE,all),/USDC_BALANCE_RECONCILIATION_MISMATCH/)
})
test('fresh quote and an explicit exclusive browser action are required; no retry',async()=>{
 assertFreshQuote(1000,61_000);assert.throws(()=>assertFreshQuote(1000,61_001),/EXPIRED/)
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let calls=0
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name:string,_options:unknown,run:(lock:object|null)=>Promise<unknown>)=>run(null)}}})
 await assert.rejects(withSendLock(async()=>{calls++}),/SEND_ALREADY_ACTIVE/);assert.equal(calls,0)
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name:string,_options:unknown,run:(lock:object)=>Promise<unknown>)=>run({})}}})
 await assert.rejects(withSendLock(async()=>{calls++;throw new Error('cancelled')}),/cancelled/);assert.equal(calls,1)
 if(original)Object.defineProperty(globalThis,'navigator',original);else Reflect.deleteProperty(globalThis,'navigator')
})
test('advisory review decodes known transfer, flags unlimited approvals and fails closed',()=>{
 assert.equal(transactionReview(11155111,USDC_ADDRESS,transfer.transaction.data).status,'No issue detected by available checks')
 const approve=()=>{const abi=tokenAbi;return import('viem').then(v=>v.encodeFunctionData({abi,functionName:'approve',args:[recipient,maxUint256]}))}
 return approve().then(data=>{const review=transactionReview(11155111,USDC_ADDRESS,data);assert.equal(review.status,'Review recommended');assert.match(review.warnings.join(' '),/Unlimited allowance/);assert.equal(review.sanctions,'Not checked')
 assert.equal(transactionReview(1,USDC_ADDRESS,data).status,'Cannot complete check');assert.equal(transactionReview(11155111,USDC_ADDRESS,'0xdead').status,'Cannot complete check');assert.equal(transactionReview(11155111,recipient,data).status,'Review recommended')})
})

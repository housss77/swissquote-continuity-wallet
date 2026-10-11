import { decodeEventLog, encodeFunctionData, getAddress, isAddress, parseAbi, parseUnits, zeroAddress, type Address, type Hash, type TransactionReceipt } from 'viem'
import { CHAIN_ID, ENTRY_POINT } from './constants'
import { tokenAbi, USDC_ADDRESS, sameAddress } from './product'
import { ENTRY_POINT_ABI } from './proof'

export type UsdcIntent = { chainId: 11155111; safe: Address; token: Address; recipient: Address; amount: string }
export function validateUsdcIntent(value: unknown): UsdcIntent {
  const v=value as UsdcIntent
  if(!v || v.chainId!==CHAIN_ID || !isAddress(v.safe) || !isAddress(v.token) || !sameAddress(v.token,USDC_ADDRESS)
    || !isAddress(v.recipient) || sameAddress(v.recipient,zeroAddress) || sameAddress(v.safe,v.recipient)
    || typeof v.amount!=='string' || !/^[1-9]\d*$/.test(v.amount) || BigInt(v.amount)>=2n**256n) throw new Error('USDC_INVALID_INTENT')
  return {chainId:11155111,safe:getAddress(v.safe),token:USDC_ADDRESS,recipient:getAddress(v.recipient),amount:v.amount}
}
export function usdcTransfer(safe: Address, recipient: string, amount: string, balance: bigint) {
  if(!isAddress(recipient) || sameAddress(recipient,zeroAddress) || sameAddress(safe,recipient))throw new Error('INVALID_RECIPIENT')
  if(!/^\d+(?:\.\d{1,6})?$/.test(amount))throw new Error('USDC_INVALID_AMOUNT')
  const units=parseUnits(amount,6)
  if(units<=0n || units>=2n**256n)throw new Error('USDC_INVALID_AMOUNT')
  if(units>balance)throw new Error('INSUFFICIENT_USDC')
  const intent=validateUsdcIntent({chainId:11155111,safe,token:USDC_ADDRESS,recipient,amount:units.toString()})
  return {intent,transaction:usdcTransaction(intent)}
}
export function usdcTransaction(value: UsdcIntent) {
  const intent=validateUsdcIntent(value)
  return {to:USDC_ADDRESS,value:'0',data:encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[intent.recipient,BigInt(intent.amount)]})}
}
export type TransferProof = { token:Address; recipient:Address; amount:string; logIndex:number; reconciliation:'verified'|'unavailable' }
// Restrict evidence to this UserOperation's execution interval inside a bundle.
// A successful outer receipt or another operation's Transfer is insufficient.
export function verifyUsdcTransfer(receipt:Pick<TransactionReceipt,'status'|'logs'>,hash:Hash,value:UsdcIntent):TransferProof {
  const intent=validateUsdcIntent(value)
  if(receipt.status!=='success')throw new Error('OPERATION_REVERTED')
  let start=-1,end=-1
  for(const log of receipt.logs) {
    if(!sameAddress(log.address,ENTRY_POINT))continue
    try {decodeEventLog({abi:parseAbi(['event BeforeExecution()']),data:log.data,topics:log.topics});if(log.logIndex!==null)start=log.logIndex;continue}catch{/* Other EntryPoint events. */}
    try {
      const event=decodeEventLog({abi:ENTRY_POINT_ABI,data:log.data,topics:log.topics})
      if(log.logIndex===null)throw new Error('USDC_TRANSFER_UNVERIFIED')
      if(event.args.userOpHash.toLowerCase()===hash.toLowerCase()){end=log.logIndex;break}
      start=log.logIndex
    }catch(error){if(error instanceof Error && error.message==='USDC_TRANSFER_UNVERIFIED')throw error}
  }
  if(end<0 || start<0)throw new Error('USDC_TRANSFER_UNVERIFIED')
  const outgoing=receipt.logs.flatMap(log=>{
    if(!sameAddress(log.address,USDC_ADDRESS) || log.logIndex===null || log.logIndex<=start || log.logIndex>=end)return []
    try {const e=decodeEventLog({abi:tokenAbi,eventName:'Transfer',data:log.data,topics:log.topics});return sameAddress(e.args.from,intent.safe)?[{...e.args,index:log.logIndex}]:[]}catch{return []}
  })
  if(outgoing.length!==1 || !sameAddress(outgoing[0].to,intent.recipient) || outgoing[0].value!==BigInt(intent.amount))throw new Error('USDC_TRANSFER_UNVERIFIED')
  return {token:USDC_ADDRESS,recipient:intent.recipient,amount:intent.amount,logIndex:outgoing[0].index,reconciliation:'unavailable'}
}
export function balanceDelta(address:Address,transfers:readonly {from:Address;to:Address;value:bigint}[]) {
  return transfers.reduce((delta,t)=>delta+(sameAddress(t.to,address)?t.value:0n)-(sameAddress(t.from,address)?t.value:0n),0n)
}
export function reconcileBalance(before:bigint,after:bigint,address:Address,transfers:readonly {from:Address;to:Address;value:bigint}[]) {
  if(after-before!==balanceDelta(address,transfers))throw new Error('USDC_BALANCE_RECONCILIATION_MISMATCH')
}

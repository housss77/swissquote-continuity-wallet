import { decodeFunctionData, encodeFunctionData, getAddress, type Address, type Hex } from 'viem'
import { encodeMultiSendData, getMultiSendCallOnlyContract } from '@safe-global/protocol-kit'
import type { Safe4337Pack } from '@safe-global/relay-kit'
import { assertDisposableSafe, recoveryCall, safeAbi } from './contracts'
import type { Enrollment } from './types'
export function enrollmentCalls(module:Address,enrollment:Enrollment) {
  assertDisposableSafe(enrollment.safe)
  const guardians=[enrollment.backup.signer,enrollment.bank,enrollment.third]
  if (new Set(guardians.map(g=>g.toLowerCase())).size!==3 || guardians.some(g=>g.toLowerCase()===enrollment.safe.toLowerCase())) throw new Error('RECOVERY_GUARDIANS_NOT_DISTINCT')
  return [{to:enrollment.safe,value:'0',data:encodeFunctionData({abi:safeAbi,functionName:'enableModule',args:[module]})},
    ...guardians.map((g,i)=>({to:module,value:'0',data:recoveryCall('addGuardianWithThreshold',[g,i===0?1n:2n])}))]
}
export async function atomicBatch(pack:Safe4337Pack,calls:ReturnType<typeof enrollmentCalls>) {
  const contract=await getMultiSendCallOnlyContract({safeProvider:pack.protocolKit.getSafeProvider(),safeVersion:'1.4.1'})
  const bytes=encodeMultiSendData(calls.map(c=>({...c,operation:0})))
  return {to:getAddress(await contract.getAddress()),value:'0',operation:1 as const,
    data:encodeFunctionData({abi:[{type:'function',name:'multiSend',stateMutability:'payable',inputs:[{name:'transactions',type:'bytes'}],outputs:[]}],functionName:'multiSend',args:[bytes as Hex]})}
}
const execute=[{type:'function',name:'executeUserOp',stateMutability:'nonpayable',inputs:[{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'},{name:'operation',type:'uint8'}],outputs:[]}] as const
export function batchIntentValidator(expected:Awaited<ReturnType<typeof atomicBatch>>) {
  return (operation:{sender:string;callData:string;initCode:string;nonce:string|bigint|number},safe:Address) => {
    if (operation.sender.toLowerCase()!==safe.toLowerCase()) throw new Error('SPONSORSHIP_SENDER_MISMATCH')
    const {args:[to,value,data,op]}=decodeFunctionData({abi:execute,data:operation.callData as Hex})
    if (to.toLowerCase()!==expected.to.toLowerCase() || value!==0n || data.toLowerCase()!==expected.data.toLowerCase() || op!==1
      || !/^0x(?:[a-fA-F0-9]{2})*$/.test(operation.initCode) || BigInt(operation.nonce)<0n) throw new Error('RECOVERY_BATCH_INTENT_MISMATCH')
  }
}

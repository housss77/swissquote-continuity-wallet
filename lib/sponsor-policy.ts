import {decodeFunctionData,getAddress,isAddress,parseAbi,zeroAddress,type Hex} from 'viem'
import {ENTRY_POINT,NFT_ADDRESS} from './constants'
import {ORIGINAL_SAFE,USDC_ADDRESS,sameAddress,tokenAbi,assertConfigurationWritable} from './product'
const executeAbi=parseAbi(['function executeUserOp(address to,uint256 value,bytes data,uint8 operation)'])
const nftAbi=parseAbi(['function safeMint(address to,uint256 tokenId)'])
const quantities=['nonce','callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas'] as const
export function validateSponsorOperation(value:unknown,entryPoint:unknown,sessionSafe?:string,allowRecovery=false) {
  if(typeof entryPoint!=='string' || !sameAddress(entryPoint,ENTRY_POINT))throw new Error('SPONSOR_ENTRYPOINT_REJECTED')
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('SPONSOR_OPERATION_INVALID')
  const op=value as Record<string,unknown>
  if(typeof op.sender!=='string' || !isAddress(op.sender) || sameAddress(op.sender,zeroAddress) || sameAddress(op.sender,ORIGINAL_SAFE))throw new Error('SPONSOR_SENDER_REJECTED')
  if(sessionSafe && !sameAddress(op.sender,sessionSafe))throw new Error('SPONSOR_SESSION_WALLET_MISMATCH')
  for(const name of quantities)if(typeof op[name]!=='string' || !/^0x[a-fA-F0-9]+$/.test(op[name] as string) || BigInt(op[name] as string)>=2n**256n)throw new Error('SPONSOR_OPERATION_INVALID')
  for(const name of ['initCode','callData','paymasterAndData','signature'])if(typeof op[name]!=='string' || !/^0x(?:[a-fA-F0-9]{2})*$/.test(op[name] as string))throw new Error('SPONSOR_OPERATION_INVALID')
  const {args:[target,valueWei,data,operation]}=decodeFunctionData({abi:executeAbi,data:op.callData as Hex})
  if(valueWei!==0n)throw new Error('SPONSOR_NATIVE_TRANSFER_DISABLED')
  if(operation===1 && allowRecovery){assertConfigurationWritable(op.sender);return {sender:getAddress(op.sender),kind:'recovery' as const}}
  if(operation!==0)throw new Error('SPONSOR_CALL_REJECTED')
  if(sameAddress(target,USDC_ADDRESS)){
    const call=decodeFunctionData({abi:tokenAbi,data})
    if(call.functionName!=='transfer')throw new Error('SPONSOR_APPROVAL_DISABLED')
    const [recipient,amount]=call.args
    const ceiling=BigInt(process.env.SPONSORSHIP_MAX_USDC_UNITS || '100000000')
    if(sameAddress(recipient,zeroAddress) || sameAddress(recipient,op.sender) || amount<=0n || amount>ceiling)throw new Error('SPONSOR_TRANSFER_POLICY_REJECTED')
    return {sender:getAddress(op.sender),kind:'usdc' as const}
  }
  if(sameAddress(target,NFT_ADDRESS)){
    const {args:[recipient]}=decodeFunctionData({abi:nftAbi,data})
    if(!sameAddress(recipient,op.sender))throw new Error('SPONSOR_NFT_RECIPIENT_REJECTED')
    return {sender:getAddress(op.sender),kind:'mint' as const}
  }
  throw new Error('SPONSOR_TARGET_REJECTED')
}

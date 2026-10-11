import { decodeFunctionData, formatUnits, maxUint256, parseAbi, type Address, type Hex } from 'viem'
import { CHAIN_ID, NFT_ADDRESS } from './constants'
import { sameAddress, tokenAbi, USDC_ADDRESS } from './product'

export const DEMO_REVIEW_POLICY={largeTransfer:100_000_000n,largeAllowance:1_000_000_000n}
export type SafetyReview={status:'No issue detected by available checks'|'Review recommended'|'Cannot complete check';action:string;warnings:string[];sanctions:'Not checked';advisory:true}
export function transactionReview(chainId:number,target:Address,data:Hex,policy=DEMO_REVIEW_POLICY):SafetyReview {
  const base={sanctions:'Not checked' as const,advisory:true as const}
  if(chainId!==CHAIN_ID)return {...base,status:'Cannot complete check',action:'Wrong network',warnings:['Only Ethereum Sepolia is supported. Signing is refused.']}
  const known=sameAddress(target,USDC_ADDRESS) || sameAddress(target,NFT_ADDRESS),warnings:string[]=[]
  if(!known)warnings.push('Destination is outside the reviewed demo contract list. This list is not legal approval.')
  try {
    const call=decodeFunctionData({abi:tokenAbi,data})
    if(!['transfer','approve'].includes(call.functionName))throw new Error('Unsupported call')
    const [address,units]=call.args as readonly [Address,bigint]
    const official=sameAddress(target,USDC_ADDRESS)
    const quantity=call.functionName==='approve' && units===maxUint256?(official?'unlimited test USDC':'unlimited token access (asset not verified)'):official?`${formatUnits(units,6)} test USDC`:`${units} base units (asset not verified)`
    if(call.functionName==='approve') {
      if(units===maxUint256)warnings.push('Unlimited allowance lets this spender move all current and future tokens until revoked.')
      else if(units>policy.largeAllowance)warnings.push('Large allowance. Consider approving only the amount needed.')
      warnings.push('Spender has not been reviewed. An allowance is permission to move tokens, not a transfer.')
    } else if(official && units>=policy.largeTransfer)warnings.push('Large transfer under the demo threshold. No additional onchain customer signer is enforced.')
    return {...base,status:warnings.length?'Review recommended':'No issue detected by available checks',action:`${call.functionName==='approve'?'Approve':'Send'} ${quantity} ${call.functionName==='approve'?'for':'to'} ${address}`,warnings}
  } catch {
    try {const call=decodeFunctionData({abi:parseAbi(['function safeMint(address to,uint256 tokenId)']),data});if(!sameAddress(target,NFT_ADDRESS))throw new Error('Unknown NFT');return {...base,status:'No issue detected by available checks',action:`Mint tutorial NFT to ${call.args[0]}`,warnings}}
    catch {return {...base,status:'Cannot complete check',action:'Unrecognized or malformed call',warnings:[...warnings,'Available checks cannot decode this interaction. Do not interpret this as safe.']}}
  }
}

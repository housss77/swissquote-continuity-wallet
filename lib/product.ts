import { createPublicClient, getAddress, http, isAddress, parseAbi, type Address } from 'viem'
import { CHAIN, RPC_URL, assertSepolia } from './constants'
import { recoveryState } from './recovery/onchain'
import { safeAbi } from './recovery/contracts'
import type { RecoveryState } from './recovery/types'

export const DEMO_SAFE = getAddress('0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06')
export const ORIGINAL_SAFE = getAddress('0x6f7c9faba9B6039255f2301935D891ffE6065e8C')
export const USDC_ADDRESS = getAddress('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
export const CUSTOMER_SAFE_KEY = 'continuity-customer-safe-v1'
export const CUSTOMER_PASSKEY_KEY = 'continuity-customer-created-passkey-v1'
export const tokenAbi = parseAbi(['function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)', 'function symbol() view returns(string)', 'function transfer(address,uint256) returns(bool)', 'function approve(address,uint256) returns(bool)', 'event Transfer(address indexed from,address indexed to,uint256 value)'])
export const productClient = createPublicClient({chain:CHAIN,transport:http(RPC_URL,{timeout:12000,retryCount:0})})
export const sameAddress = (a:string,b:string) => a.toLowerCase()===b.toLowerCase()
export const shortAddress = (a:string) => `${a.slice(0,6)}…${a.slice(-4)}`
export function assertConfigurationWritable(safe:string) {
  if (sameAddress(safe,DEMO_SAFE) || sameAddress(safe,ORIGINAL_SAFE)) throw new Error('VERIFIED_WALLET_CONFIGURATION_LOCKED')
}
export function assertCustomerSpendingAllowed(safe:string) {
  if (sameAddress(safe,ORIGINAL_SAFE)) throw new Error('ORIGINAL_WALLET_READ_ONLY')
}
export function selectedSafe():Address|null {
  const stored=localStorage.getItem(CUSTOMER_SAFE_KEY)
  if(stored) {const value=JSON.parse(stored);if(value.version!==1 || !isAddress(value.safe))throw new Error('STORED_DATA');return getAddress(value.safe)}
  const draft=JSON.parse(localStorage.getItem('continuity-recovery-public-draft-v1') || 'null')
  return draft && isAddress(draft.safe)?getAddress(draft.safe):null
}
export function selectSafe(safe:string) {
  if(!isAddress(safe))throw new Error('INVALID_RECIPIENT')
  localStorage.setItem(CUSTOMER_SAFE_KEY,JSON.stringify({version:1,safe:getAddress(safe)}))
}
export type WalletView={safe:Address;deployed:boolean;owners:Address[];threshold:bigint;eth:bigint;usdc:bigint|null;recovery:RecoveryState|null;warnings:string[];checkedAt:string}
export async function readWallet(safeValue:string):Promise<WalletView> {
  if(!isAddress(safeValue))throw new Error('INVALID_RECIPIENT')
  const safe=getAddress(safeValue)
  assertSepolia(await productClient.getChainId())
  const block=await productClient.getBlockNumber()
  const code=await productClient.getCode({address:safe,blockNumber:block})
  const deployed=!!code && code!=='0x'
  const [eth,owners,threshold]=await Promise.all([productClient.getBalance({address:safe,blockNumber:block}),
    deployed?productClient.readContract({address:safe,abi:safeAbi,functionName:'getOwners',blockNumber:block}):Promise.resolve([]),
    deployed?productClient.readContract({address:safe,abi:safeAbi,functionName:'getThreshold',blockNumber:block}):Promise.resolve(1n)])
  const warnings:string[]=[]
  let usdc:bigint|null=null,recovery:RecoveryState|null=null
  const results=await Promise.allSettled([
    (async()=>{const [tokenCode,decimals,symbol,balance]=await Promise.all([productClient.getCode({address:USDC_ADDRESS,blockNumber:block}),productClient.readContract({address:USDC_ADDRESS,abi:tokenAbi,functionName:'decimals',blockNumber:block}),productClient.readContract({address:USDC_ADDRESS,abi:tokenAbi,functionName:'symbol',blockNumber:block}),productClient.readContract({address:USDC_ADDRESS,abi:tokenAbi,functionName:'balanceOf',args:[safe],blockNumber:block})]);if(!tokenCode || tokenCode==='0x' || decimals!==6 || symbol!=='USDC')throw new Error('USDC_CONTRACT_MISMATCH');return balance})(),
    deployed?recoveryState(productClient,safe):Promise.resolve(null),
  ])
  if(results[0].status==='fulfilled')usdc=results[0].value;else warnings.push('USDC balance unavailable. Refresh before sending.')
  if(results[1].status==='fulfilled')recovery=results[1].value;else warnings.push('Recovery configuration could not be checked. Availability is unknown.')
  return {safe,deployed,owners:owners as Address[],threshold:threshold as bigint,eth,usdc,recovery,warnings,checkedAt:new Date().toISOString()}
}

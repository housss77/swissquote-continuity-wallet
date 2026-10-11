import {isRpcFixture} from './rpc-fixture'
import type {Page} from '@playwright/test'
import {decodeFunctionData,encodeFunctionResult,domainSeparator,type Address} from 'viem'
import {DEMO_SAFE,CUSTOMER_SAFE_KEY,tokenAbi,USDC_ADDRESS} from '../../lib/product'
import {expectedModuleCode,recoveryAbi,safeAbi} from '../../lib/recovery/contracts'
// Isolated synthetic RPC fixtures. Never public-chain acceptance evidence.
export async function walletFixture(page:Page,{balance=0n,protectedWallet=true,unavailable=false,receipt,deployed=true,safe=DEMO_SAFE}:{balance?:bigint;protectedWallet?:boolean;unavailable?:boolean;receipt?:unknown;deployed?:boolean;safe?:Address}={}) {
 await page.addInitScript(({safe,key})=>localStorage.setItem(key,JSON.stringify({version:1,safe})),{safe,key:CUSTOMER_SAFE_KEY})
 let sends=0
 const abi=[...tokenAbi,...safeAbi,...recoveryAbi]
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(!isRpcFixture(route.request()))return route.continue()
  if(unavailable)return route.abort('failed')
  const body=req.postDataJSON();let result:unknown
  if(body.method==='eth_sendUserOperation' || body.method==='eth_sendRawTransaction'){sends++;return route.abort('failed')}
  if(body.method==='eth_chainId')result='0xaa36a7'
  else if(body.method==='eth_blockNumber')result='0x100'
  else if(body.method==='eth_getBalance')result='0x0'
  else if(body.method==='eth_getCode')result=!deployed && body.params[0].toLowerCase()===safe.toLowerCase()?'0x':expectedModuleCode(180)
  else if(body.method==='eth_getTransactionReceipt' && receipt)result=receipt
  else if(body.method==='eth_getLogs' && receipt)return route.abort('failed') // Fixture deliberately lacks archive/log reconciliation support.
  else if(body.method==='eth_getBlockByNumber')result={number:'0x100',timestamp:'0x100',hash:`0x${'11'.repeat(32)}`,transactions:[]}
  else if(body.method==='eth_call'){
   const call=decodeFunctionData({abi,data:body.params[0].data}),name=call.functionName
   const isSafe=body.params[0].to.toLowerCase()===safe.toLowerCase()
   const values:Record<string,unknown>={decimals:6,symbol:'USDC',balanceOf:balance,VERSION:isSafe?'1.4.1':'0.2.0',getOwners:['0x1195F0aCdBf59F45c2C0E6FF4Bc40BF58821fBE1'],getThreshold:1n,isModuleEnabled:protectedWallet,getGuardians:protectedWallet?['0xEb46B6f8BEeAE07A42fbB1a772c1Bc892ebB8fA3','0xbED556C6B6F68815B506EC7cF962C8C483602aC1','0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86']:[],threshold:protectedWallet?2n:0n,nonce:4n,getRecoveryRequest:[0n,0n,0n,0n,[]],domainSeparator:domainSeparator({domain:{name:'Social Recovery Module',version:'0.2.0',chainId:11155111,verifyingContract:body.params[0].to as Address}})}
   if(!(name in values))throw new Error(`Unhandled synthetic read ${name}`)
   result=encodeFunctionResult({abi,functionName:name,result:values[name] as never})
  }else throw new Error(`Unhandled synthetic RPC ${body.method}`)
  await route.fulfill({contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:body.id,result})})
 })
 return {sends:()=>sends}
}

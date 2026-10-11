import 'server-only'
import {checkAppOrigin,deploymentOrigin} from './app-origin'
import {sessionAccount} from './auth-server'
import {providerConfig,RPC_URL,ENTRY_POINT,assertSepolia} from './constants'
import {rpcRequest} from './operations'
import {RpcFailure,scrubMessage} from './diagnostics'
import {validateSponsorOperation} from './sponsor-policy'
import {allowedSafe} from './recovery/server'
import {assertOperationBudget} from './gas'
import {createPublicClient,http} from 'viem'
import {sepolia} from 'viem/chains'

const publicReads=new Set(['eth_chainId','eth_blockNumber','eth_getBalance','eth_getCode','eth_call','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getLogs','eth_getStorageAt','eth_getTransactionCount','eth_feeHistory','eth_gasPrice','eth_maxPriorityFeePerGas','eth_estimateGas'])
const bundlerReads=new Set(['eth_chainId','eth_supportedEntryPoints','eth_getUserOperationReceipt','eth_getUserOperationByHash','pimlico_getUserOperationStatus','pimlico_getUserOperationGasPrice'])
const preparation=new Set(['eth_estimateUserOperationGas','pm_sponsorUserOperation'])
const counters=new Map<string,{count:number;until:number}>()
let networkVerifiedUntil=0
export async function rpcGateway(request:Request,kind:'rpc'|'sponsor'):Promise<Response> {
  let id:unknown=null
  try {
    checkAppOrigin(request,false)
    const raw=await request.text();if(raw.length>100000)throw new Error('RPC_REQUEST_TOO_LARGE')
    const body=JSON.parse(raw)
    // Protocol Kit's ethers provider batches public contract reads. Each member
    // still passes the same allowlist and quota; writes are never batched.
    if(Array.isArray(body) && kind==='rpc'){
      if(body.length===0 || body.length>20 || body.some(v=>!v || typeof v!=='object' || Array.isArray(v)))throw new Error('RPC_BATCH_INVALID')
      const responses=await Promise.all(body.map(v=>rpcGateway(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(v)}),'rpc').then(r=>r.json())))
      return Response.json(responses,{headers:{'Cache-Control':'no-store'}})
    }
    if(!body || Array.isArray(body) || body.jsonrpc!=='2.0' || typeof body.method!=='string' || (body.params!==undefined && !Array.isArray(body.params)) || (typeof body.id!=='number' && typeof body.id!=='string'))throw new Error('RPC_REQUEST_INVALID')
    body.params ??= [] // viem omits params for no-argument JSON-RPC methods.
    id=body.id
    const account=kind==='sponsor'?await sessionAccount(request):null
    const bucket=account?.id || 'public',now=Date.now(),old=counters.get(bucket),slot=old && old.until>now?old:{count:0,until:now+60000}
    counters.set(bucket,slot);if(++slot.count>(account?180:600))throw new Error('RPC_RATE_LIMIT')
    if(kind==='rpc' && !publicReads.has(body.method))throw new Error('RPC_METHOD_DISABLED')
    if(kind==='sponsor' && !bundlerReads.has(body.method) && !preparation.has(body.method) && body.method!=='eth_sendUserOperation')throw new Error('RPC_METHOD_DISABLED')
    const sensitive=kind==='sponsor' && !bundlerReads.has(body.method)
    if(sensitive){
      checkAppOrigin(request)
      const localLegacy=new URL(deploymentOrigin()).hostname==='localhost' && new URL(request.url).hostname==='localhost'
      if(!account && !localLegacy)throw new Error('AUTH_REQUIRED')
      if(account && !account.safe)throw new Error('AUTH_WALLET_SETUP_REQUIRED')
      let recovery=false
      try{allowedSafe(body.params[0]?.sender);recovery=true}catch{/* Not an allowlisted configuration ceremony. */}
      validateSponsorOperation(body.params[0],body.params[1],account?.safe || undefined,recovery)
      if(body.method==='eth_sendUserOperation' && (!body.params[0].signature || body.params[0].signature==='0x'))throw new Error('SPONSOR_SIGNATURE_REQUIRED')
      if(body.method==='eth_sendUserOperation'){
        const op=body.params[0],numeric=Object.fromEntries(['callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas'].map(name=>[name,BigInt(op[name])]))
        assertOperationBudget({...op,...numeric})
      }
    }
    const config=kind==='sponsor'?providerConfig(body.method==='pm_sponsorUserOperation'):null
    if(kind==='sponsor' && body.method==='pimlico_getUserOperationGasPrice' && process.env.SPONSORSHIP_PROVIDER==='swissquote'){
      const client=createPublicClient({chain:sepolia,transport:http(RPC_URL,{retryCount:0,timeout:12000})})
      assertSepolia(await client.getChainId())
      const fees=await client.estimateFeesPerGas()
      const speed={maxFeePerGas:`0x${fees.maxFeePerGas.toString(16)}`,maxPriorityFeePerGas:`0x${fees.maxPriorityFeePerGas.toString(16)}`}
      return Response.json({jsonrpc:'2.0',id,result:{slow:speed,standard:speed,fast:speed}},{headers:{'Cache-Control':'no-store'}})
    }
    if(sensitive && Date.now()>networkVerifiedUntil){
      const chain=await rpcRequest<string>(config!.bundlerUrl,'eth_chainId',[]);assertSepolia(BigInt(chain.result))
      const entries=await rpcRequest<string[]>(config!.bundlerUrl,'eth_supportedEntryPoints',[])
      if(!entries.result.some(e=>e.toLowerCase()===ENTRY_POINT.toLowerCase()))throw new Error('BUNDLER_ENTRYPOINT_UNSUPPORTED')
      networkVerifiedUntil=Date.now()+60000
    }
    // The frontend never selects a policy or sends provider credentials.
    const params=body.method==='pm_sponsorUserOperation'?[body.params[0],ENTRY_POINT,...(config?.sponsorshipPolicyId?[{sponsorshipPolicyId:config.sponsorshipPolicyId}]:[])]:body.params
    const upstream=kind==='rpc'?RPC_URL:body.method==='pm_sponsorUserOperation'?config!.paymasterUrl:config!.bundlerUrl
    const result=await rpcRequest(upstream,body.method,params)
    return Response.json({jsonrpc:'2.0',id,result:result.result},{headers:{'Cache-Control':'no-store'}})
  }catch(e){
    const known=e instanceof Error && /^(?:RPC|AUTH|SPONSOR|APP|BUNDLER|MISSING)_[A-Z_]+$/.test(e.message)?e.message:'PROVIDER_REQUEST_FAILED'
    const message=e instanceof RpcFailure?scrubMessage(e.message):known
    const code=e instanceof RpcFailure?e.rpcCode ?? -32000:known==='AUTH_REQUIRED'?-32001:-32602
    const status=known==='RPC_RATE_LIMIT'?429:known==='AUTH_REQUIRED'?401:e instanceof RpcFailure && e.httpStatus && e.httpStatus>=400?e.httpStatus:200
    return Response.json({jsonrpc:'2.0',id,error:{code,message}},{status,headers:{'Cache-Control':'no-store'}})
  }
}

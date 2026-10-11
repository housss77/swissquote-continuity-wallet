import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rpcGateway} from '../../lib/rpc-gateway'
import {RpcFailure,scrubMessage} from '../../lib/diagnostics'
import {providerConfig,ENTRY_POINT} from '../../lib/constants'
import {writeRecord,token,tokenHash} from '../../lib/auth-store'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {encodeFunctionData,parseAbi} from 'viem'
import {USDC_ADDRESS,tokenAbi} from '../../lib/product'
const request=(method:string,params:unknown[]=[],origin='http://localhost:3000')=>new Request('http://localhost:3000/api/sponsor',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify({jsonrpc:'2.0',id:8,method,params})})
test('gateway refuses cross-origin writes and raw-transaction/private-signing RPC methods before upstream access',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('TEST_MUST_NOT_FORWARD')}
 try{
  for(const method of ['eth_sendRawTransaction','eth_sign','personal_sign','wallet_addEthereumChain']){const response=await rpcGateway(request(method),'sponsor');assert.equal((await response.json()).error.message,'RPC_METHOD_DISABLED')}
  const cross=await rpcGateway(request('eth_sendUserOperation',[],'https://attacker.example'),'sponsor');assert.ok((await cross.json()).error);assert.equal(calls,0)
 }finally{globalThis.fetch=previous}
})
test('RPC proxy preserves JSON-RPC identity and never retries a provider failure',async()=>{
 const previous=globalThis.fetch;let calls=0
 globalThis.fetch=async()=>{calls++;return Response.json({jsonrpc:'2.0',id:1,error:{code:-32602,message:'provider rejected request'}})}
 try{const response=await rpcGateway(request('eth_chainId'),'rpc'),body=await response.json();assert.equal(body.id,8);assert.equal(body.error.code,-32602);assert.equal(calls,1)}finally{globalThis.fetch=previous}
})

test('no-argument viem requests may omit params without blocking real chain reads',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options?.body as string);assert.deepEqual(body.params,[]);return Response.json({jsonrpc:'2.0',id:body.id,result:'0xaa36a7'})}
 try{const req=new Request('http://localhost:3000/api/rpc',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:12,method:'eth_chainId'})});const response=await rpcGateway(req,'rpc');assert.deepEqual(await response.json(),{jsonrpc:'2.0',id:12,result:'0xaa36a7'})}finally{globalThis.fetch=previous}
})

test('Protocol Kit public read batches retain IDs while batched sponsorship/submission is refused',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(options?.body as string);return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0xaa36a7':'0x1234'})}
 const members=[{jsonrpc:'2.0',id:20,method:'eth_chainId'},{jsonrpc:'2.0',id:21,method:'eth_getCode',params:['0x1111111111111111111111111111111111111111','latest']}]
 const req=()=>new Request('http://localhost:3000/api/rpc',{method:'POST',body:JSON.stringify(members)})
 try{assert.deepEqual(await (await rpcGateway(req(),'rpc')).json(),[{jsonrpc:'2.0',id:20,result:'0xaa36a7'},{jsonrpc:'2.0',id:21,result:'0x1234'}]);assert.equal(calls,2);assert.ok((await (await rpcGateway(req(),'sponsor')).json()).error);assert.equal(calls,2)}finally{globalThis.fetch=previous}
})
test('Swissquote adapter endpoints and private policy are configuration, never client parameters',()=>{
 const previous={mode:process.env.SPONSORSHIP_PROVIDER,bundler:process.env.SPONSORSHIP_BUNDLER_RPC_URL,paymaster:process.env.SPONSORSHIP_PAYMASTER_RPC_URL,policy:process.env.SPONSORSHIP_POLICY_ID}
 try{
  process.env.SPONSORSHIP_PROVIDER='swissquote';process.env.SPONSORSHIP_BUNDLER_RPC_URL='https://bundler.example/rpc';process.env.SPONSORSHIP_PAYMASTER_RPC_URL='https://paymaster.example/rpc';process.env.SPONSORSHIP_POLICY_ID='synthetic-policy'
  const config=providerConfig(true);assert.equal(config.bundlerUrl,'https://bundler.example/rpc');assert.equal(config.paymasterUrl,'https://paymaster.example/rpc');assert.equal(config.sponsorshipPolicyId,'synthetic-policy')
  process.env.SPONSORSHIP_PROVIDER='unknown';assert.throws(()=>providerConfig(),/UNSUPPORTED/)
 }finally{for(const [name,value] of Object.entries({SPONSORSHIP_PROVIDER:previous.mode,SPONSORSHIP_BUNDLER_RPC_URL:previous.bundler,SPONSORSHIP_PAYMASTER_RPC_URL:previous.paymaster,SPONSORSHIP_POLICY_ID:previous.policy})){if(value===undefined)delete process.env[name];else process.env[name]=value}}
})
test('server-only provider credentials are scrubbed from errors',()=>{
 const previous=process.env.PIMLICO_API_KEY;process.env.PIMLICO_API_KEY='synthetic-server-credential'
 try{assert.ok(!scrubMessage(`failed synthetic-server-credential https://example/rpc?apikey=secret`).includes('synthetic-server-credential'));assert.equal(new RpcFailure('signature=0xdeadbeef').message,'(request data redacted)')}finally{if(previous===undefined)delete process.env.PIMLICO_API_KEY;else process.env.PIMLICO_API_KEY=previous}
})

test('public deployment refuses anonymous sponsorship even behind a localhost reverse proxy',async()=>{
 const origin=process.env.APP_ORIGIN,fetch=globalThis.fetch;process.env.APP_ORIGIN='https://wallet.example';let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('MUST_NOT_FORWARD')}
 try{const req=new Request('http://localhost:3000/api/sponsor',{method:'POST',headers:{host:'wallet.example',origin:'https://wallet.example'},body:JSON.stringify({jsonrpc:'2.0',id:9,method:'pm_sponsorUserOperation',params:[]})});const response=await rpcGateway(req,'sponsor');assert.equal(response.status,401);assert.equal((await response.json()).error.message,'AUTH_REQUIRED');assert.equal(calls,0)}finally{globalThis.fetch=fetch;if(origin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=origin}
})

test('verified session sponsorship uses only the server policy and submission is forwarded once',async()=>{
 const names=['APP_ORIGIN','CONTINUITY_DATA_DIR','SPONSORSHIP_PROVIDER','PIMLICO_API_KEY','PIMLICO_SPONSORSHIP_POLICY_ID'],previous=Object.fromEntries(names.map(n=>[n,process.env[n]])),fetch=globalThis.fetch,directory=await mkdtemp(path.join(os.tmpdir(),'continuity-gateway-test-'))
 Object.assign(process.env,{APP_ORIGIN:'https://wallet.example',CONTINUITY_DATA_DIR:directory,SPONSORSHIP_PROVIDER:'pimlico',PIMLICO_API_KEY:'synthetic-key',PIMLICO_SPONSORSHIP_POLICY_ID:'server-policy'})
 const sender='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',raw=token(),account=tokenHash('synthetic-credential')
 await writeRecord('credential',account,{id:'synthetic-credential',safe:sender});await writeRecord('session',tokenHash(raw),{credential:account,expires:Date.now()+60000})
 const data=encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[recipient,1000000n]})
 const op={sender,nonce:'0x0',initCode:'0x',callData:encodeFunctionData({abi:parseAbi(['function executeUserOp(address to,uint256 value,bytes data,uint8 operation)']),functionName:'executeUserOp',args:[USDC_ADDRESS,0n,data,0]}),callGasLimit:'0x100',verificationGasLimit:'0x100',preVerificationGas:'0x100',maxFeePerGas:'0x100',maxPriorityFeePerGas:'0x1',paymasterAndData:'0x',signature:'0x11'}
 const seen:{method:string;params:unknown[]}[]=[];globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options?.body as string);seen.push(body);return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0xaa36a7':body.method==='eth_supportedEntryPoints'?[ENTRY_POINT]:body.method==='eth_sendUserOperation'?`0x${'11'.repeat(32)}`:{paymasterAndData:'synthetic-quote'}})}
 const req=(method:string,safe=sender)=>new Request('https://wallet.example/api/sponsor',{method:'POST',headers:{origin:'https://wallet.example',cookie:`continuity-session=${raw}`},body:JSON.stringify({jsonrpc:'2.0',id:10,method,params:[{...op,sender:safe},ENTRY_POINT,{sponsorshipPolicyId:'attacker-policy'}]})})
 try{
  const quote=await rpcGateway(req('pm_sponsorUserOperation'),'sponsor');assert.ok((await quote.json()).result);assert.deepEqual(seen.find(v=>v.method==='pm_sponsorUserOperation')?.params[2],{sponsorshipPolicyId:'server-policy'})
  const mismatch=await rpcGateway(req('pm_sponsorUserOperation',recipient),'sponsor');assert.equal((await mismatch.json()).error.message,'SPONSOR_SESSION_WALLET_MISMATCH')
  const acknowledgement=await rpcGateway(req('eth_sendUserOperation'),'sponsor');assert.equal((await acknowledgement.json()).result,`0x${'11'.repeat(32)}`);assert.equal(seen.filter(v=>v.method==='eth_sendUserOperation').length,1)
 }finally{globalThis.fetch=fetch;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name]};await rm(directory,{recursive:true,force:true})}
})

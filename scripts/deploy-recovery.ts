import fs from 'node:fs/promises'
import { createPublicClient, createWalletClient, encodeDeployData, http, keccak256, type Hash, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import artifact from '../lib/recovery/artifact.json'

async function main() {
  process.loadEnvFile('.env.local')
  const { expectedModuleCodeHash,recoveryAbi }=await import('../lib/recovery/contracts')
  const flag=process.argv[2]
  if (!['--test-only','--production-policy'].includes(flag))throw new Error('Use --test-only (180 seconds) or --production-policy (3 days). Never attach the short variant to the accepted Safe.')
  const delay=flag==='--test-only'?180:259200
  const key=process.env.RECOVERY_RELAYER_PRIVATE_KEY
  if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key))throw new Error('RECOVERY_RELAYER_PRIVATE_KEY_MISSING')
  const account=privateKeyToAccount(key as Hex)
  const rpc=process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
  const client=createPublicClient({chain:sepolia,transport:http(rpc,{timeout:15000,retryCount:0})})
  const wallet=createWalletClient({chain:sepolia,account,transport:http(rpc,{timeout:30000,retryCount:0})})
  if(await client.getChainId()!==11155111)throw new Error('RECOVERY_WRONG_CHAIN')
  const filename=`.recovery-data/deployment-${delay}.json`
  let hash:Hash
  try {const existing=JSON.parse(await fs.readFile(filename,'utf8')) as {hash?:Hash;transactionHash?:Hash};hash=(existing.hash || existing.transactionHash) as Hash;
    if(!/^0x[a-fA-F0-9]{64}$/.test(hash || ''))throw new Error('RECOVERY_DEPLOYMENT_RECORD_INVALID')}
  catch(e) {
    if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('RECOVERY_DEPLOYMENT_RECORD_INVALID')
    if(process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS)throw new Error('RECOVERY_MODULE_ALREADY_CONFIGURED_REVIEW_BEFORE_NEW_DEPLOYMENT')
    if(await client.getBalance({address:account.address})===0n)throw new Error('RECOVERY_RELAYER_NEEDS_SEPOLIA_ETH')
    const data=encodeDeployData({abi:recoveryAbi,bytecode:artifact.bytecode as Hex,args:[BigInt(delay)]})
    const prepared=await wallet.prepareTransactionRequest({account,data,type:'eip1559',value:0n})
    const raw=await account.signTransaction(prepared)
    hash=keccak256(raw)
    await fs.mkdir('.recovery-data',{recursive:true})
    await fs.writeFile(filename,JSON.stringify({hash,delay,status:'broadcasting'}),{flag:'wx'})
    try {if(await wallet.sendRawTransaction({serializedTransaction:raw})!==hash)throw new Error('HASH_MISMATCH')}
    catch {throw new Error('RECOVERY_DEPLOYMENT_UNRESOLVED_PUBLIC_HASH_PRESERVED_NO_RESUBMISSION')}
  }
  const receipt=await client.waitForTransactionReceipt({hash,confirmations:2,timeout:120000})
  if(receipt.status!=='success' || !receipt.contractAddress)throw new Error('RECOVERY_DEPLOYMENT_NOT_SUCCESSFUL')
  const module=receipt.contractAddress,code=await client.getCode({address:module})
  if(!code || keccak256(code)!==expectedModuleCodeHash(delay))throw new Error('RECOVERY_DEPLOYED_CODE_MISMATCH')
  if(await client.readContract({address:module,abi:recoveryAbi,functionName:'VERSION'})!=='0.2.0')throw new Error('RECOVERY_DEPLOYED_VERSION_MISMATCH')
  const evidence={chainId:11155111,module,delay,transactionHash:hash,codeHash:keccak256(code),sourceCommit:artifact.upstream.commit,verified:true}
  await fs.writeFile(filename,JSON.stringify(evidence,null,2))
  let env=await fs.readFile('.env.local','utf8')
  for(const [name,value] of Object.entries({NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS:module,NEXT_PUBLIC_RECOVERY_DELAY_SECONDS:String(delay)})) {
    const re=new RegExp(`^${name}=.*$`,'m')
    env=re.test(env)?env.replace(re,`${name}=${value}`):env.trimEnd()+`\n${name}=${value}\n`
  }
  await fs.writeFile('.env.local',env)
  console.log(JSON.stringify(evidence,null,2))
}
main().catch(e=>{const code=e instanceof Error && /^RECOVERY_[A-Z0-9_]+$/.test(e.message)?e.message:'RECOVERY_DEPLOYMENT_FAILED_OR_UNRESOLVED';console.error(`NOT VERIFIED: ${code}. Public deployment record is preserved; no automatic retry.`);process.exitCode=1})

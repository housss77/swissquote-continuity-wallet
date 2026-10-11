import {decodeEventLog,parseAbi,type Address,type Hash} from 'viem'
import evidence from './demo-evidence.json'
import {productClient,readWallet,DEMO_SAFE,ORIGINAL_SAFE,sameAddress} from './product'
import {ENTRY_POINT_ABI,verifyReceipt} from './proof'
import {ENTRY_POINT,providerConfig} from './constants'
import {safeAbi} from './recovery/contracts'
import {recoveryReceiptIntent} from './recovery/evidence'
export type ReadinessItem={name:string;status:'PASS'|'WARN'|'FAIL';detail:string}
export type DemoReadiness={status:'PASS'|'WARN'|'FAIL';checkedAt:string;checks:ReadinessItem[];usdcBalance:string|null;ethBalance:string|null}
export async function demoReadiness():Promise<DemoReadiness> {
 const checks:ReadinessItem[]=[],checkedAt=new Date().toISOString();let usdcBalance:string|null=null,ethBalance:string|null=null
 try {
  const [wallet,original,receipts]=await Promise.all([readWallet(DEMO_SAFE),readWallet(ORIGINAL_SAFE),Promise.all(evidence.transactions.map(t=>productClient.getTransactionReceipt({hash:t.hash as Hash})))])
  checks.push({name:'Sepolia contracts',status:'PASS',detail:'Chain 11155111; wallet contract reads available. Recovery runtime/domain checks are included below.'})
  const ownerOK=wallet.owners.length===1 && sameAddress(wallet.owners[0],evidence.newOwner) && wallet.threshold===1n
  checks.push({name:'Recovered spending owner',status:ownerOK?'PASS':'FAIL',detail:ownerOK?'Expected recovered owner; threshold one.':'Unexpected current ownership. Do not sign.'})
  const recoveryOK=wallet.recovery?.protected && wallet.recovery.delay===evidence.delaySeconds && sameAddress(wallet.recovery.module,evidence.module) && evidence.guardians.every(g=>wallet.recovery!.guardians.some(a=>sameAddress(g.address,a)))
  checks.push({name:'Recovery configuration',status:recoveryOK?'PASS':'FAIL',detail:recoveryOK?'Exactly three expected guardians, threshold two, test-only delay 180 seconds.':'Recovery configuration differs from acceptance. Do not modify it.'})
  checks.push({name:'Pending recovery',status:wallet.recovery?.request.executableAt===0n?'PASS':'FAIL',detail:wallet.recovery?.request.executableAt===0n?'No unresolved onchain recovery.':'Unexpected or unavailable recovery request.'})
  const aaEnabled=await productClient.readContract({address:DEMO_SAFE,abi:safeAbi,functionName:'isModuleEnabled',args:[evidence.aaModule as Address]})
  checks.push({name:'ERC-4337 module',status:aaEnabled?'PASS':'FAIL',detail:aaEnabled?'Existing spending module remains enabled.':'Spending module unavailable; do not sign.'})
  const originalOK=original.owners.length===1 && sameAddress(original.owners[0],evidence.oldOwner) && original.threshold===1n && original.recovery?.enabled===false && original.recovery.guardians.length===0 && original.recovery.threshold===0n && original.recovery.request.executableAt===0n
  const nonceAbi=parseAbi(['function nonce() view returns(uint256)','function getNonce(address,uint192) view returns(uint256)'])
  const [safeNonce,entryNonce]=await Promise.all([productClient.readContract({address:ORIGINAL_SAFE,abi:nonceAbi,functionName:'nonce'}),productClient.readContract({address:ENTRY_POINT,abi:nonceAbi,functionName:'getNonce',args:[ORIGINAL_SAFE,0n]})])
  checks.push({name:'Original acceptance Safe',status:originalOK && safeNonce===0n && entryNonce===1n?'PASS':'FAIL',detail:originalOK && safeNonce===0n && entryNonce===1n?'Expected owner, threshold, disabled recovery and original nonces retained.':'Original state differs from the documented baseline. Read-only investigation required.'})
  if(receipts.some((r,i)=>r.status!=='success' || r.transactionHash.toLowerCase()!==evidence.transactions[i].hash || r.blockNumber!==BigInt(evidence.transactions[i].block)))throw new Error('HISTORICAL_RECEIPT_MISMATCH')
  const finalIntent=recoveryReceiptIntent(receipts[2],evidence.module as Address,DEMO_SAFE,'RecoveryFinalized')
  recoveryReceiptIntent(receipts[1],evidence.module as Address,DEMO_SAFE,'RecoveryExecuted',finalIntent)
  if(!sameAddress(finalIntent.newOwner,evidence.newOwner))throw new Error('HISTORICAL_RECEIPT_MISMATCH')
  const blocks=await Promise.all([productClient.getBlock({blockNumber:receipts[1].blockNumber}),productClient.getBlock({blockNumber:receipts[2].blockNumber})])
  if(blocks[1].timestamp-blocks[0].timestamp!==BigInt(evidence.observedWaitSeconds))throw new Error('HISTORICAL_RECEIPT_MISMATCH')
  const hasEnrollment=receipts[0].logs.some(log=>{if(!sameAddress(log.address,ENTRY_POINT))return false;try{const {args}=decodeEventLog({abi:ENTRY_POINT_ABI,data:log.data,topics:log.topics});return args.success && sameAddress(args.sender,DEMO_SAFE) && sameAddress(args.paymaster,evidence.sponsor)}catch{return false}})
  if(!hasEnrollment)throw new Error('HISTORICAL_RECEIPT_MISMATCH')
  verifyReceipt(receipts[3],evidence.recoveredUserOperationHash as Hash,DEMO_SAFE,evidence.sponsor as Address)
  const owner=await productClient.readContract({address:evidence.nftContract as Address,abi:parseAbi(['function ownerOf(uint256) view returns(address)']),functionName:'ownerOf',args:[BigInt(evidence.recoveredTokenId)]})
  if(!sameAddress(owner,DEMO_SAFE))throw new Error('HISTORICAL_RECEIPT_MISMATCH')
  const latest=await productClient.getBlockNumber();if(receipts.some(r=>latest<r.blockNumber+1n))throw new Error('HISTORICAL_RECEIPT_MISMATCH')
  checks.push({name:'Historical recovery and recovered spend',status:'PASS',detail:'Four successful receipts, matching recovery events, 252-second wait, sponsored EntryPoint proof and NFT ownership rechecked. These are historical actions.'})
  usdcBalance=wallet.usdc?.toString()??null;ethBalance=wallet.eth.toString()
  checks.push({name:'Official test USDC funding',status:wallet.usdc===null?'FAIL':wallet.usdc>0n?'PASS':'WARN',detail:wallet.usdc===null?'Token metadata or balance unavailable.':wallet.usdc>0n?'Test USDC available. Human confirmation is still required.':'Zero USDC. Fund the disposable Safe with Circle faucet tokens.'})
 }catch(e){const mismatch=e instanceof Error && e.message==='HISTORICAL_RECEIPT_MISMATCH';checks.push({name:'Live RPC verification',status:mismatch?'FAIL':'WARN',detail:mismatch?'Historical receipt/event mismatch. Investigate before presenting it as refreshed.':'Unable to finish live reads. Stored verified evidence remains historical; live state is unavailable.'})}
 checks.push({name:'USDC live acceptance',status:'WARN',detail:'A real human passkey signature and confirmed matching USDC Transfer event are required. No USDC success is claimed by this readiness check.'})
 let configured=false;try{providerConfig(true);configured=true}catch{/* Report presence without leaking provider secrets. */}
 checks.push({name:'Sponsorship configuration',status:configured?'PASS':'WARN',detail:'Presence check only. Paymaster permission for a fresh USDC operation is checked during preparation, not inferred from configuration.'})
 return {status:checks.some(c=>c.status==='FAIL')?'FAIL':checks.some(c=>c.status==='WARN')?'WARN':'PASS',checkedAt,checks,usdcBalance,ethBalance}
}

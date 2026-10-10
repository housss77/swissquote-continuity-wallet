import { hashDomain, keccak256, type Address, type PublicClient } from 'viem'
import { assertSepolia } from '../constants'
import { address, expectedModuleCodeHash, moduleConfig, recoveryAbi, safeAbi } from './contracts'
import type { RecoveryState } from './types'

export async function verifyModule(client:PublicClient) {
  assertSepolia(await client.getChainId())
  const config=moduleConfig()
  const code=await client.getCode({address:config.module})
  if (!code || keccak256(code)!==expectedModuleCodeHash(config.delay)) throw new Error('RECOVERY_MODULE_CODE_MISMATCH')
  const version=await client.readContract({address:config.module,abi:recoveryAbi,functionName:'VERSION'})
  if (version!=='0.2.0') throw new Error('RECOVERY_MODULE_VERSION_MISMATCH')
  const domain=await client.readContract({address:config.module,abi:recoveryAbi,functionName:'domainSeparator'})
  if (domain!==hashDomain({domain:{name:'Social Recovery Module',version:'0.2.0',chainId:11155111,verifyingContract:config.module}})) throw new Error('RECOVERY_MODULE_DOMAIN_MISMATCH')
  return config
}
export async function recoveryState(client:PublicClient,safeValue:string):Promise<RecoveryState> {
  const safe=address(safeValue), config=await verifyModule(client)
  const block=await client.getBlock()
  const readSafe=(functionName:'VERSION'|'getOwners'|'getThreshold'|'isModuleEnabled',args?:readonly unknown[])=>client.readContract({address:safe,abi:safeAbi,functionName,args:args as never,blockNumber:block.number})
  const read=(functionName:string)=>client.readContract({address:config.module,abi:recoveryAbi,functionName,args:[safe],blockNumber:block.number})
  const [version,owners,spendingThreshold,enabled,guardians,threshold,nonce,request]=await Promise.all([
    readSafe('VERSION'),readSafe('getOwners'),readSafe('getThreshold'),readSafe('isModuleEnabled',[config.module]),
    read('getGuardians'),read('threshold'),read('nonce'),read('getRecoveryRequest'),
  ])
  if (version!=='1.4.1') throw new Error('RECOVERY_SAFE_VERSION_UNSUPPORTED')
  const result={safe,...config,owners:owners as Address[],spendingThreshold:spendingThreshold as bigint,enabled:enabled as boolean,
    guardians:guardians as Address[],threshold:threshold as bigint,nonce:nonce as bigint,timestamp:block.timestamp,
    request:request as RecoveryState['request']}
  return {...result,protected:isRecoveryProtected(result)}
}
export function isRecoveryProtected(s:Pick<RecoveryState,'enabled'|'owners'|'spendingThreshold'|'guardians'|'threshold'>) {
  return s.enabled && s.spendingThreshold===1n && s.owners.length===1 && s.threshold===2n && s.guardians.length===3
    && new Set(s.guardians.map(a=>a.toLowerCase())).size===3 && s.guardians.every(g=>!s.owners.some(o=>o.toLowerCase()===g.toLowerCase()))
}

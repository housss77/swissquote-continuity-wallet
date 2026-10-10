import { encodeFunctionData, getAddress, isAddress, keccak256, parseAbi, type Abi, type Address, type Hex, zeroAddress } from 'viem'
import artifact from './artifact.json'

export const EXISTING_SAFE = getAddress('0x6f7c9faba9B6039255f2301935D891ffE6065e8C')
export const recoveryAbi = artifact.abi as Abi
export const SIGNER_FACTORY = getAddress('0x1d31F259eE307358a26dFb23EB365939E8641195')
export const P256_VERIFIER = getAddress('0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765')
export const SHARED_SIGNER = getAddress('0x94a4F6affBd8975951142c3999aEAB7ecee555c2')
export const sharedSignerAbi = parseAbi(['function getConfiguration(address account) view returns ((uint256 x,uint256 y,uint176 verifiers) signer)'])
export const factoryAbi = parseAbi([
  'function getSigner(uint256 x,uint256 y,uint176 verifiers) view returns(address)',
  'function createSigner(uint256 x,uint256 y,uint176 verifiers) returns(address)',
  'function SINGLETON() view returns(address)',
  'function isValidSignatureForSigner(bytes32 message,bytes signature,uint256 x,uint256 y,uint176 verifiers) view returns(bytes4)',
])
export const safeAbi = parseAbi([
  'function VERSION() view returns(string)', 'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)', 'function isModuleEnabled(address) view returns(bool)',
  'function enableModule(address)', 'function getModulesPaginated(address start,uint256 pageSize) view returns(address[],address)',
])
export const erc1271Abi = parseAbi(['function isValidSignature(bytes32 hash,bytes signature) view returns(bytes4)'])
export const address = (value: string): Address => {
  if (!isAddress(value) || [zeroAddress,'0x0000000000000000000000000000000000000001'].includes(value.toLowerCase())) throw new Error('RECOVERY_INVALID_ADDRESS')
  return getAddress(value)
}
export function moduleConfig() {
  const module = process.env.NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS
  if (!module) throw new Error('RECOVERY_MODULE_UNAVAILABLE')
  const delay = Number(process.env.NEXT_PUBLIC_RECOVERY_DELAY_SECONDS || '259200')
  if (![180,259200,604800,1209600].includes(delay)) throw new Error('RECOVERY_UNSUPPORTED_DELAY')
  return { module:address(module),delay }
}
export function expectedModuleCode(delay: number): Hex {
  let code = artifact.deployedBytecode.slice(2)
  const references = Object.values(artifact.immutableReferences)
  if (references.length !== 1) throw new Error('RECOVERY_UNEXPECTED_ARTIFACT')
  for (const ref of references[0]) code = code.slice(0,ref.start*2)+BigInt(delay).toString(16).padStart(ref.length*2,'0')+code.slice((ref.start+ref.length)*2)
  return `0x${code}`
}
export const expectedModuleCodeHash = (delay:number) => keccak256(expectedModuleCode(delay))
export function assertDisposableSafe(safe: Address) {
  // The existing Safe stays blocked until a separately approved installation change.
  if (safe.toLowerCase() === EXISTING_SAFE.toLowerCase()) throw new Error('EXISTING_SAFE_REQUIRES_INSTALLATION_APPROVAL')
}
export const recoveryCall = (name: string,args: readonly unknown[] = []) => encodeFunctionData({abi:recoveryAbi,functionName:name,args})

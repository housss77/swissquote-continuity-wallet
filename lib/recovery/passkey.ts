import { extractPasskeyData, SafeProvider, type PasskeyArgType } from '@safe-global/protocol-kit'
import { hashMessage, isHex, type Address, type Hex, type PublicClient } from 'viem'
import { assertPasskeySupport } from '../passkeys'
import { RPC_URL, assertSepolia } from '../constants'
import { erc1271Abi, factoryAbi, P256_VERIFIER, SIGNER_FACTORY, SHARED_SIGNER, sharedSignerAbi, address } from './contracts'
import type { PublicCredential, RecoveryIntent, GuardianApproval } from './types'
import { intentHash, verifyApprovals } from './signatures'
import { validPasskeyRp } from '../app-origin'

export function validateCredential(v:PublicCredential):PublicCredential {
  if (!v || !['customer_backup','replacement'].includes(v.role) || !validPasskeyRp(v.rpId)
    || !/^(?:[a-fA-F0-9]{2}){16,1024}$/.test(v.passkey?.rawId || '')
    || !/^0x[a-fA-F0-9]{64}$/.test(v.passkey?.coordinates?.x || '') || !/^0x[a-fA-F0-9]{64}$/.test(v.passkey?.coordinates?.y || '')
    || v.passkey.customVerifierAddress) throw new Error('RECOVERY_INVALID_PUBLIC_CREDENTIAL')
  return { role:v.role,rpId:v.rpId,signer:address(v.signer),passkey:{rawId:v.passkey.rawId,coordinates:{x:v.passkey.coordinates.x,y:v.passkey.coordinates.y}} }
}
export async function credentialAddress(client:PublicClient,pk:PasskeyArgType) {
  assertSepolia(await client.getChainId())
  return client.readContract({address:SIGNER_FACTORY,abi:factoryAbi,functionName:'getSigner',args:[BigInt(pk.coordinates.x),BigInt(pk.coordinates.y),BigInt(P256_VERIFIER)]})
}
export async function verifyCredentialBinding(client:PublicClient,input:PublicCredential,requireDeployed=true) {
  const credential=validateCredential(input)
  if ((await credentialAddress(client,credential.passkey)).toLowerCase()!==credential.signer.toLowerCase()) throw new Error('RECOVERY_CREDENTIAL_BINDING_MISMATCH')
  if (requireDeployed) {
    const code=await client.getCode({address:credential.signer})
    if (!code || code==='0x') throw new Error('RECOVERY_SIGNER_NOT_DEPLOYED')
  }
  return credential
}
export async function verifyFreshCredential(client:PublicClient,safe:Address,owners:Address[],guardians:Address[],credential:PublicCredential) {
  const c=await verifyCredentialBinding(client,credential,false)
  if ([...owners,...guardians].some(a=>a.toLowerCase()===c.signer.toLowerCase())) throw new Error('RECOVERY_CREDENTIAL_NOT_DISTINCT')
  // A shared signer address is account-specific. A new proxy address alone does
  // not prove a new public key if its coordinates copy the old shared owner.
  if (owners.some(a=>a.toLowerCase()===SHARED_SIGNER.toLowerCase())) {
    const old=await client.readContract({address:SHARED_SIGNER,abi:sharedSignerAbi,functionName:'getConfiguration',args:[safe]})
    if (old.x===BigInt(c.passkey.coordinates.x) && old.y===BigInt(c.passkey.coordinates.y)) throw new Error('RECOVERY_OLD_PUBLIC_KEY_REUSED')
  }
  return c
}
export async function createRecoveryCredential(client:PublicClient,role:PublicCredential['role'],existing?:PasskeyArgType):Promise<PublicCredential> {
  assertPasskeySupport()
  if (!validPasskeyRp(location.hostname)) throw new Error('RECOVERY_RP_UNSUPPORTED')
  const credential=await navigator.credentials.create({publicKey:{
    rp:{name:'Swissquote Continuity Wallet',id:location.hostname},
    challenge:crypto.getRandomValues(new Uint8Array(32)),
    user:{id:crypto.getRandomValues(new Uint8Array(32)),name:`${role}-${crypto.randomUUID()}`,displayName:role==='customer_backup'?'Continuity recovery access':'Continuity replacement spending access'},
    pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{residentKey:'required',userVerification:'required'},attestation:'none',timeout:60_000,
  }})
  if (!credential) throw new Error('RECOVERY_ENROLLMENT_CANCELLED')
  const passkey=await extractPasskeyData(credential)
  if (existing && (existing.rawId===passkey.rawId || existing.coordinates.x===passkey.coordinates.x && existing.coordinates.y===passkey.coordinates.y)) throw new Error('RECOVERY_CREDENTIAL_NOT_DISTINCT')
  return {passkey,role,rpId:location.hostname,signer:await credentialAddress(client,passkey)}
}
export async function signDigest(credential:PublicCredential,digest:Hex,rpc=RPC_URL):Promise<Hex> {
  assertPasskeySupport()
  validateCredential(credential)
  if (location.hostname!==credential.rpId) throw new Error('RECOVERY_RP_MISMATCH')
  const provider=await SafeProvider.init(rpc,credential.passkey,'1.4.1')
  assertSepolia(await provider.getChainId())
  const signer=await provider.getExternalSigner()
  if (!signer || (await signer.getAddress()).toLowerCase()!==credential.signer.toLowerCase()) throw new Error('RECOVERY_SIGNER_MISMATCH')
  // Pinned SDK challenges the raw EIP-712 digest; no EIP-191 prefix or custom DER parser.
  return await signer.signMessage(digest) as Hex
}
export function metadataDigest(safe:string,module:string,credential:PublicCredential) {
  const c=validateCredential(credential)
  return hashMessage(JSON.stringify({purpose:'Continuity public recovery metadata v1',chainId:11155111,safe:address(safe),module:address(module),credential:c}))
}
export async function verifyMetadataProof(client:PublicClient,safe:string,module:string,credential:PublicCredential,signature:Hex) {
  await verifyCredentialBinding(client,credential)
  if (!isHex(signature,{strict:true}) || signature.length>18000 || signature.length%2!==0) throw new Error('RECOVERY_INVALID_METADATA_PROOF')
  const magic=await client.readContract({address:credential.signer,abi:erc1271Abi,functionName:'isValidSignature',args:[metadataDigest(safe,module,credential),signature]})
  if (magic!=='0x1626ba7e') throw new Error('RECOVERY_INVALID_METADATA_PROOF')
}
export async function backupApproval(client:PublicClient,intent:RecoveryIntent,credential:PublicCredential):Promise<GuardianApproval> {
  await verifyCredentialBinding(client,credential)
  const digest=intentHash(intent), approval={signer:credential.signer,signature:await signDigest(credential,digest),intentHash:digest}
  await verifyApprovals(client,intent,[approval],false)
  return approval
}

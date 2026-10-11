import type { PasskeyArgType } from '@safe-global/protocol-kit'
import type { Address } from 'viem'
import { CUSTOMER_PASSKEY_KEY, productClient, sameAddress } from './product'
import { loadPasskey } from './passkeys'
import { verifyCredentialBinding } from './recovery/passkey'
import { safeAbi } from './recovery/contracts'
import type { PublicCredential } from './recovery/types'

export function createdPasskey():PasskeyArgType|null {
  const raw=localStorage.getItem(CUSTOMER_PASSKEY_KEY)
  if(!raw)return null
  const p=JSON.parse(raw)
  if(typeof p.rawId!=='string' || !/^(?:[a-fA-F0-9]{2})+$/.test(p.rawId) || !/^0x[a-fA-F0-9]{64}$/.test(p.coordinates?.x) || !/^0x[a-fA-F0-9]{64}$/.test(p.coordinates?.y))throw new Error('STORED_DATA')
  return {rawId:p.rawId,coordinates:{x:p.coordinates.x,y:p.coordinates.y}}
}
export async function currentPasskey(safe:Address):Promise<PasskeyArgType> {
  const owners=await productClient.readContract({address:safe,abi:safeAbi,functionName:'getOwners'}) as Address[]
  const draft=JSON.parse(localStorage.getItem('continuity-recovery-public-draft-v1') || 'null')
  let replacement:PublicCredential|null=draft && sameAddress(draft.safe,safe)?draft.replacement?.credential??null:null
  if(!replacement || !owners.some(o=>sameAddress(o,replacement!.signer))) {
    try {const response=await fetch(`/api/recovery?safe=${encodeURIComponent(safe)}`,{cache:'no-store'});if(response.ok){const data=await response.json();replacement=data.replacement?.credential??null}}catch{/* No fallback to an unverified registry credential. */}
  }
  if(replacement && owners.some(o=>sameAddress(o,replacement!.signer))) {
    await verifyCredentialBinding(productClient,replacement)
    return replacement.passkey
  }
  const legacy=createdPasskey() || loadPasskey()
  if(!legacy)throw new Error('CUSTOMER_PASSKEY_UNAVAILABLE')
  // initializeWallet(passkey, safe) independently enforces the current owner and
  // threshold before a signature. Metadata alone never grants authorization.
  return legacy
}

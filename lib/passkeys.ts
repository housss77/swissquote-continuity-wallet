import { extractPasskeyData, type PasskeyArgType } from '@safe-global/protocol-kit'
import { STORAGE_KEY } from './constants'

export function assertPasskeySupport() {
  if (!window.isSecureContext) throw new Error('INSECURE_CONTEXT')
  if (!window.PublicKeyCredential || !navigator.credentials?.create || !navigator.credentials?.get) {
    throw new Error('UNSUPPORTED_BROWSER')
  }
}

// Safe SDK extracts the public P-256 coordinates; no custom cryptography.
export async function createPasskey(): Promise<PasskeyArgType> {
  assertPasskeySupport()
  const credential = await navigator.credentials.create({
    publicKey: {
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Swissquote Continuity Wallet — Sepolia spike' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(32)),
        name: `Sepolia Safe ${new Date().toISOString()}`,
        displayName: 'Continuity Wallet Sepolia owner',
      },
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
    },
  })
  if (!credential) throw new Error('PASSKEY_CREATION_FAILED')
  return extractPasskeyData(credential)
}

export function savePasskey(passkey: PasskeyArgType) {
  // rawId and x/y are public metadata. The authenticator retains the secret.
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rawId: passkey.rawId, coordinates: passkey.coordinates })) }
  catch { throw new Error('STORED_DATA') }
}

export function loadPasskey(): PasskeyArgType | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as PasskeyArgType
    if (typeof value.rawId !== 'string' || !/^(?:[a-fA-F0-9]{2})+$/.test(value.rawId)
      || !/^0x[a-fA-F0-9]{64}$/.test(value.coordinates?.x)
      || !/^0x[a-fA-F0-9]{64}$/.test(value.coordinates?.y)) throw new Error('STORED_DATA')
    return { rawId: value.rawId, coordinates: { x: value.coordinates.x, y: value.coordinates.y } }
  } catch { throw new Error('STORED_DATA') }
}

export async function authenticatePasskey(passkey: PasskeyArgType) {
  assertPasskeySupport()
  // rawId format is the Safe SDK's hex credential identifier.
  const bytes = new Uint8Array(passkey.rawId.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)))
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: bytes, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })
  if (!credential) throw new Error('PASSKEY_AUTHENTICATION_FAILED')
  // This local prompt is a UX check. Onchain authorization is the SDK's
  // transaction-bound WebAuthn signature, verified by Safe contracts.
}

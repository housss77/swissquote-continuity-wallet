import 'server-only'
import {generateRegistrationOptions,generateAuthenticationOptions,verifyRegistrationResponse,verifyAuthenticationResponse,type RegistrationResponseJSON,type AuthenticationResponseJSON} from '@simplewebauthn/server'
import {decodeCredentialPublicKey,isoCBOR} from '@simplewebauthn/server/helpers'
import type {PasskeyArgType} from '@safe-global/protocol-kit'
import type {Address} from 'viem'
import {deploymentOrigin} from './app-origin'
import {token,tokenHash,locked,readRecord,writeRecord,removeRecord} from './auth-store'
import type {PublicCredential} from './recovery/types'

export const SESSION_COOKIE='continuity-session',CHALLENGE_COOKIE='continuity-challenge'
export type Account={id:string;publicKey:string;counter:number;rpId:string;passkey:PasskeyArgType;safe:Address|null}
type Challenge={kind:'register'|'login';challenge:string;expires:number;origin:string;rpId:string}
type Session={credential:string;expires:number}
const validToken=(v:string|null)=>!!v && /^[A-Za-z0-9_-]{43}$/.test(v)
export function cookie(request:Request,name:string) {
  return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1) || null
}
export function cookieHeader(name:string,value:string,maxAge:number) {
  return `${name}=${value}; Path=${name===CHALLENGE_COOKIE?'/api/auth':'/'}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${deploymentOrigin().startsWith('https:')?'; Secure':''}`
}
export async function sessionAccount(request:Request):Promise<Account|null> {
  const raw=cookie(request,SESSION_COOKIE);if(!validToken(raw))return null
  const session=await readRecord<Session>('session',tokenHash(raw!))
  if(!session || session.expires<Date.now())return null
  return readRecord<Account>('credential',session.credential)
}
export function publicAccount(account:Account) {return {safe:account.safe,passkey:account.passkey,rpId:account.rpId}}
export async function authOptions(kind:Challenge['kind']) {
  const origin=deploymentOrigin(),rpId=new URL(origin).hostname
  const options=kind==='register'?await generateRegistrationOptions({rpName:'Continuity Wallet',rpID:rpId,userName:`Wallet ${new Date().toISOString()}`,userDisplayName:'My Continuity wallet',supportedAlgorithmIDs:[-7],attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},preferredAuthenticatorType:'localDevice'}):await generateAuthenticationOptions({rpID:rpId,userVerification:'required'})
  const id=token();await writeRecord('challenge',tokenHash(id),{kind,challenge:options.challenge,expires:Date.now()+300_000,origin,rpId} satisfies Challenge)
  return {options,id}
}
export async function completeAuth(request:Request,kind:Challenge['kind'],response:RegistrationResponseJSON|AuthenticationResponseJSON) {
  return locked(async()=>{
    const raw=cookie(request,CHALLENGE_COOKIE)
    if(!validToken(raw))throw new Error('AUTH_CHALLENGE_EXPIRED')
    const id=tokenHash(raw!),pending=await readRecord<Challenge>('challenge',id)
    await removeRecord('challenge',id) // consume before verification; no replay
    if(!pending || pending.kind!==kind || pending.expires<Date.now() || pending.origin!==deploymentOrigin())throw new Error('AUTH_CHALLENGE_EXPIRED')
    let account:Account
    if(kind==='register') {
      const verification=await verifyRegistrationResponse({response:response as RegistrationResponseJSON,expectedChallenge:pending.challenge,expectedOrigin:pending.origin,expectedRPID:pending.rpId,requireUserVerification:true,supportedAlgorithmIDs:[-7]})
      if(!verification.verified || !verification.registrationInfo?.userVerified)throw new Error('AUTH_VERIFICATION_FAILED')
      const credential=verification.registrationInfo.credential,key=decodeCredentialPublicKey(credential.publicKey) as unknown as ReadonlyMap<number,unknown>
      const x=key.get(-2),y=key.get(-3)
      if(key.get(1)!==2 || key.get(3)!==-7 || key.get(-1)!==1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length!==32 || y.length!==32)throw new Error('AUTH_UNSUPPORTED_KEY')
      if(await readRecord('credential',tokenHash(credential.id)))throw new Error('AUTH_CREDENTIAL_ALREADY_REGISTERED')
      account={id:credential.id,publicKey:Buffer.from(credential.publicKey).toString('base64url'),counter:credential.counter,rpId:pending.rpId,safe:null,passkey:{rawId:Buffer.from(credential.id,'base64url').toString('hex'),coordinates:{x:`0x${Buffer.from(x).toString('hex')}`,y:`0x${Buffer.from(y).toString('hex')}`}}}
    }else {
      if(typeof response.id!=='string' || response.id.length>3000)throw new Error('AUTH_VERIFICATION_FAILED')
      const stored=await readRecord<Account>('credential',tokenHash(response.id))
      if(!stored || stored.rpId!==pending.rpId)throw new Error('AUTH_ACCOUNT_NOT_FOUND')
      const verification=await verifyAuthenticationResponse({response:response as AuthenticationResponseJSON,expectedChallenge:pending.challenge,expectedOrigin:pending.origin,expectedRPID:pending.rpId,requireUserVerification:true,credential:{id:stored.id,publicKey:new Uint8Array(Buffer.from(stored.publicKey,'base64url')),counter:stored.counter}})
      if(!verification.verified || !verification.authenticationInfo.userVerified)throw new Error('AUTH_VERIFICATION_FAILED')
      account={...stored,counter:verification.authenticationInfo.newCounter}
    }
    await writeRecord('credential',tokenHash(account.id),account)
    const session=token();await writeRecord('session',tokenHash(session),{credential:tokenHash(account.id),expires:Date.now()+6*60*60*1000} satisfies Session)
    const previous=cookie(request,SESSION_COOKIE);if(validToken(previous))await removeRecord('session',tokenHash(previous!))
    return {account,session}
  })
}
export async function attachWallet(account:Account,safe:Address) {
  await locked(async()=>{const current=await readRecord<Account>('credential',tokenHash(account.id));if(!current || (current.safe && current.safe.toLowerCase()!==safe.toLowerCase()))throw new Error('AUTH_WALLET_BINDING_MISMATCH');await writeRecord('credential',tokenHash(account.id),{...current,safe})})
}
export async function logout(request:Request) {const raw=cookie(request,SESSION_COOKIE);if(validToken(raw))await removeRecord('session',tokenHash(raw!))}
// Only invoked after the existing signer factory verifies the canonical signed
// recovery metadata. CBOR is library serialization of the proven public key.
// Sign-in still needs a fresh origin-bound, user-verified WebAuthn assertion.
export async function registerProvenReplacement(safe:Address,credential:PublicCredential) {
  if(credential.role!=='replacement')return
  await locked(async()=>{
    const id=Buffer.from(credential.passkey.rawId,'hex').toString('base64url'),key=new Map<number,number|Uint8Array>([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(credential.passkey.coordinates.x.slice(2),'hex'))],[-3,new Uint8Array(Buffer.from(credential.passkey.coordinates.y.slice(2),'hex'))]])
    const publicKey=Buffer.from(isoCBOR.encode(key)).toString('base64url'),existing=await readRecord<Account>('credential',tokenHash(id))
    if(existing){if(existing.publicKey!==publicKey || existing.safe?.toLowerCase()!==safe.toLowerCase() || existing.rpId!==credential.rpId)throw new Error('AUTH_WALLET_BINDING_MISMATCH');return}
    await writeRecord('credential',tokenHash(id),{id,publicKey,counter:0,rpId:credential.rpId,passkey:credential.passkey,safe} satisfies Account)
  })
}

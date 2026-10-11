'use client'
import type {PasskeyArgType} from '@safe-global/protocol-kit'
import type {Address} from 'viem'
import {CUSTOMER_PASSKEY_KEY,selectSafe} from './product'
export type CustomerSession={safe:Address|null;passkey:PasskeyArgType;rpId:string}
async function call(action:string,response?:unknown) {
  const result=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,response}),redirect:'error'})
  const data=await result.json();if(!result.ok || data.error)throw new Error(data.error || 'AUTH_UNAVAILABLE');return data
}
export async function customerSession():Promise<CustomerSession|null> {
  const response=await fetch('/api/auth',{cache:'no-store'});if(!response.ok)return null;return (await response.json()).account || null
}
export async function signIn(create=false):Promise<CustomerSession> {
  const {assertPasskeySupport}=await import('./passkeys')
  assertPasskeySupport()
  const browser=await import('@simplewebauthn/browser')
  const kind=create?'register':'login',options=await call(`${kind}_options`)
  const response=create?await browser.startRegistration({optionsJSON:options.options}):await browser.startAuthentication({optionsJSON:options.options})
  const {account}=await call(`${kind}_verify`,response)
  // Preserve the public credential before any RPC-dependent initialization.
  if(create)localStorage.setItem(CUSTOMER_PASSKEY_KEY,JSON.stringify(account.passkey))
  let current=account as CustomerSession
  if(!current.safe)current=(await call('finish_wallet')).account
  if(!current.safe)throw new Error('AUTH_WALLET_SETUP_REQUIRED')
  selectSafe(current.safe);return current
}
export async function finishWallet():Promise<CustomerSession> {const {account}=await call('finish_wallet');if(account.safe)selectSafe(account.safe);return account}
export async function signOut(){await call('logout')}

'use client'
import { useEffect, useState } from 'react'
import { hashTypedData, type Hex } from 'viem'
import { publicClient } from '../lib/wallet'
import { address } from '../lib/recovery/contracts'
import { recoveryState } from '../lib/recovery/onchain'
import { enrollmentTyped, verifyEnrollmentProof, downloadPublicJson, type EnrollmentPreview } from '../lib/recovery/guardian-proof'
import { assertGuardianConnection, independentWallet, readGuardianConnection, type GuardianConnection } from '../lib/recovery/providers'
import { discoverGuardianWallets, type GuardianWallet } from '../lib/recovery/wallet-discovery'
import { parseIntent, validateIntent } from '../lib/recovery/signatures'
import type { RecoveryIntent } from '../lib/recovery/types'
import { diagnose } from '../lib/diagnostics'
import { recoveryErrorMessage } from '../lib/recovery/errors'
import {Shell} from './product/Shell'
export default function GuardianApproval() {
  const [request,setRequest]=useState<EnrollmentPreview|RecoveryIntent|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [wallets,setWallets]=useState<GuardianWallet[]>([]),[selected,setSelected]=useState<GuardianWallet|null>(null)
  const [connection,setConnection]=useState<GuardianConnection|null>(null),[connectionError,setConnectionError]=useState('')
  const cleanError=(e:unknown)=>recoveryErrorMessage(diagnose(e,'sign','no').message)
  useEffect(()=>discoverGuardianWallets(window,options=>{
    setWallets(options)
    // Require an explicit choice for announced wallets; keep the sole legacy
    // provider compatible with existing independent-wallet test contexts.
    setSelected(current=>current?options.find(v=>v.provider===current.provider) || null:options.length===1 && options[0].source==='legacy'?options[0]:null)
  }),[])
  useEffect(()=>{
    let current=true
    setConnection(null);setConnectionError('');setError('')
    if(selected)void readGuardianConnection(selected.provider).then(v=>{if(current)setConnection(v)}).catch(e=>{if(current)setConnectionError(cleanError(e))})
    return ()=>{current=false}
  },[selected])
  async function connect() {
    if(busy || !selected)return
    setBusy(true);setError('');setConnectionError('')
    try {
      const value=await readGuardianConnection(selected.provider,true)
      setConnection(value)
      assertGuardianConnection(value,request && 'kind' in request?request.third:undefined)
    }catch(e){setError(cleanError(e))}finally{setBusy(false)}
  }
  async function load(file:File) {
    setBusy(true);setRequest(null);setError('')
    try {
      if(file.size>12000)throw new Error('RECOVERY_REQUEST_TOO_LARGE')
      const v=JSON.parse(await file.text())
      if(v.kind==='guardian_enrollment') {
        const p=v as EnrollmentPreview,s=await recoveryState(publicClient,p.safe)
        if(p.chainId!==11155111 || p.threshold!==2 || p.module.toLowerCase()!==s.module.toLowerCase() || p.delay!==s.delay
          || new Set([p.backup,p.bank,p.third].map(a=>address(a).toLowerCase())).size!==3 || s.owners.some(o=>[p.backup,p.bank,p.third].some(a=>a.toLowerCase()===o.toLowerCase())))throw new Error('RECOVERY_ENROLLMENT_PREVIEW_INVALID')
        setRequest(p)
      } else {const p=parseIntent(v);await validateIntent(publicClient,p);setRequest(p)}
      setError('')
    } catch(e){setError(diagnose(e,'prepare','no').message);setRequest(null)} finally{setBusy(false)}
  }
  async function sign() {
    if(busy || !request)return
    setBusy(true);setError('')
    try {
      const wallet=selected?.provider
      if(!wallet)throw new Error('RECOVERY_INDEPENDENT_WALLET_UNAVAILABLE')
      const value=await readGuardianConnection(wallet,true)
      setConnection(value)
      const signer=assertGuardianConnection(value,'kind' in request?request.third:undefined)
      let approval
      if('kind' in request) {
        const p=request
        const typed=enrollmentTyped(p)
        const body=JSON.stringify({...typed,types:{...typed.types,EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}]}},(_,v)=>typeof v==='bigint'?v.toString():v)
        approval={signer,intentHash:hashTypedData(typed),signature:await wallet.request({method:'eth_signTypedData_v4',params:[signer,body]}) as Hex}
        await verifyEnrollmentProof(publicClient,p,approval)
      } else {approval=await independentWallet(publicClient,wallet,signer).approve(request)}
      downloadPublicJson(approval,'continuity-guardian-approval.json')
    } catch(e){setError(cleanError(e))} finally{setBusy(false)}
  }
  return <Shell><div className="guardian-flow"><h1>Independent guardian approval</h1><p className="lede">Use the guardian’s own wallet in a separate browser context. Review the wallet and replacement identity with the customer through a trusted channel before signing.</p>
    <section aria-label="Guardian wallet connection"><h2>Guardian wallet</h2>
      <label htmlFor="guardian-wallet-provider">Wallet provider</label><select id="guardian-wallet-provider" disabled={busy} value={selected?.id || ''} onChange={e=>setSelected(wallets.find(v=>v.id===e.target.value) || null)}>
        <option value="">Select your wallet</option>{wallets.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
      <button disabled={busy || !selected} onClick={()=>void connect()}>Connect guardian wallet (no signing)</button>
      {connection && <><p>First account returned by wallet: <code>{connection.accounts[0] || 'None authorized'}</code></p>
        <p>Wallet chain ID: {connection.chainId}{connection.chainId===11155111?' (Ethereum Sepolia)':' — select Ethereum Sepolia before signing'}</p></>}
      {connectionError && <p>{connectionError}</p>}
    </section>
    <label>Public enrollment or recovery request<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void load(file)}}/></label>
    {request && <section><h2>Approval preview</h2><p>Ethereum Sepolia · <code>{request.safe}</code></p><p>Recovery module <code>{request.module}</code></p>
      {'kind' in request?<><p>Enroll as guardian <code>{request.third}</code>; 2-of-3 recovery; delay {request.delay} seconds.</p><p>This enrollment proof cannot execute a recovery.</p></>:<><p>Replace spending owner with <code>{request.newOwner}</code>; threshold 1; nonce {request.nonce}.</p><p>Two guardians can authorize this owner rotation after the onchain delay.</p></>}
      <button disabled={busy} onClick={()=>void sign()}>Sign and download verified public approval</button></section>}
    {error && <p role="alert">{error}</p>}<p>No private key is imported, stored or returned by this application. Organizational independence is simulated if one developer controls both roles.</p>
  </div></Shell>
}

'use client'
import { useState } from 'react'
import { hashTypedData, type Hex } from 'viem'
import { publicClient } from '../lib/wallet'
import { address } from '../lib/recovery/contracts'
import { recoveryState } from '../lib/recovery/onchain'
import { enrollmentTyped, verifyEnrollmentProof, downloadPublicJson, type EnrollmentPreview } from '../lib/recovery/guardian-proof'
import { independentWallet } from '../lib/recovery/providers'
import { parseIntent, validateIntent } from '../lib/recovery/signatures'
import type { RecoveryIntent } from '../lib/recovery/types'
import { diagnose } from '../lib/diagnostics'
export default function GuardianApproval() {
  const [request,setRequest]=useState<EnrollmentPreview|RecoveryIntent|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function load(file:File) {
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
    } catch(e){setError(diagnose(e,'prepare','no').message);setRequest(null)}
  }
  async function sign() {
    if(busy || !request)return
    setBusy(true);setError('')
    try {
      const wallet=(window as Window & {ethereum?:Parameters<typeof independentWallet>[1]}).ethereum
      if(!wallet)throw new Error('RECOVERY_INDEPENDENT_WALLET_UNAVAILABLE')
      const accounts=await wallet.request({method:'eth_requestAccounts'}) as string[]
      const signer=address(accounts[0])
      let approval
      if('kind' in request) {
        const p=request
        if(await wallet.request({method:'eth_chainId'})!=='0xaa36a7' || signer.toLowerCase()!==p.third.toLowerCase())throw new Error('RECOVERY_WRONG_THIRD_PARTY_ACCOUNT')
        const typed=enrollmentTyped(p)
        const body=JSON.stringify({...typed,types:{...typed.types,EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}]}},(_,v)=>typeof v==='bigint'?v.toString():v)
        approval={signer,intentHash:hashTypedData(typed),signature:await wallet.request({method:'eth_signTypedData_v4',params:[signer,body]}) as Hex}
        await verifyEnrollmentProof(publicClient,p,approval)
      } else {approval=await independentWallet(publicClient,wallet,signer).approve(request)}
      downloadPublicJson(approval,'continuity-guardian-approval.json')
    } catch(e){setError(diagnose(e,'sign','no').message)} finally{setBusy(false)}
  }
  return <main><h1>Independent guardian approval</h1><p>Use the guardian’s own wallet in a separate browser context. Review the wallet and replacement identity with the customer through a trusted channel before signing.</p>
    <label>Public enrollment or recovery request<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void load(file)}}/></label>
    {request && <section><h2>Approval preview</h2><p>Ethereum Sepolia · <code>{request.safe}</code></p><p>Recovery module <code>{request.module}</code></p>
      {'kind' in request?<><p>Enroll as guardian <code>{request.third}</code>; 2-of-3 recovery; delay {request.delay} seconds.</p><p>This enrollment proof cannot execute a recovery.</p></>:<><p>Replace spending owner with <code>{request.newOwner}</code>; threshold 1; nonce {request.nonce}.</p><p>Two guardians can authorize this owner rotation after the onchain delay.</p></>}
      <button disabled={busy} onClick={()=>void sign()}>Sign and download verified public approval</button></section>}
    {error && <p role="alert">{error}</p>}<p>No private key is imported, stored or returned by this application. Organizational independence is simulated if one developer controls both roles.</p>
  </main>
}

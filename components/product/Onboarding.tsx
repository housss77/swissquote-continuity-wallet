'use client'
import {useRef,useState} from 'react'
import Link from 'next/link'
import {Shell,PageHeading,AddressLine} from './Shell'
import {Icon} from './Icon'
import {customerSession,finishWallet,signIn} from '../../lib/auth-client'
import {createdPasskey} from '../../lib/customer-credentials'
import {loadPasskey} from '../../lib/passkeys'
import {selectSafe} from '../../lib/product'
import {friendlyError} from '../../lib/errors'

export default function Onboarding(){
  const [step,setStep]=useState(0),[client,setClient]=useState('DEMO-1001'),[safe,setSafe]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const locked=useRef(false)
  async function create(){
    if(locked.current)return;locked.current=true;setBusy(true);setError('')
    try{
      const existing=await customerSession()
      if(!existing && (createdPasskey() || loadPasskey()))throw new Error('AUTH_EXISTING_ACCOUNT_PRESERVED')
      const account=existing?(existing.safe?existing:await finishWallet()):await signIn(true)
      if(!account.safe)throw new Error('AUTH_WALLET_SETUP_REQUIRED')
      selectSafe(account.safe);setSafe(account.safe);setStep(2)
    }catch(e){setError(friendlyError(e,'passkey'))}finally{locked.current=false;setBusy(false)}
  }
  return <Shell><div className="onboarding-layout"><PageHeading eyebrow="WELCOME TO CONTINUITY" title="Your wallet. A familiar start.">Connect your account, create your wallet, and add a way back.</PageHeading>
    <ol className="onboarding-progress" aria-label="Wallet setup">{['Account','Wallet','Recovery'].map((s,i)=><li key={s} aria-current={i===step?'step':undefined} className={i<step?'complete':''}><span>{i<step?<Icon name="check" size={14}/>:i+1}</span>{s}</li>)}</ol>
    <section className="onboarding-card">
      <div className="onboarding-symbol"><Icon name={step===0?'wallet':step===1?'face':'shield'} size={28}/></div>
      {error && <p role="alert" className="alert">{error}<Link href="/login">Connect your existing passkey</Link></p>}
      {step===0?<><p className="eyebrow">SWISSQUOTE ACCOUNT · DEMO CONNECTION</p><h2>One account. More control.</h2><p className="muted">Start from your Swissquote account, then keep your wallet keys on your device.</p><label htmlFor="demo-client">Demo client ID</label><input id="demo-client" value={client} onChange={e=>setClient(e.target.value)} maxLength={40} autoComplete="off" aria-describedby="demo-login-note"/><button className="button-primary onboarding-primary" disabled={!client.trim()} onClick={()=>setStep(1)}>Continue with demo account<Icon name="arrow" size={17}/></button><p id="demo-login-note" className="small muted">Simulated account connection. This does not authenticate with Swissquote. Do not enter real bank credentials.</p></>:step===1?<><p className="eyebrow">YOUR KEYS, ON YOUR DEVICE</p><h2>Create your wallet with a passkey.</h2><p className="muted">Use Face ID, Touch ID or your device PIN. No seed phrase to write down. Each transfer still needs your approval.</p><div className="onboarding-benefit"><Icon name="key"/><p>Your authenticator keeps the private key. The bank demo account cannot approve spending.</p></div><button className="button-primary onboarding-primary" disabled={busy} onClick={()=>void create()}><Icon name="face" size={18}/>{busy?'Waiting for your device…':'Create wallet with passkey'}</button><p role="status" className="small muted">{busy?'Approve the real passkey prompt on your device. No transaction is being sent.':'Only this button opens your device’s real passkey prompt.'}</p><button className="button-text" disabled={busy} onClick={()=>setStep(0)}>Back to account</button><Link className="quiet-link" href="/login">Already have a wallet? Connect it</Link></>:<><p className="eyebrow">WALLET CREATED</p><h2>Now give yourself a way back.</h2><p className="muted">A separate backup passkey, the Swissquote demo guardian and a trusted friend. Any two can restore access after a waiting period.</p><AddressLine address={safe}/><div className="onboarding-benefit"><Icon name="shield"/><p>Recovery is optional and is only enabled after the setup is confirmed onchain.</p></div><Link className="button button-primary onboarding-primary" href="/setup">Add recovery protection<Icon name="arrow" size={17}/></Link><Link className="quiet-link" href="/">I’ll do this later</Link></>}
    </section><p className="onboarding-caption">Self-custody · Ethereum Sepolia · Test assets only</p>
  </div></Shell>
}

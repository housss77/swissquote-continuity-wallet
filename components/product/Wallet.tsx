'use client'
import Link from 'next/link'
import {useRef,useState} from 'react'
import {formatUnits,isAddress} from 'viem'
import {Shell,PageHeading,AddressLine} from './Shell'
import {useWallet} from './useWallet'
import {DEMO_SAFE,CUSTOMER_PASSKEY_KEY,selectSafe,selectedSafe,sameAddress,ORIGINAL_SAFE} from '../../lib/product'
import {friendlyError} from '../../lib/errors'
import {CustomerActivity,HistoricalActivity} from './Activity'

export default function Wallet() {
  const {wallet,loading,error,safe,refresh,choose}=useWallet()
  const [input,setInput]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false)
  const lock=useRef(false)
  async function connect(create=false) {
    if(lock.current)return;lock.current=true;setBusy(true);setActionError('')
    try {
      const {createPasskey,loadPasskey,authenticatePasskey}=await import('../../lib/passkeys')
      const {createdPasskey,currentPasskey}=await import('../../lib/customer-credentials')
      const {initializeWallet,walletSnapshot}=await import('../../lib/wallet')
      let pk
      if(create) {if(selectedSafe() || createdPasskey() || loadPasskey())throw new Error('EXISTING_CREDENTIAL_PRESERVED');pk=await createPasskey();localStorage.setItem(CUSTOMER_PASSKEY_KEY,JSON.stringify({rawId:pk.rawId,coordinates:pk.coordinates}))}
      else {pk=wallet?.deployed?await currentPasskey(wallet.safe):createdPasskey() || loadPasskey();if(!pk)throw new Error('CUSTOMER_PASSKEY_UNAVAILABLE');await authenticatePasskey(pk)}
      const pack=await initializeWallet(pk,wallet?.deployed?wallet.safe:undefined)
      const result=await walletSnapshot(pack);selectSafe(result.address);await refresh(result.address);setConnected(true)
    }catch(e){const message=e instanceof Error?e.message:'';setActionError(message==='EXISTING_CREDENTIAL_PRESERVED'?'Your existing passkey is preserved. Connect your wallet instead of creating another.':message==='CUSTOMER_PASSKEY_UNAVAILABLE'?'Use the Chrome profile containing your spending passkey. You can view the demo wallet without connecting.':friendlyError(e,create?'passkey':'authenticate'))}finally{lock.current=false;setBusy(false)}
  }
  return <Shell><PageHeading eyebrow="SELF-CUSTODY, WITH CONTINUITY" title="Your wallet">Your crypto. Your control. Recovery when it matters.</PageHeading>
    {(error || actionError) && <div className="alert" role="alert">{actionError || error}<button className="button-text" onClick={()=>void refresh()}>Refresh wallet</button></div>}
    {loading?<div className="wallet-loading" role="status">Checking your wallet on Sepolia…<div className="skeleton"/><div className="skeleton short"/></div>:wallet?<>
      <AddressLine address={wallet.safe}/><div className="balance-section"><p className="eyebrow">AVAILABLE BALANCE</p><div className="balance">{wallet.usdc===null?'—':formatUnits(wallet.usdc,6)} <span>USDC</span></div><p className="muted">Test USDC has no real-world value.</p><div className="actions"><Link className="button button-primary" href="/send">Send USDC</Link><Link className="button" href="/protection">Recovery settings</Link></div></div>
      <div className="wallet-detail-grid"><section className="plain-section"><div className="section-heading"><h2>Recovery protection</h2><Link href="/protection">Manage ↗</Link></div><p className={`status-line ${wallet.recovery?.protected?'positive':''}`}>{wallet.recovery?.protected?'Recovery enabled — 2 of 3 approvals required':wallet.recovery?'Recovery not configured':wallet.deployed?'Recovery status unavailable':'Wallet not yet deployed'}</p><p className="muted">{wallet.recovery?.protected?'Your backup passkey and two trusted guardians provide a delayed recovery path. Guardian availability still needs checking.':'Your wallet is controlled by your spending passkey. Recovery is a separate protection.'}</p></section><section className="plain-section"><h2>Passkey access</h2><p>{connected?'Passkey authenticated for this session.':'Viewing public wallet information.'}</p><p className="muted">{sameAddress(wallet.safe,ORIGINAL_SAFE)?'This original acceptance wallet is read-only.':'Your device approves each transaction. Swissquote is not a required spending signer.'}</p><button disabled={busy} onClick={()=>void connect()}>{busy?'Waiting for your device…':'Connect passkey'}</button></section></div>
      {wallet.usdc===0n && <div className="funding-row"><div><h2>Ready for your first USDC transfer?</h2><p className="muted">Get free test USDC for this address. You do not need ETH for sponsored network fees.</p></div><a className="button" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get free test USDC ↗</a></div>}
      {wallet.warnings.map(w=><p key={w} className="alert" role="status">{w}</p>)}<div className="section-heading activity-heading"><h2>Activity</h2><Link href="/activity">View activity ↗</Link></div><CustomerActivity safe={wallet.safe}/>{sameAddress(wallet.safe,DEMO_SAFE)?<HistoricalActivity compact/>:<p className="muted">No verified customer transfers are recorded in this browser yet.</p>}
    </>:safe?<section className="empty-state"><h2>Your wallet is preserved</h2><AddressLine address={safe}/><p>Its balance and recovery state could not be checked. Refresh before connecting or sending.</p><button onClick={()=>void refresh()}>Refresh wallet</button></section>:<section className="welcome-panel"><h2>A wallet that starts with your passkey</h2><p className="lede">Approve transactions with your device. Add recovery without sharing your spending key.</p><div className="actions"><button className="button-primary" disabled={busy} onClick={()=>void connect(true)}>Create wallet</button><button disabled={busy} onClick={()=>void connect()}>Connect passkey</button></div><div className="divider"/><label htmlFor="view-address">Already have a wallet? View its public address</label><div className="inline-form"><input id="view-address" value={input} onChange={e=>setInput(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false}/><button disabled={!isAddress(input)} onClick={()=>void choose(input)}>View wallet</button></div><button className="button-text" onClick={()=>void choose(DEMO_SAFE)}>View the verified demo wallet</button></section>}
  </Shell>
}

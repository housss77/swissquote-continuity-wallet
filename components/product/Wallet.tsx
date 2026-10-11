'use client'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {formatUnits,isAddress} from 'viem'
import {Shell,PageHeading,AddressLine} from './Shell'
import {useWallet} from './useWallet'
import {DEMO_SAFE,selectSafe,selectedSafe,sameAddress,ORIGINAL_SAFE} from '../../lib/product'
import {friendlyError} from '../../lib/errors'
import {CustomerActivity,HistoricalActivity} from './Activity'

export default function Wallet() {
  const {wallet,loading,error,safe,refresh,choose}=useWallet()
  const [input,setInput]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState(false),[connectedSafe,setConnectedSafe]=useState<string|null>(null)
  const connected=!!wallet && !!connectedSafe && sameAddress(wallet.safe,connectedSafe)
  const lock=useRef(false)
  useEffect(()=>{let live=true;void import('../../lib/auth-client').then(async auth=>{const session=await auth.customerSession();if(live && session?.safe){setConnectedSafe(session.safe);if(!selectedSafe())await refresh(session.safe)}}).catch(()=>{});return()=>{live=false}},[refresh])
  async function connect(create=false) {
    if(lock.current)return;lock.current=true;setBusy(true);setActionError('')
    try {
      const {loadPasskey,authenticatePasskey}=await import('../../lib/passkeys')
      const {createdPasskey,currentPasskey}=await import('../../lib/customer-credentials')
      let pk
      if(!create){const auth=await import('../../lib/auth-client'),session=await auth.customerSession();if(session){const account=session.safe?session:await auth.finishWallet();await refresh(account.safe!);setConnectedSafe(account.safe);return}}
      if(create) {if(createdPasskey() || loadPasskey())throw new Error('EXISTING_CREDENTIAL_PRESERVED');const session=await (await import('../../lib/auth-client')).signIn(true);await refresh(session.safe!);setConnectedSafe(session.safe);return}
      else if(!createdPasskey() && !loadPasskey()) {const session=await (await import('../../lib/auth-client')).signIn();await refresh(session.safe!);setConnectedSafe(session.safe);return}
      else {pk=wallet?.deployed?await currentPasskey(wallet.safe):createdPasskey() || loadPasskey();if(!pk)throw new Error('CUSTOMER_PASSKEY_UNAVAILABLE');await authenticatePasskey(pk)}
      const {initializeWallet,walletSnapshot}=await import('../../lib/wallet')
      const pack=await initializeWallet(pk,wallet?.deployed?wallet.safe:undefined)
      const result=await walletSnapshot(pack);selectSafe(result.address);await refresh(result.address);setConnectedSafe(result.address)
    }catch(e){const message=e instanceof Error?e.message:'';setActionError(message==='EXISTING_CREDENTIAL_PRESERVED'?'Your existing passkey is preserved. Connect your wallet instead of creating another.':message==='CUSTOMER_PASSKEY_UNAVAILABLE'?'Sign in with the current spending passkey. Credentials created on localhost stay on that hostname.':friendlyError(e,create?'passkey':'authenticate'))}finally{lock.current=false;setBusy(false)}
  }
  return <Shell><PageHeading eyebrow="SELF-CUSTODY, WITH CONTINUITY" title="Your wallet">Your crypto. Your control. Recovery when it matters.</PageHeading>
    {(error || actionError) && <div className="alert" role="alert">{actionError || error}<button className="button-text" onClick={()=>void refresh()}>Refresh wallet</button></div>}
    {loading?<div className="wallet-loading" role="status">Checking your wallet on Sepolia…<div className="skeleton"/><div className="skeleton short"/></div>:wallet?<>
      <AddressLine address={wallet.safe}/><div className="balance-section"><p className="eyebrow">AVAILABLE BALANCE</p><div className="balance">{wallet.usdc===null?'—':formatUnits(wallet.usdc,6)} <span>USDC</span></div><p className="muted">Test USDC has no real-world value.</p><div className="actions"><Link className="button button-primary" href="/send">Send USDC</Link><Link className="button" href="/protection">Recovery settings</Link></div></div>
      <div className="wallet-detail-grid"><section className="plain-section"><div className="section-heading"><h2>Recovery protection</h2><Link href="/protection">Manage ↗</Link></div><p className={`status-line ${wallet.recovery?.protected?'positive':''}`}>{wallet.recovery?.protected?'Recovery enabled — 2 of 3 approvals required':wallet.recovery?'Recovery not configured':wallet.deployed?'Recovery status unavailable':'Wallet not yet deployed'}</p><p className="muted">{wallet.recovery?.protected?'Your backup passkey and two trusted guardians provide a delayed recovery path. Guardian availability still needs checking.':'Your wallet is controlled by your spending passkey. Recovery is a separate protection.'}</p></section><section className="plain-section"><h2>Passkey access</h2><p>{connected?'Passkey authenticated for this session.':'Viewing public wallet information.'}</p><p className="muted">{sameAddress(wallet.safe,ORIGINAL_SAFE)?'This original acceptance wallet is read-only.':'Your device approves each transaction. Swissquote is not a required spending signer.'}</p><button disabled={busy} onClick={()=>void connect()}>{busy?'Waiting for your device…':'Connect passkey'}</button></section></div>
      {!wallet.deployed && <div className="funding-row"><div><h2>Your address is ready</h2><p className="muted">Activate with a real sponsored test NFT mint. No ETH or USDC funding is needed.</p></div><Link className="button button-primary" href="/activate">Activate wallet</Link></div>}
      {wallet.usdc===0n && <div className="funding-row"><div><h2>Ready for your first USDC transfer?</h2><p className="muted">Get free test USDC for this address. You do not need ETH for sponsored network fees.</p></div><Link className="button" href="/receive">Get free test USDC ↗</Link></div>}
      {wallet.warnings.map(w=><p key={w} className="alert" role="status">{w}</p>)}<div className="section-heading activity-heading"><h2>Activity</h2><Link href="/activity">View activity ↗</Link></div><CustomerActivity safe={wallet.safe}/>{sameAddress(wallet.safe,DEMO_SAFE)?<HistoricalActivity compact/>:<p className="muted">No verified customer transfers are recorded in this browser yet.</p>}
    </>:safe?<section className="empty-state"><h2>Your wallet is preserved</h2><AddressLine address={safe}/><p>Its balance and recovery state could not be checked. Refresh before connecting or sending.</p><button onClick={()=>void refresh()}>Refresh wallet</button></section>:<section className="welcome-panel"><span className="access-symbol" aria-hidden="true">C</span><h2>Your wallet. One familiar gesture.</h2><p className="lede">Use Face ID, Touch ID or your device PIN. Your passkey controls the wallet; every transfer needs your approval.</p><div className="actions"><button className="button-primary" disabled={busy} onClick={()=>void connect(true)}>Create wallet</button><button disabled={busy} onClick={()=>void connect()}>Connect passkey</button></div><ul className="access-benefits"><li>No seed phrase to type</li><li>Sponsored network fees</li><li>Optional recovery with two guardians</li></ul><details className="advanced"><summary>View an existing wallet without signing in</summary><label htmlFor="view-address">Wallet address</label><div className="inline-form"><input id="view-address" value={input} onChange={e=>setInput(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false}/><button disabled={!isAddress(input)} onClick={()=>void choose(input)}>View wallet</button></div><button className="button-text" onClick={()=>void choose(DEMO_SAFE)}>View the verified demo wallet</button></details><Link className="quiet-link" href="/demo">Explore the verified jury demo →</Link></section>}
  </Shell>
}

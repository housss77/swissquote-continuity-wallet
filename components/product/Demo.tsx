'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import evidence from '../../lib/demo-evidence.json'
import {EXPLORER} from '../../lib/constants'
import {shortAddress} from '../../lib/product'
import type {DemoReadiness} from '../../lib/demo-check'
import {parseDemoReport} from '../../lib/demo-report'
import {Shell,PageHeading} from './Shell'
import {Icon} from './Icon'

const scenes=['Sign in','Create wallet','Add recovery','Spend','Device loss','Recover']
type Proof=typeof evidence.transactions[number]

// This presentation has memory-only story state. It never authenticates, signs,
// submits a transaction, or writes to the customer's wallet/session storage.
export default function Demo(){
 const [scene,setScene]=useState(0)
 const [created,setCreated]=useState(false),[protectedStory,setProtectedStory]=useState(false)
 const [spent,setSpent]=useState(false),[restored,setRestored]=useState(false)
 const [proof,setProof]=useState<Proof|null>(null)
 const [report,setReport]=useState<DemoReadiness|null>(null)
 const [checking,setChecking]=useState(false),[unavailable,setUnavailable]=useState(false)
 const lock=useRef(false),dialog=useRef<HTMLDialogElement>(null),returnFocus=useRef<HTMLElement|null>(null)

 function showProof(value:Proof,trigger:HTMLElement){returnFocus.current=trigger;setProof(value)}
 function closeProof(){dialog.current?.close();setProof(null);returnFocus.current?.focus()}
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'})},[scene])
 useEffect(()=>{if(proof && dialog.current && !dialog.current.open)dialog.current.showModal()},[proof])
 async function check(){
  if(lock.current)return
  lock.current=true;setChecking(true);setUnavailable(false)
  try {
   const res=await fetch('/api/demo',{cache:'no-store',signal:AbortSignal.timeout(60000)})
   if(!res.ok)throw new Error('UNAVAILABLE')
   setReport(parseDemoReport(await res.json()))
  }catch{setUnavailable(true);setReport(null)}
  finally{setChecking(false);lock.current=false}
 }
 function restart(){closeProof();setScene(0);setCreated(false);setProtectedStory(false);setSpent(false);setRestored(false)}

 return <Shell>
  <div className="demo-topline"><span className="eyebrow">THE CUSTOMER JOURNEY · ABOUT 3 MINUTES</span><span className="demo-counter">Scene {scene+1} of 6</span></div>
  <div className="demo-simulation"><strong>Simulated customer journey</strong><p>These buttons illustrate the experience. They do not authenticate, create keys or send transactions. Proof popups show real transactions verified earlier on Sepolia.</p></div>
  <ol className="journey-progress" aria-label="Customer journey">{scenes.map((label,index)=><li key={label} aria-current={index===scene?'step':undefined} className={index<scene?'completed':''}><span>{index<scene?<Icon name="check" size={12}/>:index+1}</span>{label}</li>)}</ol>
  <div className="demo-stage journey-stage" aria-live="polite">
   {scene===0 && <>
    <PageHeading title="Your Swissquote account. Your own wallet.">A familiar starting point, with the customer in control.</PageHeading>
    <div className="journey-grid">
     <div className="journey-customer-card"><div className="journey-brand"><span>SQ</span><div><strong>Swissquote account</strong><p>Hackathon concept</p></div></div><h2>Welcome to Continuity</h2><p className="muted">A self-custody companion, close to your Swissquote account.</p><div className="demo-account"><span>Illustrative customer</span><strong>DEMO-1001</strong><span>No real credentials needed</span></div><button className="button-primary journey-primary" onClick={()=>setScene(1)}>Continue with Swissquote (demo)</button></div>
     <aside className="journey-explanation"><span className="eyebrow">ONE FAMILIAR EXPERIENCE</span><h2>Your bank is the starting point.</h2><p>Create a wallet, send assets and manage recovery in the same interface.</p><p className="muted">This sign-in is simulated. There is no connection to Swissquote's authentication or banking systems.</p><p className="muted">The bank does not become a mandatory signer for daily spending.</p></aside>
    </div>
   </>}
   {scene===1 && <>
    <PageHeading title="Your wallet starts with your passkey.">No seed phrase to type. Your device approves spending.</PageHeading>
    <div className="journey-grid">
     <div className="journey-customer-card"><div className="journey-symbol"><Icon name="face" size={28}/></div><h2>Create your wallet</h2><p className="muted">In the real app, Face ID or Windows Hello creates your spending passkey.</p><div className="journey-wallet-address"><span>Historical acceptance wallet</span><code>{evidence.safe}</code></div><button className="button-primary journey-primary" onClick={event=>{setCreated(true);showProof(evidence.initialSpend,event.currentTarget)}}>Create wallet (demo)</button>{created && <p className="journey-complete"><Icon name="check" size={16}/>Wallet creation illustrated. Historical proof available.</p>}<p className="small muted">This walkthrough does not open your authenticator or create a new wallet.</p></div>
     <aside className="journey-explanation"><span className="eyebrow">CUSTOMER CONTROL</span><h2>A genuine Safe account.</h2><p>The customer passkey authorizes ordinary spending. Spending threshold: one.</p><p className="muted">The proof shows this exact Safe being deployed and a sponsored NFT mint approved by its original spending passkey.</p><p className="muted">The private key stays with the authenticator. Recovery replaces an owner; it does not reconstruct the old private key.</p></aside>
    </div>
   </>}
   {scene===2 && <>
    <PageHeading title="A backup. A bank guardian. A trusted friend.">Any two approvals can restore access after a security delay.</PageHeading>
    <div className="journey-grid">
     <div className="journey-customer-card"><h2>Add your recovery circle</h2><div className="journey-guardians">{evidence.guardians.map((guardian,index)=><div key={guardian.address}><span className="journey-guardian-icon"><Icon name={index===0?'key':index===1?'shield':'wallet'} size={19}/></span><div><strong>{guardian.label}</strong><span>{index===0?'A separate backup passkey':index===1?'Simulated institutional guardian':'Independently signed wallet approval'}</span></div></div>)}</div><div className="journey-rule"><strong>2 of 3 approvals</strong><span>One guardian alone cannot recover the wallet.</span></div><button className="button-primary journey-primary" onClick={event=>{setProtectedStory(true);showProof(evidence.transactions[0],event.currentTarget)}}>Enable recovery (demo)</button>{protectedStory && <p className="journey-complete"><Icon name="check" size={16}/>Recovery setup illustrated. No configuration changed.</p>}</div>
     <aside className="journey-explanation"><span className="eyebrow">A WAY BACK</span><h2>Recovery without a bank spending key.</h2><p>The historical setup registered three distinct guardians with a two-approval threshold.</p><p className="muted">Registered onchain, cryptographically approved and reachable in real life are three different things. We do not claim current guardian availability.</p><p className="muted">Two guardians may collude to replace the owner. The bank verification and organizational independence are simulated.</p></aside>
    </div>
   </>}
   {scene===3 && <>
    <PageHeading title="Your approval. Sponsored network fees.">Review the action. Approve with a passkey. The sponsor pays gas.</PageHeading>
    <div className="journey-grid">
     <div className="journey-customer-card"><h2>Review a transaction</h2><dl className="review-facts"><dt>Action</dt><dd>Mint a tutorial NFT</dd><dt>Recipient</dt><dd><code>{shortAddress(evidence.safe)}</code></dd><dt>ETH transferred</dt><dd>0 ETH</dd><dt>Network fee</dt><dd>Sponsored by the Sepolia paymaster</dd><dt>Authorization</dt><dd>Customer spending passkey</dd></dl><button className="button-primary journey-primary" onClick={event=>{setSpent(true);showProof(evidence.initialSpend,event.currentTarget)}}>Approve transaction (demo)</button>{spent && <p className="journey-complete"><Icon name="check" size={16}/>Historical receipt shown. Nothing sent now.</p>}<p className="small muted">Testnet assets only. No passkey request or broadcast occurs here.</p></div>
     <aside className="journey-explanation"><span className="eyebrow">GENUINE GASLESS EVIDENCE</span><h2>No native gas token needed.</h2><p>The verified NFT operation deployed the Safe and succeeded with sponsored ERC-4337 execution.</p><p className="muted">The USDC send flow is implemented and automated-tested. A real USDC transfer still needs test tokens and a human passkey approval.</p><p className="muted">The NFT receipt is not evidence of a USDC transfer. Advisory risk checks are not an onchain spending firewall.</p></aside>
    </div>
   </>}
   {scene===4 && <>
    <PageHeading title="A lost device doesn’t mean a lost wallet.">Get new access without moving the wallet or its assets.</PageHeading>
    <div className="journey-grid">
     <div className="journey-customer-card"><div className="journey-symbol"><Icon name="phone" size={28}/></div><h2>I can't use my usual device</h2><p className="muted">Start a recovery request for the same wallet. Your new device will hold a new spending passkey.</p><div className="journey-wallet-address"><span>Same public Safe address</span><code>{evidence.safe}</code></div><button className="button-primary journey-primary" onClick={()=>setScene(5)}>Recover wallet (demo)</button><p className="small muted">Device loss is an illustrative story. We do not delete credentials or claim synchronized passkeys are inaccessible.</p></div>
     <aside className="journey-explanation"><span className="eyebrow">TWO INDEPENDENT APPROVALS</span><h2>You can lose your original access.</h2><p>In the verified recovery, the Swissquote mock and independent third-party signatures approved the same new owner.</p><p className="muted">The old customer passkey was not required to authorize that recovery.</p><p className="muted">A backup passkey is the third guardian, not an extra spending key. Email and SMS recovery shortcuts are not implemented.</p></aside>
    </div>
   </>}
   {scene===5 && <>
    <PageHeading title="New access. Same wallet.">Verified earlier on Sepolia — not a recovery happening live.</PageHeading>
    <div className="journey-grid">
     <div className="journey-customer-card"><h2>Restore your spending access</h2><div className="journey-approvals"><div><Icon name="check" size={16}/><span>Swissquote mock approval</span></div><div><Icon name="check" size={16}/><span>Independent third-party approval</span></div><div><Icon name="check" size={16}/><span>Historical delay: {evidence.observedWaitSeconds}s elapsed / {evidence.delaySeconds}s required</span></div></div><div className="journey-wallet-address"><span>Same wallet before and after</span><code>{evidence.safe}</code></div><div className="owner-comparison"><div><span className="eyebrow">OLD OWNER · REMOVED</span><code>{shortAddress(evidence.oldOwner)}</code></div><div><span className="eyebrow">NEW OWNER · INSTALLED</span><code>{shortAddress(evidence.newOwner)}</code></div></div><button className="button-primary journey-primary" onClick={event=>{setRestored(true);showProof(evidence.transactions[2],event.currentTarget)}}>Restore access (demo)</button>{restored && <p className="journey-complete"><Icon name="check" size={16}/>Historical owner rotation shown. No recovery sent now.</p>}</div>
     <aside className="journey-explanation"><span className="eyebrow">THE COMPLETE LIFECYCLE</span><h2>The new passkey spent again.</h2><p>After owner rotation, a real sponsored NFT mint succeeded from this same Safe with the replacement passkey.</p><div className="journey-proof-actions"><button onClick={event=>showProof(evidence.transactions[1],event.currentTarget)}>View recovery initiation proof</button><button onClick={event=>showProof(evidence.transactions[2],event.currentTarget)}>View owner rotation proof</button><button onClick={event=>showProof(evidence.transactions[3],event.currentTarget)}>View recovered transaction proof</button></div><p className="small muted">The 180-second delay is test-only. Bank identity checks are simulated. Receipt evidence proves authorization, not the physical authenticator used.</p><Link href="/activity">See all historical evidence <Icon name="external" size={13}/></Link></aside>
    </div>
   </>}
  </div>
  <div className="demo-controls"><button disabled={scene===0} onClick={()=>setScene(value=>value-1)}>Back</button><span>{scenes[scene]}</span><button className="button-primary" disabled={scene===5} onClick={()=>setScene(value=>value+1)}>Next scene</button></div>
  <button className="button-text demo-restart" onClick={restart}><Icon name="refresh" size={14}/>Restart walkthrough</button>
  <details className="advanced"><summary>Live verification and evidence provenance</summary><p>Stored historical evidence comes from <code>{evidence.source}</code>, recorded at {evidence.verifiedAt}. It stays available if the network fails.</p><button disabled={checking} onClick={()=>void check()}>{checking?'Reading Sepolia…':'Check live state (read-only)'}</button>{unavailable && <p className="alert" role="status">Live RPC verification unavailable. The displayed recovery remains stored historical evidence; current state has not been refreshed.</p>}{report && <><p role="status">Live read-only report: {report.status} · {report.checkedAt}</p><ul className="check-list">{report.checks.map(item=><li key={item.name}><strong>{item.status} · {item.name}</strong><p>{item.detail}</p></li>)}</ul></>}{evidence.limitations.map(item=><p className="small muted" key={item}>{item}</p>)}</details>
  <dialog ref={dialog} className="proof-modal" aria-labelledby="demo-proof-title" onCancel={event=>{event.preventDefault();closeProof()}}>
   {proof && <><div className="proof-modal-header"><span className="history-label">Verified earlier on Sepolia</span><button onClick={closeProof} aria-label="Close proof" autoFocus>Close</button></div><h2 id="demo-proof-title">{proof.label}</h2><p>{proof.detail}</p><dl className="review-facts"><dt>Safe account</dt><dd><code>{evidence.safe}</code></dd><dt>Actual transaction hash</dt><dd><code>{proof.hash}</code></dd><dt>Confirmed block</dt><dd>{proof.block.toLocaleString('en-US')}</dd><dt>Network</dt><dd>Ethereum Sepolia · 11155111</dd><dt>Evidence source</dt><dd><code>{evidence.source}</code></dd></dl><a className="button button-primary proof-explorer" href={EXPLORER+'/tx/'+proof.hash} target="_blank" rel="noreferrer">View real transaction on Etherscan <Icon name="external" size={14}/></a><p className="small muted">No transaction was submitted by this walkthrough. This is stored historical evidence, not a new live confirmation.</p></>}
  </dialog>
 </Shell>
}

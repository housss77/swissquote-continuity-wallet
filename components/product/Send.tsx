'use client'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {formatUnits,parseAbi} from 'viem'
import type {Safe4337Pack} from '@safe-global/relay-kit'
import {Shell,PageHeading,AddressLine} from './Shell'
import {useWallet} from './useWallet'
import {productClient,tokenAbi,USDC_ADDRESS,DEMO_SAFE,sameAddress,assertCustomerSpendingAllowed} from '../../lib/product'
import {usdcTransfer,type UsdcIntent} from '../../lib/usdc'
import {transactionReview} from '../../lib/transaction-review'
import {friendlyError,type Stage} from '../../lib/errors'
import {diagnose} from '../../lib/diagnostics'
import {ENTRY_POINT,EXPLORER} from '../../lib/constants'
import {assertFreshQuote,withSendLock} from '../../lib/send-session'
import type {PendingOperation} from '../../lib/operations'
import type {ConfirmedProof} from '../../lib/proof'
import type {prepareSponsoredTransaction} from '../../lib/sponsorship'
import evidence from '../../lib/demo-evidence.json'
import {Icon,TokenIcon} from './Icon'

type Quote=Awaited<ReturnType<typeof prepareSponsoredTransaction>>&{pack:Safe4337Pack;intent:UsdcIntent;at:number;review:ReturnType<typeof transactionReview>}
const nonceAbi=parseAbi(['function getNonce(address sender,uint192 key) view returns(uint256)'])
const stateLabels={prepared:'Waiting for passkey',broadcasting:'Submitting',accepted:'Submitted',included:'Confirmed',rejected:'Failed',failed:'Failed',unknown:'Unresolved'}
export default function Send() {
  const {wallet,loading,error,refresh}=useWallet()
  const [asset,setAsset]=useState('USDC')
  const [recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[pending,setPending]=useState<PendingOperation|null>(null),[proof,setProof]=useState<ConfirmedProof|null>(null),[message,setMessage]=useState(''),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false)
  const active=useRef(false)
  async function action(stage:Stage,work:()=>Promise<void>) {
    if(active.current)return;active.current=true;setBusy(true);setProblem('')
    try{await work()}catch(e){setProblem(friendlyError(e,stage))}finally{active.current=false;setBusy(false)}
  }
  useEffect(()=>{
    let live=true
    void import('../../lib/wallet').then(async sdk=>{const saved=sdk.loadPending();if(!live)return;setPending(saved);if(saved?.transactionHash){try{const result=await sdk.verifyOperationInclusion(saved,null,120_000);if(live && sdk.loadPending()?.userOperationHash===saved.userOperationHash){const confirmed={...saved,state:'included' as const,acceptance:'yes' as const};sdk.savePending(confirmed);setPending(confirmed);setProof(result)}}catch{if(live)setMessage('Saved receipt could not be verified now. Check confirmation; do not resend.')}}}).catch(()=>{if(live)setProblem('Saved operation cannot be read. Preserve browser data and inspect Advanced lab before sending.')})
    const listener=()=>{setProof(null);setQuote(null);setMessage('');void import('../../lib/wallet').then(({loadPending})=>setPending(loadPending())).catch(()=>setProblem('Saved operation could not be read. Sending is blocked.'))}
    window.addEventListener('storage',listener)
    if(new URLSearchParams(location.search).get('demo')==='1'){setRecipient(evidence.guardians[2].address);setAmount('1')}
    return()=>{live=false;window.removeEventListener('storage',listener)}
  },[])
  async function review() {
    if(asset!=='USDC')throw new Error('UNSUPPORTED_ASSET')
    if(!wallet || wallet.usdc===null)throw new Error('USDC_BALANCE_UNAVAILABLE')
    assertCustomerSpendingAllowed(wallet.safe)
    const sdk=await import('../../lib/wallet')
    if(sdk.loadPending())throw new Error('SEND_PREVIOUS_ATTEMPT')
    const fresh=await import('../../lib/product').then(p=>p.readWallet(wallet.safe))
    if(fresh.usdc===null)throw new Error('USDC_BALANCE_UNAVAILABLE')
    if(sameAddress(fresh.safe,DEMO_SAFE)) {
      const r=fresh.recovery
      if(fresh.threshold!==1n || fresh.owners.length!==1 || !sameAddress(fresh.owners[0],evidence.newOwner)
        || !r?.protected || r.threshold!==2n || r.guardians.length!==3 || r.delay!==180 || r.request.executableAt!==0n
        || !evidence.guardians.every(g=>r.guardians.some(v=>sameAddress(g.address,v))))throw new Error('DEMO_CONFIGURATION_CHANGED')
    }
    const {intent,transaction}=usdcTransfer(fresh.safe,recipient.trim(),amount.trim(),fresh.usdc)
    const {currentPasskey,createdPasskey}=await import('../../lib/customer-credentials')
    const pk=fresh.deployed?await currentPasskey(fresh.safe):createdPasskey() || (await import('../../lib/passkeys')).loadPasskey()
    if(!pk)throw new Error('CUSTOMER_PASSKEY_UNAVAILABLE')
    const pack=await sdk.initializeWallet(pk,fresh.deployed?fresh.safe:undefined)
    if(!sameAddress(await pack.protocolKit.getAddress(),fresh.safe))throw new Error('OWNER_MISMATCH')
    const simulated=await productClient.simulateContract({address:USDC_ADDRESS,abi:tokenAbi,functionName:'transfer',args:[intent.recipient,BigInt(intent.amount)],account:fresh.safe})
    if(simulated.result!==true)throw new Error('USDC_SIMULATION_FAILED')
    setMessage('Preparing sponsored fees. No signature or broadcast yet.')
    const result=await (await import('../../lib/sponsorship')).prepareSponsoredTransaction(pack,fresh.safe,transaction,sdk.sponsorshipReads)
    if(fresh.deployed)await productClient.call({account:ENTRY_POINT,to:fresh.safe,data:result.operation.toUserOperation().callData as `0x${string}`})
    setQuote({...result,pack,intent,at:Date.now(),review:transactionReview(11155111,USDC_ADDRESS,transaction.data)})
    setMessage('Review the exact transfer. Fees quoted; this has not been submitted.')
  }
  async function sign() {
    if(!quote)return
    await withSendLock(async()=>{
      const q=quote,sdk=await import('../../lib/wallet')
      if(sdk.loadPending())throw new Error('SEND_PREVIOUS_ATTEMPT')
      assertFreshQuote(q.at)
      assertCustomerSpendingAllowed(q.intent.safe)
      await sdk.checkNetworks()
      const [balance,nonce]=await Promise.all([productClient.readContract({address:USDC_ADDRESS,abi:tokenAbi,functionName:'balanceOf',args:[q.intent.safe]}),productClient.readContract({address:ENTRY_POINT,abi:nonceAbi,functionName:'getNonce',args:[q.intent.safe,0n]})])
      if(balance<BigInt(q.intent.amount))throw new Error('INSUFFICIENT_USDC')
      if(nonce!==BigInt(q.operation.toUserOperation().nonce))throw new Error('SEND_NONCE_CHANGED')
      // The SDK verifies the actual credential; the fresh public snapshot must
      // still match the same owner/configuration before prompting the device.
      await sdk.walletSnapshot(q.pack)
      const current=await import('../../lib/product').then(p=>p.readWallet(q.intent.safe))
      if(current.deployed && (current.threshold!==1n || current.owners.length!==1 || !sameAddress(current.owners[0],await q.pack.protocolKit.getSafeProvider().getSignerAddress() || '')))throw new Error('OWNER_MISMATCH')
      if(sameAddress(current.safe,DEMO_SAFE) && (!current.recovery?.protected || current.recovery.request.executableAt!==0n || !sameAddress(current.owners[0],evidence.newOwner)
        || !evidence.guardians.every(g=>current.recovery!.guardians.some(v=>sameAddress(v,g.address)))))throw new Error('DEMO_CONFIGURATION_CHANGED')
      assertFreshQuote(q.at)
      if(sdk.loadPending())throw new Error('SEND_PREVIOUS_ATTEMPT')
      const update=(v:PendingOperation)=>{sdk.savePending(v);setPending(v)}
      const attempt:PendingOperation={kind:'usdc',usdcIntent:q.intent,safeAddress:q.intent.safe,paymasterAddress:q.paymasterAddress,userOperationHash:sdk.operationHash(q.operation.toUserOperation()),state:'prepared',acceptance:'no',description:`Send ${formatUnits(BigInt(q.intent.amount),6)} test USDC to ${q.intent.recipient}`,createdAt:new Date().toISOString()}
      update(attempt);setMessage('Waiting for your spending passkey approval.');setProof(null)
      let signed
      try {
        signed=await q.pack.signSafeOperation(q.operation)
        assertFreshQuote(q.at)
        ;(await import('../../lib/gas')).assertOperationBudget(signed.toUserOperation())
        if(sdk.operationHash(signed.toUserOperation())!==attempt.userOperationHash)throw new Error('SPONSORSHIP_SIGNED_MISMATCH')
      }catch(e){update({...attempt,state:'rejected',submissionError:diagnose(e,'sign','no')});throw e}
      setQuote(null);setMessage('Submitting once. Never send again while confirmation is unresolved.')
      const submitted=await sdk.submitOperation(signed,attempt,update)
      if(submitted.state==='accepted') {
        const result=await sdk.confirmOperation(submitted,update)
        if(result){setProof(result);setMessage('Transfer confirmed on Sepolia.');await refresh()}
      }
    })
  }
  async function check() {
    const sdk=await import('../../lib/wallet'),saved=sdk.loadPending()
    if(!saved)return
    const result=await sdk.confirmOperation(saved,v=>{if(sdk.loadPending()?.userOperationHash!==saved.userOperationHash)throw new Error('SEND_ATTEMPT_CHANGED');sdk.savePending(v);setPending(v)})
    if(result && sdk.loadPending()?.userOperationHash===saved.userOperationHash){setProof(result);setMessage(saved.kind==='usdc'?'Transfer confirmed on Sepolia.':'Earlier operation verified. Preserve it before preparing a new transfer.');await refresh()}
  }
  async function preserve() {
    await withSendLock(async()=>{const sdk=await import('../../lib/wallet'),saved=sdk.loadPending();if(!saved)return
      // An included record loaded from storage becomes unknown until verified.
      if(proof && (proof.userOperationHash!==saved.userOperationHash || !sameAddress(proof.safeAddress,saved.safeAddress)))throw new Error('SEND_PREVIOUS_ATTEMPT')
      if(!proof && !['rejected','failed'].includes(saved.state) && !(saved.state==='prepared' && saved.acceptance==='no'))throw new Error('SEND_PREVIOUS_ATTEMPT')
      sdk.archivePending(proof?{...saved,state:'included',transactionHash:proof.transactionHash}:saved);setPending(null);setProof(null);setMessage('Evidence preserved. You can prepare a new transfer manually.')
    })
  }
  return <Shell><PageHeading eyebrow="PAYMENTS" title="Send">Choose an asset, add a recipient, and approve with your passkey.</PageHeading>
    {(error || problem) && <div role="alert" className="alert">{problem || error}</div>}
    {message && <p role="status" className="status-line">{message}</p>}
    {loading?<p className="wallet-loading" role="status">Checking your balance…</p>:!wallet?<div className="empty-state"><h2>Choose your wallet first</h2><p>Use the browser profile containing your spending passkey.</p><Link className="button" href="/">Open wallet</Link></div>:<>
      <ol className="transfer-steps" aria-label="Transfer progress">{['Details','Review','Confirm'].map((step,i)=><li key={step} aria-current={i===(pending?2:quote?1:0)?'step':undefined}><span>{i+1}</span>{step}</li>)}</ol>
      <div className="send-layout"><div className="send-main-column">
      <div className="asset-picker"><label htmlFor="send-asset">Asset</label><select id="send-asset" value={asset} disabled={busy || !!quote || !!pending} onChange={e=>setAsset(e.target.value)}><option value="USDC">USDC · USD Coin</option><option value="ETH">ETH · Ethereum (view balance)</option></select><p className="small muted">USDC transfers are available now. Additional asset transfers are coming later.</p></div>
      {pending?<section className={`transfer-result ${proof?'confirmed':''}`} aria-label="Saved operation"><div className="result-icon"><Icon name={proof?'check':pending.state==='rejected' || pending.state==='failed'?'info':'activity'} size={28}/></div><p className="eyebrow">{proof?'CONFIRMED ON SEPOLIA':pending.state==='included'?'Checking confirmation':stateLabels[pending.state]}</p><h2>{pending.description}</h2>{proof?<><p>Successful receipt and matching sponsored operation verified.{proof.transfer?' Matching USDC Transfer event verified.':''}</p>{proof.transfer && <p className="muted">Balance reconciliation: {proof.transfer.reconciliation==='verified'?'all transfers in this block accounted for':'unavailable from this RPC; matching Transfer event verified'}</p>}<a className="button button-primary" href={`${EXPLORER}/tx/${proof.transactionHash}`} target="_blank" rel="noreferrer">View confirmed transaction ↗</a></>:<><p>Checking or opening this page cannot send again. A UserOperation hash is not a transaction receipt.</p><button className="button-primary" disabled={busy} onClick={()=>void action('confirm',check)}>Check confirmation</button></>}
        <details className="advanced"><summary>Operation evidence and diagnostics</summary><p>Bundler acknowledgement: {pending.acknowledgement?'Recorded':'Not recorded'}</p><p>UserOperation hash: <code>{pending.userOperationHash}</code></p>{(pending.submissionError || pending.lastError) && <pre>{JSON.stringify(pending.submissionError || pending.lastError,null,2)}</pre>}</details>
        {(proof || ['rejected','failed','prepared'].includes(pending.state)) && <button disabled={busy} onClick={()=>void action('prepare',preserve)}>Preserve attempt and continue</button>}
      </section>:quote?<section className="send-review"><div className="section-heading"><h2>Review transfer</h2><span className="status-badge">Fees quoted</span></div><div className="review-amount"><TokenIcon/><strong>{formatUnits(BigInt(quote.intent.amount),6)}<span>test USDC</span></strong></div><dl className="review-facts"><dt>Recipient</dt><dd><code>{quote.intent.recipient}</code></dd><dt>From</dt><dd><code>{quote.intent.safe}</code></dd><dt>Network</dt><dd>Ethereum Sepolia</dd><dt>Network fees</dt><dd>Covered by the demo sponsor · zero ETH transferred</dd></dl><div className="safety-review"><h3>Transaction review</h3><p>{quote.review.status}</p>{quote.review.warnings.map(w=><p key={w}>{w}</p>)}<p className="muted">Contract simulation passed; sponsorship quote validated. These do not guarantee bundler acceptance or a real passkey signature. Sanctions: Not checked. UI checks are advisory; a usable spending passkey can bypass them.</p></div><div className="actions"><button className="button-primary" disabled={busy} onClick={()=>void action('sign',sign)}><Icon name="face" size={19}/>{busy?'Waiting for your device…':'Confirm with passkey'}</button><button disabled={busy} onClick={()=>{setQuote(null);setMessage('')}}>Back to transfer</button></div><p className="small muted">This button requests a real passkey signature, then broadcasts once. Review expires after 60 seconds. No automatic retry.</p></section>:asset==='ETH'?<section className="send-form"><h2>Ethereum</h2><div className="balance">{formatUnits(wallet.eth,18)} <span>ETH</span></div><p>Ethereum is held at the same wallet address. Sending ETH is not enabled in this customer flow yet.</p><button className="button-primary" onClick={()=>setAsset('USDC')}>Choose USDC to send</button></section>:<section className="send-form"><div className="section-heading"><h2>Transfer details</h2><span className="transfer-token"><TokenIcon/>USDC</span></div>
      <div className="amount-field"><label htmlFor="usdc-amount">Amount in USDC</label><div className="amount-input"><input id="usdc-amount" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" disabled={busy} aria-describedby="amount-help"/><button className="max-button" disabled={busy || wallet.usdc===null} onClick={()=>setAmount(formatUnits(wallet.usdc!,6))}>Max</button></div><span className="amount-balance">Balance: {wallet.usdc===null?'Unavailable':formatUnits(wallet.usdc,6)} USDC</span></div>
      <label htmlFor="usdc-recipient">Recipient address</label><input id="usdc-recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Enter an Ethereum address · 0x…" autoComplete="off" spellCheck={false} disabled={busy} aria-describedby="recipient-help"/><p id="recipient-help" className="field-help">Send only to an address on Ethereum Sepolia.</p><div className="fee-line"><span><Icon name="send" size={16}/>Network fees</span><strong>Sponsored<span>No ETH needed</span></strong></div><button className="button-primary review-button" disabled={busy || wallet.usdc===null || wallet.usdc===0n || !recipient || !amount} onClick={()=>void action('prepare',review)}>{busy?'Preparing…':'Review transfer'}<Icon name="arrow" size={18}/></button><p id="amount-help" className="small muted">Up to 6 decimal places. Reviewing does not sign or send.</p></section>}
      <p className="test-notice"><Icon name="info" size={15}/>Test USDC has no real-world value. Ethereum Sepolia only.</p></div>
      <aside className="send-sidebar"><section className="sender-card"><div className="card-icon"><Icon name="wallet" size={21}/></div><p className="eyebrow">SENDING FROM</p><h2>Your wallet</h2><AddressLine address={wallet.safe}/><button className="button-text" disabled={busy} onClick={()=>void refresh()}><Icon name="refresh" size={14}/>Refresh balance</button></section>
      {wallet.usdc===0n && <section className="funding-card"><h3>A little test USDC to start.</h3><p>Copy your wallet address into Circle’s faucet, then refresh your balance.</p><Link className="button" href="/receive">Get free test USDC ↗</Link></section>}
      <div className="send-assurance"><Icon name="lock" size={17}/><p>Only your spending passkey can approve this transfer. The demo sponsor covers network fees.</p></div></aside></div>
    </>}
  </Shell>
}

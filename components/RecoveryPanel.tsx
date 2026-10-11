'use client'
import { useEffect, useRef, useState } from 'react'
import { hashTypedData, isAddress, type Address, type Hash, type Hex } from 'viem'
import { publicClient, initializeWallet, walletSnapshot } from '../lib/wallet'
import { ENTRY_POINT, EXPLORER } from '../lib/constants'
import { diagnose } from '../lib/diagnostics'
import { loadPasskey, authenticatePasskey } from '../lib/passkeys'
import {createdPasskey,currentPasskey} from '../lib/customer-credentials'
import { mintTransaction } from '../lib/transactions'
import { prepareSponsoredTransaction } from '../lib/sponsorship'
import { sponsorshipReads } from '../lib/wallet'
import { address, assertDisposableSafe, erc1271Abi, recoveryCall } from '../lib/recovery/contracts'
import { recoveryState } from '../lib/recovery/onchain'
import { backupApproval, createRecoveryCredential, metadataDigest, signDigest, verifyCredentialBinding, verifyFreshCredential } from '../lib/recovery/passkey'
import { recoveryReceiptIntent } from '../lib/recovery/evidence'
import { intentHash, makeIntent, verifyApprovals } from '../lib/recovery/signatures'
import { independentWallet } from '../lib/recovery/providers'
import { atomicBatch, batchIntentValidator, enrollmentCalls } from '../lib/recovery/enrollment'
import { archiveRecoveryAttempt, checkRecoveryAttempt, loadRecoveryAttempt, sendPreparedRecovery } from '../lib/recovery/transport'
import type { GuardianApproval, PublicCredential, RecoveryIntent, RecoveryState } from '../lib/recovery/types'
import type { PendingOperation } from '../lib/operations'
import { downloadPublicJson, enrollmentPreview, enrollmentTyped, enrollmentProofMatches, verifyEnrollmentProof } from '../lib/recovery/guardian-proof'
import { recoveryErrorMessage } from '../lib/recovery/errors'
import { assertConfigurationWritable } from '../lib/product'

type CredentialRecord={credential:PublicCredential;signature:Hex}
type RelayRecord={hash:Hash;state:string;action:string}
const draftKey='continuity-recovery-public-draft-v1'
export default function RecoveryPanel({initialSafe='',embedded=false,guidedSetup=false}:{initialSafe?:string;embedded?:boolean;guidedSetup?:boolean}={}) {
  const [setupStep,setSetupStep]=useState(0)
  const [safeInput,setSafeInput]=useState(initialSafe),[state,setState]=useState<RecoveryState|null>(null)
  const [bank,setBank]=useState<Address|null>(null),[third,setThird]=useState(''),[backup,setBackup]=useState<CredentialRecord|null>(null)
  const [replacement,setReplacement]=useState<CredentialRecord|null>(null),[savedBackup,setSavedBackup]=useState<PublicCredential|null>(null)
  const [intent,setIntent]=useState<RecoveryIntent|null>(null),[approvals,setApprovals]=useState<GuardianApproval[]>([])
  const [operator,setOperator]=useState(''),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [status,setStatus]=useState('Find your Safe to read its recovery configuration. No original browser session is needed.')
  const [relay,setRelay]=useState<RelayRecord|null>(null),[attempt,setAttempt]=useState<PendingOperation|null>(null),[confirmed,setConfirmed]=useState<Hash|null>(null)
  const [rotated,setRotated]=useState(false),[readiness,setReadiness]=useState(false)
  const [thirdProof,setThirdProof]=useState<GuardianApproval|null>(null)
  const preview=state && backup && bank && isAddress(third)?enrollmentPreview(state,backup.credential.signer,bank,address(third)):null
  const verifiedThird=!!preview && !!thirdProof && enrollmentProofMatches(preview,thirdProof)
  const currentEnrollmentHash=useRef<Hex|null>(null)
  currentEnrollmentHash.current=preview?hashTypedData(enrollmentTyped(preview)):null
  const locked=useRef(false)
  useEffect(()=>{try {setAttempt(loadRecoveryAttempt())} catch {setError('Saved recovery attempt cannot be read. Preserve browser data; do not retry.')}},[])
  useEffect(()=>{if(guidedSetup && initialSafe)void run(find)},[guidedSetup,initialSafe])
  const cleanError=(e:unknown)=>recoveryErrorMessage(diagnose(e,'prepare','no').message)
  async function run(work:()=>Promise<unknown>) {
    if (locked.current) return
    locked.current=true;setBusy(true);setError('')
    try {await work()} catch(e){setError(cleanError(e));setStatus('Action not verified as successful. No automatic retry.')} finally {locked.current=false;setBusy(false)}
  }
  async function api(body:object,bankAction=false) {
    if (bankAction && !operator.trim()) throw new Error('RECOVERY_OPERATOR_REQUIRED')
    const response=await fetch('/api/recovery',{method:'POST',headers:{'Content-Type':'application/json',...(bankAction?{Authorization:`Bearer ${operator}`}:{})},body:JSON.stringify(body),redirect:'error'})
    const data=await response.json()
    if (!response.ok || data.error) throw new Error(data.error || 'RECOVERY_SERVICE_UNAVAILABLE')
    return data.result
  }
  async function refresh(safe=state?.safe || safeInput) {
    const s=await recoveryState(publicClient,safe)
    setState(s)
    const response=await fetch(`/api/recovery?safe=${encodeURIComponent(s.safe)}`,{cache:'no-store'})
    const config=await response.json()
    if (!response.ok) throw new Error(config.error || 'RECOVERY_SERVICE_UNAVAILABLE')
    setBank(config.bank);setSavedBackup(config.backup)
    // The registry restores the current/pending owner for a clean browser. It
    // must not replace a locally prepared new signer during receipt refreshes.
    if (config.replacement) setReplacement(current=>current ?? config.replacement)
    if (config.transactions?.length) setRelay(config.transactions[0])
    if (s.request.executableAt>0n && s.request.newOwners.length===1 && s.request.newThreshold===1n) {
      setIntent({chainId:11155111,moduleVersion:'0.2.0',safe:s.safe,module:s.module,newOwner:s.request.newOwners[0],newThreshold:'1',nonce:s.request.nonce.toString()})
    }
    return s
  }
  async function find() {
    setReadiness(false);setRotated(false);setIntent(null);setApprovals([]);setBackup(null);setReplacement(null);setRelay(null);setConfirmed(null);setThirdProof(null)
    const s=await refresh(address(safeInput.trim()))
    const draft=JSON.parse(localStorage.getItem(draftKey) || 'null')
    if (draft?.safe?.toLowerCase()===s.safe.toLowerCase()) {
      if (draft.backup) {await verifyCredentialBinding(publicClient,draft.backup.credential,false);setBackup(draft.backup)}
      if (draft.replacement) {await verifyCredentialBinding(publicClient,draft.replacement.credential,false);setReplacement(draft.replacement)}
    }
    setStatus(s.protected?'Three recovery guardians are registered onchain. Their current availability still needs verification.':'Recovery protection is incomplete. The account has not been marked protected.')
  }
  async function create(role:'customer_backup'|'replacement') {
    if (!state) return
    assertDisposableSafe(state.safe)
    assertConfigurationWritable(state.safe)
    const credential=await createRecoveryCredential(publicClient,role,createdPasskey() || loadPasskey() || undefined)
    await verifyFreshCredential(publicClient,state.safe,state.owners,state.guardians,credential)
    const record={credential,signature:await signDigest(credential,metadataDigest(state.safe,state.module,credential))}
    const next={safe:state.safe,backup:role==='customer_backup'?record:backup,replacement:role==='replacement'?record:replacement}
    localStorage.setItem(draftKey,JSON.stringify(next)) // Public metadata and signatures only; original wallet keys untouched.
    if (role==='customer_backup')setBackup(record);else {setReplacement(record);setIntent(null);setApprovals([])}
    setStatus('New passkey created. Deploy its contract identity next; recovery is not complete.')
  }
  async function deploy(record:CredentialRecord|null) {
    if (!state || !record)return
    const result=await api({action:'deploy_credential',safe:state.safe,...record},true)
    if (result.transaction) {setRelay(result.transaction);setStatus('Signer deployment submitted or unresolved. Check its receipt before proceeding.')}
    else {await verifyCredentialBinding(publicClient,record.credential);setStatus('Signer identity has deployed code and matches this passkey.')}
  }
  async function publish(record:CredentialRecord) {
    if (!state)return
    await api({action:'publish_metadata',safe:state.safe,module:state.module,...record})
    setSavedBackup(record.credential);setStatus('Onchain guardian configuration and public credential metadata verified. Guardian availability still needs confirmation.')
  }
  async function ownerCall(calls:ReturnType<typeof enrollmentCalls>,description:string) {
    if (!state)return
    assertDisposableSafe(state.safe)
    assertConfigurationWritable(state.safe)
    const pk=rotated && replacement?replacement.credential.passkey:await currentPasskey(state.safe)
    if (!pk)throw new Error('RECOVERY_AUTHORIZED_SPENDING_PASSKEY_UNAVAILABLE')
    await authenticatePasskey(pk)
    const pack=await initializeWallet(pk,state.safe)
    await walletSnapshot(pack)
    const batch=await atomicBatch(pack,calls)
    const prepared=await prepareSponsoredTransaction(pack,state.safe,batch,sponsorshipReads,undefined,undefined,batchIntentValidator(batch))
    // Simulate the exact Safe execution path without committing state or bypassing signing.
    await publicClient.call({account:ENTRY_POINT,to:state.safe,data:prepared.operation.toUserOperation().callData as Hex})
    setStatus('Simulation passed. Approve the exact sponsored installation or repair with the spending passkey.')
    const proof=await sendPreparedRecovery(pack,prepared.operation,state.safe,prepared.paymasterAddress,description,setAttempt)
    if (proof) {setConfirmed(proof.transactionHash);await refresh()}
    else setStatus('Sponsored action is rejected, failed or unresolved. Check the preserved submission diagnostic and operation before any manual retry.')
    return proof
  }
  async function install() {
    if (!state || !backup || !bank)return
    if(!verifiedThird || !thirdProof)throw new Error('RECOVERY_THIRD_PARTY_POSSESSION_NOT_PROVEN')
    await verifyCredentialBinding(publicClient,backup.credential)
    const thirdAddress=address(third)
    await verifyEnrollmentProof(publicClient,enrollmentPreview(state,backup.credential.signer,bank,thirdAddress),thirdProof)
    if (state.enabled || state.guardians.length!==0 || state.threshold!==0n)throw new Error('RECOVERY_SETUP_REQUIRES_EMPTY_MODULE_STATE')
    if ([backup.credential.signer,bank,thirdAddress].some(g=>state.owners.some(o=>o.toLowerCase()===g.toLowerCase())))throw new Error('RECOVERY_GUARDIAN_IS_SPENDING_OWNER')
    if (!await ownerCall(enrollmentCalls(state.module,{safe:state.safe,backup:backup.credential,bank,third:thirdAddress}),'Atomic recovery enrollment; three guardians; threshold two'))return
    const current=await recoveryState(publicClient,state.safe)
    if (!current.protected || ![backup.credential.signer,bank,thirdAddress].every(a=>current.guardians.some(g=>g.toLowerCase()===a.toLowerCase())))throw new Error('RECOVERY_ENROLLMENT_UNCONFIRMED')
    await publish(backup)
  }
  async function importEnrollment(file:File) {
    setThirdProof(null)
    setStatus('Verifying independent guardian enrollment proof. No signing or sending.')
    if(!preview)throw new Error('RECOVERY_ENROLLMENT_INPUTS_REQUIRED')
    if(file.size>20000)throw new Error('RECOVERY_APPROVAL_FILE_INVALID')
    let value:unknown
    try{value=JSON.parse(await file.text())}catch{throw new Error('RECOVERY_APPROVAL_FILE_INVALID')}
    const proof=await verifyEnrollmentProof(publicClient,preview,value)
    if(currentEnrollmentHash.current!==proof.intentHash)throw new Error('RECOVERY_ENROLLMENT_CHANGED')
    setThirdProof(proof)
    setStatus('Independent guardian verified. Enrollment proof validated; protection has not been activated.')
  }
  async function prepareIntent() {
    if (!state || !replacement)return
    assertDisposableSafe(state.safe)
    await verifyCredentialBinding(publicClient,replacement.credential)
    const current=await refresh(),next=makeIntent(current,replacement.credential.signer)
    setIntent(next);setApprovals([]);setStatus('Replacement owner preview prepared. Each guardian must approve this same recovery intent.')
  }
  async function addApproval(approval:GuardianApproval) {
    if (!intent)return
    if (approvals.some(a=>a.signer.toLowerCase()===approval.signer.toLowerCase()))throw new Error('RECOVERY_DUPLICATE_GUARDIAN')
    await verifyApprovals(publicClient,intent,[approval],false)
    setApprovals([...approvals,approval]);setStatus('Guardian signature verified by the recovery module. Two distinct signatures are required.')
  }
  async function bankApprove() {
    if (!intent || !replacement)return
    const approval=await api({action:'bank_approve',intent,verifiedDemoIdentity:verified,...replacement},true)
    setOperator('');setVerified(false);await addApproval(approval)
  }
  async function thirdApprove() {
    if (!intent || !state)return
    const wallet=(window as Window & {ethereum?:Parameters<typeof independentWallet>[1]}).ethereum
    if (!wallet)throw new Error('RECOVERY_INDEPENDENT_WALLET_UNAVAILABLE_USE_APPROVAL_FILE')
    const accounts=await wallet.request({method:'eth_requestAccounts'}) as string[]
    const guardian=accounts?.[0]?address(accounts[0]):null
    if (!guardian || !state.guardians.some(g=>g.toLowerCase()===guardian.toLowerCase()) || guardian.toLowerCase()===bank?.toLowerCase()
      || guardian.toLowerCase()===savedBackup?.signer.toLowerCase())throw new Error('RECOVERY_WRONG_THIRD_PARTY_ACCOUNT')
    await addApproval(await independentWallet(publicClient,wallet,guardian).approve(intent))
  }
  async function start() {
    if (!intent || !replacement)return
    await verifyApprovals(publicClient,intent,approvals)
    const record=await api({action:'initiate',intent,approvals,...replacement})
    setRelay(record);setStatus('Recovery initiation submitted or unresolved. Check the receipt; the security delay has not yet been verified.')
  }
  async function checkRelay() {
    if (!relay || !state)return
    const receipt=await publicClient.waitForTransactionReceipt({hash:relay.hash,confirmations:2,timeout:120000})
    if (receipt.status!=='success')throw new Error('RECOVERY_TRANSACTION_REVERTED')
    let verifiedIntent:RecoveryIntent|null=null
    if (relay.action.startsWith('initiate recovery') || relay.action.startsWith('finalize recovery')) {
      const wanted=relay.action.startsWith('initiate')?'RecoveryExecuted':'RecoveryFinalized'
      verifiedIntent=recoveryReceiptIntent(receipt,state.module,state.safe,wanted,intent)
      setIntent(verifiedIntent)
    }
    const current=await refresh()
    setConfirmed(receipt.transactionHash)
    if (relay.action.startsWith('finalize') && verifiedIntent && current.owners.length===1 && current.owners[0].toLowerCase()===verifiedIntent.newOwner.toLowerCase()
      && current.spendingThreshold===1n && current.request.executableAt===0n) {
      setRotated(true);setReadiness(false);setStatus('Owner rotation confirmed on the original Safe address. Test the new spending passkey and review backup availability.')
    } else setStatus('Transaction receipt verified. Current recovery state has been refreshed from Sepolia.')
  }
  async function repair() {
    if (!state || !savedBackup || !backup)return
    await verifyCredentialBinding(publicClient,backup.credential)
    const index=state.guardians.findIndex(g=>g.toLowerCase()===savedBackup.signer.toLowerCase())
    if (index<0)throw new Error('RECOVERY_BACKUP_NOT_REGISTERED')
    const previous=index===0?'0x0000000000000000000000000000000000000001':state.guardians[index-1]
    if (!await ownerCall([{to:state.module,value:'0',data:recoveryCall('revokeGuardianWithThreshold',[previous,savedBackup.signer,2n])},
      {to:state.module,value:'0',data:recoveryCall('addGuardianWithThreshold',[backup.credential.signer,2n])}],'Atomic replacement of backup guardian; threshold remains two'))return
    await publish(backup);setReadiness(false)
  }
  async function testNewSigner() {
    if (!state || !replacement || !rotated)return
    assertDisposableSafe(state.safe)
    const pack=await initializeWallet(replacement.credential.passkey,state.safe)
    await walletSnapshot(pack)
    const mint=mintTransaction(state.safe)
    const prepared=await prepareSponsoredTransaction(pack,state.safe,mint.transaction,sponsorshipReads)
    const proof=await sendPreparedRecovery(pack,prepared.operation,state.safe,prepared.paymasterAddress,`Recovered Safe tutorial NFT mint: token ${mint.tokenId}; zero ETH transferred`,setAttempt)
    if (proof) {setConfirmed(proof.transactionHash);setStatus('A real sponsored transaction from the recovered Safe was independently verified. Zero ETH transferred.')}
  }
  if(guidedSetup)return <div className="guided-setup">
    <ol className="onboarding-progress" aria-label="Recovery setup">{['Backup passkey','Trusted friend','Confirm'].map((s,i)=><li key={s} aria-current={i===setupStep?'step':undefined} className={i<setupStep?'complete':''}><span>{i+1}</span>{s}</li>)}</ol>
    {error && <p className="alert" role="alert">{error}</p>}
    {!state?<section className="onboarding-card"><p role="status">{busy?'Checking your wallet…':'Your wallet could not be checked.'}</p><button disabled={busy} onClick={()=>run(find)}>Check again</button></section>:state.protected?<section className="onboarding-card"><h2>Recovery enabled onchain.</h2><p>{state.guardians.length} registered guardians · {state.threshold.toString()} approvals required.</p><p className="muted">Check backup access and confirm that your friend is reachable. Onchain registration alone does not prove availability.</p><a className="button button-primary" href="/protection">View your recovery settings</a></section>:<section className="onboarding-card">
      <p className="eyebrow">STEP {setupStep+1} OF 3</p>
      {setupStep===0?<><h2>Keep a separate way in.</h2><p className="muted">Create a backup passkey, different from the one you use to spend. Keep it somewhere you can access if you lose your usual device.</p>{!backup?<button className="button-primary onboarding-primary" disabled={busy} onClick={()=>run(()=>create('customer_backup'))}>Create backup passkey</button>:<><p className="positive">Backup passkey created. Your spending passkey is unchanged.</p><button className="button-primary onboarding-primary" disabled={busy} onClick={()=>run(()=>deploy(backup))}>Register backup on Sepolia</button><p className="small muted">This sends a funded registration transaction through the demo operator. It does not enable recovery yet.</p><button disabled={busy} onClick={()=>run(async()=>{await verifyCredentialBinding(publicClient,backup.credential);setSetupStep(1);setStatus('Backup identity verified on Sepolia. Choose your friend next.')})}>Continue to trusted friend</button></>}
        <details className="advanced"><summary>Demo operator setup</summary><p>The presenter must authorize funded backup registration. This is a demo service credential, not your Swissquote password.</p><label htmlFor="setup-operator">Demo operator credential</label><input id="setup-operator" type="password" value={operator} onChange={e=>setOperator(e.target.value)} autoComplete="off"/></details>
      </>:setupStep===1?<><h2>Choose someone you trust.</h2><p className="muted">A friend with an Ethereum wallet can be your third guardian. They approve the setup in their own wallet; you never need their private key.</p><label htmlFor="friend-address">Friend’s Ethereum address</label><input id="friend-address" value={third} onChange={e=>{setThird(e.target.value);setThirdProof(null)}} placeholder="0x…" spellCheck={false} autoComplete="off"/>
        <div className="friend-workflow"><div><span>1</span><h3>Share the invitation file</h3><p>Send the public request to your friend. No funds or private keys are included.</p><button disabled={busy || !preview} onClick={()=>preview && downloadPublicJson(preview,'continuity-enrollment-request.json')}>Download friend request</button></div><div><span>2</span><h3>Your friend approves</h3><p>They open the guardian page, upload the request, and sign with their own wallet.</p><a className="button" href="/guardian" target="_blank" rel="noreferrer">Open friend approval page ↗</a></div><div><span>3</span><h3>Upload their approval</h3><label htmlFor="setup-proof">Friend’s signed approval file</label><input id="setup-proof" type="file" accept=".json,application/json" disabled={busy || !preview} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(()=>importEnrollment(file))}}/>{verifiedThird && <p className="positive" role="status">Independent guardian verified: <code>{thirdProof?.signer}</code></p>}</div></div>
        <button className="button-primary onboarding-primary" disabled={busy || !verifiedThird} onClick={()=>setSetupStep(2)}>Review protection</button><button className="button-text" disabled={busy} onClick={()=>setSetupStep(0)}>Back to backup</button><p className="small muted">Email invitations are not implemented. This file workflow validates your friend’s actual signature.</p>
      </>:<><h2>Three guardians. Two approvals.</h2><p className="muted">You keep control of everyday spending. Recovery needs two guardians and an onchain waiting period.</p><div className="setup-guardians">{[['Your backup passkey',backup?.credential.signer],['Swissquote demo guardian',bank],['Your trusted friend',verifiedThird?thirdProof?.signer:null]].map(([label,value])=><div key={label}><strong>{label}</strong><code>{value || 'Not verified'}</code></div>)}</div><div className="notice">Any two guardians can replace your spending owner after {state.delay} seconds. This delay is test-only. Bank identity checks and institutional operation are simulated.</div><p className="small muted">Your wallet address and current spending owner stay unchanged. Approving the passkey prompt signs and broadcasts the atomic setup once.</p><button className="button-primary onboarding-primary" disabled={busy || !verifiedThird || !!attempt} onClick={()=>run(install)}>{busy?'Preparing protection…':'Enable recovery with passkey'}</button><button className="button-text" disabled={busy} onClick={()=>setSetupStep(1)}>Back to friend</button></>}
    </section>}
    <p className="small muted" role="status">{status}</p>
    {relay && <div className="setup-receipt"><p>Backup registration: receipt verification required.</p><a href={`${EXPLORER}/tx/${relay.hash}`} target="_blank" rel="noreferrer">View registration transaction ↗</a><button disabled={busy} onClick={()=>run(checkRelay)}>Check registration receipt</button></div>}
    {attempt && <section className="setup-receipt"><h3>Preserved protection attempt</h3><p>{attempt.state} · Bundler acceptance: {attempt.acceptance}</p>{attempt.submissionError && <p className="alert">{cleanError(new Error(attempt.submissionError.message))}</p>}<button disabled={busy} onClick={()=>run(async()=>{const result=await checkRecoveryAttempt(setAttempt);if(result){setConfirmed(result.transactionHash);await refresh()}})}>Check protection confirmation</button>{['included','rejected','failed'].includes(attempt.state) && <button disabled={busy} onClick={()=>run(async()=>{archiveRecoveryAttempt();setAttempt(null)})}>Preserve completed attempt</button>}</section>}
    {confirmed && <p className="positive"><a href={`${EXPLORER}/tx/${confirmed}`} target="_blank" rel="noreferrer">Verified transaction receipt ↗</a></p>}
  </div>
  const Container=embedded?'div':'main'
  return <Container className={embedded?'guardian-flow recovery-ceremony':undefined}>
    <h1>Recover your Continuity Wallet</h1><p>Ethereum Sepolia only. Your wallet address and assets stay in place during owner rotation.</p>
    <p><a href="/">Back to wallet</a></p><p role="status">{status}</p>{error && <p role="alert">{error}</p>}
    <section><h2>Find your wallet</h2><label>Safe address<input value={safeInput} onChange={e=>setSafeInput(e.target.value)} autoComplete="off"/></label>
      <button disabled={busy || !isAddress(safeInput.trim())} onClick={()=>run(find)}>Find wallet</button>
      {state && <><p><code>{state.safe}</code></p><p>{state.protected?'Recovery configured onchain':'Recovery incomplete'} · {state.guardians.length} guardians · approval threshold {state.threshold.toString()}</p>
        <p>{state.delay===180?'Test-only 3-minute security delay':`${state.delay/86400}-day security delay`}</p>
        <p>Guardian availability: {readiness?'Backup access verified; other guardians require independent confirmation.':'Not established. Registration does not prove current access.'}</p>
        <button disabled={busy} onClick={()=>run(async()=>{await refresh()})}>Refresh recovery state</button></>}
    </section>
    {state && <>
      <section><h2>Local demo operator</h2><p>Required for funded signer provisioning and the simulated bank approval. Initiation and finalization rely on valid onchain approvals and do not require this credential. Any funded independent account can also call the public recovery contract.</p>
        <label>Demo operator credential<input type="password" value={operator} onChange={e=>setOperator(e.target.value)} autoComplete="off"/></label>
      </section>
      <section><h2>Secure your recovery access</h2><p>Create a dedicated backup passkey. It is one guardian, even if your passkey provider syncs it across devices. Keep a separate failure domain where possible.</p>
        <button disabled={busy} onClick={()=>run(()=>create('customer_backup'))}>Create recovery passkey</button>
        {backup && <><p>Backup guardian <code>{backup.credential.signer}</code></p><button disabled={busy} onClick={()=>run(()=>deploy(backup))}>Deploy backup identity</button></>}
        {!state.protected && <><p>Demo institutional guardian: <code>{bank || 'Unavailable'}</code></p><label>Independent guardian address<input value={third} onChange={e=>{setThird(e.target.value);setThirdProof(null)}}/></label>
          <button disabled={busy || !backup || !bank || !isAddress(third)} onClick={()=>{if(backup && bank)downloadPublicJson(enrollmentPreview(state,backup.credential.signer,bank,address(third)),'continuity-enrollment-request.json')}}>Download independent guardian enrollment request</button>
          <p>The independent guardian opens <a href="/guardian" target="_blank" rel="noreferrer">the approval page</a> in their own wallet browser and returns a signed public approval file.</p>
          <label>Import guardian enrollment proof<input type="file" accept=".json,application/json" disabled={busy || !preview} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(()=>importEnrollment(file))}}/></label>
          <p role="status" aria-label="Independent guardian enrollment verification">{verifiedThird && thirdProof?<>Independent guardian verified: <code>{thirdProof.signer}</code>. Enrollment approval only; protection has not been activated.</>:'Independent guardian enrollment proof has not been verified.'}</p>
          <button disabled={busy || !verifiedThird} onClick={()=>run(install)}>Simulate and sign atomic protection setup</button></>}
        {state.protected && backup && <button disabled={busy} onClick={()=>run(repair)}>Sign replacement of backup guardian</button>}
        {state.protected && backup && !savedBackup && state.guardians.some(g=>g.toLowerCase()===backup.credential.signer.toLowerCase()) &&
          <button disabled={busy} onClick={()=>run(()=>publish(backup))}>Register public backup metadata</button>}
        {savedBackup && <button disabled={busy} onClick={()=>run(async()=>{const digest=metadataDigest(state.safe,state.module,savedBackup),signature=await signDigest(savedBackup,digest);
          if (await publicClient.readContract({address:savedBackup.signer,abi:erc1271Abi,functionName:'isValidSignature',args:[digest,signature]})!=='0x1626ba7e')throw new Error('RECOVERY_BACKUP_NOT_AVAILABLE');setReadiness(true)})}>Verify backup access</button>}
      </section>
      {state.protected && <section><h2>Prepare replacement access</h2><p>Use this from your replacement browser. Neither the old spending passkey nor the backup passkey is required when the other two guardians approve.</p>
        <button disabled={busy} onClick={()=>run(()=>create('replacement'))}>Create replacement spending passkey</button>
        {replacement && <><p>Proposed new owner <code>{replacement.credential.signer}</code></p><button disabled={busy} onClick={()=>run(()=>deploy(replacement))}>Deploy replacement identity</button>
          <button disabled={busy || state.request.executableAt!==0n} onClick={()=>run(prepareIntent)}>Prepare recovery preview</button></>}
        {intent && <><p>Wallet <code>{intent.safe}</code>; new owner <code>{intent.newOwner}</code>; spending threshold 1.</p><p>Approved intent <code>{intentHash(intent)}</code> · nonce {intent.nonce}</p>
          <button disabled={busy} onClick={()=>downloadPublicJson(intent,'continuity-recovery-request.json')}>Download request for independent guardian</button>
          <h3>Guardian approvals: {approvals.length} of 2</h3><ul>{approvals.map(a=><li key={a.signer}>Verified signature: <code>{a.signer}</code></li>)}</ul>
          <button disabled={busy || !savedBackup} onClick={()=>run(async()=>{if(savedBackup)await addApproval(await backupApproval(publicClient,intent,savedBackup))})}>Approve with backup passkey</button>
          <label><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/> Demo bank verification completed by operator (simulated identity check)</label>
          <button disabled={busy || !operator || !verified} onClick={()=>run(bankApprove)}>Request demo bank approval</button>
          <button disabled={busy} onClick={()=>run(thirdApprove)}>Approve from independent guardian wallet</button>
          <label>Or import independently signed public approval file<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{if(file.size>20000)throw new Error('RECOVERY_APPROVAL_FILE_TOO_LARGE');await addApproval(JSON.parse(await file.text()))})}}/></label>
          <button disabled={busy || approvals.length<2} onClick={()=>run(start)}>Start delayed recovery</button></>}
        {state.request.executableAt>0n && <><p>Onchain earliest finalization: {new Date(Number(state.request.executableAt)*1000).toISOString()}</p>
          <button disabled={busy || state.timestamp<state.request.executableAt} onClick={()=>run(async()=>{setRelay(await api({action:'finalize',safe:state.safe}));setStatus('Finalization submitted or unresolved. Verify the receipt before claiming recovery.')})}>Finalize recovery</button>
          <button disabled={busy} onClick={()=>run(()=>ownerCall([{to:state.module,value:'0',data:recoveryCall('cancelRecovery')}],'Cancel recovery using authorized spending owner'))}>Cancel with authorized spending passkey</button></>}
        {rotated && <button disabled={busy} onClick={()=>run(testNewSigner)}>Sign and send test NFT with replacement passkey</button>}
      </section>}
    </>}
    {relay && <section><h2>Relayer submission</h2><p>{relay.action} · {relay.state}; confirmation pending verification.</p><a href={`${EXPLORER}/tx/${relay.hash}`} target="_blank" rel="noreferrer">{relay.hash}</a>
      <button disabled={busy} onClick={()=>run(checkRelay)}>Check transaction receipt and recovery state</button></section>}
    {attempt && <section><h2>Preserved sponsored recovery attempt</h2><p>{attempt.description}</p><p>{attempt.state} · bundler acceptance: {attempt.acceptance}</p><code>{attempt.userOperationHash}</code>
      {attempt.submissionError && <dl><dt>Submission stage</dt><dd>{attempt.submissionError.stage}</dd><dt>HTTP status</dt><dd>{attempt.submissionError.httpStatus ?? 'Unavailable'}</dd>
        <dt>RPC/SDK error code</dt><dd>{attempt.submissionError.rpcCode ?? attempt.submissionError.sdkCode ?? 'Unavailable'}</dd><dt>Sanitized submission error</dt><dd>{attempt.submissionError.message}</dd></dl>}
      {attempt.lastError && <p>{attempt.lastError.message}</p>}<button disabled={busy} onClick={()=>run(async()=>{const proof=await checkRecoveryAttempt(setAttempt);if(proof){setConfirmed(proof.transactionHash);await refresh()}})}>Check sponsored operation</button>
      <button disabled={busy || !['included','rejected','failed'].includes(attempt.state)} onClick={()=>run(async()=>{archiveRecoveryAttempt();setAttempt(null)})}>Preserve completed attempt and enable manual next operation</button></section>}
    {confirmed && <p className="success">Verified Sepolia transaction: <a href={`${EXPLORER}/tx/${confirmed}`} target="_blank" rel="noreferrer">{confirmed}</a>. Review its verified postconditions above.</p>}
    <p className="notice">Any two guardians can replace your spending owner after the delay. Bank identity verification and institutional operation are simulated. Passkey sync is provider-dependent. Email and SMS alerts are not implemented. This local demo is not a production bank service.</p>
  </Container>
}

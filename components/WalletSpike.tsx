'use client'

import { useEffect, useRef, useState } from 'react'
import type { PasskeyArgType } from '@safe-global/protocol-kit'
import type { Safe4337Pack } from '@safe-global/relay-kit'
import { formatEther, type Hash } from 'viem'
import { CHAIN_ID, EXPLORER, NFT_ADDRESS, providerConfig } from '../lib/constants'
import { diagnose, type Diagnostic } from '../lib/diagnostics'
import { friendlyError, type Stage } from '../lib/errors'
import { assertPasskeySupport, authenticatePasskey, createPasskey, loadPasskey, savePasskey } from '../lib/passkeys'
import type { ConfirmedProof } from '../lib/proof'
import { diagnosticMintTransaction, mintTransaction, transferTransaction } from '../lib/transactions'
import { diagnoseSponsorship, prepareSponsoredTransaction, type SponsorshipReport } from '../lib/sponsorship'
import { assertOperationBudget } from '../lib/gas'
import { assertCustomerSpendingAllowed } from '../lib/product'
import { archivePending, checkNetworks, confirmOperation, initializeWallet, loadPending, operationHash, publicClient, savePending, sponsorshipReads, submitOperation, walletSnapshot, type PendingOperation, type WalletSnapshot } from '../lib/wallet'

const lifecycleText = {
  prepared: 'Prepared locally; no broadcast yet.',
  broadcasting: 'Broadcasting once; awaiting bundler acknowledgement.',
  accepted: 'Accepted by bundler; onchain success still unverified.',
  included: 'Included onchain and independently verified.',
  rejected: 'Rejected; no successful operation verified.',
  failed: 'Failed; no successful operation verified.',
  unknown: 'Unknown/unresolved; acceptance or confirmation is uncertain.',
}

function DiagnosticDisplay({ value }: { value: Diagnostic }) {
  return <dl>
    <dt>Stage</dt><dd>{value.stage}</dd>
    <dt>Time (UTC)</dt><dd>{value.at}</dd>
    <dt>HTTP status</dt><dd>{value.httpStatus ?? 'Unavailable (SDK/local/transport error)'}</dd>
    <dt>JSON-RPC error code</dt><dd>{value.rpcCode ?? 'Unavailable'}</dd>
    {value.sdkCode && <><dt>SDK error code</dt><dd>{value.sdkCode}</dd></>}
    <dt>Sanitized message</dt><dd>{value.message}</dd>
    <dt>May have been accepted</dt><dd>{value.acceptance === 'yes' ? 'Yes: acceptance evidence exists' : value.acceptance === 'no' ? 'No: not sent or explicitly rejected' : 'Unknown: preserve this attempt'}</dd>
  </dl>
}

export default function WalletSpike() {
  const [ready, setReady] = useState(false)
  const [supported, setSupported] = useState(false)
  const [passkey, setPasskey] = useState<PasskeyArgType | null>(null)
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null)
  const [pending, setPending] = useState<PendingOperation | null>(null)
  const [proof, setProof] = useState<ConfirmedProof | null>(null)
  const [includedHash, setIncludedHash] = useState<Hash | null>(null)
  const [resultDescription, setResultDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Create a passkey to begin.')
  const [error, setError] = useState('')
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [sponsorshipReport, setSponsorshipReport] = useState<SponsorshipReport | null>(null)
  const [kind, setKind] = useState<'transfer' | 'mint'>('mint')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('0.00001')
  const packRef = useRef<Safe4337Pack | null>(null)
  const lock = useRef(false)
  const pendingRef = useRef<PendingOperation | null>(null)

  useEffect(() => {
    setReady(true)
    try {
      assertPasskeySupport()
      setSupported(true)
      const stored = loadPasskey()
      setPasskey(stored)
      const operation = loadPending()
      pendingRef.current = operation
      setPending(operation)
      if (stored) setStatus('Saved public passkey metadata found. Authenticate to connect your Safe.')
    } catch (cause) { setError(friendlyError(cause, 'passkey')) }
  }, [])

  async function connect(create: boolean) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    let stage: Stage = create ? 'passkey' : 'authenticate'
    try {
      let signer = passkey
      if (create) {
        setStatus('Approve passkey creation in your browser.')
        signer = await createPasskey()
        // Save before network calls so a provider failure never loses metadata.
        savePasskey(signer)
        setPasskey(signer)
      } else {
        if (!signer) throw new Error('STORED_DATA')
        setStatus('Approve authentication with your original passkey.')
        await authenticatePasskey(signer)
      }
      stage = 'initialize'
      setStatus('Checking Sepolia and initializing the Safe account…')
      const pack = await initializeWallet(signer!)
      const snapshot = await walletSnapshot(pack)
      packRef.current = pack
      setWallet(snapshot)
      setKind(snapshot.balance > 0n ? 'transfer' : 'mint')
      setStatus('Safe initialized. Deployment happens with its first sponsored operation.')
    } catch (cause) {
      setError(friendlyError(cause, stage))
      setStatus('Connect step did not complete.')
    } finally { setBusy(false); lock.current = false }
  }

  async function refresh() {
    const pack = packRef.current
    if (!pack || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const snapshot = await walletSnapshot(pack)
      setWallet(snapshot)
      if (snapshot.balance > 0n) setKind('transfer')
    } catch (cause) { setError(friendlyError(cause, 'balance')) }
    finally { setBusy(false); lock.current = false }
  }

  function recordOperation(operation: PendingOperation) {
    pendingRef.current = operation
    setPending(operation)
    setStatus(lifecycleText[operation.state])
    if (operation.transactionHash) setIncludedHash(operation.transactionHash)
    savePending(operation)
  }

  async function finish(operation: PendingOperation) {
    setStatus('Waiting for inclusion and two Sepolia block confirmations…')
    const verified = await confirmOperation(operation, recordOperation)
    if (!verified) {
      const latest = pendingRef.current?.lastError
      if (latest) setError(friendlyError(new Error(latest.message), latest.stage))
      return
    }
    setProof(verified)
    setResultDescription(operation.description)
    setStatus('Onchain operation verified with two block confirmations.')
    // Keep the verified public record. Only a manual archive enables another send.
    // A refresh failure cannot change the already verified transaction result.
    if (packRef.current && passkey) {
      try {
        // Refresh the SDK signer after the first deployment: the tutorial's
        // shared signer is then configured and can authorize subsequent sends.
        const pack = await initializeWallet(passkey)
        packRef.current = pack
        setWallet(await walletSnapshot(pack))
      }
      catch (cause) { setError(friendlyError(cause, 'balance')) }
    }
  }

  async function send() {
    const pack = packRef.current
    if (!pack || !wallet || pending || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setDiagnostic(null)
    setProof(null)
    setIncludedHash(null)
    let stage: Stage = 'prepare'
    try {
      assertCustomerSpendingAllowed(wallet.address)
      providerConfig(true) // Missing policy blocks preparation before a passkey prompt.
      await checkNetworks()
      const balance = await publicClient.getBalance({ address: wallet.address })
      let transaction
      let description
      if (kind === 'transfer') {
        transaction = transferTransaction(wallet.address, recipient.trim(), amount.trim(), balance)
        description = `ETH transfer: ${amount.trim()} Sepolia ETH to ${transaction.to}`
      } else {
        const code = await publicClient.getCode({ address: NFT_ADDRESS })
        if (!code || code === '0x') throw new Error('MINT_UNAVAILABLE')
        const mint = mintTransaction(wallet.address)
        transaction = mint.transaction
        description = `Tutorial NFT mint: token ${mint.tokenId} to this Safe. Zero ETH transferred.`
      }
      setStatus('Estimating the UserOperation and requesting sponsorship…')
      const report: SponsorshipReport = { checks: {}, valid: false }
      let prepared
      try { prepared = await prepareSponsoredTransaction(pack, wallet.address, transaction, sponsorshipReads, report) }
      finally { setSponsorshipReport(report) }
      const { operation, paymasterAddress } = prepared
      const preparedHash = operationHash(operation.toUserOperation())
      stage = 'sign'
      setStatus('Prepared locally. Approve the transaction-bound passkey signature in your browser.')
      const signed = await pack.signSafeOperation(operation)
      // A larger real assertion must still fit before the single broadcast.
      // This checks size/budget only; SDK/bundler retain signature verification.
      assertOperationBudget(signed.toUserOperation())
      // Keep the local hash for ambiguous network failures, never as acceptance proof.
      const hash = operationHash(signed.toUserOperation())
      if (hash !== preparedHash) throw new Error('SPONSORSHIP_SIGNED_MISMATCH')
      const next: PendingOperation = { userOperationHash: hash, safeAddress: wallet.address, paymasterAddress, kind, description, state: 'prepared', acceptance: 'no', createdAt: new Date().toISOString() }
      recordOperation(next)
      stage = 'submit'
      const submitted = await submitOperation(signed, next, recordOperation)
      if (submitted.state !== 'accepted') {
        if (submitted.submissionError) setError(friendlyError(new Error(submitted.submissionError.message), 'submit'))
        return
      }
      stage = 'confirm'
      await finish(submitted)
    } catch (cause) {
      setError(friendlyError(cause, stage))
      const acceptance = pendingRef.current?.acceptance || 'no'
      const details = diagnose(cause, stage, acceptance)
      setDiagnostic(details)
      if (pendingRef.current) {
        const latest = { ...pendingRef.current, state: 'unknown' as const, lastError: details,
          ...(stage === 'submit' ? { submissionError: details } : {}) }
        pendingRef.current = latest
        setPending(latest)
        try { savePending(latest) } catch { /* Show the storage error without broadcasting again. */ }
      }
      setStatus('Operation has not been verified as successful.')
    } finally { setBusy(false); lock.current = false }
  }

  async function probeSponsorship() {
    if (!passkey || lock.current) return
    lock.current = true
    setBusy(true)
    setSponsorshipReport(null)
    try {
      // SDK initialization uses public metadata; no WebAuthn request is made.
      const pack = await initializeWallet(passkey)
      const safe = await pack.protocolKit.getAddress() as WalletSnapshot['address']
      const expected = [wallet?.address, pendingRef.current?.safeAddress].filter(Boolean)
      if (expected.some(address => safe.toLowerCase() !== address!.toLowerCase())) throw new Error('OWNER_MISMATCH')
      const mint = diagnosticMintTransaction(safe, pendingRef.current)
      const report = await diagnoseSponsorship(pack, safe, mint.transaction, sponsorshipReads)
      if (report.preparation) { report.preparation.tokenId = mint.tokenId; report.preparation.reusedPendingMint = mint.reusedPendingMint }
      setSponsorshipReport(report)
    } catch (cause) {
      setSponsorshipReport({ checks: {}, valid: false, error: diagnose(cause, 'prepare', 'no') })
    } finally { setBusy(false); lock.current = false }
  }

  async function checkPending() {
    if (!pending || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setProof(null)
    try { await finish(pending) }
    catch (cause) {
      setError(friendlyError(cause, 'confirm'))
      setDiagnostic(diagnose(cause, 'confirm', pendingRef.current?.acceptance || 'unknown'))
      setStatus('Operation has not been verified as successful.')
    } finally { setBusy(false); lock.current = false }
  }

  function dismissPending() {
    if (!pending || busy) return
    if (!window.confirm('This preserves the attempt in local history and enables a MANUAL new attempt; it does not send anything. Check Pimlico and Sepolia first. not_found or timeout does not prove rejection. An unresolved attempt could still execute, so a new attempt may duplicate the mint or transfer. Continue only if you have reviewed and accept this risk.')) return
    try { archivePending(pending); pendingRef.current = null; setPending(null); setIncludedHash(null); setDiagnostic(null); setError(''); setStatus('Previous attempt preserved. A new operation requires an explicit click and passkey approval.') }
    catch (cause) { setError(friendlyError(cause, 'confirm')) }
  }

  return <main>
    <h1>Swissquote Continuity Wallet</h1>
    <p><a href="/recovery">Secure recovery access or recover a wallet</a></p>
    <p>Safe + WebAuthn + sponsored ERC-4337 viability spike</p>
    <p className="notice">Ethereum Sepolia only · Chain ID {CHAIN_ID} · Testnet assets only</p>
    <p role="status" aria-live="polite">{status}</p>
    {error && <p role="alert">{error}</p>}
    {diagnostic && <section aria-label="Attempt diagnostic"><h2>Attempt diagnostic</h2><DiagnosticDisplay value={diagnostic} /></section>}
    {passkey && <section aria-label="Preparation-only sponsorship diagnostic">
      <h2>Preparation-only sponsorship diagnostic</h2>
      <p>Request a tutorial NFT sponsorship quote using the saved public wallet metadata. No passkey approval, signing, broadcast, or attempt-history changes. A valid quote is not an onchain transaction.</p>
      <button onClick={() => void probeSponsorship()} disabled={busy}>Diagnose NFT sponsorship (no signing or sending)</button>
      <p>The report applies the configured verification allowance, requests a fresh quote, re-estimates with its returned paymaster data and checks the serialized budget. An existing mint attempt supplies the original token ID. Sending runs these checks again before signing. This does not check bundler acceptance or prove a real passkey signature.</p>
      {sponsorshipReport?.gasTrace?.budgetCheck && !sponsorshipReport.gasTrace.budgetCheck.fits && <p className="notice">The estimated bundler budget exceeds 16,000,000 including the executor reserve. Signing is blocked.</p>}
      {sponsorshipReport && <pre>{JSON.stringify(sponsorshipReport, null, 2)}</pre>}
    </section>}

    <section>
      <h2>1. Create or authenticate a passkey</h2>
      <p>Use Chrome or Edge on <code>http://localhost:3000</code>. Your authenticator retains the private key.</p>
      <button onClick={() => void connect(true)} disabled={!ready || !supported || busy || !!passkey || !!pending}>Create passkey and initialize Safe</button>
      {passkey && <button onClick={() => void connect(false)} disabled={!supported || busy}>Authenticate and connect Safe</button>}
      {passkey && <p className="muted">Public credential metadata is saved in this browser. Keep this profile and hostname. Recovery requires separate onchain enrollment; registration and browser storage alone do not protect this wallet.</p>}
    </section>

    {wallet && <section>
      <h2>2. Safe account</h2>
      <dl>
        <dt>Safe address</dt><dd><code>{wallet.address}</code> · <a href={`${EXPLORER}/address/${wallet.address}`} target="_blank" rel="noreferrer">View Safe on Sepolia Etherscan</a></dd>
        <dt>Network</dt><dd>Ethereum Sepolia ({CHAIN_ID})</dd>
        <dt>Balance</dt><dd>{formatEther(wallet.balance)} Sepolia ETH</dd>
        <dt>Deployment</dt><dd>{wallet.deployed ? 'Deployed: code found on Sepolia' : 'Predicted address: not yet deployed'}</dd>
        <dt>Passkey contract owner · threshold 1</dt><dd><code>{wallet.owner}</code></dd>
      </dl>
      <button onClick={() => void refresh()} disabled={busy}>Refresh balance and deployment</button>
      {!wallet.deployed && <p>The predicted address can receive Sepolia ETH before deployment. The explorer may show no contract until the first operation is included.</p>}
    </section>}

    {wallet && <section>
      <h2>3. Sign and send a sponsored operation</h2>
      <label htmlFor="kind">Operation</label>
      <select id="kind" value={kind} onChange={event => setKind(event.target.value as 'transfer' | 'mint')} disabled={busy || !!pending}>
        <option value="transfer">Transfer Sepolia ETH to a distinct recipient (funded Safe)</option>
        <option value="mint">Mint official tutorial NFT (zero ETH transfer)</option>
      </select>
      {kind === 'transfer' ? <>
        <label htmlFor="recipient">Recipient address</label>
        <input id="recipient" value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="0x… distinct Sepolia recipient" disabled={busy || !!pending} autoComplete="off" spellCheck={false} />
        <label htmlFor="amount">Amount in Sepolia ETH</label>
        <input id="amount" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" disabled={busy || !!pending} />
        <p>Sponsorship pays gas. Your Safe must hold the ETH you transfer.</p>
      </> : <p>Call <code>safeMint</code> on the official tutorial contract <code>{NFT_ADDRESS}</code>. This creates an NFT for the Safe and deploys the Safe if needed. It is not an ETH asset transfer.</p>}
      <button onClick={() => void send()} disabled={busy || !!pending}>Sign and send sponsored {kind === 'transfer' ? 'ETH transfer' : 'NFT mint'}</button>
    </section>}

    {pending && <section>
      <h2>Pending or unresolved operation</h2>
      <p>{pending.description}</p>
      <p><strong>{lifecycleText[pending.state]}</strong></p>
      <p>Locally computed UserOperation hash (not proof of acceptance): <code>{pending.userOperationHash}</code></p>
      {pending.acknowledgement ? <p>Submission acknowledgement: <code>{pending.acknowledgement.hash}</code> · HTTP {pending.acknowledgement.httpStatus} · {pending.acknowledgement.at}</p>
        : <p>No submission acknowledgement recorded. Legacy attempts cannot recover their original submission response.</p>}
      <p>Bundler acceptance evidence: {pending.acceptance === 'yes' ? 'Yes' : pending.acceptance === 'no' ? 'No' : 'Unknown'}. A UserOperation hash is not a transaction hash.</p>
      {pending.checks && <p>Latest read-only checks: receipt {pending.checks.receipt}; by hash {pending.checks.byHash}; Pimlico status {pending.checks.status}. Checked {pending.lastCheckedAt}.</p>}
      {pending.submissionError && <div><h3>Preserved submission error</h3><DiagnosticDisplay value={pending.submissionError} /></div>}
      {pending.lastError && pending.lastError.at !== pending.submissionError?.at && <div><h3>Latest check error</h3><DiagnosticDisplay value={pending.lastError} /></div>}
      {pending.checkErrors?.map((value, index) => <div key={index}><h3>Preserved provider lookup error</h3><DiagnosticDisplay value={value} /></div>)}
      <button onClick={() => void checkPending()} disabled={busy}>Check pending operation</button>
      <button onClick={dismissPending} disabled={busy}>Preserve attempt and enable manual retry</button>
    </section>}

    {includedHash && !proof && <p>Bundler-reported transaction hash, verification incomplete: <a href={`${EXPLORER}/tx/${includedHash}`} target="_blank" rel="noreferrer">Inspect transaction on Sepolia</a></p>}
    {proof && <section className="success">
      <h2>Confirmed onchain</h2>
      <p>{resultDescription}</p>
      <p>RPC receipt successful; matching successful sponsored EntryPoint event; deployed Safe code; two block confirmations.</p>
      <dl>
        <dt>Actual transaction hash</dt><dd><code>{proof.transactionHash}</code></dd>
        <dt>UserOperation hash</dt><dd><code>{proof.userOperationHash}</code></dd>
        <dt>Block</dt><dd>{proof.blockNumber}</dd>
        <dt>Gas sponsor</dt><dd><code>{proof.paymaster}</code></dd>
      </dl>
      <a href={`${EXPLORER}/tx/${proof.transactionHash}`} target="_blank" rel="noreferrer">View confirmed transaction on Sepolia Etherscan</a>
    </section>}
  </main>
}

'use client'

import { useEffect, useRef, useState } from 'react'
import type { PasskeyArgType } from '@safe-global/protocol-kit'
import type { Safe4337Pack } from '@safe-global/relay-kit'
import { formatEther, type Hash } from 'viem'
import { CHAIN_ID, EXPLORER, NFT_ADDRESS } from '../lib/constants'
import { friendlyError, type Stage } from '../lib/errors'
import { assertPasskeySupport, authenticatePasskey, createPasskey, loadPasskey, savePasskey } from '../lib/passkeys'
import type { ConfirmedProof } from '../lib/proof'
import { mintTransaction, transferTransaction } from '../lib/transactions'
import { checkNetworks, clearPending, confirmOperation, initializeWallet, loadPending, operationHash, publicClient, savePending, walletSnapshot, type PendingOperation, type WalletSnapshot } from '../lib/wallet'

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
  const [kind, setKind] = useState<'transfer' | 'mint'>('mint')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('0.00001')
  const packRef = useRef<Safe4337Pack | null>(null)
  const lock = useRef(false)

  useEffect(() => {
    setReady(true)
    try {
      assertPasskeySupport()
      setSupported(true)
      const stored = loadPasskey()
      setPasskey(stored)
      setPending(loadPending())
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

  async function finish(operation: PendingOperation) {
    setStatus('Waiting for inclusion and two Sepolia block confirmations…')
    const verified = await confirmOperation(operation, setIncludedHash)
    setProof(verified)
    setResultDescription(operation.description)
    setStatus('Onchain operation verified with two block confirmations.')
    try { clearPending(); setPending(null) }
    catch (cause) { setError(friendlyError(cause, 'confirm')) }
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
    setProof(null)
    setIncludedHash(null)
    let stage: Stage = 'prepare'
    try {
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
      const operation = await pack.createTransaction({ transactions: [transaction] })
      stage = 'sign'
      setStatus('Approve the transaction-bound passkey signature in your browser.')
      const signed = await pack.signSafeOperation(operation)
      // Persist the deterministic hash before broadcasting. An ambiguous network
      // failure can be checked after reload without submitting a duplicate.
      const hash = operationHash(signed.toUserOperation())
      const next: PendingOperation = { userOperationHash: hash, safeAddress: wallet.address, kind, description }
      savePending(next)
      setPending(next)
      stage = 'submit'
      setStatus('Submitting the signed sponsored UserOperation to Pimlico…')
      const returnedHash = await pack.executeTransaction({ executable: signed })
      if (returnedHash.toLowerCase() !== hash.toLowerCase()) throw new Error('EVIDENCE_MISMATCH')
      stage = 'confirm'
      await finish(next)
    } catch (cause) {
      setError(friendlyError(cause, stage))
      setStatus('Operation has not been verified as successful.')
    } finally { setBusy(false); lock.current = false }
  }

  async function checkPending() {
    if (!pending || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try { await finish(pending) }
    catch (cause) {
      setError(friendlyError(cause, 'confirm'))
      setStatus('Operation has not been verified as successful.')
    } finally { setBusy(false); lock.current = false }
  }

  function dismissPending() {
    if (!pending || busy) return
    if (!window.confirm('Only dismiss after Pimlico confirms this operation was rejected/dropped, or the explorer shows it failed. Dismissing an unresolved operation can allow a duplicate transfer. Continue?')) return
    try { clearPending(); setPending(null); setIncludedHash(null) }
    catch (cause) { setError(friendlyError(cause, 'confirm')) }
  }

  return <main>
    <h1>Swissquote Continuity Wallet</h1>
    <p>Safe + WebAuthn + sponsored ERC-4337 viability spike</p>
    <p className="notice">Ethereum Sepolia only · Chain ID {CHAIN_ID} · Testnet assets only</p>
    <p role="status" aria-live="polite">{status}</p>
    {error && <p role="alert">{error}</p>}

    <section>
      <h2>1. Create or authenticate a passkey</h2>
      <p>Use Chrome or Edge on <code>http://localhost:3000</code>. Your authenticator retains the private key.</p>
      <button onClick={() => void connect(true)} disabled={!ready || !supported || busy || !!passkey || !!pending}>Create passkey and initialize Safe</button>
      {passkey && <button onClick={() => void connect(false)} disabled={!supported || busy}>Authenticate and connect Safe</button>}
      {passkey && <p className="muted">Public credential metadata is saved in this browser. Keep this profile and hostname. Clearing browser data is outside this spike; recovery is not implemented.</p>}
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
      <p>UserOperation hash (not a transaction hash): <code>{pending.userOperationHash}</code></p>
      <p>No success has been claimed. This operation might already have been submitted; check it before sending again.</p>
      <button onClick={() => void checkPending()} disabled={busy}>Check pending operation</button>
      <button onClick={dismissPending} disabled={busy}>Dismiss after confirming rejection or failure</button>
    </section>}

    {includedHash && !proof && <p>Bundler-reported inclusion, verification incomplete: <a href={`${EXPLORER}/tx/${includedHash}`} target="_blank" rel="noreferrer">Inspect transaction on Sepolia</a></p>}
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

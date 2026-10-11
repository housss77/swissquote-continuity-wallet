import Safe, { type PasskeyArgType } from '@safe-global/protocol-kit'
import { Safe4337Pack } from '@safe-global/relay-kit'
import { userOperationToHexValues } from '@safe-global/relay-kit/dist/src/packs/safe-4337/utils'
import { createPublicClient, getAddress, http, isAddress, parseAbi, zeroAddress, type Address, type Hash, type Hex } from 'viem'
import { getUserOperationHash } from 'viem/account-abstraction'
import { assertSepolia, CHAIN, CHAIN_ID, ENTRY_POINT, PAYMASTER_ADDRESS, PENDING_KEY, providerConfig, RPC_URL } from './constants'
import { verifyReceipt } from './proof'
import { diagnose, scrubMessage, type Diagnostic } from './diagnostics'
import { broadcastOperation, inspectOperation, isHash, pollOperation, rpcRequest, type BundlerReceipt, type PendingOperation } from './operations'
import { extractPaymaster, type SponsorshipReads } from './sponsorship'
export type { PendingOperation } from './operations'

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL, { timeout: 12_000, retryCount: 1 }),
})

export const sponsorshipReads: SponsorshipReads = {
  getChainId: () => publicClient.getChainId(),
  getCode: address => publicClient.getCode({ address }),
  getPaymasterEntryPoint: address => publicClient.readContract({ address,
    abi: parseAbi(['function entryPoint() view returns (address)']), functionName: 'entryPoint' }),
}

export type WalletSnapshot = { address: Address; balance: bigint; deployed: boolean; owner: Address }
async function bundlerRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const { bundlerUrl } = providerConfig()
  return (await rpcRequest<T>(bundlerUrl, method, params)).result
}

export async function checkNetworks() {
  const [rpcId, bundlerId] = await Promise.all([
    publicClient.getChainId(),
    bundlerRpc<string>('eth_chainId'),
  ])
  assertSepolia(rpcId)
  assertSepolia(BigInt(bundlerId))
}

export async function initializeWallet(passkey: PasskeyArgType, existingSafe?: Address): Promise<Safe4337Pack> {
  await checkNetworks()
  const supported = await bundlerRpc<string[]>('eth_supportedEntryPoints')
  if (!supported.some(address => address.toLowerCase() === ENTRY_POINT.toLowerCase())) {
    throw new Error('BUNDLER_ENTRYPOINT_UNSUPPORTED')
  }
  const config = providerConfig()
  let estimationOwner:Address|undefined
  if (existingSafe) {
    const existing=await Safe.init({provider:RPC_URL,signer:passkey,safeAddress:existingSafe})
    const [owners,threshold,signer]=await Promise.all([existing.getOwners(),existing.getThreshold(),existing.getSafeProvider().getSignerAddress()])
    if (threshold!==1 || owners.length!==1 || !signer || owners[0].toLowerCase()!==signer.toLowerCase())throw new Error('OWNER_MISMATCH')
    estimationOwner=getAddress(signer)
  }
  const pack = await Safe4337Pack.init({
    provider: RPC_URL,
    signer: passkey,
    bundlerUrl: config.bundlerUrl,
    safeModulesVersion: '0.2.0',
    // In Relay Kit 3.1.0 the existing-Safe branch never initializes this
    // dummy-signature address. Its supported override must name the verified
    // current contract owner, including a recovered standalone passkey proxy.
    customContracts: { entryPointAddress: ENTRY_POINT, ...(estimationOwner?{safeWebAuthnSharedSignerAddress:estimationOwner}:{}) },
    paymasterOptions: {
      isSponsored: true,
      paymasterUrl: config.paymasterUrl,
      sponsorshipPolicyId: config.sponsorshipPolicyId,
      // Estimation seed only; the validated response determines the final sponsor.
      ...{ paymasterAddress: PAYMASTER_ADDRESS },
    },
    options: existingSafe ? { safeAddress: existingSafe } : { owners: [], threshold: 1, safeVersion: '1.4.1', saltNonce: '0' },
  })
  assertSepolia(BigInt(await pack.getChainId()))
  return pack
}

export async function walletSnapshot(pack: Safe4337Pack): Promise<WalletSnapshot> {
  assertSepolia(await publicClient.getChainId())
  const address = getAddress(await pack.protocolKit.getAddress())
  const [balance, code, owners, threshold, signer] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.getCode({ address }),
    pack.protocolKit.getOwners(),
    pack.protocolKit.getThreshold(),
    pack.protocolKit.getSafeProvider().getSignerAddress(),
  ])
  const deployed = !!code && code !== '0x'
  // Before deployment the tutorial uses a shared owner configured in the Safe
  // setup call. The SDK's standalone signer address differs until deployment.
  const sharedSigner = await pack.protocolKit.getSafeProvider().getSafeWebAuthnSharedSignerContract({ safeVersion: '1.4.1' })
  const expectedOwner = deployed ? signer : await sharedSigner.getAddress()
  if (threshold !== 1 || owners.length !== 1 || !expectedOwner || owners[0].toLowerCase() !== expectedOwner.toLowerCase()) {
    throw new Error('OWNER_MISMATCH')
  }
  return { address, balance, deployed, owner: getAddress(owners[0]) }
}

export function operationHash(operation: ReturnType<Awaited<ReturnType<Safe4337Pack['signSafeOperation']>>['toUserOperation']>): Hash {
  return getUserOperationHash({
    chainId: CHAIN_ID,
    entryPointAddress: ENTRY_POINT,
    entryPointVersion: '0.6',
    userOperation: {
      sender: getAddress(operation.sender),
      nonce: BigInt(operation.nonce),
      initCode: operation.initCode as Hex,
      callData: operation.callData as Hex,
      callGasLimit: operation.callGasLimit,
      verificationGasLimit: operation.verificationGasLimit,
      preVerificationGas: operation.preVerificationGas,
      maxFeePerGas: operation.maxFeePerGas,
      maxPriorityFeePerGas: operation.maxPriorityFeePerGas,
      paymasterAndData: operation.paymasterAndData as Hex,
      signature: operation.signature as Hex,
    },
  })
}

export function savePending(pending: PendingOperation) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)) }
  catch { throw new Error('STORED_DATA') }
}

export function loadPending(): PendingOperation | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PendingOperation | null
    if (!data) return null
    if (!/^0x[a-fA-F0-9]{64}$/.test(data.userOperationHash) || !isAddress(data.safeAddress)
      || !['mint', 'transfer'].includes(data.kind) || typeof data.description !== 'string') throw new Error('STORED_DATA')
    if (data.paymasterAddress !== undefined && (!isAddress(data.paymasterAddress) || data.paymasterAddress.toLowerCase() === zeroAddress)) throw new Error('STORED_DATA')
    const states = ['prepared', 'broadcasting', 'accepted', 'included', 'rejected', 'failed', 'unknown']
    // Old records have no evidence of acceptance. Reload never resumes a send.
    const state = states.includes(data.state) && !['broadcasting', 'included'].includes(data.state) ? data.state : 'unknown'
    const acceptance = ['no', 'yes', 'unknown'].includes(data.acceptance) ? data.acceptance : 'unknown'
    const cleanDiagnostic = (value?: Diagnostic): Diagnostic | undefined => value && typeof value.message === 'string'
      ? { ...diagnose({ message: value.message, code: value.rpcCode, status: value.httpStatus }, value.stage, value.acceptance), at: value.at, sdkCode: value.sdkCode ? scrubMessage(value.sdkCode) : undefined }
      : undefined
    return {
      userOperationHash: data.userOperationHash, safeAddress: data.safeAddress, paymasterAddress: data.paymasterAddress, kind: data.kind,
      description: data.description, state, acceptance, createdAt: data.createdAt,
      acknowledgement: data.acknowledgement && isHash(data.acknowledgement.hash)
        ? { hash: data.acknowledgement.hash, at: data.acknowledgement.at, httpStatus: data.acknowledgement.httpStatus } : undefined,
      transactionHash: isHash(data.transactionHash) ? data.transactionHash : undefined,
      submissionError: cleanDiagnostic(data.submissionError), lastError: cleanDiagnostic(data.lastError),
      checkErrors: Array.isArray(data.checkErrors) ? data.checkErrors.map(cleanDiagnostic).filter((value): value is Diagnostic => !!value) : undefined,
      lastCheckedAt: data.lastCheckedAt, checks: data.checks,
    }
  } catch { throw new Error('STORED_DATA') }
}

export function archivePending(pending: PendingOperation) {
  // Retain the attempt and its errors; never delete any credential or attempt.
  try {
    const key = `${PENDING_KEY}-history`
    const history = JSON.parse(localStorage.getItem(key) || '[]') as PendingOperation[]
    if (!Array.isArray(history)) throw new Error('STORED_DATA')
    localStorage.setItem(key, JSON.stringify([...history, pending]))
    localStorage.setItem(PENDING_KEY, 'null')
  }
  catch { throw new Error('STORED_DATA') }
}

export async function submitOperation(signed: Awaited<ReturnType<Safe4337Pack['signSafeOperation']>>, pending: PendingOperation, update: (value: PendingOperation) => void) {
  const { bundlerUrl } = providerConfig(true)
  const operation = signed.toUserOperation()
  if (!pending.paymasterAddress || extractPaymaster(operation.paymasterAndData).toLowerCase() !== pending.paymasterAddress.toLowerCase()
    || operation.sender.toLowerCase() !== pending.safeAddress.toLowerCase() || operationHash(operation) !== pending.userOperationHash) throw new Error('SPONSORSHIP_SIGNED_MISMATCH')
  // Relay Kit 3.1.0 executeTransaction does exactly this RPC with this SDK serializer.
  // Keep SDK preparation/signing intact; use one observable, non-retrying POST.
  const params = [userOperationToHexValues(operation), ENTRY_POINT]
  return broadcastOperation(pending, () => rpcRequest<Hash>(bundlerUrl, 'eth_sendUserOperation', params), update)
}

export async function verifyOperationInclusion(pending: PendingOperation, result: BundlerReceipt | null, remainingMs: number) {
  const hash = result?.receipt.transactionHash || pending.transactionHash
  if (!isHash(hash)) throw new Error('EVIDENCE_MISMATCH')
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: remainingMs })
    .catch((error: unknown) => {
      if ((error as { name?: string })?.name === 'WaitForTransactionReceiptTimeoutError') throw new Error('CONFIRMATION_TIMEOUT')
      throw error
    })
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('EVIDENCE_MISMATCH')
  const proof = verifyReceipt(receipt, pending.userOperationHash, pending.safeAddress, pending.paymasterAddress)
  if (result && !result.success) throw new Error('EVIDENCE_MISMATCH')
  const code = await publicClient.getCode({ address: pending.safeAddress, blockNumber: receipt.blockNumber })
  if (!code || code === '0x') throw new Error('EVIDENCE_MISMATCH')
  const sponsorCode = await publicClient.getCode({ address: proof.paymaster, blockNumber: receipt.blockNumber })
  if (!sponsorCode || sponsorCode === '0x') throw new Error('EVIDENCE_MISMATCH')
  return proof
}

export async function confirmOperation(pending: PendingOperation, update: (value: PendingOperation) => void) {
  try {
    await checkNetworks()
    const { bundlerUrl } = providerConfig()
    return await pollOperation(pending, {
      inspect: value => inspectOperation(value, (method, params) => rpcRequest(bundlerUrl, method, params), ENTRY_POINT),
      verify: verifyOperationInclusion,
      update,
    })
  } catch (error) {
    update({ ...pending, state: 'unknown', lastError: diagnose(error, 'confirm', pending.acceptance) })
    return null
  }
}

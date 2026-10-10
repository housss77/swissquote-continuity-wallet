import type { PasskeyArgType } from '@safe-global/protocol-kit'
import { Safe4337Pack } from '@safe-global/relay-kit'
import { createPublicClient, getAddress, http, isAddress, type Address, type Hash, type Hex } from 'viem'
import { getUserOperationHash } from 'viem/account-abstraction'
import { assertSepolia, CHAIN, CHAIN_ID, ENTRY_POINT, PAYMASTER_ADDRESS, PENDING_KEY, providerConfig, RPC_URL } from './constants'
import { verifyReceipt } from './proof'

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL, { timeout: 12_000, retryCount: 1 }),
})

export type WalletSnapshot = { address: Address; balance: bigint; deployed: boolean; owner: Address }
export type PendingOperation = {
  userOperationHash: Hash
  safeAddress: Address
  kind: 'transfer' | 'mint'
  description: string
}

async function bundlerRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const { bundlerUrl } = providerConfig()
  const response = await fetch(bundlerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'API_KEY_REJECTED 401' : 'RPC_NETWORK')
  const body = await response.json() as { result?: T; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message || 'BUNDLER_FAILURE')
  if (!('result' in body)) throw new Error('BUNDLER_FAILURE')
  return body.result as T
}

export async function checkNetworks() {
  const [rpcId, bundlerId] = await Promise.all([
    publicClient.getChainId(),
    bundlerRpc<string>('eth_chainId'),
  ])
  assertSepolia(rpcId)
  assertSepolia(BigInt(bundlerId))
}

export async function initializeWallet(passkey: PasskeyArgType): Promise<Safe4337Pack> {
  await checkNetworks()
  const supported = await bundlerRpc<string[]>('eth_supportedEntryPoints')
  if (!supported.some(address => address.toLowerCase() === ENTRY_POINT.toLowerCase())) {
    throw new Error('BUNDLER_ENTRYPOINT_UNSUPPORTED')
  }
  const config = providerConfig()
  const pack = await Safe4337Pack.init({
    provider: RPC_URL,
    signer: passkey,
    bundlerUrl: config.bundlerUrl,
    safeModulesVersion: '0.2.0',
    customContracts: { entryPointAddress: ENTRY_POINT },
    paymasterOptions: {
      isSponsored: true,
      paymasterUrl: config.paymasterUrl,
      sponsorshipPolicyId: config.sponsorshipPolicyId,
      // The tutorial seeds estimation with the EntryPoint 0.6 paymaster address.
      ...{ paymasterAddress: PAYMASTER_ADDRESS },
    },
    options: { owners: [], threshold: 1, safeVersion: '1.4.1', saltNonce: '0' },
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
    const data = JSON.parse(raw) as PendingOperation
    if (!/^0x[a-fA-F0-9]{64}$/.test(data.userOperationHash) || !isAddress(data.safeAddress)
      || !['mint', 'transfer'].includes(data.kind) || typeof data.description !== 'string') throw new Error('STORED_DATA')
    return data
  } catch { throw new Error('STORED_DATA') }
}

export function clearPending() {
  try { localStorage.removeItem(PENDING_KEY) }
  catch { throw new Error('STORED_DATA') }
}

export async function confirmOperation(pending: PendingOperation, onTransaction: (hash: Hash) => void) {
  await checkNetworks()
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const result = await bundlerRpc<{
      userOpHash: string
      sender: string
      success: boolean
      receipt: { transactionHash: string }
    } | null>('eth_getUserOperationReceipt', [pending.userOperationHash])
    if (result) {
      if (result.userOpHash.toLowerCase() !== pending.userOperationHash.toLowerCase()
        || result.sender.toLowerCase() !== pending.safeAddress.toLowerCase()
        || !/^0x[a-fA-F0-9]{64}$/.test(result.receipt.transactionHash)) throw new Error('EVIDENCE_MISMATCH')
      const hash = result.receipt.transactionHash as Hash
      onTransaction(hash)
      // Independently query the chain; never trust a bundler's success flag.
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
        timeout: Math.max(1, deadline - Date.now()),
      }).catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'WaitForTransactionReceiptTimeoutError') throw new Error('CONFIRMATION_TIMEOUT')
        throw error
      })
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('EVIDENCE_MISMATCH')
      const proof = verifyReceipt(receipt, pending.userOperationHash, pending.safeAddress)
      if (!result.success) throw new Error('EVIDENCE_MISMATCH')
      const code = await publicClient.getCode({ address: pending.safeAddress, blockNumber: receipt.blockNumber })
      if (!code || code === '0x') throw new Error('EVIDENCE_MISMATCH')
      return proof
    }
    await new Promise(resolve => setTimeout(resolve, 3_000))
  }
  throw new Error('CONFIRMATION_TIMEOUT')
}

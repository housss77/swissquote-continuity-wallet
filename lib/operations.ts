import type { Address, Hash } from 'viem'
import { diagnose, isDefiniteRejection, RpcFailure, type Acceptance, type Diagnostic } from './diagnostics'
import type { ConfirmedProof } from './proof'

export type OperationState = 'prepared' | 'broadcasting' | 'accepted' | 'included' | 'rejected' | 'failed' | 'unknown'
export type PendingOperation = {
  userOperationHash: Hash
  safeAddress: Address
  kind: 'transfer' | 'mint'
  description: string
  state: OperationState
  acceptance: Acceptance
  createdAt?: string
  acknowledgement?: { hash: Hash; at: string; httpStatus: number }
  transactionHash?: Hash
  submissionError?: Diagnostic
  lastError?: Diagnostic
  checkErrors?: Diagnostic[]
  lastCheckedAt?: string
  checks?: { receipt: string; byHash: string; status: string }
}
export type RpcResult<T> = { result: T; httpStatus: number }
export type OperationRpc = <T>(method: string, params: unknown[]) => Promise<RpcResult<T>>
export type BundlerReceipt = { userOpHash: string; sender: string; success: boolean; receipt: { transactionHash: Hash } }
type Lookup = { userOperation: { sender: string }; entryPoint: string; transactionHash?: Hash | null }
type ProviderStatus = { status: string; transactionHash: Hash | null }
export const isHash = (value: unknown): value is Hash => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)

// A single fetch, with no retry, redirect, logging, or request data in errors.
export async function rpcRequest<T>(url: string, method: string, params: unknown[], fetcher: typeof fetch = fetch): Promise<RpcResult<T>> {
  let response: Response
  try {
    response = await fetcher(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(method === 'eth_sendUserOperation' ? 30_000 : 12_000),
    })
  } catch (error) {
    throw new RpcFailure(error instanceof Error && error.name === 'TimeoutError' ? 'RPC request timed out; acknowledgement unavailable' : 'RPC network request failed; acknowledgement unavailable')
  }
  let body: { result?: T; error?: { code?: number; message?: string }; id?: unknown }
  try { body = await response.json() }
  catch { throw new RpcFailure('Provider returned a non-JSON response', response.status) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RpcFailure('Invalid JSON-RPC response', response.status)
  if (body.error) throw new RpcFailure(body.error.message || 'JSON-RPC error', response.status, body.error.code)
  if (!response.ok) throw new RpcFailure(`Provider HTTP ${response.status}`, response.status)
  if (body.id !== 1 || !('result' in body)) throw new RpcFailure('Invalid JSON-RPC acknowledgement', response.status)
  return { result: body.result as T, httpStatus: response.status }
}

export async function broadcastOperation(operation: PendingOperation, submit: () => Promise<RpcResult<Hash>>, update: (value: PendingOperation) => void): Promise<PendingOperation> {
  let current: PendingOperation = { ...operation, state: 'broadcasting', acceptance: 'unknown' }
  update(current) // Persistence must succeed BEFORE any request can be sent.
  try {
    const { result, httpStatus } = await submit()
    if (!isHash(result)) throw new RpcFailure('Invalid bundler hash acknowledgement', httpStatus)
    current = { ...current, acknowledgement: { hash: result, httpStatus, at: new Date().toISOString() }, acceptance: 'yes' }
    if (result.toLowerCase() !== current.userOperationHash.toLowerCase()) {
      throw new RpcFailure('EVIDENCE_MISMATCH: acknowledged hash differs from locally computed hash', httpStatus)
    }
    current = { ...current, state: 'accepted' }
  } catch (error) {
    const rejected = !current.acknowledgement && isDefiniteRejection(error)
    const acceptance = current.acknowledgement ? 'yes' : rejected ? 'no' : 'unknown'
    const diagnostic = diagnose(error, 'submit', acceptance)
    current = { ...current, state: rejected ? 'rejected' : 'unknown', acceptance, submissionError: diagnostic, lastError: diagnostic }
  }
  update(current)
  return current
}

export async function inspectOperation(operation: PendingOperation, rpc: OperationRpc, entryPoint: Address): Promise<{ operation: PendingOperation; receipt: BundlerReceipt | null }> {
  const results = await Promise.allSettled([
    rpc<BundlerReceipt | null>('eth_getUserOperationReceipt', [operation.userOperationHash]),
    rpc<Lookup | null>('eth_getUserOperationByHash', [operation.userOperationHash]),
    rpc<ProviderStatus>('pimlico_getUserOperationStatus', [operation.userOperationHash]),
  ])
  const [receiptResult, lookupResult, statusResult] = results
  const receipt = receiptResult.status === 'fulfilled' ? receiptResult.value.result : null
  const lookup = lookupResult.status === 'fulfilled' ? lookupResult.value.result : null
  const status = statusResult.status === 'fulfilled' ? statusResult.value.result : null
  let current: PendingOperation = { ...operation, lastCheckedAt: new Date().toISOString(), checks: {
    receipt: receiptResult.status === 'rejected' ? 'error' : receipt ? 'found' : 'null',
    byHash: lookupResult.status === 'rejected' ? 'error' : lookup ? 'found' : 'null',
    status: statusResult.status === 'rejected' ? 'unavailable' : ['not_found', 'not_submitted', 'submitted', 'rejected', 'included', 'failed', 'queued'].includes(status?.status || '') ? status!.status : 'unknown',
  } }
  if (receipt && (receipt.userOpHash.toLowerCase() !== operation.userOperationHash.toLowerCase()
    || receipt.sender.toLowerCase() !== operation.safeAddress.toLowerCase() || !isHash(receipt.receipt.transactionHash))) throw new Error('EVIDENCE_MISMATCH')
  if (lookup && (lookup.userOperation.sender.toLowerCase() !== operation.safeAddress.toLowerCase()
    || lookup.entryPoint.toLowerCase() !== entryPoint.toLowerCase())) throw new Error('EVIDENCE_MISMATCH')
  if (operation.acknowledgement && operation.acknowledgement.hash.toLowerCase() !== operation.userOperationHash.toLowerCase()) throw new Error('EVIDENCE_MISMATCH')
  const readError = results.find(result => result.status === 'rejected')
  if (readError?.status === 'rejected') current.lastError = diagnose(readError.reason, 'confirm', current.acceptance)
  const errors = results.flatMap(result => result.status === 'rejected' ? [diagnose(result.reason, 'confirm', current.acceptance)] : [])
  if (errors.length) current.checkErrors = errors
  if (receipt || lookup || ['queued', 'not_submitted', 'submitted', 'included'].includes(status?.status || '')) {
    current.acceptance = 'yes'
    // A provider inclusion report is still only accepted until chain verification.
    current.state = 'accepted'
  } else if (status?.status === 'rejected') {
    current.state = 'rejected'
    current.acceptance = 'yes' // It entered the mempool, then failed re-simulation.
    current.lastError = diagnose(new Error('Pimlico rejected the operation during re-simulation'), 'confirm', 'yes')
  } else if (status?.status === 'failed') {
    current.state = 'failed'
    current.acceptance = 'yes'
    current.lastError = diagnose(new Error('Pimlico reports a failed bundle; no successful operation verified'), 'confirm', 'yes')
  } else if (!['rejected', 'failed', 'included'].includes(current.state)) current.state = 'unknown'
  const tx = receipt?.receipt.transactionHash || lookup?.transactionHash || status?.transactionHash
  if (isHash(tx)) current.transactionHash = tx
  return { operation: current, receipt }
}

export async function pollOperation(operation: PendingOperation, dependencies: {
  inspect: (value: PendingOperation) => Promise<{ operation: PendingOperation; receipt: BundlerReceipt | null }>
  verify: (value: PendingOperation, receipt: BundlerReceipt | null, remainingMs: number) => Promise<ConfirmedProof>
  update: (value: PendingOperation) => void
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
}): Promise<ConfirmedProof | null> {
  const now = dependencies.now || Date.now
  const sleep = dependencies.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const deadline = now() + (dependencies.timeoutMs ?? 120_000)
  let current = operation
  try {
    while (now() < deadline) {
      const result = await dependencies.inspect(current)
      current = result.operation
      dependencies.update(current)
      if (result.receipt || current.transactionHash) {
        // A hash from by-hash/status is a candidate, never a successful receipt.
        // Independently verify it even when the bundler receipt endpoint is null.
        const proof = await dependencies.verify(current, result.receipt, Math.max(1, deadline - now()))
        dependencies.update({ ...current, state: 'included', acceptance: 'yes', transactionHash: proof.transactionHash })
        return proof
      }
      if (['rejected', 'failed'].includes(current.state)) return null
      // not_found is ambiguous; it never clears the record or triggers a resend.
      await sleep(Math.min(3_000, Math.max(0, deadline - now())))
    }
    throw new Error('CONFIRMATION_TIMEOUT')
  } catch (error) {
    const diagnostic = diagnose(error, 'confirm', current.acceptance)
    dependencies.update({ ...current, state: error instanceof Error && error.message === 'OPERATION_REVERTED' ? 'failed' : 'unknown', lastError: diagnostic })
    return null
  }
}

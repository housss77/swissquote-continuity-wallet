import { existsSync } from 'node:fs'

async function main() {
  let stage = 'configuration'
  try {
    if (existsSync('.env.local')) process.loadEnvFile('.env.local')
    const { createPublicClient, http } = await import('viem')
    const { sepolia } = await import('viem/chains')
    const { assertSepolia, providerConfig, RPC_URL, ENTRY_POINT, NFT_ADDRESS, PAYMASTER_ADDRESS } = await import('../lib/constants')
    const { bundlerUrl } = providerConfig()
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL, { timeout: 12_000, retryCount: 0 }) })
    stage = 'public RPC chain check'
    assertSepolia(await publicClient.getChainId())
    stage = 'Pimlico chain check'
    const chainResponse = await fetch(bundlerUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!chainResponse.ok) throw new Error(`HTTP_${chainResponse.status}`)
    const chainBody = await chainResponse.json() as { result?: string }
    if (!chainBody.result) throw new Error('PREFLIGHT_FAILED')
    assertSepolia(BigInt(chainBody.result))
    stage = 'Pimlico EntryPoint support'
    const response = await fetch(bundlerUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_supportedEntryPoints', params: [] }),
      signal: AbortSignal.timeout(12_000),
    })
    const body = await response.json() as { result?: string[] }
    if (!response.ok || !body.result?.some(value => value.toLowerCase() === ENTRY_POINT.toLowerCase())) throw new Error('PREFLIGHT_FAILED')
    stage = 'Sepolia contract code'
    const codes = await Promise.all([ENTRY_POINT, PAYMASTER_ADDRESS, NFT_ADDRESS].map(address => publicClient.getCode({ address })))
    if (codes.some(code => !code || code === '0x')) throw new Error('CONTRACT_UNAVAILABLE')
    process.stdout.write('PASS: Sepolia (11155111), EntryPoint 0.6 support, and deployed EntryPoint/paymaster/NFT contracts.\n')
    stage = 'sponsorship policy configuration'
    const config = providerConfig(true)
    // Documented account endpoint/authentication. Management access is separate
    // from the bundler/paymaster RPC; failure here does not prove sponsorship denial.
    const policyUrl = new URL(`https://api.pimlico.io/v2/account/sponsorship_policies/${encodeURIComponent(config.sponsorshipPolicyId!)}`)
    policyUrl.searchParams.set('apikey', process.env.NEXT_PUBLIC_PIMLICO_API_KEY!.trim())
    stage = 'read-only sponsorship policy retrieval'
    let policyResponse: Response
    try { policyResponse = await fetch(policyUrl, { redirect: 'error', signal: AbortSignal.timeout(12_000) }) }
    catch {
      process.stdout.write('WARN: Account policy lookup could not be completed. RPC compatibility passed; sponsorship availability is unverified. Confirm policy in Dashboard before a controlled attempt. No operation was submitted.\n')
      return
    }
    if (!policyResponse.ok) {
      const { RpcFailure } = await import('../lib/diagnostics')
      const failure = await policyResponse.json().catch(() => ({})) as { error?: string | { message?: string }; message?: string }
      const message = typeof failure.error === 'string' ? failure.error : failure.error?.message || failure.message || 'Policy retrieval failed'
      const { diagnose } = await import('../lib/diagnostics')
      process.stdout.write(`WARN: Account policy verification unavailable: ${JSON.stringify(diagnose(new RpcFailure(message, policyResponse.status), 'initialize', 'no'))}\nRPC compatibility passed; this account-management response is not proof of ERC-4337 sponsorship denial. Confirm policy in Dashboard. Actual call sponsorship remains unverified until user preparation. No operation was submitted.\n`)
      return
    }
    const policy = await policyResponse.json() as { id?: string; policy_status?: string; chain_ids?: { allowlist?: number[] | null }; start_time?: string | null; end_time?: string | null }
    if (policy.id !== config.sponsorshipPolicyId || policy.policy_status !== 'active') throw new Error('SPONSORSHIP_POLICY_INACTIVE_OR_MISMATCH')
    const allowed = policy.chain_ids?.allowlist
    if (allowed && !allowed.includes(11155111)) throw new Error('SPONSORSHIP_POLICY_SEPOLIA_DENIED')
    if (policy.start_time && (!Number.isFinite(Date.parse(policy.start_time)) || Date.parse(policy.start_time) > Date.now())) throw new Error('SPONSORSHIP_POLICY_NOT_STARTED')
    if (policy.end_time && (!Number.isFinite(Date.parse(policy.end_time)) || Date.parse(policy.end_time) <= Date.now())) throw new Error('SPONSORSHIP_POLICY_EXPIRED')
    process.stdout.write('PASS: Configured policy is retrievable, active, within its time window, and permits Sepolia. Quota, funding, webhook rules, and approval of the actual call are determined during SDK sponsorship. No operation was prepared, sponsored, signed, or submitted by this check.\n')
  } catch (error) {
    const { diagnose } = await import('../lib/diagnostics')
    process.stderr.write(`Provider preflight failed at ${stage}. ${JSON.stringify(diagnose(error, 'initialize', 'no'))} No operation was submitted.\n`)
    process.exitCode = 1
  }
}

void main()

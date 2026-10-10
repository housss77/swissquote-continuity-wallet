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
    process.stdout.write('PASS: RPC and Pimlico bundler report Sepolia (11155111); EntryPoint 0.6 supported; EntryPoint, tutorial paymaster, and NFT contract code exists.\nSponsorship approval and real passkey signing still require the browser operation. No operation was submitted.\n')
  } catch (error) {
    const { friendlyError } = await import('../lib/errors')
    process.stderr.write(`Provider preflight failed at ${stage}. ${friendlyError(error, 'initialize')} No operation was submitted.\n`)
    process.exitCode = 1
  }
}

void main()

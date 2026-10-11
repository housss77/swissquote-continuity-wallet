import { sepolia } from 'viem/chains'
import type { Address } from 'viem'

export const CHAIN = sepolia
export const CHAIN_ID = 11155111
// Dynamic legacy lookup prevents build-time NEXT_PUBLIC credentials entering
// browser bundles. New deployments use server-only variables.
const runtimeValue = (name: string) => process.env[name]?.trim()
export const RPC_URL = typeof window === 'undefined'
  ? runtimeValue('SEPOLIA_RPC_URL') || runtimeValue(['NEXT','PUBLIC','SEPOLIA','RPC','URL'].join('_')) || 'https://ethereum-sepolia-rpc.publicnode.com'
  : new URL('/api/rpc', window.location.origin).href
export const ENTRY_POINT: Address = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
// Tutorial estimation seed; Pimlico chooses the actual sponsor in its response.
export const PAYMASTER_ADDRESS: Address = '0x0000000000325602a77416A16136FDafd04b299f'
export const NFT_ADDRESS: Address = '0xBb9ebb7b8Ee75CDBf64e5cE124731A89c2BC4A07'
export const EXPLORER = 'https://sepolia.etherscan.io'
export const STORAGE_KEY = 'continuity-wallet-sepolia-passkey-v1'
export const PENDING_KEY = 'continuity-wallet-sepolia-pending-v1'

export function providerConfig(requireSponsorship = false) {
  if (typeof window !== 'undefined') {
    const endpoint = new URL('/api/sponsor', window.location.origin).href
    return { bundlerUrl: endpoint, paymasterUrl: endpoint, sponsorshipPolicyId: undefined }
  }
  if (runtimeValue('SPONSORSHIP_PROVIDER') === 'swissquote') {
    const bundlerUrl = runtimeValue('SPONSORSHIP_BUNDLER_RPC_URL'), paymasterUrl = runtimeValue('SPONSORSHIP_PAYMASTER_RPC_URL')
    if (!bundlerUrl || !paymasterUrl) throw new Error('SPONSORSHIP_PROVIDER_UNCONFIGURED')
    return { bundlerUrl, paymasterUrl, sponsorshipPolicyId: runtimeValue('SPONSORSHIP_POLICY_ID') }
  }
  if (runtimeValue('SPONSORSHIP_PROVIDER') && runtimeValue('SPONSORSHIP_PROVIDER') !== 'pimlico') throw new Error('SPONSORSHIP_PROVIDER_UNSUPPORTED')
  const apiKey = runtimeValue('PIMLICO_API_KEY') || runtimeValue(['NEXT','PUBLIC','PIMLICO','API','KEY'].join('_'))
  if (!apiKey) throw new Error('MISSING_PIMLICO_KEY')
  const sponsorshipPolicyId = runtimeValue('PIMLICO_SPONSORSHIP_POLICY_ID') || runtimeValue(['NEXT','PUBLIC','PIMLICO','SPONSORSHIP','POLICY','ID'].join('_'))
  if (requireSponsorship && !sponsorshipPolicyId) throw new Error('MISSING_SPONSORSHIP_POLICY')
  const query = new URLSearchParams({ apikey: apiKey })
  query.set('add_balance_override', 'true')
  return {
    // The tutorial's v1 endpoint returned 403 with a valid current key.
    // Pimlico v2 supports the same EntryPoint 0.6 JSON-RPC methods.
    bundlerUrl: `https://api.pimlico.io/v2/sepolia/rpc?${query}`,
    paymasterUrl: `https://api.pimlico.io/v2/sepolia/rpc?${query}`,
    sponsorshipPolicyId,
  }
}

export function assertSepolia(chainId: number | bigint) {
  if (BigInt(chainId) !== BigInt(CHAIN_ID)) throw new Error('WRONG_CHAIN')
}

import { sepolia } from 'viem/chains'
import type { Address } from 'viem'

export const CHAIN = sepolia
export const CHAIN_ID = 11155111
export const RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com'
export const ENTRY_POINT: Address = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
export const PAYMASTER_ADDRESS: Address = '0x0000000000325602a77416A16136FDafd04b299f'
export const NFT_ADDRESS: Address = '0xBb9ebb7b8Ee75CDBf64e5cE124731A89c2BC4A07'
export const EXPLORER = 'https://sepolia.etherscan.io'
export const STORAGE_KEY = 'continuity-wallet-sepolia-passkey-v1'
export const PENDING_KEY = 'continuity-wallet-sepolia-pending-v1'

export function providerConfig(requireSponsorship = false) {
  const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY?.trim()
  if (!apiKey) throw new Error('MISSING_PIMLICO_KEY')
  const sponsorshipPolicyId = process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID?.trim()
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

import { encodeFunctionData, getAddress, isAddress, parseEther, zeroAddress, type Address } from 'viem'
import { NFT_ADDRESS } from './constants'

export function transferTransaction(safeAddress: Address, recipient: string, amount: string, balance: bigint) {
  if (!isAddress(recipient) || recipient.toLowerCase() === safeAddress.toLowerCase() || recipient.toLowerCase() === zeroAddress) {
    throw new Error('INVALID_RECIPIENT')
  }
  if (!/^\d+(\.\d{1,18})?$/.test(amount)) throw new Error('INVALID_AMOUNT')
  const value = parseEther(amount)
  if (value <= 0n) throw new Error('INVALID_AMOUNT')
  if (value > balance) throw new Error('INSUFFICIENT_FUNDS')
  return { to: getAddress(recipient), value: value.toString(), data: '0x' }
}

export function mintTransaction(safeAddress: Address, existingTokenId?: bigint) {
  // Random token ID avoids tutorial NFT collisions; this is not key material.
  const tokenId = existingTokenId ?? BigInt(`0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')}`)
  if (tokenId < 0n || tokenId >= 2n ** 256n) throw new Error('INVALID_MINT_TOKEN_ID')
  return {
    transaction: {
      to: NFT_ADDRESS,
      value: '0',
      data: encodeFunctionData({
        abi: [{ type: 'function', name: 'safeMint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] }],
        functionName: 'safeMint',
        args: [safeAddress, tokenId],
      }),
    },
    tokenId: tokenId.toString(),
  }
}

// Read the public token ID already recorded by this app so a diagnostic replays
// the rejected NFT intent. This never modifies or archives the attempt.
export function diagnosticMintTransaction(safeAddress: Address, attempt: { kind: string; description: string } | null) {
  if (!attempt || attempt.kind !== 'mint') return { ...mintTransaction(safeAddress), reusedPendingMint: false }
  const match = /^Tutorial NFT mint: token (\d+) to this Safe\. Zero ETH transferred\.$/.exec(attempt.description)
  if (!match) throw new Error('MINT_DIAGNOSTIC_INTENT_UNAVAILABLE')
  return { ...mintTransaction(safeAddress, BigInt(match[1])), reusedPendingMint: true }
}

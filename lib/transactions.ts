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

export function mintTransaction(safeAddress: Address) {
  // Random token ID avoids tutorial NFT collisions; this is not key material.
  const tokenId = BigInt(`0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')}`)
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

import { createPublicClient, getAddress, http, isAddress, type Hash } from 'viem'
import { sepolia } from 'viem/chains'
import { assertSepolia } from '../lib/constants'
import { verifyReceipt } from '../lib/proof'

// Independent, read-only public Sepolia verification. No Pimlico key required.
async function main() {
  const [transactionHash, userOperationHash, safeAddress] = process.argv.slice(2)
  if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash || '')
    || !/^0x[a-fA-F0-9]{64}$/.test(userOperationHash || '') || !isAddress(safeAddress || '')) {
    process.stderr.write('Usage: npm run verify:onchain -- <transaction-hash> <useroperation-hash> <safe-address>\n')
    process.exitCode = 1
    return
  }
  const client = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 15_000 }) })
  try {
    assertSepolia(await client.getChainId())
    const receipt = await client.getTransactionReceipt({ hash: transactionHash as Hash })
    const latest = await client.getBlockNumber()
    if (latest < receipt.blockNumber + 1n) throw new Error('NOT_TWO_CONFIRMATIONS')
    const proof = verifyReceipt(receipt, userOperationHash as Hash, getAddress(safeAddress))
    const code = await client.getCode({ address: proof.safeAddress, blockNumber: receipt.blockNumber })
    if (!code || code === '0x') throw new Error('SAFE_NOT_DEPLOYED')
    process.stdout.write(`${JSON.stringify({ network: 'Ethereum Sepolia', chainId: 11155111, ...proof, explorer: `https://sepolia.etherscan.io/tx/${proof.transactionHash}` }, null, 2)}\n`)
  } catch {
    process.stderr.write('NOT VERIFIED: RPC unavailable, insufficient confirmations, reverted execution, or mismatched/missing sponsored EntryPoint evidence.\n')
    process.exitCode = 1
  }
}

void main()

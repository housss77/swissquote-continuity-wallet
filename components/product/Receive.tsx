'use client'
import {useState} from 'react'
import Link from 'next/link'
import {decodeEventLog,formatUnits,type Hash} from 'viem'
import {Shell,PageHeading,AddressLine} from './Shell'
import {useWallet} from './useWallet'
import {productClient,USDC_ADDRESS,tokenAbi,sameAddress} from '../../lib/product'
import {assertSepolia,EXPLORER} from '../../lib/constants'
export default function Receive(){
 const {wallet,loading,error,refresh}=useWallet(),[hash,setHash]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
 async function check(){if(!wallet)return;setBusy(true);setStatus('Checking the faucet transaction on Ethereum Sepolia…')
  try{
   assertSepolia(await productClient.getChainId())
   const receipt=await productClient.getTransactionReceipt({hash:hash.trim() as Hash}),latest=await productClient.getBlockNumber({cacheTime:0})
   if(receipt.status!=='success')throw new Error('FAILED')
   if(latest<receipt.blockNumber+1n){setStatus('The transaction is included; waiting for a second block confirmation. Check again shortly.');return}
   let units=0n
   for(const log of receipt.logs){if(!sameAddress(log.address,USDC_ADDRESS))continue;try{const event=decodeEventLog({abi:tokenAbi,data:log.data,topics:log.topics});if(event.eventName==='Transfer' && sameAddress(event.args.to,wallet.safe))units+=event.args.value}catch{/* Unrelated log. */}}
   if(units<=0n){setStatus('This receipt has no official Ethereum Sepolia USDC transfer to your wallet. Check the faucet network and recipient.');return}
   setStatus(`Confirmed receipt: ${formatUnits(units,6)} test USDC arrived at this Safe. The current balance below is refreshed separately.`);await refresh()
  }catch{setStatus('The faucet transaction could not be verified on Ethereum Sepolia. It may be pending, failed, on another network, or temporarily unavailable. Check the faucet result and try this read-only check again.')}
  finally{setBusy(false)}
 }
 return <Shell><PageHeading title="Add test USDC">Free test tokens for your wallet. No ETH purchase or wallet signature is needed.</PageHeading>{loading?<p role="status">Reading your wallet…</p>:!wallet?<div className="empty-state"><p>{error || 'Create or view a wallet first.'}</p><Link className="button" href="/">Open wallet</Link></div>:<>
  <AddressLine address={wallet.safe}/><p className="muted">Current balance: {wallet.usdc===null?'Unavailable':formatUnits(wallet.usdc,6)} test USDC</p>
  <section className="funding-guide"><ol className="install-steps"><li><strong>Copy this Safe’s wallet address.</strong> Use Copy above. This is the destination for your tokens.</li><li><strong>Open Circle’s faucet.</strong> Select USDC and <strong>Ethereum Sepolia</strong> in its Network menu. Paste your wallet address and complete its request.</li><li><strong>Return here and refresh.</strong> A submitted faucet request needs a confirmed blockchain transfer before the balance changes.</li></ol><div className="actions"><a className="button button-primary" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Open Circle faucet ↗</a><button disabled={busy} onClick={()=>void refresh()}>Refresh balance</button></div><p className="test-notice">Test USDC has no real-world value. Your wallet reads the official Ethereum Sepolia token automatically.</p></section>
  <details className="advanced"><summary>Faucet requested but the balance is still zero?</summary><p>Check the network and full recipient address on the faucet confirmation. If it supplies a transaction hash, verify it here. A request or a transfer on another network cannot fund this Sepolia balance.</p><label htmlFor="faucet-hash">Public faucet transaction hash</label><input id="faucet-hash" value={hash} onChange={e=>setHash(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false}/><button disabled={busy || !/^0x[a-fA-F0-9]{64}$/.test(hash.trim())} onClick={()=>void check()}>Check faucet transaction</button>{status && <p role="status">{status}</p>}{/^0x[a-fA-F0-9]{64}$/.test(hash.trim()) && <a href={`${EXPLORER}/tx/${hash.trim()}`} target="_blank" rel="noreferrer">View this hash on Sepolia ↗</a>}</details><Link className="quiet-link" href="/send">Continue to Send USDC →</Link>
 </>}</Shell>
}

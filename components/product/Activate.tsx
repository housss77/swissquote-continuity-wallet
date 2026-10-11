'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {parseAbi,type Hash} from 'viem'
import {Shell,PageHeading,AddressLine} from './Shell'
import {useWallet} from './useWallet'
import {sameAddress,assertCustomerSpendingAllowed,productClient} from '../../lib/product'
import {currentPasskey,createdPasskey} from '../../lib/customer-credentials'
import {mintTransaction} from '../../lib/transactions'
import {prepareSponsoredTransaction} from '../../lib/sponsorship'
import {withSendLock,assertFreshQuote} from '../../lib/send-session'
import {diagnose} from '../../lib/diagnostics'
import {friendlyError} from '../../lib/errors'
import {EXPLORER,NFT_ADDRESS,ENTRY_POINT} from '../../lib/constants'
import type {PendingOperation} from '../../lib/operations'
type Preparation=Awaited<ReturnType<typeof prepareSponsoredTransaction>>
type Quote=Preparation&{pack:Awaited<ReturnType<typeof import('../../lib/wallet')['initializeWallet']>>;tokenId:string;at:number}
export default function Activate(){
 const {wallet,loading,error,refresh}=useWallet(),[quote,setQuote]=useState<Quote|null>(null),[attempt,setAttempt]=useState<PendingOperation|null>(null),[confirmed,setConfirmed]=useState<Hash|null>(null),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[message,setMessage]=useState(''),lock=useRef(false)
 useEffect(()=>{void import('../../lib/wallet').then(sdk=>setAttempt(sdk.loadPending()))},[])
 async function action(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setProblem('');try{await work()}catch(e){setProblem(friendlyError(e,quote?'sign':'prepare'))}finally{setBusy(false);lock.current=false}}
 async function prepare(){
  if(!wallet)return;assertCustomerSpendingAllowed(wallet.safe)
  if(wallet.deployed)throw new Error('WALLET_ALREADY_DEPLOYED')
  const sdk=await import('../../lib/wallet');if(sdk.loadPending())throw new Error('SEND_PREVIOUS_ATTEMPT')
  const pk=createdPasskey() || await currentPasskey(wallet.safe),pack=await sdk.initializeWallet(pk)
  if(!sameAddress(await pack.protocolKit.getAddress(),wallet.safe))throw new Error('OWNER_MISMATCH')
  const mint=mintTransaction(wallet.safe),prepared=await prepareSponsoredTransaction(pack,wallet.safe,mint.transaction,sdk.sponsorshipReads)
  setQuote({...prepared,pack,tokenId:mint.tokenId,at:Date.now()});setMessage('Fees quoted. No signature or transaction has been sent.')
 }
 async function verify(saved:PendingOperation){
  if(saved.kind!=='mint' || !wallet || !sameAddress(saved.safeAddress,wallet.safe))throw new Error('SEND_PREVIOUS_ATTEMPT')
  const sdk=await import('../../lib/wallet'),proof=await sdk.confirmOperation(saved,v=>{sdk.savePending(v);setAttempt(v)})
  if(!proof)return
  const token=/Tutorial NFT mint: token (\d+)/.exec(saved.description)?.[1]
  if(!token)throw new Error('EVIDENCE_MISMATCH')
  const owner=await productClient.readContract({address:NFT_ADDRESS,abi:parseAbi(['function ownerOf(uint256 tokenId) view returns(address)']),functionName:'ownerOf',args:[BigInt(token)]})
  if(!sameAddress(owner,saved.safeAddress))throw new Error('EVIDENCE_MISMATCH')
  setConfirmed(proof.transactionHash);setMessage('Wallet deployed and test NFT ownership verified on Sepolia. Zero ETH transferred.');await refresh()
 }
 async function sign(){if(!quote || !wallet)return;await withSendLock(async()=>{
  const q=quote,sdk=await import('../../lib/wallet');if(sdk.loadPending())throw new Error('SEND_PREVIOUS_ATTEMPT');assertFreshQuote(q.at);await sdk.checkNetworks();await sdk.walletSnapshot(q.pack)
  const nonce=await productClient.readContract({address:ENTRY_POINT,abi:parseAbi(['function getNonce(address sender,uint192 key) view returns(uint256)']),functionName:'getNonce',args:[wallet.safe,0n]})
  if(nonce!==BigInt(q.operation.toUserOperation().nonce))throw new Error('SEND_NONCE_CHANGED')
  const prepared:PendingOperation={kind:'mint',safeAddress:wallet.safe,paymasterAddress:q.paymasterAddress,userOperationHash:sdk.operationHash(q.operation.toUserOperation()),state:'prepared',acceptance:'no',description:`Tutorial NFT mint: token ${q.tokenId} to this Safe. Zero ETH transferred.`,createdAt:new Date().toISOString()}
  const update=(v:PendingOperation)=>{sdk.savePending(v);setAttempt(v)};update(prepared);setMessage('Waiting for your spending passkey approval.')
  let signed
  try{signed=await q.pack.signSafeOperation(q.operation);assertFreshQuote(q.at);(await import('../../lib/gas')).assertOperationBudget(signed.toUserOperation());if(sdk.operationHash(signed.toUserOperation())!==prepared.userOperationHash)throw new Error('SPONSORSHIP_SIGNED_MISMATCH')}
  catch(e){update({...prepared,state:'rejected',submissionError:diagnose(e,'sign','no')});throw e}
  setQuote(null);setMessage('Sending the signed operation once…');const submitted=await sdk.submitOperation(signed,prepared,update);if(submitted.state==='accepted'){setMessage('Accepted by the bundler. Waiting for independent receipt verification.');await verify(submitted)}else{setMessage('The operation was not confirmed. Check the preserved result before any manual retry.')}
 })}
 async function preserve(){await withSendLock(async()=>{const sdk=await import('../../lib/wallet'),saved=sdk.loadPending();if(!saved)return;if(!confirmed && !['failed','rejected'].includes(saved.state))throw new Error('SEND_PREVIOUS_ATTEMPT');sdk.archivePending(saved);setAttempt(null);setConfirmed(null);setMessage('Attempt evidence preserved. No operation was retried.')})}
 return <Shell><PageHeading title="Activate your test wallet">A real sponsored transaction, approved by your passkey. No ETH or USDC balance is required.</PageHeading>{(error || problem) && <p className="alert" role="alert">{problem || error}</p>}{loading?<p role="status">Reading your wallet…</p>:!wallet?<Link className="button" href="/login">Create or connect your wallet</Link>:<><AddressLine address={wallet.safe}/><section className="send-review">
  {confirmed?<><h2>Confirmed on Sepolia</h2><p>Successful sponsored operation, deployed Safe and test NFT ownership independently verified.</p><a href={`${EXPLORER}/tx/${confirmed}`} target="_blank" rel="noreferrer">View confirmed transaction ↗</a><div className="actions"><button disabled={busy} onClick={()=>void action(preserve)}>Preserve attempt and continue</button><Link className="button button-primary" href="/">Open wallet</Link></div></>:attempt?<><h2>{attempt.state==='rejected' || attempt.state==='failed'?'Activation failed':'Activation needs confirmation'}</h2><p>No success is claimed until the receipt and NFT ownership are verified.</p>{attempt.submissionError && <p className="alert" role="alert">{friendlyError(new Error(attempt.submissionError.message),attempt.submissionError.stage as 'submit')}</p>}{attempt.kind==='mint' && sameAddress(attempt.safeAddress,wallet.safe)?<button disabled={busy} onClick={()=>void action(()=>verify(attempt))}>Check confirmation</button>:<Link href="/send">Check the saved transfer before activating</Link>}{['failed','rejected'].includes(attempt.state) && <button disabled={busy} onClick={()=>void action(preserve)}>Preserve attempt and continue</button>}</>:wallet.deployed?<><h2>Your wallet is already deployed</h2><Link className="button" href="/">Open wallet</Link></>:<><h2>{quote?'Review test activation':'Make your wallet live on Sepolia'}</h2><p>This deploys your Safe and mints the official tutorial NFT to it. It is a test NFT mint; zero ETH and zero USDC are transferred. Network fees are sponsored.</p>{quote?<><p>Your wallet: <code>{wallet.safe}</code></p><button className="button-primary" disabled={busy} onClick={()=>void action(sign)}>Confirm with passkey</button><button disabled={busy} onClick={()=>setQuote(null)}>Back</button><p className="muted">Confirmation signs and broadcasts once. The quote expires after 60 seconds.</p></>:<button className="button-primary" disabled={busy} onClick={()=>void action(prepare)}>Review test activation</button>}</>}
  {message && <p role="status">{message}</p>}
 </section></>}</Shell>
}

'use client'
import {useEffect,useState} from 'react'
import type {Address} from 'viem'
import evidence from '../../lib/demo-evidence.json'
import {EXPLORER,PENDING_KEY} from '../../lib/constants'
import {selectedSafe,sameAddress} from '../../lib/product'
import {validateUsdcIntent} from '../../lib/usdc'
import {isHash,type PendingOperation} from '../../lib/operations'
import type {ConfirmedProof} from '../../lib/proof'
import {Shell,PageHeading,AddressLine} from './Shell'
export function CustomerActivity({safe}:{safe?:Address}) {
 const [items,setItems]=useState<{operation:PendingOperation;proof:ConfirmedProof|null}[]>([])
 useEffect(()=>{let live=true;setItems([])
   void(async()=>{try{
     const address=safe || selectedSafe();if(!address)return
     const saved=[...JSON.parse(localStorage.getItem(`${PENDING_KEY}-history`) || '[]'),JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')].filter(Boolean) as PendingOperation[]
     const records=saved.filter(o=>o.kind==='usdc' && sameAddress(o.safeAddress,address) && isHash(o.userOperationHash)).slice(-3).reverse().map(o=>{const intent=validateUsdcIntent(o.usdcIntent);if(!sameAddress(intent.safe,address))throw new Error('STORED_DATA');return {...o,usdcIntent:intent}})
     if(live)setItems(records.map(operation=>({operation,proof:null})))
     if(!records.length)return
     const sdk=await import('../../lib/wallet')
     const results=await Promise.all(records.map(async operation=>{try{return {operation,proof:isHash(operation.transactionHash)?await sdk.verifyOperationInclusion(operation,null,20_000):null}}catch{return {operation,proof:null}}}))
     if(live)setItems(results)
   }catch{/* Preserve malformed storage; never infer success or delete evidence. */}})()
   return()=>{live=false}
 },[safe])
 if(!items.length)return null
 return <ol className="activity-list" aria-label="Recent customer transfers">{items.map(({operation,proof})=><li key={operation.userOperationHash}><div><h3>Test USDC transfer</h3><span className="activity-meta">{proof?'Receipt and transfer independently verified now':'Confirmation has not been verified in this view'}</span></div>{proof?<a href={`${EXPLORER}/tx/${proof.transactionHash}`} target="_blank" rel="noreferrer">Receipt ↗</a>:<a href="/send">Check operation</a>}</li>)}</ol>
}
export function HistoricalActivity({compact=false}:{compact?:boolean}) {return <ol className="activity-list historical-activity">{[...evidence.transactions].reverse().slice(0,compact?2:4).map(t=><li key={t.id}><div><h3>{t.label}</h3>{!compact && <p className="muted">{t.detail}</p>}<span className="activity-meta">Verified earlier on Sepolia · Block {t.block}</span></div><a href={`${EXPLORER}/tx/${t.hash}`} target="_blank" rel="noreferrer">Receipt ↗</a></li>)}</ol>}
export default function Activity(){return <Shell><PageHeading eyebrow="AUDITABLE EVIDENCE" title="Activity">Real transaction receipts. Historical proof stays separate from new live actions.</PageHeading><CustomerActivity/><AddressLine address={evidence.safe} label="Historical acceptance wallet"/><div className="history-label">Verified earlier on Sepolia · Evidence recorded 11 October 2026</div><HistoricalActivity/><p className="muted">These completed transactions belong to the public acceptance wallet. They do not represent new activity in another selected wallet.</p><details className="advanced"><summary>Evidence provenance and limitations</summary><p>Source: <code>{evidence.source}</code>. Independently recorded at {evidence.verifiedAt}.</p>{evidence.limitations.map(l=><p key={l}>{l}</p>)}<a href="/demo">Open the presentation and optional live verification</a></details></Shell>}

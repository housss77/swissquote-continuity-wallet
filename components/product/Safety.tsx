'use client'
import {useState} from 'react'
import {encodeFunctionData,maxUint256} from 'viem'
import {Shell,PageHeading} from './Shell'
import {tokenAbi,USDC_ADDRESS} from '../../lib/product'
import {transactionReview} from '../../lib/transaction-review'
export default function Safety(){
 const [warning,setWarning]=useState(false)
 const recipient='0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86'
 const data=warning?encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[recipient,maxUint256]}):encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[recipient,1_000_000n]})
 const review=transactionReview(11155111,USDC_ADDRESS,data)
 return <Shell><PageHeading title="Transaction review examples">Unsigned, deterministic examples. This page cannot sign or send.</PageHeading><div className="actions"><button aria-pressed={!warning} onClick={()=>setWarning(false)}>Simple test USDC transfer</button><button aria-pressed={warning} onClick={()=>setWarning(true)}>Unlimited approval warning</button></div><section className="safety-review" aria-live="polite"><h2>{review.status}</h2><p>{review.action}</p>{review.warnings.map(w=><p key={w} className="notice">{w}</p>)}<p className="muted">Sanctions: Not checked. Contract simulation: not run for these unsigned examples. Reviewed demo contracts are not legally approved.</p></section><p className="muted">These checks are advisory. The current spending threshold is one: a stolen, usable spending passkey can authorize transactions outside this UI. Recovery is not a spending firewall.</p></Shell>
}

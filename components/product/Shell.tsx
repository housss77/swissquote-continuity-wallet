'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { EXPLORER } from '../../lib/constants'
import { shortAddress } from '../../lib/product'

export function Shell({children}:{children:React.ReactNode}) {
  const path=usePathname()
  const links=[['/','Wallet'],['/send','Send'],['/protection','Recovery'],['/activity','Activity']]
  return <div className="product"><a className="skip-link" href="#content">Skip to content</a><header className="app-header"><div className="header-inner"><Link href="/" className="wordmark"><span className="brand-mark" aria-hidden="true"/>Continuity</Link><nav aria-label="Main navigation">{links.map(([href,label])=><Link key={href} href={href} aria-current={path===href || (href==='/protection' && path==='/recovery')?'page':undefined}>{label}</Link>)}</nav><span className="network-label"><span aria-hidden="true"/>Sepolia testnet</span></div></header><main id="content" className="customer-main">{children}</main><footer className="app-footer"><span>Swissquote-inspired hackathon concept · Test assets only</span><div><Link href="/demo">Jury demo</Link><Link href="/lab">Advanced lab</Link></div></footer></div>
}
export function AddressLine({address,label='Wallet address'}:{address:string;label?:string}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState(false)
  return <div className="address-line"><span className="muted">{label}</span><code title={address}>{shortAddress(address)}</code><button className="button-text" onClick={async()=>{try{await navigator.clipboard.writeText(address);setCopied(true);setError(false)}catch{setError(true)}}}>{copied?'Copied':'Copy'}</button><a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">Explorer ↗</a>{error && <span role="alert">Copy unavailable: <code>{address}</code></span>}</div>
}
export function PageHeading({eyebrow,title,children}:{eyebrow?:string;title:string;children?:React.ReactNode}) {return <div className="page-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{children && <p className="lede">{children}</p>}</div>}

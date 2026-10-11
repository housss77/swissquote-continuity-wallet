'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { EXPLORER } from '../../lib/constants'
import { shortAddress } from '../../lib/product'
import {MobileStatus} from './Mobile'
import {Icon} from './Icon'

export function Shell({children}:{children:React.ReactNode}) {
  const path=usePathname()
  const links=[{href:'/',label:'Wallet',icon:'wallet'},{href:'/send',label:'Send',icon:'send'},{href:'/protection',label:'Recovery',icon:'shield'},{href:'/activity',label:'Activity',icon:'activity'}] as const
  const section=path==='/recovery'?'Recovery':path==='/receive'?'Add funds':path==='/login'?'Sign in':path==='/demo'?'Presentation':path==='/install'?'On your phone':path==='/activate'?'Activate wallet':links.find(l=>l.href===path)?.label || 'Workspace'
  return <div className={`product page-${path.split('/')[1] || 'wallet'}`}>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="app-header"><div className="header-inner">
      <Link href="/" className="wordmark"><span className="brand-mark" aria-hidden="true">c<span/></span>Continuity<span className="brand-subtitle">SELF-CUSTODY WALLET</span></Link>
      <span className="nav-caption">YOUR WORKSPACE</span>
      <nav aria-label="Main navigation">{links.map(({href,label,icon})=><Link key={href} href={href} aria-current={path===href || (href==='/protection' && path==='/recovery') || (href==='/send' && path==='/receive')?'page':undefined}><Icon name={icon}/><span>{label}</span>{icon==='send' && <Icon name="chevron" size={15}/>}</Link>)}</nav>
      <div className="sidebar-bottom"><Link href="/demo"><Icon name="play"/>Jury demo<Icon name="external" size={15}/></Link><Link href="/install"><Icon name="phone"/>On your phone</Link><div className="sidebar-concept"><span className="concept-mark">SQ</span><p>Swissquote-inspired<br/><span>Hackathon concept</span></p></div></div>
    </div></header>
    <div className="app-workspace"><div className="workspace-topbar"><span className="workspace-breadcrumb">Personal wallet <span>/</span> <strong>{section}</strong></span><div className="workspace-tools"><span className="network-label"><span aria-hidden="true"/>Sepolia testnet</span><Link className="profile-link" href="/login" aria-label="Passkey sign-in"><Icon name="key" size={19}/></Link></div></div>
      <MobileStatus/><main id="content" className="customer-main">{children}</main>
      <footer className="app-footer"><span>Swissquote-inspired hackathon concept · Test assets only</span><div><Link href="/login">Sign in</Link><Link className="mobile-utility" href="/demo">Jury demo</Link><Link className="mobile-utility" href="/install">On your phone</Link><Link href="/lab">Advanced lab <Icon name="external" size={12}/></Link></div></footer>
    </div>
  </div>
}
export function AddressLine({address,label='Wallet address'}:{address:string;label?:string}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState(false)
  return <div className="address-line"><span className="muted">{label}</span><span className="address-value"><Icon name="wallet" size={15}/><code title={address}>{shortAddress(address)}</code></span><button className="button-text" onClick={async()=>{try{await navigator.clipboard.writeText(address);setCopied(true);setError(false)}catch{setError(true)}}}><Icon name={copied?'check':'copy'} size={14}/><span>{copied?'Copied':'Copy'}</span></button><a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">Explorer <Icon name="external" size={13}/></a>{copied && <span className="sr-only" role="status">Wallet address copied</span>}{error && <span role="alert">Copy unavailable: <code>{address}</code></span>}</div>
}
export function PageHeading({eyebrow,title,children}:{eyebrow?:string;title:string;children?:React.ReactNode}) {return <div className="page-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{children && <p className="lede">{children}</p>}</div>}

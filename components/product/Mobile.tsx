'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
export function MobileStatus(){
  const [offline,setOffline]=useState(false)
  useEffect(()=>{
    const update=()=>setOffline(!navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update)
    if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}
  },[])
  return offline?<div className="connection-banner" role="status">You’re offline. Balance and transaction checks need a connection. No operation will be retried automatically.</div>:null
}
export default function Mobile(){
  return <div className="install-content"><h1>Continuity on your iPhone</h1><p className="lede">Keep your wallet one tap away.</p><ol className="install-steps"><li>Open this website in Safari over HTTPS.</li><li>Tap Share, then Add to Home Screen.</li><li>Open Continuity and choose Continue with passkey.</li></ol><p>Face ID or Touch ID approves your passkey. Enable iCloud Keychain if your device asks. Your PIN and private key stay on your device.</p><Link className="button button-primary" href="/login">Continue to sign-in</Link><p className="muted">The wallet needs a connection to read balances and submit transactions. Installation does not move a localhost passkey to this domain.</p></div>
}

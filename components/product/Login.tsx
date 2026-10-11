'use client'
import {useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import Link from 'next/link'
import {Shell,PageHeading} from './Shell'
import {signIn,finishWallet,customerSession,signOut} from '../../lib/auth-client'
import {createdPasskey} from '../../lib/customer-credentials'
import {loadPasskey} from '../../lib/passkeys'
import {friendlyError} from '../../lib/errors'
import {Icon} from './Icon'
export default function Login(){
  const router=useRouter(),active=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  async function connect(create=false){if(active.current)return;active.current=true;setBusy(true);setError('');setMessage('Waiting for your device…')
    try{if(create && (createdPasskey() || loadPasskey()))throw new Error('AUTH_EXISTING_ACCOUNT_PRESERVED');const existing=await customerSession();if(existing && !existing.safe)await finishWallet();else await signIn(create);router.push('/')}
    catch(e){setError(friendlyError(e,create?'passkey':'authenticate'));setMessage('Your wallet and passkey are preserved. Nothing was sent.')}
    finally{active.current=false;setBusy(false)}
  }
  return <Shell><div className="access-layout">
    <PageHeading eyebrow="CONTINUITY WALLET" title="Welcome back to your wallet.">Sign in with your passkey. Your device stays in control.</PageHeading>
    <section className="access-panel">
      <span className="access-symbol" aria-hidden="true"><Icon name="face" size={30}/></span><h2>Face ID. Touch ID. Your passkey.</h2>
      <p className="muted">No email password or seed phrase. Sign-in restores your wallet; sending still needs a separate approval.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="button-primary access-primary" disabled={busy} onClick={()=>void connect()}><Icon name="key" size={18}/>{busy?'Waiting for your device…':'Continue with passkey'}</button>
      <button className="access-secondary" disabled={busy} onClick={()=>void connect(true)}>Create wallet</button>
      {message && <p role="status" className="muted">{message}</p>}
      <Link href="/recovery">Lost access? Recover your wallet</Link>
      <details className="advanced"><summary>About this demo</summary><p>Sepolia testnet only. Face ID availability depends on your authenticator and iCloud Keychain settings. Localhost passkeys cannot be moved to a new deployment domain.</p>
        <button disabled={busy} onClick={async()=>{try{await signOut();setMessage('Signed out. Stored passkeys and wallet evidence are preserved.')}catch{setError('Sign-out could not be completed. Try again.')}}}>Sign out of this session</button>
      </details>
    </section><Link className="quiet-link" href="/demo">Open the jury presentation without signing in →</Link>
  </div></Shell>
}

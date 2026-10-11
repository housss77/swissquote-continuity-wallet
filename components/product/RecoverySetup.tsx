'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {Shell,PageHeading} from './Shell'
import {useWallet} from './useWallet'
import {DEMO_SAFE,ORIGINAL_SAFE,sameAddress} from '../../lib/product'
import {Icon} from './Icon'
const RecoveryPanel=dynamic(()=>import('../RecoveryPanel'),{ssr:false,loading:()=> <p role="status">Loading your recovery setup…</p>})
export default function RecoverySetup(){
  const {wallet,loading,error}=useWallet()
  const frozen=wallet && (sameAddress(wallet.safe,DEMO_SAFE) || sameAddress(wallet.safe,ORIGINAL_SAFE))
  return <Shell><div className="onboarding-layout"><PageHeading eyebrow="PROTECT YOUR WALLET" title="A way back, together.">Choose your backup access and a trusted friend. Two approvals are required to recover.</PageHeading>
    {error && <p className="alert" role="alert">{error}</p>}
    {loading?<p role="status">Checking your wallet’s protection…</p>:!wallet?<section className="onboarding-card"><h2>Create or connect your wallet first.</h2><Link className="button button-primary" href="/onboarding">Get started</Link><Link className="quiet-link" href="/login">Connect an existing passkey</Link></section>:wallet.recovery?.protected?<section className="onboarding-card"><div className="onboarding-symbol"><Icon name="shield" size={28}/></div><h2>Your recovery is configured onchain.</h2><p>2 of 3 registered guardians must approve. Registration does not prove they are currently reachable.</p><Link className="button button-primary" href="/protection">View recovery settings</Link></section>:frozen?<section className="onboarding-card"><h2>This acceptance wallet is preserved.</h2><p>Its security settings cannot be changed in this build. Use a new wallet for setup.</p><Link className="button" href="/protection">View existing protection</Link></section>:!wallet.deployed?<section className="onboarding-card"><div className="onboarding-symbol"><Icon name="wallet" size={28}/></div><h2>First, activate your wallet.</h2><p className="muted">One passkey-approved test transaction registers your wallet on Sepolia. Fees are sponsored; no ETH funding is required. Then come back to add recovery.</p><Link className="button button-primary" href="/activate">Activate wallet<Icon name="arrow" size={17}/></Link><Link className="quiet-link" href="/">Do this later</Link></section>:!wallet.recovery?<section className="onboarding-card"><h2>Recovery state could not be verified.</h2><p>Setup is blocked until the network check succeeds.</p><Link className="button" href="/setup">Check again</Link></section>:<RecoveryPanel key={wallet.safe} initialSafe={wallet.safe} embedded guidedSetup/>}
  </div></Shell>
}

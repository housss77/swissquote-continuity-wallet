import type { ExternalWallet } from './providers'

type LegacyWallet=ExternalWallet & {isMetaMask?:boolean;providers?:LegacyWallet[]}
export type GuardianWallet={id:string;label:string;provider:ExternalWallet;source:'eip6963'|'legacy'}
type WalletWindow=EventTarget & {ethereum?:LegacyWallet}
const isWallet=(value:unknown):value is ExternalWallet=>!!value && typeof (value as ExternalWallet).request==='function'

// Provider labels are self-reported, not an identity guarantee. The expected
// account, Sepolia chain and cryptographic approval remain independently checked.
export function discoverGuardianWallets(scope:WalletWindow,update:(wallets:GuardianWallet[])=>void) {
  const known=new Map<ExternalWallet,GuardianWallet>()
  let nextId=0
  const publish=()=>{
    const all=[...known.values()],announced=all.filter(v=>v.source==='eip6963')
    update(announced.length?announced:all)
  }
  const announce=(event:Event)=>{
    const detail=(event as CustomEvent).detail
    if(!isWallet(detail?.provider) || typeof detail?.info?.name!=='string' || typeof detail?.info?.rdns!=='string')return
    const previous=known.get(detail.provider)
    known.set(detail.provider,{id:previous?.id || String(++nextId),provider:detail.provider,source:'eip6963',
      label:`${detail.info.name.slice(0,80)} (${detail.info.rdns.slice(0,80)})`})
    publish()
  }
  scope.addEventListener('eip6963:announceProvider',announce)
  scope.dispatchEvent(new Event('eip6963:requestProvider'))
  const injected=scope.ethereum
  const legacy=Array.isArray(injected?.providers) && injected.providers.length?injected.providers:injected?[injected]:[]
  for(const provider of legacy)if(isWallet(provider) && !known.has(provider))known.set(provider,{id:String(++nextId),provider,source:'legacy',
    label:provider.isMetaMask?'MetaMask (legacy provider)':`Injected wallet ${nextId} (legacy provider)`})
  publish()
  return ()=>scope.removeEventListener('eip6963:announceProvider',announce)
}

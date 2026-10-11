import type {CSSProperties} from 'react'

const paths = {
  wallet: <><path d="M4 6h13a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M19 10h-5v5h5M16 12.5h.01"/></>,
  send: <><path d="m5 19 14-14M6 5h13v13"/></>,
  receive: <><path d="M19 5 5 19M18 19H5V6"/></>,
  shield: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
  activity: <><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 3v4m10 3v4M9 17v4"/></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  external: <><path d="M13 5h6v6m-8 2 8-8M9 5H5v14h14v-4"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V4H4v11h4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  key: <><circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-5-5 3-3m0 6 3-3"/></>,
  face: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 9v2m8-2v2m-4-2v5m-4 2c2 2 6 2 8 0"/></>,
  play: <><rect x="3" y="3" width="18" height="18" rx="5"/><path d="m10 8 6 4-6 4V8Z"/></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/></>,
} as const

export function Icon({name,size=20,style}:{name:keyof typeof paths;size?:number;style?:CSSProperties}) {
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>{paths[name]}</svg>
}

export function TokenIcon(){return <span className="token-icon" aria-hidden="true">$</span>}

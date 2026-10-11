import type { Metadata,Viewport } from 'next'
import './globals.css'
import './product.css'

export const metadata: Metadata = {
  title: 'Continuity — Your wallet, your control',
  description: 'An independent Swissquote-inspired hackathon concept: passkey self-custody, sponsored testnet transactions and verified social recovery.',
  appleWebApp:{capable:true,title:'Continuity',statusBarStyle:'default'},
  formatDetection:{telephone:false},
}
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#f5f6f8'}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}

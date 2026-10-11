import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Continuity — Your wallet, your control',
  description: 'An independent Swissquote-inspired hackathon concept: passkey self-custody, sponsored testnet transactions and verified social recovery.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}

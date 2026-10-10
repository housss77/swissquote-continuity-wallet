import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Swissquote Continuity Wallet — Sepolia spike',
  description: 'Safe passkey and sponsored ERC-4337 technical viability spike.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}

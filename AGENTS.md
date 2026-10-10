# Swissquote Continuity Wallet: viability spike

- Work on `spike/safe-passkey`. Do not switch branches, commit, merge, or push without explicit user approval.
- Scope: passkey creation/authentication, Safe initialization, sponsored ERC-4337 execution, and independently verified onchain evidence. Stop after this spike.
- Ethereum Sepolia only, chain ID 11155111. Check the RPC and bundler chain IDs before initializing or submitting. Never use mainnet.
- Follow the official Safe React passkey tutorial and pinned Protocol Kit / Relay Kit APIs. Use Safe contracts and SDK cryptography; no custom Solidity or signature implementation.
- Never log, store in source, or commit private keys, passkey secrets, recovery shares, API credentials, or raw errors containing RPC URLs. Browser storage may hold only public passkey coordinates/credential ID and public operation metadata.
- `.env.local`, other local environment files, build output, and browser reports must remain ignored. `.env.example` contains variable names with empty values only.
- `NEXT_PUBLIC_*` values are public browser configuration, not secrets. Use a separate testnet Pimlico key with Sepolia-only limits and a restricted sponsorship policy.
- A UserOperation hash is not a transaction hash. Never display success before verifying the RPC transaction receipt and matching successful, sponsored EntryPoint event. Pending/timeout is unknown, not success or failure; do not blindly resubmit.
- A zero-value NFT mint is not an ETH transfer. Only transfer a positive amount to a distinct, nonzero recipient when the Safe is funded.
- Do not build recovery, compliance, MPC, SLIP-39, bank APIs, custom smart contracts, hosting, or polished UI.
- Keep dependencies exact and retain the npm lockfile. Document the tested Node/npm versions and any audit findings.
- Verify build, TypeScript, critical security/evidence checks, startup, and git status/diff. Browser automation cannot establish that a real human passkey works.
- Do not delegate to additional agents; this is a solo hackathon spike.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

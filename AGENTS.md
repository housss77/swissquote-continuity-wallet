# Swissquote Continuity Wallet: recovery implementation

- Work on `feat/recovery`. The user authorized implementation, checks, local commits and disposable Sepolia recovery tests. Do not merge, push, rewrite history or discard work without separate authorization.
- Scope: preserve Step 1 and implement 2-of-3 social recovery using the reviewed Candide v0.2.0 contract. Do not add spending policies, compliance, banking infrastructure, MPC, SLIP-39, hosting or polished UI.
- Never send a transaction that changes the accepted Safe `0x6f7c9faba9B6039255f2301935D891ffE6065e8C`. Read-only verification is allowed. Installation requires a separate concrete proposal and explicit user approval; the application currently blocks all recovery writes to this Safe.
- Three distinct guardians, threshold two: backup WebAuthn proxy, server-isolated demo institutional signer and independently controlled third party. No guardian is a spending owner. Do not count labels, checkboxes or duplicated signatures as approvals.
- Recovery rotates to a unique, deployed passkey proxy after the contract delay, preserving Safe address/assets and spending threshold one. It must work without the original passkey/session. Do not reconstruct an old key or reuse shared-signer coordinates.
- Use unmodified upstream recovery Solidity, pinned source/compiler/dependencies, exact bytecode/domain verification, and canonical chain/module/Safe/owner/nonce-bound approvals. No new privileged contracts.
- Three-minute delay is disposable-test-only. It is never suitable for the accepted wallet or a production deployment. Document remaining audit findings and simulated organizational controls.
- Ethereum Sepolia only, chain ID 11155111. Check the RPC and bundler chain IDs before initializing or submitting. Never use mainnet.
- Follow the official Safe React passkey tutorial and pinned Protocol Kit / Relay Kit APIs. Use Safe contracts and SDK cryptography; no custom Solidity or signature implementation.
- Never log, store in source, or commit private keys, passkey secrets, recovery shares, API credentials, or raw errors containing RPC URLs. Browser storage may hold only public passkey coordinates/credential ID and public operation metadata.
- `.env.local`, other local environment files, build output, and browser reports must remain ignored. `.env.example` contains variable names with empty values only.
- `NEXT_PUBLIC_*` values are public browser configuration, not secrets. Use a separate testnet Pimlico key with Sepolia-only limits and a restricted sponsorship policy.
- A UserOperation hash is not a transaction hash. Never display success before verifying the RPC transaction receipt and matching successful, sponsored EntryPoint event. Pending/timeout is unknown, not success or failure; do not blindly resubmit.
- A zero-value NFT mint is not an ETH transfer. Only transfer a positive amount to a distinct, nonzero recipient when the Safe is funded.
- Recovery private keys remain server-side or in independent signer contexts; never store them in browser bundles/storage. Public signed metadata may be registered off-device. `.recovery-data/` remains ignored. Never read the real user's browser profile, clear credentials, or rewrite original attempt history.
- Keep dependencies exact and retain the npm lockfile. Document the tested Node/npm versions and any audit findings.
- Verify build, TypeScript, critical security/evidence checks, startup, and git status/diff. Browser automation cannot establish that a real human passkey works.
- Do not delegate to additional agents; this is a solo hackathon project.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

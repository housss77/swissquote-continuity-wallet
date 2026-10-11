# Swissquote Continuity Wallet: recovery implementation

- Work on `feat/hackathon-polish`, based on the pushed recovery checkpoint `27ad0ef151fe8f70418ab2de5daf56799ad60cd6`. The user authorized UI, demo, USDC, advisory checks, documentation, tests, small local commits and a normal feature-branch push after secret scanning. Never merge, force-push, rewrite history or discard work.
- Scope: customer presentation around the existing cryptography, official Sepolia USDC and advisory transaction review. No dependency migration, new contracts, privileged spending policies, real banking/compliance integration, MPC, SLIP-39 or hosting.
- Do not sign, broadcast, deploy, fund or trigger human authenticator prompts autonomously. Public Sepolia queries and isolated local-fork tests are allowed. Live USDC acceptance requires the human's explicit passkey approval.
- Preserve the human-device Safe `0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06`: no owner, threshold, module, guardian or recovery changes. Only a human-approved test-token transfer may use its spending owner.
- Never send a transaction that changes the accepted Safe `0x6f7c9faba9B6039255f2301935D891ffE6065e8C`. Read-only verification is allowed. Installation requires a separate concrete proposal and explicit user approval; the application currently blocks all recovery writes to this Safe.
- Three distinct guardians, threshold two: backup WebAuthn proxy, server-isolated demo institutional signer and independently controlled third party. No guardian is a spending owner. Do not count labels, checkboxes or duplicated signatures as approvals.
- Recovery rotates to a unique, deployed passkey proxy after the contract delay, preserving Safe address/assets and spending threshold one. It must work without the original passkey/session. Do not reconstruct an old key or reuse shared-signer coordinates.
- Use unmodified upstream recovery Solidity, pinned source/compiler/dependencies, exact bytecode/domain verification, and canonical chain/module/Safe/owner/nonce-bound approvals. No new privileged contracts.
- Three-minute delay is disposable-test-only. It is never suitable for the accepted wallet or a production deployment. Document remaining audit findings and simulated organizational controls.
- Ethereum Sepolia only, chain ID 11155111. Check the RPC and bundler chain IDs before initializing or submitting. Never use mainnet.
- Follow the official Safe React passkey tutorial and pinned Protocol Kit / Relay Kit APIs. Use Safe contracts and SDK cryptography; no custom Solidity or signature implementation.
- Never log, store in source, or commit private keys, passkey secrets, recovery shares, API credentials, or raw errors containing RPC URLs. Browser storage may hold only public passkey coordinates/credential ID and public operation metadata.
- `.env.local`, other local environment files, build output, and browser reports must remain ignored. `.env.example` contains variable names with empty values only.
- `NEXT_PUBLIC_*` values are public browser configuration, not secrets. New deployments keep provider credentials server-side (`PIMLICO_API_KEY`, `PIMLICO_SPONSORSHIP_POLICY_ID`, `SEPOLIA_RPC_URL`) behind the authenticated sponsorship gateway. Legacy local variables remain compatible but must not enter browser bundles. Use a separate Sepolia-only key and restricted sponsorship policy.
- Mobile deployment preparation is authorized. Keep a fixed HTTPS origin/RP and one server with persistent storage; do not silently change wallet identity when moving from localhost. Physical iPhone acceptance remains a human action. Never bypass the bank demo operator control to simplify phone UX.
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

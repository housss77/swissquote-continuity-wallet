# Phone demo handoff — 11 October 2026

The mobile wallet and deployment package are implemented on
`feat/hackathon-polish`. No hosting was provisioned, no public-chain transaction
was submitted, and neither acceptance Safe's configuration was changed.

## Open now

- `http://localhost:3000/login`: real server-verified passkey sign-in/creation.
- `/`: wallet, actual balance and onchain recovery status.
- `/activate`: explicit sponsored NFT activation for a new unfunded Safe.
- `/receive`: exact Circle funding instructions and read-only faucet receipt check.
- `/send`: reviewed USDC transfer requiring the customer's passkey.
- `/install`: iPhone home-screen instructions.
- `/demo`: the existing six-scene pitch with honest historical recovery evidence.
- `/recovery`, `/guardian`, `/lab/recovery`: existing independent recovery ceremony.

The supported production standalone server is running locally at handoff. After
shutdown, use `npm run build` then `npm run start`. Do not start a second server
on port 3000. `npm run mobile:check` is read-only.

## What changed

Passkey login now verifies single-use server challenges, exact origin/RP, P-256
credentials, user verification, signatures and counters. Public credential
metadata is persisted off-device; private keys stay with the authenticator.
HttpOnly sessions restore the wallet without granting transaction-signing power.
The existing spending signature and receipt verification remain mandatory.

The same-origin RPC/sponsorship gateway keeps provider credentials server-side,
checks the session's Safe, Sepolia, EntryPoint v0.6, supported intent and existing
gas budget, injects only the server policy and forwards a send once. A compatible
Swissquote provider can replace Pimlico through server configuration. A real bank
service, bank SSO and funding agreement are not implemented.

The UI adds phone navigation/safe areas, passkey onboarding, an installable PWA,
honest offline feedback, and a reviewed activation NFT requiring no token funding.
The USDC page now leads to an exact recipient/network funding guide. A public
faucet transaction can be checked for a successful receipt, confirmations and an
official-token Transfer to this Safe. No faucet click is treated as funding.

The reviewed recovery implementation supports an explicitly configured HTTPS RP
and persistent registry. Existing operator authentication, guardian proofs,
allowlists and protected-wallet restrictions remain intact. The original
cryptographic architecture, Solidity, SDK pairing and gas allowance are unchanged.

Implementation files are recorded in commits
`d7861b368d631d8eadc1c1dc9e4ba656b7dc6d50` (verified sessions/gateway) and
`63ee8c0c68b498bcaf0e93d3681e9a4ade89b7c6` (mobile UI/deployment). The delivery
documentation is a subsequent checkpoint. The preserved recovery branch and main
were not changed or merged.

## Verification

| Check | Result |
| --- | --- |
| TypeScript and production build | PASS |
| Unit tests | 80 passed |
| Auth/gateway server tests | 12 passed |
| Existing recovery server tests | 5 passed |
| Chrome browser suite against production | 36 passed |
| Mobile WebKit suite against production | 20 passed; Chromium-only authenticator test skipped |
| Real Sepolia browser reads | 3 passed; virtual credential, no signing/broadcast |
| Supported standalone entrypoint | PASS; repeated 3 live-read and 7 mobile/offline tests |
| Isolated Sepolia-fork recovery | 29 passed, including all guardian pairs and revoked-owner checks |
| Git/index/history/browser-bundle secret scan | PASS; known local credentials and private-key markers absent |
| Compose configuration | PASS |
| Docker image execution | Not verified; Docker Desktop engine unavailable |
| Dependency audit | 6 low, 0 moderate/high/critical; no speculative SDK migration |
| Lint | No lint command configured |
| Physical iPhone Face ID / live USDC | Awaiting human action on final HTTPS domain |

The audit's nonzero exit reflects the six documented low findings, not a clean
dependency audit. Build retains the known ox dynamic-import and transitive Gelato
deprecation warnings. Automated authenticator tests do not establish physical
Face ID or physical Windows Hello acceptance.

Real rendered screenshots were inspected at 1440×900, 390×844 and 360×800 across
multiple passes. The final production screenshots are in ignored
`.dist/mobile-design/production/`: login, welcome, wallet, send, receive, install
and demo for each width. Browser fixtures stay clearly synthetic. Real wallet
screens show **0 USDC**, not fabricated funding. Visual/live checks caught and
fixed optional JSON-RPC params and Protocol Kit read-batch compatibility; batched
sponsorship/submission remains refused.

Read-only readiness rechecked the same recovered owner, spending threshold one,
three guardians/threshold two, no pending recovery, retained ERC-4337 module,
original Safe's expected owner/configuration/nonces, four historical successful
receipts, matching events, actual delay and NFT ownership. No new transaction
hash is claimed. Historical hashes remain in `docs/recovery-evidence.md`.

## Remaining prerequisites and limits

1. Deploy one persistent Node/Docker service with a fixed HTTPS hostname, exact
   `APP_ORIGIN`, public build-time RP setting and private server provider fields.
   The exact setup is in [phone-deployment.md](phone-deployment.md). Run the Docker
   smoke test on that host; do not use ephemeral storage or multiple replicas.
2. Create a **new disposable** phone wallet on that domain. Localhost Windows
   credentials cannot migrate. Perform one human-approved activation NFT first.
3. Obtain official Ethereum Sepolia test USDC for the exact phone Safe, then
   approve one controlled transfer and verify its receipt/logs. USDC acceptance
   remains unverified; the established Windows Safe also currently holds zero.
4. Fresh live recovery still requires separate guardians, secure operator
   provisioning/allowlisting, independent signing and the real delay. Historical
   recovery remains the reliable short jury story; bank identity verification is
   simulated. No bypass was added to make this ceremony appear instant.

Production banking limits remain: threshold-one spending, possible two-guardian
collusion, 180-second test-only delay, upstream recovery audit considerations,
no real institutional identity/HSM/alert infrastructure, and demo-only file-backed
sessions/rate limits requiring operational hardening. See
[security limits](security-and-limitations.md) and
[sponsorship boundary](sponsorship-adapter.md).

## Short presenter check after deployment

1. Open HTTPS `/demo` on the jury iPhone and navigate forward/back. Confirm earlier
   recovery is labelled historical.
2. Open `/login`, create a new wallet and approve its real authenticator prompt.
   Verify the address, sign out/sign in, and confirm the address is unchanged.
3. Choose Activate wallet → Review test activation → Confirm with passkey **once**.
   Check confirmation/explorer evidence; unresolved means check, never resubmit.
4. If the wallet is funded, review/send 1 test USDC to a distinct address once.
   Otherwise demonstrate the confirmed NFT and label USDC as awaiting funding.
5. If RPC, passkey or sponsor fails, use `/demo`'s existing verified receipt links.
   Preserve the failed/pending attempt; do not claim live success or reset keys.

Initial faucet waiting and the hosting setup occur before this short checklist.
No passwords, keys or operator tokens are needed for the historical presentation.

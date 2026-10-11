# Hackathon polish baseline

Baseline: `27ad0ef151fe8f70418ab2de5daf56799ad60cd6`, pushed to
`housss77/swissquote-continuity-wallet` on `feat/recovery`.
Implementation branch: `feat/hackathon-polish`. Main remains unchanged.

Rechecked 2026-10-11 using the existing pinned dependencies:

| Check | Result |
| --- | --- |
| Unit tests | 64 passed |
| TypeScript | Passed |
| Server authentication tests | 4 passed |
| Isolated local Sepolia fork | 29 checks passed; virtual authenticators, not Windows Hello |
| Browser regression | 14 passed against the production server, isolated Chrome contexts |
| Production build | Passed |
| Secret scan | No findings in 73 source files/index and existing client bundles |
| Git | Clean recovery checkpoint; expected origin; recovery branch already pushed |

Existing build warnings: viem/ox dynamic dependency and deprecated transitive
Gelato relay package. No SDK upgrades are planned.

Read-only preflight confirmed the human-device disposable Safe retains the
recovered owner, spending threshold one, exactly three guardians with threshold
two, and no pending recovery. Official Circle Sepolia USDC is deployed, reports
six decimals, and the Safe has zero USDC and zero ETH. Live USDC requires faucet
funding and a human Windows Hello approval. No public-chain transaction was sent.

The original Safe and human-device recovery Safe are protected from configuration
changes. Their existing passkeys, approvals, registry and history are preserved.

## Customer interface checkpoint

Phase 1 checks: 65 unit tests, 4 server tests and 20 isolated browser tests passed;
TypeScript and production build passed. Existing technical tests now target
`/lab` and `/lab/recovery`; their security assertions remain intact. The optional
live-read suite remains separate from ordinary browser regression.

First rendered design review inspected actual public-wallet desktop and 390px
mobile screenshots. Raw diagnostics remain in the lab. New write restrictions
protect both acceptance wallets' configuration; institutional authentication is
unchanged. USDC submission and presentation mode are subsequent checkpoints.

## Evidence presentation checkpoint

Six-scene presentation and network fallback browser checks passed. TypeScript
and the evidence-provenance unit test passed. The new read-only `demo:check`
independently rechecked the published receipts, matching module events, actual
252-second waiting period, recovered sponsored operation and NFT ownership.
Current ownership, guardian configuration and the original Safe's baseline
nonces passed. USDC remains zero; no live USDC success is claimed.

## Final regression and design review

Final production build and standalone TypeScript passed. Unit tests: **75**;
server tests: **5**; browser tests against production: **29**, all passing.
The existing **29** isolated local-fork recovery checks passed during this run.
No lint script/configuration exists; no lint success is asserted. `npm audit`
reported six low findings, no moderate/high/critical findings; dependencies were
not upgraded. Secret scan covered working files, the index, built client chunks
and reachable Git history with zero findings.

Rendered QA used desktop 1440×900, laptop 1280×800, mobile 390×844 and 360×800.
First pass inspected wallet hierarchy and mobile navigation. Second pass
inspected transfer spacing, historical demo labeling and recovery status. Final
refinement tightened form margins, waited for chain reads before screenshots,
and fixed the unlimited-approval integer overflow. The regression now asserts
that warning view fits 360 pixels. Final screenshots are local, ignored artifacts
under `test-results/design-final/`; regenerate with `npm run demo:screenshots`.
These screenshots use public live state, not the real customer's Chrome profile.

Read-only readiness at **2026-10-11T05:03:36.470Z** passed all recovered/original
Safe and historical-evidence checks. USDC remained zero; live USDC and its
sponsorship eligibility remain unverified. No production bank/guardian controls,
legal approval or new public-chain transaction was asserted.

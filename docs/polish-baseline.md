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

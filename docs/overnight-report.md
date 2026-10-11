# Overnight delivery — 11 October 2026

## 1. What was implemented

Continuity now has a restrained, responsive banking-style interface; an evidence-backed six-scene jury presentation; exact-decimal gasless test USDC preparation/signing/verification; and transparent advisory transaction review. Business, regulatory, security, pitch and morning-readiness documentation are included. The validated recovery cryptography, SDK versions and institution authentication remain intact.

No public-chain transaction, deployment, token transfer, owner rotation, guardian rotation, threshold/module change or human authenticator prompt was performed unattended. The two accepted Safes' configuration is locked in the UI/server, with a regression proving that allowlisting cannot bypass the human Safe's restriction. The original Safe is also spending read-only. These restrictions are application protections, not new contracts.

## 2. Screens and UX

| URL | Purpose |
| --- | --- |
| `/` | Wallet, actual USDC balance, address copy/explorer, passkey connection, chain-derived recovery status and verified activity |
| `/send` | Exact six-decimal test USDC form, faucet/Max, simulation and sponsorship review, explicit passkey confirmation, preserved operation evidence |
| `/protection` | Actual registered guardians; registration distinct from current cryptographic access and real-world availability |
| `/recovery` | Beginner recovery overview and progression; accepted-wallet preservation; advanced operator workflow for separately authorized wallets |
| `/activity` | Independently reverified customer transfer receipts and clearly labeled historical acceptance evidence |
| `/demo` | Approximately 3:45 presentation, Next/Back, real historical receipt links, optional read-only current-state check and network fallback |
| `/guardian` | Existing independent wallet/provider/account validation and signing ceremony, with the shared presentation shell |
| `/lab`, `/lab/recovery` | Original technical controls, diagnostics and manual recovery workflow |
| `/lab/safety` | Unsigned deterministic simple-transfer and unlimited-allowance examples; cannot sign/send |

Customer pages omit raw gas JSON, EntryPoint internals and operator tokens. Technical data stays behind advanced disclosures or in the lab. Existing passkeys, signed approvals and attempt history were preserved. Confirmed evidence replaces the stale pending display only after fresh verification; cross-tab changes invalidate stale proof. Duplicate sends are blocked by persistence, nonce checks and a Web Lock in the customer send flow. There is no automatic retry.

The recovery overview does not replace every operator ceremony with consumer bank infrastructure. Real guardian signatures, file exchange and the institutional operator requirement remain in the advanced workflow; the presentation avoids that coordination by showing honest historical evidence.

## 3. Confirmed existing functionality

The original NFT sponsor/intent/gas pipeline passes regression unchanged. Recovery signature binding, distinct guardians, each two-guardian combination, cancellation, replay rejection, contract waiting period, owner revocation and fresh-session replacement signing passed the isolated fork suite. Institutional authentication/origin/allowlist checks passed. Browser tests preserve actual recovery and guardian import/provider behavior.

Read-only Sepolia verification at **2026-10-11T05:03:36.470Z** passed the current recovered owner, spending threshold 1, recovery threshold 2, three expected guardians, enabled ERC-4337 module, no pending recovery and unchanged original Safe nonces/configuration. Four real historical recovery/NFT receipts, matching module events, the actual 252-second delay and NFT ownership were rechecked. This does not claim new hardware testing during polish.

## 4. Bonus and feature status

| Feature | Honest status |
| --- | --- |
| Gasless NFT spending / recovered spending | **Implemented and live verified earlier**; historical receipts refreshed read-only |
| Real Windows Hello B+C recovery | **Implemented and live verified earlier**; no new recovery or device-loss test performed here |
| Gasless official test USDC | **Implemented and automated-tested**; **blocked awaiting human funding/signing** |
| Transaction safety review | **Implemented and automated-tested**, advisory only; no enforced spending firewall |
| Sanctions/compliance service | **Not attempted**; status is Not checked |
| Bank account/brokerage integration, stronger customer cosigning | **Documented proposal only** |
| Business economics and Swiss regulatory assessment | **Documented proposal only**; no forecast or legal approval |

USDC requires a successful receipt, exact sponsored UserOperation event and matching official token Transfer within the operation's bundle interval. Whole-block balance reconciliation accounts for concurrent transfers; unsupported archive/log reads are explicitly unavailable. No false success is inferred from HTTP 200, sponsorship, dummy signatures or a local hash.

## 5. Human actions and intentional exclusions

The disposable Safe has **0 USDC and 0 ETH** at the last check. Fund only `0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06` through Circle's free Ethereum Sepolia USDC faucet. Use the existing **Continuity Replacement** Chrome context and Windows Hello to approve one reviewed transfer. Native ETH is not required for sponsored fees. Live USDC-method paymaster eligibility and real signed inclusion remain unverified.

No banking APIs, mandatory bank spending key, sanctions provider, privileged guard/module, mainnet deployment, MPC/SLIP-39, SDK migration or new recovery architecture was added. The validated recovery checkpoint remains preserved. No original/disposable Safe configuration changes or backup rotation were made.

## 6. Validation and screenshots

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | 75 passed |
| `npm run test:recovery:server` | 5 passed |
| `npm run test:browser` | 29 passed against production, isolated Chrome contexts |
| `npm run test:recovery` | 29 isolated-fork checks passed; virtual authenticators, not Windows Hello |
| `npm run build` and `npm run start` | PASS; production server available on localhost:3000 |
| `npm run demo:check` | Core evidence/state PASS; aggregate WARN for zero USDC / live acceptance still required |
| Source/index/client/history secret scan | Zero findings; environment and local registry ignored/untracked |
| `npm audit` | Six low findings; zero moderate/high/critical; no speculative upgrades |
| Lint | No lint script/configuration exists; not reported as passed |

Three rendered visual reviews inspected hierarchy, spacing, addresses, honest status labels and responsive forms. Screenshots cover 1440×900, 1280×800, 390×844 and 360×800. The unlimited-approval integer overflow was fixed and regression-tested; form spacing was tightened and screenshots now wait for chain state. Final artifacts are ignored local files under `test-results/design-final/`, including wallet, fresh wallet, protection, recovery, send, demo and safety views. Regenerate with `npm run demo:screenshots`. Automated balance/receipt fixtures are explicitly synthetic, not evidence of live USDC success.

## 7. Security issues and limits

Threshold-one spending can be bypassed through another client by a stolen usable passkey. Two recovery guardians can collude. Institutional identity and organizational independence remain simulated. The 180-second test delay, absent alerts/HSM/production identity service and upstream recovery L-04 issue require production review. Owner revocation does not erase synchronized passkeys. Backup access/rotation may need separate authorized maintenance. Two confirmations are not finality; RPC/paymaster availability and public testnet API-key abuse remain risks.

See [security-and-limitations.md](security-and-limitations.md) and the preserved [recovery design](recovery-design.md). No remaining limitation was converted into a passed compliance or cryptographic check.

## 8. Git delivery

Repository: `housss77/swissquote-continuity-wallet`; branch [feat/hackathon-polish](https://github.com/housss77/swissquote-continuity-wallet/tree/feat/hackathon-polish).

Validated implementation HEAD before this final report: `ceb0e2f`.
Working tree at that checkpoint: `## feat/hackathon-polish`, no changes.

| Checkpoint | Commit |
| --- | --- |
| Preserved recovery baseline | `258c783` |
| Customer interface / advanced lab | `18be80c` |
| Evidence-backed presentation/readiness | `9dbf9fb` |
| Sponsored test USDC implementation | `1144182` |
| Advisory review / evidence-state hardening | `5362ce6` |
| Business, regulatory and security material | `93603d8` |
| Final regression, screenshots and history scanner | `ceb0e2f` |

This report is committed as the final documentation checkpoint; its own hash is supplied in the final handoff and `git log -1`. Delivery uses a normal feature-branch push after scanning and verifies origin matches HEAD. No force-push or main merge is authorized or needed. `feat/recovery` remains `27ad0ef151fe8f70418ab2de5daf56799ad60cd6`; main remains `500e13f281fb8f8ffd2654aab805450fb8c845c9`.

## 9. Morning verification — 3–5 minutes

1. Run `npm run demo:check`; confirm core evidence/configuration PASS. If RPC is unavailable, use explicitly historical evidence. A mismatch means stop live signing.
2. Open **http://localhost:3000/demo** and rehearse the six scenes. The real receipt links are ready; no operator credential or original passkey is needed.
3. Before the pitch, fund the demo Safe using Circle's free USDC faucet. In **Continuity Replacement**, select the public demo wallet and open `/send?demo=1`; refresh the actual balance. Recheck/preserve any completed attempt; never clear an unresolved one.
4. Review **1 test USDC** to `0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86`. Verify asset, recipient, wallet, network and sponsor. Approve **Confirm with passkey** once using Windows Hello.
5. Only after confirmed receipt/event verification, open the actual transaction explorer link and record its public hash. If unresolved or rejected, do not retry during the pitch; show the verified historical NFT/recovery fallback.

Faucet/provider waiting can exceed this short checklist. [Exact readiness and fallback](demo-readiness.md), [controlled transfer steps](usdc-acceptance.md), [3:45 narration / six-minute technical pitch / Q&A](demo-script.md).

## 10. Source-file inventory

The exact baseline-to-delivery file list follows; original evidence/tests remain present.

- AGENTS.md
- README.md
- app/activity/page.tsx
- app/api/demo/route.ts
- app/demo/page.tsx
- app/globals.css
- app/lab/page.tsx
- app/lab/recovery/page.tsx
- app/lab/safety/page.tsx
- app/layout.tsx
- app/page.tsx
- app/protection/page.tsx
- app/recovery/page.tsx
- app/send/page.tsx
- components/GuardianApproval.tsx
- components/RecoveryPanel.tsx
- components/WalletSpike.tsx
- components/product/Activity.tsx
- components/product/Demo.tsx
- components/product/Protection.tsx
- components/product/Recovery.tsx
- components/product/Safety.tsx
- components/product/Send.tsx
- components/product/Shell.tsx
- components/product/Wallet.tsx
- components/product/useWallet.ts
- docs/business-case.md
- docs/demo-checklist.md
- docs/demo-readiness.md
- docs/demo-script.md
- docs/polish-baseline.md
- docs/security-and-limitations.md
- docs/swiss-regulatory-notes.md
- docs/usdc-acceptance.md
- lib/customer-credentials.ts
- lib/demo-check.ts
- lib/demo-evidence.json
- lib/demo-report.ts
- lib/errors.ts
- lib/operations.ts
- lib/product.ts
- lib/proof.ts
- lib/recovery/server.ts
- lib/send-session.ts
- lib/transaction-review.ts
- lib/usdc.ts
- lib/wallet.ts
- package.json
- playwright.config.ts
- scripts/capture-ui.mjs
- scripts/check-secrets.mjs
- scripts/demo-readiness.ts
- tests/browser/demo.spec.ts
- tests/browser/live-read.spec.ts
- tests/browser/product-fixtures.ts
- tests/browser/product.spec.ts
- tests/browser/safety.spec.ts
- tests/browser/send.spec.ts
- tests/browser/spike.spec.ts
- tests/demo-report.test.ts
- tests/evidence.test.ts
- tests/product.test.ts
- tests/recovery/server.test.ts
- tests/sponsorship.test.ts
- tests/storage.test.ts
- tests/usdc.test.ts
- docs/overnight-report.md

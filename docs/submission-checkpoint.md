# Final submission checkpoint

Validated on 11 October 2026 with Node 24.16.0 and npm 11.13.0.

## Delivered

- Judge-focused README; previous technical notes retained in [spike history](spike-history.md).
- Six-scene `/demo`: simulated Swissquote entry, wallet creation, recovery enrollment, sponsored spending, device loss and restored access.
- Native proof dialogs with the exact historical Safe deployment, enrollment, initiation, owner rotation and recovered NFT receipts.
- Explicit simulation and historical-evidence labels. No real credentials, WebAuthn prompts, signing, broadcast or wallet/session-storage changes in the walkthrough.
- Keyboard dismissal and focus return in Chromium and WebKit; scene navigation returns to the top on phones.
- Updated [three-minute narration and Q&A](demo-script.md) and [readiness instructions](demo-readiness.md).

## Final checks

| Check | Result |
| --- | --- |
| TypeScript | PASS |
| Unit tests | 80 passed |
| Authentication/provider server tests | 12 passed |
| Recovery authorization server tests | 5 passed |
| Chromium browser regression | 57 passed |
| Mobile WebKit regression | 34 passed, 1 skipped |
| Production build and startup | PASS |
| Secret scan, staged files, client bundle and reachable Git history | PASS; zero findings |
| Git whitespace check | PASS |
| Production dependency audit | 6 low; no moderate, high or critical findings |

The WebKit skip is the virtual-authenticator server sign-in test: that fixture
uses Chromium's CDP authenticator support. It passes in Chromium. Automated
browser checks are not physical iPhone or Windows Hello acceptance.

The build retains upstream viem/ox dynamic-dependency and transitive Gelato
deprecation warnings. The six low audit findings are the pinned Safe SDK's
transitive elliptic dependency chain; resolving them requires a breaking SDK
migration, which was deliberately excluded from this submission checkpoint.

Desktop (1440px) and phone (390px) sign-in, recovery and proof-dialog screenshots
were captured and visually inspected in ignored
`test-results/demo-final-visuals/`. Layout regression also covers 1280px and
360px. Screenshots and temporary browser files are not committed.

## Evidence and limits

The added original-spend receipt and block match [the existing human acceptance
record](recovery-evidence.md). All four recovery receipts remain unchanged.
No onchain writes or customer authenticator prompts were performed during this
checkpoint; neither preserved Safe was changed.

Live USDC transfer, hosting and physical iPhone acceptance remain outstanding.
Swissquote authentication and institutional identity operations are simulated.
Two guardians can collectively take over after the delay; the 180-second delay
is test-only. Existing recovery and spending security controls were preserved.
The historical contract-fork and live recovery acceptance were not rerun for
this presentation-only change.

## Git delivery

The verified recovery checkpoint `27ad0ef151fe8f70418ab2de5daf56799ad60cd6`
is retained. The submission is committed on `feat/hackathon-polish`, pushed
normally, then fast-forwarded into `main` under the user's explicit approval.
No forced push, history rewrite, discarded changes or credential files are
included. The final commit identifier is available through `git rev-parse HEAD`
and the delivery response.

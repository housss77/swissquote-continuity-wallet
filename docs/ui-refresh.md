# Banking interface refresh — 11 October 2026

Open the production app at http://localhost:3000/ and refresh with Ctrl+Shift+R if an older tab is still open. Use `/send` for the new transfer experience and `/demo` for the evidence-backed presentation. The production server starts with `npm run start` after `npm run build`.

The customer interface now uses a desktop sidebar, an orange monogram, a charcoal USDC account surface, consistent type and spacing, and phone navigation with explicit text labels. The wallet separates actual assets, passkey access, recovery registration and historical activity. Send uses Details → Review → Confirm, an amount-first form, a separate sender panel and an obvious funding path when the actual token balance is zero. The review retains the full addresses, amount, test network and advisory limitations before the explicit passkey action.

Recovery, activity, sign-in, funding and presentation screens share the same design system. Copy now announces success to assistive technology. Unverified inclusion cannot receive the confirmed heading or styling. Public wallet viewing continues to be distinguished from authenticated spending access.

The change is limited to presentation and browser checks. The existing sponsorship preparation, gas allowance, transaction intent binding, signature verification, submission and independent receipt checks remain in place. Recovery contracts, authorization controls, passkeys, stored attempts and both protected Safes were preserved. No live transaction was signed or sent for this refresh. No dependencies were added.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Unit tests | 80 passed |
| Authentication and gateway server tests | 12 passed |
| Recovery authorization server tests | 5 passed |
| Chrome production browser tests | 43 passed |
| WebKit mobile production browser tests | 20 passed; 1 Chromium-only virtual authenticator test skipped |
| Production build | Passed; existing upstream ox warning and Gelato deprecation remain |
| Source, index, history and client-bundle secret scan | Passed; no findings |

Two visual passes were inspected. The first caught an occluded mobile network badge and low-contrast supporting labels; both were corrected. Final production screenshots cover 1440×900, 1280×800, 390×844 and 360×800, including wallet, send, recovery settings, activity, login, demo, zero balance and unresolved operation. Stored locally under `.dist/banking-design/pass2/`; this ignored directory is not pushed.

The design screenshots with positive balances use explicitly synthetic RPC fixtures. They are layout evidence, not proof that the public Safe is funded or that a transfer occurred. Browser coverage includes cancellation, preserved attempts, pending state across reload, independently checked synthetic receipts, protected recovery configuration and unauthorized operator errors. WebKit automation does not establish physical iPhone Face ID acceptance.

The two initial development-server timing failures passed against the final production build; there are no outstanding test failures. Existing HTTPS hosting, actual faucet funding, human passkey approvals and physical-device acceptance prerequisites remain as documented in `phone-deployment.md` and `mobile-handoff.md`.

Design references inspected: [Monzo current accounts](https://monzo.com/current-account), [Revolut](https://www.revolut.com/) and [Wise](https://wise.com/). No affiliation, released bank product, real bank integration or regulatory approval is implied.

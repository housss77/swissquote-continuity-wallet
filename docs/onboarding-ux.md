# Guided onboarding

Start at `/onboarding`: Swissquote demo account connection → real passkey wallet creation → `/setup` for optional recovery. The client ID is presentation data only, is not saved, and grants no authentication or spending authority. No real bank credentials are requested. Swissquote SSO remains an integration prerequisite.

The existing `/login` passkey sign-in, technical labs and `/guardian` independent signing workflow remain available. Manrope is bundled locally with its SIL Open Font License.

Recovery setup first requires actual wallet deployment, then guides the customer through a separate backup passkey, independent friend's enrollment approval and a final onchain configuration review. The same verified recovery implementation checks distinct signers, public credential binding, deployed signer code, canonical enrollment proof, sponsorship and receipts. A setup state or invitation download is never labelled onchain protection.

Funded backup registration still requires the existing demo operator credential, supplied manually inside an advanced section. New test Safes must be authorized by the existing server allowlist. Neither control is bypassed for onboarding. Friend enrollment uses signed public request/approval files; email invitation delivery is not implemented. The 180-second delay and institutional identity checks remain explicitly test-only and simulated, respectively.

Both accepted Safes are preserved. The Send asset selector supports USDC transfer; ETH shows an actual balance only. Unsupported ETH sending is not presented as available. Assets share a Safe address on Sepolia. Quotes and pending attempts lock asset selection.

Automated tests use synthetic RPC fixtures and cannot establish physical Windows Hello/Face ID acceptance. All new wallet creation, backup creation, enrollment and signing require explicit human actions. Existing passkeys and attempt histories are preserved.

## Delivery checks

- TypeScript and production build passed. Existing upstream ox dynamic-import and Gelato deprecation warnings remain.
- 80 unit tests, 12 authentication/gateway server tests and 5 recovery authorization server tests passed.
- 51 Chrome browser tests passed; WebKit passed 28 with one Chromium-only virtual-authenticator test skipped.
- Source, staged files, history and client-bundle secret scan passed with no findings. Only `.env.example` is tracked; local credentials remain ignored.
- Desktop 1440px/1280px and phone 390px/360px layouts were captured and inspected. A font-weight defect and ambiguous browser selectors were corrected before the final run. The bundled Manrope file has a verified weight axis of 200–800.
- Local screenshots: `.dist/onboarding-design/` and `.dist/banking-design/onboarding-final/`. Positive balances and unprotected-wallet setup screenshots use synthetic RPC fixtures, never live acceptance evidence.
- No public-chain transaction, wallet owner change or guardian configuration change was performed.

For a recording, open `http://localhost:3000/onboarding`, continue with the demo client ID, and show the real passkey wallet step. Actual new-wallet creation requires human device approval; an undeployed wallet needs explicit activation before recovery. Existing protected wallets can be connected through `/login` and inspected at `/protection`. `/demo` remains the historical evidence presentation without new signing.

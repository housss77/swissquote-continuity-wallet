# Swissquote Continuity

**Your keys. A way back in.** A self-custody wallet companion concept for Swissquote, built for a hackathon on **Ethereum Sepolia only** (chain ID 11155111).

Customers approve spending with a passkey. Two of three recovery guardians can replace a lost spending owner after an onchain delay, keeping the same wallet address and assets. Swissquote does not have an ordinary spending key. This is an independent prototype, not a released Swissquote product or a connected banking service.

## Start here: jury walkthrough

Open **[http://localhost:3000/demo](http://localhost:3000/demo)** after starting the app. Follow the customer story from account entry and wallet creation through recovery and restored access.

The walkthrough is **scripted and simulated**: its controls do not authenticate, create passkeys, sign, submit transactions, or accelerate the real recovery timelock. Evidence popups show **previously verified Sepolia transactions**, with explorer links and provenance. The simulated story is separate from the functioning wallet routes and never claims to be a new live recovery.

| Capability | Honest submission status |
| --- | --- |
| Passkey-controlled Safe and sponsored NFT operation | Real Sepolia transaction verified; human Windows Hello use reported by the presenter |
| Same-address 2-of-3 recovery and recovered spending | Human-operated B+C recovery verified onchain; all three pairs also tested on a separate disposable Safe with virtual authenticators |
| Gasless USDC transfer | Implemented and automated-tested; **no live USDC transfer verified** |
| Transaction risk review | Implemented advisory checks; no sanctions provider, legal approval, or spending firewall |
| Swissquote sign-in and institutional identity checks | Simulated; no real Swissquote account integration |
| Friend guardian | Genuine independent wallet-signature workflow; email invitations are future work |
| iPhone experience | Responsive web app and deployment preparation; hosting and physical iPhone acceptance remain outstanding |

## Real proof behind the story

Historical human-device acceptance wallet: [`0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06`](https://sepolia.etherscan.io/address/0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06).

| Verified action | Sepolia transaction |
| --- | --- |
| Original passkey spending and Safe deployment | [0x512f35b9…](https://sepolia.etherscan.io/tx/0x512f35b9d95d590aa0076a9331ba47313e7f6e1349113649f2f357b168fe6050) |
| Three guardians enrolled, threshold two | [0x52b695e1…](https://sepolia.etherscan.io/tx/0x52b695e1c6efc91daecbe61054265bf4a049924d8711b5aa8b535ecd8009c6be) |
| Swissquote mock + independent guardian initiate recovery | [0x0279e443…](https://sepolia.etherscan.io/tx/0x0279e44352fe80bec8c3a3372e9d5acc40ce0d7cc133e554404a6d6d28876c21) |
| New owner installed at the same Safe address | [0x46632998…](https://sepolia.etherscan.io/tx/0x46632998eeaccb86aa4ede0819933ef553973a2ef9ee3f1b706efafc4a97d6bc) |
| New passkey signs a sponsored NFT mint | [0x2c48f393…](https://sepolia.etherscan.io/tx/0x2c48f3936c4c04f36a073476f2e194ddc71f1514456e38906ed35c3bbc08c579) |

Independent receipt, event, owner, guardian and NFT-ownership checks are recorded in [recovery evidence](docs/recovery-evidence.md); the demo's public dataset is [demo-evidence.json](lib/demo-evidence.json). The observed recovery wait was 252 seconds against a 180-second **test-only** contract delay. NFT mints transferred zero ETH and are not USDC-transfer evidence. Receipts prove cryptographic authorization, not physical hardware or complete loss of synchronized credentials.

## Run locally

Tested with **Node 24.16.0 / npm 11.13.0**. Exact dependencies are pinned in the lockfile.

```sh
npm ci
npm run build
npm run start
```

Open `/demo` for the scripted walkthrough. Development alternative: `npm run dev`. Run only one server on port 3000. For live wallet features, create an ignored `.env.local` from `.env.example` **only if it does not already exist**; never overwrite an existing configuration.

Provider credentials belong on the server. The main variable names are:

- `SEPOLIA_RPC_URL`, `PIMLICO_API_KEY`, `PIMLICO_SPONSORSHIP_POLICY_ID`, `SPONSORSHIP_PROVIDER`.
- `APP_ORIGIN`, `NEXT_PUBLIC_PASSKEY_RP_ID`, `CONTINUITY_DATA_DIR` for fixed-origin authentication and persistent storage.
- `NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS`, `NEXT_PUBLIC_RECOVERY_DELAY_SECONDS`, `NEXT_PUBLIC_VERIFICATION_GAS_BPS` for public contract/configuration settings.

Use a Sepolia-only Pimlico key and enabled policy with available sponsorship budget. A sponsorship quote or HTTP 200 is not a successful transaction. The [sponsorship adapter](docs/sponsorship-adapter.md) documents the replaceable provider boundary; no real Swissquote paymaster is connected.

Actual recovery on a **new disposable Safe** additionally requires separate server-side `RECOVERY_RELAYER_PRIVATE_KEY`, `RECOVERY_INSTITUTIONAL_PRIVATE_KEY`, `RECOVERY_DEMO_OPERATOR_TOKEN`, and an explicit `RECOVERY_ALLOWED_SAFE_ADDRESSES`. The relayer needs Sepolia gas; the operator credential must be entered through the existing protected demo controls. These controls are not bypassed by onboarding. Do not expose tokens, keys or credential-bearing URLs, and do not alter either preserved acceptance Safe.

Live USDC needs official Circle Sepolia test USDC at the exact spending Safe and the human's passkey approval. See [controlled USDC acceptance](docs/usdc-acceptance.md). Test USDC has no real-world value; sponsored spending does not require the Safe to hold ETH.

For phones, use a **stable HTTPS domain and one persistent Node server**. Plain LAN HTTP does not support secure passkey use; localhost credentials cannot migrate to a different hostname. Hosting is not provisioned. See [phone deployment](docs/phone-deployment.md).

## Product and technical routes

`/onboarding` account entry → wallet → recovery setup · `/login` real wallet passkey sign-in · `/` wallet · `/send` USDC · `/setup` recovery enrollment · `/protection` settings · `/recovery` recovery flow · `/guardian` independent approvals · `/activity` historical receipts. Technical workflows remain under `/lab`.

## Verification and limits

Final test counts, visual review and dependency findings: [submission checkpoint](docs/submission-checkpoint.md).

```sh
npm run typecheck
npm test
npm run test:auth:server
npm run test:recovery:server
npm run test:browser
npm run test:mobile
npm run build
npm run check:secrets -- --history
```

Browser tests use isolated fixtures/virtual authenticators; they are not physical Windows Hello or iPhone acceptance. `npm run demo:check` performs **read-only** contract, receipt, balance and historical-state checks when RPC is configured. Isolated-fork requirements and checks are documented in [recovery design](docs/recovery-design.md). Never run live deployment/recovery scripts merely to view the demo.

Spending threshold is one: a stolen usable spending passkey can authorize transactions outside this UI. Any two compromised or colluding guardians can take over after the delay. The bank identity process and operational independence are simulated; production alerts, HSM infrastructure and banking integration are absent. The recovery module's upstream review does not audit this application. This is not production-ready or FINMA-certified.

Read [security and limitations](docs/security-and-limitations.md), [business case](docs/business-case.md), [Swiss regulatory notes](docs/swiss-regulatory-notes.md), and the [pitch/Q&A](docs/demo-script.md). Historical implementation details and spike diagnostics are preserved in [spike history](docs/spike-history.md). SDK/source attribution is in [third-party notices](THIRD_PARTY_NOTICES.md).

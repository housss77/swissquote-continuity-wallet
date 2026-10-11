# Swissquote Continuity — hackathon concept

**Phone-ready build:** start at `/login` for Face ID/passkey sign-in, `/activate`
for an explicit sponsored test NFT activation, `/receive` for precise Circle
funding checks, and `/demo` for the jury. The installable mobile web app needs a
stable HTTPS deployment. Follow [phone deployment and acceptance](docs/phone-deployment.md)
and [replaceable Swissquote sponsorship boundary](docs/sponsorship-adapter.md).
Provider credentials now remain server-side. No hosting is provisioned yet;
physical iPhone signing and live USDC remain human verification steps.

Start the polished jury walkthrough at **http://localhost:3000/demo**. Customer
routes: `/` wallet, `/send` test USDC, `/protection` recovery settings, `/recovery`
guided recovery overview, `/activity` real historical evidence. `/guardian` keeps
the independent signing ceremony. Original technical workflows remain available
at `/lab` and `/lab/recovery`; unsigned advisory examples are at `/lab/safety`.

Polish work is on **feat/hackathon-polish**, preserving the pushed recovery
checkpoint. No main merge or security-configuration change to either accepted
Safe was made. Live USDC is implemented and automated-tested, **not yet human
verified**. See [morning readiness and exact human steps](docs/demo-readiness.md),
[USDC acceptance](docs/usdc-acceptance.md), [pitch and Q&A](docs/demo-script.md),
[business case](docs/business-case.md), [Swiss regulatory notes](docs/swiss-regulatory-notes.md)
and [security limits](docs/security-and-limitations.md).

Read-only readiness: `npm run demo:check`. Production: `npm run build`, then
`npm run start`. Development: `npm run dev`. Never run both on port 3000.

This prototype implements passkey creation/authentication, a passkey-controlled
Safe and sponsored ERC-4337 operations on **Ethereum Sepolia only (11155111)**.
Step 1 was accepted with a verified real sponsored NFT mint:
[0xe902724d042e41aa5577beaf1408da507199110ae2adf402ae2cd16b6f3edfef](https://sepolia.etherscan.io/tx/0xe902724d042e41aa5577beaf1408da507199110ae2adf402ae2cd16b6f3edfef).

The `feat/recovery` implementation adds 2-of-3 social recovery using the unchanged
Candide v0.2.0 module. See the [recovery design, setup, tests and threat model](docs/recovery-design.md).
All three guardian pairs completed real recovery and new-passkey transactions
on a disposable Sepolia Safe; see the [verified recovery evidence](docs/recovery-evidence.md).
The automated tests use virtual WebAuthn authenticators and simulated institutional
controls. A later human Windows Hello B+C recovery and sponsored transaction with
the recovered spending passkey passed on another disposable Safe; its verified
hashes and limitations are in the same evidence document. Physical loss of
OS-synchronized credentials and real institutional controls remain unverified.
Local fork hashes are not Sepolia evidence. The existing accepted Safe is blocked from recovery writes.
Earlier spike diagnostics below describe their original evidence and limitations.

## Basis and pinned stack

The implementation follows the [official Safe React passkey tutorial](https://docs.safe.global/advanced/passkeys/tutorials/react)
and its [completed example](https://github.com/5afe/safe-passkeys-tutorial), inspected at
commit `44cbe73918f13ee7b435d7ab447404a3fa5d6a18`. See [third-party notices](THIRD_PARTY_NOTICES.md).
Contract references: [Safe and passkeys](https://docs.safe.global/advanced/passkeys/passkeys-safe)
and [Safe and ERC-4337](https://docs.safe.global/advanced/erc-4337/4337-safe).

- Node **24.16.0**, npm **11.13.0** (tested; `.node-version` and `.nvmrc` included).
- Protocol Kit **4.1.0**, Relay Kit **3.1.0**: the tutorial's exact SDK pairing.
- Safe **1.4.1**, Safe4337Module **0.2.0**, EntryPoint **0.6**. Do not substitute EntryPoint 0.7/0.8 with this SDK pairing.
- Next.js **16.4.0**, React/React DOM **19.3.0**, viem **2.57.4**, TypeScript **5.9.3**.
- Exact dependencies and npm lockfile. Compatible overrides pin ethers 6.17.0, axios 1.20.0,
  and ws 8.22.0 to remove high/moderate audit findings.

Tutorial changes: current framework versions instead of Next 14.2.3; npm instead of pnpm
(available on this machine); basic HTML instead of MUI; no credential/signature logs;
required WebAuthn user verification; explicit errors; a funded ETH transfer option;
pending-operation persistence and independent onchain receipt verification.
Before deployment, the tutorial's shared owner differs from the SDK's standalone
passkey signer address. The app validates the shared owner and refreshes the SDK signer
after deployment to allow subsequent operations with the configured shared signer.

## Exact setup and run commands

Run from this repository in PowerShell. Final polish stays on `feat/hackathon-polish`;
`feat/recovery` remains the preserved acceptance checkpoint.

```powershell
node --version
npm --version
npm ci
```

If `.env.local` does not already exist, create it once:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Do not overwrite an already configured environment file. Fill in your Pimlico testnet key.
The example contains names with empty values only. Then:

```powershell
npm run check:provider
npm run dev
```

Open **http://localhost:3000** in current Chrome or Edge, directly as a top-level page.
Keep the same hostname and browser profile. `localhost` is a WebAuthn secure context;
plain HTTP on a LAN IP is not. Passkeys created for `localhost` cannot be used on another
hostname. Firefox is not recommended by the Safe tutorial.

For production, stop the dev server with Ctrl+C first:

```powershell
npm run build
npm run start
```

If port 3000 is occupied, stop the other server first. Development and production servers
share Next's output; run one at a time. Restart after changing a `NEXT_PUBLIC_*` value;
rebuild for production because values are embedded at build time.

## Environment variables and credentials

| Name | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Yes for initialization/send | Dedicated key with Sepolia bundler access and verifying-paymaster sponsorship enabled. |
| `NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID` | Yes before preparation/send | Active policy allowing deployment, passkey signature gas, and the desired call on Sepolia. Missing configuration blocks preparation before signing. |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | No | Browser-accessible Sepolia RPC override; defaults to publicnode. Chain ID is checked. |
| `NEXT_PUBLIC_VERIFICATION_GAS_BPS` | No | Verification allowance, integer from 11500 to 12000; default 12000 (1.20x). Restart/rebuild after changes. |

Create/approve your provider account/key at [Pimlico Dashboard](https://dashboard.pimlico.io/).
Provider access or paid sponsorship balance is not supplied by this repository. A key
alone does not guarantee sponsorship. Check Sepolia support, policy permissions, quotas,
and any sponsorship balance requirement. See [verifying paymaster](https://docs.pimlico.io/references/paymaster/verifying-paymaster/endpoints)
and [sponsorship policies](https://docs.pimlico.io/guides/how-to/sponsorship-policies).

Every `NEXT_PUBLIC_*` value is **public**, readable in browser bundles/network requests.
It is not a secret. Use a separate testnet key, Sepolia-only limits, restricted sponsorship
permissions, and small quotas: exposed keys can consume quota or sponsorship budget.
Do not use production credentials. A custom browser RPC URL exposes embedded credentials too.

Pimlico **v2** Sepolia endpoints are used for both bundler and paymaster. The tutorial's
v1 bundler returned HTTP 403 with the configured key while v2 accepted it; this is the
provider-compatibility adjustment. EntryPoint 0.6 and `add_balance_override` remain.
The override assists simulation; it does not fund the Safe or fake onchain balances.
There is no self-funded gas fallback: failed sponsorship is a failed spike step.

The tutorial's `PAYMASTER_ADDRESS` is an **estimation seed**, not a required final
sponsor. Relay Kit **3.1.0** requests `pm_sponsorUserOperation` with its v0.6 hex
UserOperation, EntryPoint address, and `{ sponsorshipPolicyId }`. Its `feeEstimator`
hook now validates the real response before the SDK applies it: byte-aligned
`paymasterAndData` with a nonzero 20-byte address and nonempty authorization data;
required positive gas quantities; matching request provider/policy, EntryPoint,
Safe sender, recipient, value, and exact NFT/transfer call data. Independent Sepolia
reads require deployed paymaster code and its `entryPoint()` to match v0.6.
The prepared operation must preserve the request nonce/init code/intent and the
validated response fields. Signing must preserve that prepared operation hash.
Each new pending record stores only the public returned paymaster address; receipt
verification matches that sponsor rather than the estimation seed. Historical
records remain intact; without a recorded expected sponsor, verification can establish
only the nonzero sponsor in the independently matching onchain event.
See [Pimlico's v0.6 sponsorship schema](https://docs.pimlico.io/references/paymaster/verifying-paymaster/endpoints).

## Historical spike instructions — advanced lab

The older diagnostic/retry instructions below describe the accepted spike. Their
technical controls now live at `/lab`. Do not repeat them on either preserved
acceptance wallet. For the one new human-approved USDC test, use
[USDC acceptance](docs/usdc-acceptance.md) and [morning readiness](docs/demo-readiness.md).
### Preparation-only sponsorship diagnostic

In the **same Chrome profile and localhost origin** that holds your saved public
passkey metadata, click **Diagnose NFT sponsorship (no signing or sending)** once.
Authentication/reconnect is not required for this diagnostic. It initializes the same
predicted Safe from public metadata and prepares the tutorial NFT call with the SDK's
dummy signature. It cannot request a real passkey signature, broadcast, or write to
wallet/attempt storage. The operation and raw sponsorship authorization are discarded;
only public gas quantities, preparation addresses/token ID, returned paymaster address,
response field types, validation results, and sanitized errors appear.
`valid: true` means a validated preparation, **not** bundler
acceptance or onchain success. The quote is not reused for a later send.
Pimlico can temporarily reserve sponsorship budget for a quote; its documented
sponsorship window is ten minutes. Run this once, not in a polling loop.
If contract/EntryPoint/provider/intent validation fails, stop and share this public
report; do not force a send or replace the wallet. A documentation example address
alone is not a canonical provider allowlist, so no replacement address is hardcoded.

### Task 01E: bounded verification gas and preparation gate

The live Task 01D trace established that Relay Kit 3.1.0's stock adjustment ran
exactly once: verification gas increased from **5,065,294** to **20,261,176**.
Call gas increased from **876,684** to **1,315,026** and pre-verification gas from
**78,170** to **82,078**. Sponsorship and serialization preserved those values.
The old signed request was lost; its exact rejected 43,985,430 budget cannot be
reconstructed. No successful onchain transaction has been verified.

The supported `feeEstimator.adjustEstimation` hook now replaces only the stock
4x verification adjustment with `ceil(raw * bps / 10000)`. The default is
**12000 basis points (1.20x)**. Optional `NEXT_PUBLIC_VERIFICATION_GAS_BPS` accepts
only integers **11500 to 12000**; invalid configuration blocks preparation. Keep the
default for the controlled retry. The SDK's +50% call-gas and +5% pre-verification
margins remain unchanged. No SDK files or dependencies are modified.

The upper candidate allowance is selected because actual-paymaster read-only
estimation measured verification gas around 5.03 to 5.04 million, close to the initial
5.07 million estimate. The pinned SDK's padded dummy exercises the existing Safe
passkey verifier path during estimation, but does not prove that a real assertion
will validate or establish its exact gas cost. A 20% margin is a bounded candidate,
not a guarantee. It leaves more verification room than 15% while appearing to fit
the observed provider limit. Live preparation must verify this before signing.

Every diagnostic or manual send obtains fresh SDK estimates and a **new** sponsorship
quote, validates the existing chain/EntryPoint/Safe/intent/paymaster contracts and
prepared-field binding, and re-estimates once with the actual returned authorization
and SDK dummy signature. All three estimates must fit the quote, and the quoted
verification limit must retain the configured margin against the second estimate.
The operation's gas fields are never changed after sponsorship or signing. There
is no second candidate, automatic retry, or automatic lowering of the allowance.

`gasTrace` reports normalized raw gas quantities, the single adjustment,
sponsorship request/response, final serialized gas, `actualPaymasterEstimate`,
`estimateWithinQuotedGas`, and `verificationMarginPreserved`. Public
`preparation` metadata identifies the Safe, target, value and token ID.
A saved mint attempt supplies its exact token ID; a malformed saved description
blocks diagnosis. No wallet metadata, pending operation, or history is written
by the diagnostic. Request payloads, passkey data and authorization bytes are
never displayed.

Before signing, `budgetCheck` models a single v0.6 operation using
[current Alto's AA95 floor](https://github.com/pimlicolabs/alto/blob/main/src/executor/utils.ts):
`callGasLimit + 2 * verificationGasLimit + 35000`, plus the full encoded
`handleOps` calldata charged conservatively at 16 gas per byte, then a rounded-up
**10% executor reserve**. This must fit the previously observed **16,000,000**
limit. [Current Alto configuration](https://github.com/pimlicolabs/alto/blob/main/src/cli/config/options.ts)
defaults to 5% executor padding; the hosted provider's release/configuration is
unverified, so this model is not a bundler acknowledgement. The final actual
signature's serialized size is checked again before the single broadcast.
No gas field is capped to the limit, and no signature verification is bypassed.

`valid: true` requires all preparation checks, sufficient quoted gas and the
budget test. It still does not prove a real signature or inclusion.
[Pimlico explicitly permits estimation with an invalid, well-formed dummy signature](https://docs.pimlico.io/references/bundler/endpoints/eth_estimateUserOperationGas).
An insufficient quote/margin, oversized budget, invalid response, repeated adjustment
or RPC failure stops before signing with a sanitized error. If the fresh preparation
cannot establish a plausible budget, stop this Safe integration within the current
constraints and recommend an EOA + SLIP-39 fallback for a separate task; do not
implement it or introduce another workaround here.

After the updated app starts, refresh **http://localhost:3000/lab** with Ctrl+R in the
existing Chrome profile and click **Diagnose NFT sponsorship (no signing or sending)**
exactly once. Copy the public report for review. Leave Authenticate, Sign and send,
Check pending and Preserve attempt untouched for this diagnostic. The quote is
discarded; any later authorized send runs the entire fresh gate again.

The user's fresh Chrome preparation-only report after this patch passed every
chain, EntryPoint, sender, intent, paymaster contract and binding check, with
HTTP 200, `valid: true`, one adjustment, and `verificationMarginPreserved: true`:

| Fresh stage | verificationGasLimit | callGasLimit | preVerificationGas |
| --- | ---: | ---: | ---: |
| Raw provider estimate | 5,065,294 | 876,684 | 78,170 |
| Bounded SDK adjustment | 6,078,353 | 1,315,026 | 82,078 |
| Sponsorship request | 6,078,353 | 1,315,026 | 82,078 |
| Sponsorship response | 6,078,353 | 1,315,026 | 82,078 |
| Final serialization | 6,078,353 | 1,315,026 | 82,078 |
| Actual-paymaster estimate with SDK dummy | 5,039,340 | 371,976 | 80,933 |

The returned public paymaster was `0x6666666666667849c56f2850848cE1C4da65c68b`.
The model counted 2,660 encoded bytes (42,560 gas upper bound), a 13,506,732 AA95
floor and 1,354,930 executor reserve: **14,904,222** modeled gas with **1,095,778**
remaining below the observed limit. All three fresh estimates fit the unchanged
quote. Provider executor padding and a real signature remain unverified. This is
browser-reported live preparation evidence, not bundler acceptance or a transaction.

For one controlled retry after reviewing the old explicit rejection, keep the same
Chrome profile and Safe. Check the old pending operation; if it shows acceptance or
inclusion, stop and resolve it instead. If the original explicit rejection still
has no acceptance evidence, preserve the old attempt using the existing manual
archive control, authenticate the original passkey, and confirm the same Safe
address and Sepolia. Select the tutorial NFT mint and click Sign and send **once**.
The complete fresh gate runs again before its transaction signing prompt; if it
fails, stop. Approve the existing passkey once if prompted. Wait for independent
confirmation, and report the public receipt/hash or sanitized failure panel. Never
force another send, change the allowance, or replace the wallet to bypass a failure.

`npm run check:provider` performs only reads. It checks both chain IDs, EntryPoint 0.6
support, deployed contracts, and retrieves the configured policy with Pimlico's account
API. It checks identity, active status, time window, and Sepolia allowance. A key with
Account APIs disabled returns HTTP 401 even if bundler access works. In that case,
confirm the policy's active status, association with the key, Sepolia allowance, and
quota/budget in Pimlico Dashboard. Enabling Account APIs on the public frontend key
is not required for a mint. A present ID alone does not prove usability.
Account lookup HTTP failures are reported as a warning separately from the passing
RPC checks, not as proof of sponsorship denial. Exit code zero with this warning means
RPC compatibility passed and the policy ID is present; it does not mean policy API
verification or sponsorship succeeded. The account request uses the documented
`GET /v2/account/sponsorship_policies/:id?apikey=...` authentication method, with URL-encoded
values, and never prints that credential-bearing URL. See [policy retrieval API](https://docs.pimlico.io/references/platform/api/sponsorship-policies/retrieve).
Quotas, funding, webhook rules, and actual call approval are checked
by the SDK sponsorship request when the user prepares an operation.

## Exact manual browser verification

1. Run the app and open **http://localhost:3000/lab** in Chrome/Edge. Confirm Ethereum Sepolia
   and **11155111**. Have Windows Hello, an ES256-capable security key, or a supported phone ready.
2. Click **Create passkey and initialize Safe** and approve the authenticator creation
   prompt. No wallet extension or externally owned private key is required.
3. Wait for the **Safe account** panel. Record its address, balance, and passkey contract
   owner. Open **View Safe on Sepolia Etherscan**. The predicted address can have no code
   yet; this is labeled explicitly. The SDK checks one passkey owner with threshold 1.
4. Prefer a transfer if you can fund it: send testnet ETH from your existing Sepolia
   wallet/faucet to the displayed Safe address, even before deployment. For example,
   0.001 Sepolia ETH covers a 0.00001 ETH transfer amount when gas is sponsored.
   Click **Refresh balance and deployment**, select **Transfer Sepolia ETH**, enter a
   distinct recipient you control, and check the amount. Gas sponsorship does not supply
   transferred ETH. The Safe and zero address are invalid recipients.
5. If unfunded, select **Mint official tutorial NFT**. This sends a real `safeMint(Safe, tokenId)`
   call to the existing tutorial contract and deploys the Safe if needed. It mints an NFT
   to the Safe; **zero ETH is transferred**. This is not an ETH-transfer demo.
6. Click **Sign and send sponsored ETH transfer** or **Sign and send sponsored NFT mint**,
   check your selected recipient/amount, and approve the passkey signature prompt.
   Safe SDK creates the transaction-bound signature. The separate connect prompt is a
   local UX check, not server authentication. Pimlico must approve estimation/sponsorship.
7. A **locally computed UserOperation hash** is retained for diagnostics and is not proof
   of acceptance. **Submission acknowledgement** appears only after the bundler returns
   a matching hash. Wait for **Confirmed onchain**.
   It requires an independent successful RPC transaction receipt, a matching successful
   EntryPoint `UserOperationEvent` with the operation's validated returned paymaster, deployed Safe code, and
   **two block confirmations**.
8. Copy the actual transaction hash, UserOperation hash, and confirmed explorer link.
   Open the link and verify Success on Sepolia Etherscan. Inspect the matching EntryPoint
   event and Safe deployment. For a transfer, check the internal ETH call to your distinct
   recipient and value; for a mint, check the NFT transfer event to the Safe.
9. Independently check the public transaction, operation, Safe, and sponsor values in another terminal:

   ```powershell
   npm run verify:onchain -- <transaction-hash> <useroperation-hash> <safe-address> <expected-paymaster-address>
   ```

   This uses public Sepolia RPC without a Pimlico key and exits nonzero if matching,
   successful sponsored evidence or confirmations cannot be verified. It verifies the
   UserOperation; inspect the asset call/event in Etherscan as above. The fourth public
   argument binds verification to the paymaster recorded for this operation. If omitted
   for a historical attempt, it verifies a nonzero sponsor from the matching event,
   without asserting a previously recorded provider address.
10. Reload, click **Authenticate and connect Safe**, approve the original passkey, and
    verify the same deployed address. Optionally send another small operation to test
    signing after deployment. This reconnects the same passkey; use the separate
    recovery page and guide for recovery, exclusively on a disposable Safe.
    Report your real-authenticator result and public transaction/UserOperation hashes for review.

**Confirmation timeout means unknown.** The public pending hash persists; sending is
blocked. Use **Check pending operation**, including after a reload. A transaction can
be included after a network error; never blindly resend.
**Preserve attempt and enable manual retry** archives the public attempt and diagnostics
without deleting the passkey or previous attempt. It sends nothing. Review Pimlico and
Sepolia first and accept the explicit duplicate-operation warning. A timeout or
`not_found` does not prove rejection; do not use this button as an automatic retry.

## Task 01B: one controlled browser retry

The original DevTools submission response was not available to this implementation
session. Its RPC error cannot be reconstructed from the old local hash. The verified
diagnostic defect was saving that hash before broadcast without preserving an explicit
acknowledgement or submission error; receipt-only polling subsequently hid the cause.
The missing policy ID is a configuration blocker, not a verified cause of the old failure.

1. Add `NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID` to the existing `.env.local` using an
   active Sepolia policy. Do not overwrite the key. Run `npm run check:provider` and
   resolve policy errors before retrying (or confirm the policy in Dashboard if only
   Account API access is disabled). Stop/restart the local app after changing public
   configuration; production requires `npm run build` again.
2. Open **http://localhost:3000/lab** in the same Chrome/Edge profile. Do not clear browser
   data or create a passkey. Click **Authenticate and connect Safe**, approve the original
   credential, and verify the existing address
   `0x6f7c9faba9B6039255f2301935D891ffE6065e8C`. Stop if it differs.
3. Click **Check pending operation** for the previous attempt. The check reads receipt,
   by-hash, and Pimlico status. If there is acceptance/inclusion evidence, do not send
   another operation; finish checking that attempt. If still unknown, consult Pimlico
   diagnostics and Sepolia before deciding whether to proceed. `not_found` alone is
   inconclusive: Pimlico retains status for only one hour.
4. If you decide to perform the authorized controlled retry after reviewing the previous
   attempt, click **Preserve attempt and enable manual retry** and read/confirm the
   duplicate-operation warning. The original public record remains under the pending
   storage key's `-history` suffix. This action sends nothing and does not replace identity.
5. Select **Mint official tutorial NFT**, open DevTools **Network**, enable **Preserve
   log**, then click **Sign and send sponsored NFT mint** exactly once. Approve one
   passkey signing prompt. No automatic send retry exists.
6. Watch **Prepared locally → Broadcasting → Accepted by bundler**. If accepted, let
   confirmation finish. **Included onchain** requires independent successful RPC receipt,
   matching successful sponsored EntryPoint event, deployed Safe code, and two confirmations.
7. On any rejection/unknown result, stop. Use **Check pending operation** only; it never
   broadcasts. Report the displayed stage, HTTP status, RPC/SDK code, sanitized message,
   acceptance evidence, and public UserOperation hash. Share only the diagnostic display,
   never DevTools request payloads/headers, passkey data, or credential-bearing URLs.
8. On verified inclusion, copy the actual transaction hash/explorer link and run
   `npm run verify:onchain -- <transaction-hash> <useroperation-hash> <safe-address> <expected-paymaster-address>`.
   Verify the NFT mint event to the Safe in Sepolia Etherscan. Stop after this single retry.

The SDK still creates, estimates/sponsors, and signs the operation. Relay Kit 3.1.0's
`executeTransaction` simply posts `eth_sendUserOperation` with its hex serializer. The
app now uses that same pinned SDK serializer with a single observable fetch so HTTP
status and JSON-RPC errors can be retained without ethers' raw request dump or HTTP
retries. No operation payload/signature is stored or logged. Submission acknowledgement
and original sanitized error remain separate from later read-only lookup errors.

## Errors and remaining risks

- Fixed guidance covers unsupported/insecure browsers, rejected passkeys, missing/invalid
  credentials, wrong chain, network/rate limits, invalid recipients/amounts, insufficient
  transfer balance, sponsorship/policy failure, bundler failure, reverts, and unknown confirmation.
  Sanitized diagnostics show stage, HTTP status when available, RPC/SDK codes, message,
  and acceptance evidence. Raw errors, credentials, and signed payloads are not logged.
- Provider support for the tutorial's EntryPoint 0.6 is required; a later SDK/EntryPoint
  migration is a separate decision, not a silent fallback.
- Browser storage holds only public credential ID/coordinates and public pending metadata;
  the authenticator retains the private key. Keep the profile/origin and do not clear/edit
  storage. Archived public attempts include sanitized errors; recovery has separate
  public metadata/history and must first be enrolled onchain.
- Two confirmations are not Ethereum finality. No production security review, multi-tab
  transaction coordination, provider abuse-control backend or hosting is included.
  The recovery implementation remains a separate testnet prototype.
- The tutorial uses an experimental shared passkey signer deployment flow; keep the pinned
  SDK/contract pairing and do not treat this spike as a production wallet.
- Audit after compatible overrides: **6 low, 0 moderate, 0 high, 0 critical**. Remaining
  findings follow Protocol Kit → ethereumjs-util → secp256k1/elliptic. The suggested SDK
  major migration is outside this tutorial-aligned spike.

## Checks and acceptance evidence

```powershell
npm run typecheck
npm test
npm run test:browser
npm run build
git status --short
git diff --check
```

Browser tests use installed Google Chrome. Set `channel: 'msedge'` in `playwright.config.ts`
if only Edge is installed. Tests cover startup, unsupported WebAuthn, rejected creation,
and virtual-authenticator public-metadata persistence with network failure. They do not
submit operations. Virtual authenticators **do not**
satisfy real-human passkey acceptance. Unit tests check network gating, transfer validation,
safe error output, and rejection of absent/reverted evidence.
Focused lifecycle unit tests use explicitly synthetic fixtures for acknowledgement,
pending, successful inclusion, failure, and timeout. These are test-only data and provide
no evidence of a real blockchain operation. They also verify one POST, preservation of
errors/identity, and that success requires the independent verification callback.
Sponsorship regressions exercise the pinned SDK operation class with a returned
paymaster differing from the seed, response/gas validation, deployed code/EntryPoint,
request context and exact intent, prepared-field binding, sponsor receipt matching,
and preparation-only error scrubbing. A browser diagnostic failure test checks that
it never prompts a passkey, broadcasts, or changes identity/history.

Optional read-only SDK integration check with a configured Pimlico key:

```powershell
npm run test:browser:live-read
```

This creates a virtual test credential and initializes a predicted Safe using real
Sepolia RPC reads. It never signs/sends a blockchain operation and does not satisfy
the real-authenticator or live-transaction acceptance criteria.

| Criterion | Required evidence |
| --- | --- |
| A: starts | Local HTTP/browser smoke check with documented commands |
| B: real passkey | User completed real browser creation, authentication and signing in Step 1 |
| C: Safe address | Accepted Safe is deployed and explorer-verifiable |
| D: real sponsored UserOperation | Step 1 transaction above has a successful sponsored EntryPoint event |
| E: actual hash/link | Confirmed UI and independent verifier; no fabricated value |
| F: builds | Successful `npm run build` |
| G: Git/secrets | Status/diff, ignored local env, and source scan |

Step 1 live success is recorded at the top of this README. Recovery evidence is
recorded in [the separate recovery report](docs/recovery-evidence.md); never invent credentials, funds, browser interaction or successful
receipts. Automated virtual authenticators do not satisfy real-human passkey acceptance.

## Git hygiene

Environment files except `.env.example`, dependencies, build output, `.dist`, and browser
reports are ignored. `.env.example` has variable names and empty values only. Commits
and pushes require explicit user authorization; do not change branches or merge. Review new files using your editor or
`git diff --no-index -- NUL <new-file>` on Windows; plain `git diff` shows tracked changes
only. See [project rules](AGENTS.md).

# Swissquote Continuity Wallet — Safe/passkey viability spike

This is the first, 60-minute technical spike for a solo 24-hour hackathon. It implements
passkey creation/authentication → a passkey-controlled Safe → a sponsored ERC-4337
operation on **Ethereum Sepolia only (11155111)**. Stop here: recovery and the complete
continuity-wallet product are not implemented.

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

Run from this repository in PowerShell. Keep branch `spike/safe-passkey`.

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

1. Run the app and open **http://localhost:3000** in Chrome/Edge. Confirm Ethereum Sepolia
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
   EntryPoint `UserOperationEvent` with the tutorial paymaster, deployed Safe code, and
   **two block confirmations**.
8. Copy the actual transaction hash, UserOperation hash, and confirmed explorer link.
   Open the link and verify Success on Sepolia Etherscan. Inspect the matching EntryPoint
   event and Safe deployment. For a transfer, check the internal ETH call to your distinct
   recipient and value; for a mint, check the NFT transfer event to the Safe.
9. Independently check the three public values in another terminal:

   ```powershell
   npm run verify:onchain -- <transaction-hash> <useroperation-hash> <safe-address>
   ```

   This uses public Sepolia RPC without a Pimlico key and exits nonzero if matching,
   successful sponsored evidence or confirmations cannot be verified. It verifies the
   UserOperation; inspect the asset call/event in Etherscan as above.
10. Reload, click **Authenticate and connect Safe**, approve the original passkey, and
    verify the same deployed address. Optionally send another small operation to test
    signing after deployment. This reconnects the same passkey; recovery is not implemented.
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
2. Open **http://localhost:3000** in the same Chrome/Edge profile. Do not clear browser
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
   `npm run verify:onchain -- <transaction-hash> <useroperation-hash> <safe-address>`.
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
  storage. Archived public attempts include sanitized errors; there is no recovery.
- Two confirmations are not Ethereum finality. No production security review, multi-tab
  transaction coordination, provider abuse-control backend, recovery, or hosting is included.
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
| B: real passkey | Manual step 2; pending until the user performs it |
| C: Safe address | Manual step 3, then deployed-code/explorer verification |
| D: real sponsored UserOperation | Manual steps 6–9; pending until performed |
| E: actual hash/link | Confirmed UI and independent verifier; no fabricated value |
| F: builds | Successful `npm run build` |
| G: Git/secrets | Status/diff, ignored local env, and source scan |

**No live transaction hash is recorded here.** Live success remains unverified until the
user signs and verifies it. Credentials, funds, browser interaction, and account approval
cannot be invented or simulated as success.

## Git hygiene

Environment files except `.env.example`, dependencies, build output, `.dist`, and browser
reports are ignored. `.env.example` has variable names and empty values only. Commits
and pushes require explicit user authorization; do not change branches or merge. Review new files using your editor or
`git diff --no-index -- NUL <new-file>` on Windows; plain `git diff` shows tracked changes
only. See [project rules](AGENTS.md).

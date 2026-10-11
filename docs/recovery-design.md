# Recovery implementation and test guide

Step 1 is accepted: the original Safe completed a sponsored Sepolia NFT mint in
[transaction 0xe902…edfef](https://sepolia.etherscan.io/tx/0xe902724d042e41aa5577beaf1408da507199110ae2adf402ae2cd16b6f3edfef).
Recovery testing uses disposable accounts only. The application blocks recovery
writes to `0x6f7c9faba9B6039255f2301935D891ffE6065e8C`.

All three recovery pairs have completed real Sepolia owner rotation and a new-passkey
transaction on a disposable Safe, including B+C without any old customer credential.
See [the public acceptance evidence and exact transaction hashes](recovery-evidence.md).
These tests use virtual authenticators; human-device acceptance and real institutional
controls remain outstanding. The accepted Safe has not had recovery installed.

## Contract compatibility and provenance

We use Candide SocialRecoveryModule **0.2.0**, unchanged from fix commit
`d0959d28ae084a7d549bb2c12d04482653456c2c`. The upstream audit index says Certora
reviewed those fixes; L-04 and three informational findings remain acknowledged.
This does not audit our application, compiler configuration or deployment.

- [Pinned module source](https://github.com/candidelabs/candide-contracts/blob/d0959d28ae084a7d549bb2c12d04482653456c2c/contracts/modules/social_recovery/SocialRecoveryModule.sol)
- [Upstream audit index](https://github.com/candidelabs/candide-contracts/blob/main/audit/audit.md)
- [Reviewed fixes](https://github.com/candidelabs/candide-contracts/pull/28)
- [Safe passkey contract design](https://docs.safe.global/advanced/passkeys/passkeys-safe)

Public Candide Sepolia deployments examined during compatibility assessment
reported **0.0.1** (`0x949d01d424bE050D09C16025dd007CB59b3A8c66`, 180 seconds;
`0x38275826E1933303E508433dD5f289315Da2541c`, three days). We do not use them.
The pinned AbstractionKit example also used the old version/domain and ABI.
Calling it unchanged would omit the explicit v0.2.0 nonce. No SDK migration is made.

Relay Kit 3.1.0 also leaves its passkey dummy-signature owner unset when initialized
with `options.safeAddress`. We resolve the current passkey through Protocol Kit,
verify it is the sole owner at threshold one, and pass that address through the
supported `customContracts.safeWebAuthnSharedSignerAddress` override. In the
existing-Safe path this value feeds the SDK estimation signature; it does not
change the Safe or install a shared signer. This also covers recovered standalone
proxies. Gas estimates must exercise the actual contract-owner verification path.

`artifact.json` records SHA-256 source hashes and unmodified compiled bytecode.
Compiler: solc 0.8.20, optimizer 1,000,000 runs, viaIR; dependencies OpenZeppelin
4.9.6 and Safe contracts 1.4.1. Recompilation must reproduce the recorded artifact;
a mismatch requires review. Runtime code, immutable delay, version, chain and
EIP-712 domain are verified before application recovery actions.

## Custody and guardian independence

| Identity | Signing authority lives in | Privilege |
| --- | --- | --- |
| Spending passkey | Browser/OS authenticator | Normal threshold-one Safe transactions |
| Customer backup guardian | A second authenticator credential; unique Safe WebAuthn proxy | One recovery approval |
| Demo institutional guardian | Server-only `RECOVERY_INSTITUTIONAL_PRIVATE_KEY` | One recovery approval after authenticated demo operator action |
| Third-party guardian | External wallet/device, outside the bank signer | One recovery approval |
| Relayer | Separate throwaway server account | Pays native testnet gas; no guardian/spending authority |

Backup and replacement private keys are never exported to the application. Only
public coordinates, credential ID, RP ID, proxy address and signed public binding
metadata are saved. The public registry enables a clean browser to discover the
backup credential; possession still requires its authenticator. RP is **localhost**
for this prototype. A production domain migration is a separate enrollment task.
Passkey sync depends on the provider; synced copies are one logical guardian and
can share a compromise/loss domain with the spending credential.

Institutional identity verification is explicitly mocked. A bearer-protected
localhost-only action and Safe allowlist constrain the real ECDSA approval.
The operator token is not a recovery guardian and cannot itself rotate owners.
It is needed to use this demo's funded signer-provisioning service; any independent
funded account can deploy the public signer proxy and call the recovery module.
The third party signs the exact canonical request from its own wallet, optionally
using `/guardian` and public JSON files. An enrollment possession proof is bound
to the complete configuration and has a distinct domain from a recovery approval.
One developer operating separate test processes is **simulated organizational
independence**, not a bank/third-party operational deployment.

## Enforced lifecycle

Installation is one simulated, owner-authorized atomic MultiSendCallOnly batch:
enable recovery module; add A; add B; add C. Upstream requires threshold one for
the first guardian internally, then two. These intermediate states cannot be
observed or used in another transaction; a reverted batch installs nothing.
The successful transaction must leave exactly three distinct non-owner guardians
and threshold two, with unchanged spending owner/threshold.

Each approval binds chain 11155111, module/version, Safe, replacement owner,
spending threshold one and current onchain nonce. The module verifies EOAs and
ERC-1271 passkey proxies. Duplicate or unregistered signers, altered requests and
stale nonces are rejected. A replacement must have factory-bound deployed code
and a valid possession proof, differ from owners/guardians, and not copy the old
shared signer's public key.

Two signatures initiate recovery without an original owner signature. The contract
stores earliest execution time; the relayer cannot finalize early. The current
spending owner can cancel during the delay. Guardian changes invalidate pending
approvals. Finalization replaces the old owner set, preserves Safe/assets, and
sets spending threshold one. The UI requires a successful receipt with two
confirmations, the matching module event and verified owner postconditions.
Fresh-browser confirmation reconstructs the intent from that onchain event.

Recovery initiation/finalization are native relayer transactions, **not sponsored
UserOperations**. Normal spending, enrollment/repair and post-recovery NFT tests
reuse the sponsored EntryPoint 0.6 path and its preparation/signing/receipt gates.
No gas fields change after sponsorship. Relayer records persist a public hash
before one broadcast; duplicates return the existing record. Unknown outcomes
are investigated, never automatically retried. Original wallet history is separate.

Recovery registration does not establish guardian availability. After device loss
the UI does not claim backup readiness; test remaining access or replace the
missing backup using a new owner-authorized atomic revoke/add batch. Two remaining
guardians can still recover; losing either before repair prevents recovery.

## Setup and commands

Node **24.16.0**, npm **11.13.0**. Keep Protocol Kit **4.1.0**, Relay Kit **3.1.0**,
Safe **1.4.1**, Safe4337Module **0.2.0**, EntryPoint **0.6**. Ethereum Sepolia only.

```powershell
npm ci
# Create .env.local only if absent; do not overwrite existing credentials.
npm run setup:recovery-demo
node scripts/create-recovery-relayer.mjs
```

The setup script creates a new demo bank key/operator token only if missing.
The relayer script refuses to overwrite an existing key and prints only its
public address. Fund that separate relayer with about **0.05 Sepolia ETH**.
Neither script deploys or transacts. Both require `.env.local` ignored/untracked.
Never print the file or paste keys/operator tokens into chat.

| Variable | Configuration |
| --- | --- |
| NEXT_PUBLIC_SEPOLIA_RPC_URL | Sepolia RPC; frontend credential exposure applies |
| NEXT_PUBLIC_PIMLICO_API_KEY | Testnet key; publicly exposed frontend configuration |
| NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID | Enabled Sepolia policy with quota, funding and allowed calls |
| NEXT_PUBLIC_VERIFICATION_GAS_BPS | Existing bounded verification allowance; default 12000 |
| NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS | Verified deployment of the pinned module |
| NEXT_PUBLIC_RECOVERY_DELAY_SECONDS | 180 for disposable tests; 259200 for a separately reviewed three-day policy |
| RECOVERY_RELAYER_PRIVATE_KEY | Separate funded throwaway server signer |
| RECOVERY_INSTITUTIONAL_PRIVATE_KEY | Separate server-only demo bank guardian |
| RECOVERY_DEMO_OPERATOR_TOKEN | Server-only random demo operator credential; enter locally when needed |
| RECOVERY_ALLOWED_SAFE_ADDRESSES | Comma-separated disposable Safe allowlist; correct checksums or lowercase addresses; excludes the accepted Safe |

Once funded and explicitly authorized to deploy:

```powershell
npm run deploy:recovery -- --test-only
# The verified deployment writes only its public module/delay to .env.local.
npm run build
npm start
```

Pimlico may require enabling sponsorship for the exact enrollment/repair module
calls and Safe batch. A successful NFT quote does not prove those calls are allowed.
The Account API can return 401 independently of working bundler/paymaster access.
Public testnet keys need provider limits; do not enable mainnet sponsorship.
No fund transfer from the accepted Safe is needed or permitted.

## Manual disposable-browser demo

1. In a separate Chrome profile create a new spending passkey on `/`. Record the
   different predicted Safe; stop if it is the accepted Safe. Complete one
   sponsored NFT mint and independently verify deployment and receipt.
2. Add only this disposable Safe to `RECOVERY_ALLOWED_SAFE_ADDRESSES`, then restart
   the server. Restart/build after changes to public configuration.
3. Open `/recovery`, find this Safe and enter the demo operator token locally.
   Use the existing `RECOVERY_DEMO_OPERATOR_TOKEN` value from ignored `.env.local`
   in **Demo operator credential**; this is separate from your Windows Hello PIN.
   Missing credentials are blocked locally before a POST. Incorrect credentials
   are rejected by server authentication before signing/deployment. The new Safe
   must also be allowlisted. Preserve the backup passkey after either error;
   do not run setup again or create a replacement credential to resolve it.
   Create a second backup passkey, deploy its proxy and verify its receipt.
4. Enter the independent guardian's wallet address. Download the enrollment
   request. The guardian uses `/guardian` on their own wallet browser to review,
   sign and return the public proof. Import it. Simulate/sign atomic protection
   once with the current spending passkey; verify three guardians/threshold two.
5. Preserve the completed sponsored enrollment attempt using the explicit control
   before another sponsored action. The separate history remains intact.
   If enrollment is confirmed but its later metadata registration fails, refresh
   the onchain state and use **Register public backup metadata**. This verifies
   and registers the existing signed public proof without signing or submitting
   the enrollment again. An invalid proof remains rejected.
6. From a clean replacement browser find the Safe, create a new spending passkey,
   deploy its proxy with a valid metadata proof and prepare the canonical preview.
7. Obtain two approvals for that same preview: A+B, A+C or B+C. For B+C use no
   old spending or backup passkey. The operator performs the explicitly simulated
   bank verification; C signs independently and supplies its public approval file.
8. Start recovery **once**, check receipt/event and onchain deadline. Attempting
   to finalize early must fail. Wait for real chain time; refresh state, finalize
   once, and check the successful receipt/event/new-owner postconditions.
9. Reload or use another clean browser, find the Safe and verify the finalization
   from its preserved public transaction. Sign one sponsored test NFT using the
   replacement passkey. Verify the successful EntryPoint event and NFT ownership.
10. Review lost backup access, replace its guardian atomically if needed, and
    explicitly verify access. Never declare all guardians available from registration.

Repeat each pair only on disposable Safes. Never reset the accepted wallet profile.
Automated virtual WebAuthn proves cryptographic paths, not human hardware/passkey sync.

## Automated checks

```powershell
npm run typecheck
npm test
npm run test:recovery:server
npm run test:recovery
npm run build
npm start
# In another terminal, against the production server:
npm run test:browser
npm run check:secrets
git diff --check
```

The fork test needs official Anvil 1.7.1 and Chrome. On Windows, install the pinned
platform binary into ignored tooling:

```powershell
npm install --prefix .dist/recovery-reference/tools --ignore-scripts --no-save @foundry-rs/anvil-win32-amd64@1.7.1
```

Other platforms: set `ANVIL_BINARY` to an official Anvil binary. The test creates
its own isolated Sepolia fork with zero predefined accounts, local-only balances,
and accelerated EVM time. Its hashes are **not real Sepolia evidence**. Neither
these tests nor browser smoke tests access the real user's profile or broadcast.

Only after funding, verified module deployment/build, review and explicit live-test
authorization, stop the local server and run:

```powershell
npm run test:recovery:sepolia -- --disposable-sepolia-only
```

This opt-in command **sends real Sepolia transactions**, creates one new disposable
Safe and tests all three pairs with actual signatures and the full real-chain delay.
It runs its own production server, uses isolated virtual WebAuthn authenticators,
and a third-party signing worker with no inherited bank/provider credentials.
Original customer browser credentials are destroyed before B+C recovery. It tests
new-passkey sponsored NFT execution after each rotation and backup repair after loss.
It records public evidence in ignored `.recovery-data/live-recovery-test.json` and
refuses to rerun if that file exists. Investigate a failure before any new test;
do not delete the record to force a retry. The resulting Safe is disposable: its
virtual credentials/worker are destroyed at test shutdown. Never fund it with real assets.
An optional explicit public run label preserves earlier records when a reviewed
new disposable test is authorized. Setting `RECOVERY_KEEP_TEST_BROWSER=1` keeps a
failed isolated test session available on localhost CDP port 9238 for diagnosis;
it performs no retries. Type `stop` in that test terminal to close it. This test-only
debug endpoint must never be used with a real customer profile or public hosting.

The live harness uses a separate replacement authenticator context for A+C.
[Chromium's virtual CTAP2 device defaults to three resident credentials](https://raw.githubusercontent.com/chromium/chromium/main/device/fido/virtual_ctap2_device.h);
creating a fourth on the initial device fails with `NotAllowedError`. The backup
device signs a public, module-verified approval file without exporting its key.
Both customer contexts are closed before B+C; its fresh context starts with empty
storage and has no original customer authenticator. A read-only old-signature
validity proof is collected before device loss, never used to authorize recovery.
After the rotation, that previously valid signature must be rejected onchain.

Do not attach/detach a second CDP client during an active virtual-authenticator
test. Chromium's [WebAuthn handler](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/devtools/protocol/webauthn_handler.cc)
can disable the frame's virtual environment on detachment. Retaining the browser
does not guarantee retained virtual credential availability after debugging.
These limitations belong to the test fixture, not a hardware passkey or the bank
guardian. Failed public records remain preserved; no failed operation is resent.
An acknowledged operation with a temporary confirmation error permits one
read-only UI receipt check, which still requires independent successful chain proof.
Approval file imports wait for each verified count before accepting another file.
The independent approval page clears its previous request and blocks signing
while a replacement file is being validated, preventing stale preview signing.

## Threat model and remaining issues

- Any two colluding/compromised guardians can take ownership after the delay.
  Monitoring and owner cancellation reduce risk only while owner access remains.
- A 180-second demo delay is too short for production. No real SMS/email alerts,
  secure bank identity verification, HSM, staffed review or incident response exist.
- Upstream L-04 allows future-round confirmations after finalization; signatures
  have no individual revocation/expiry. Nonces, exact payloads, owner cancellation
  and guardian configuration changes are relevant defenses, not a full remedy.
- Enabled Safe modules are privileged. Pinned-code checks constrain this module;
  frontend compromise/unsafe module enrollment remains a serious attack surface.
- Local files/token/rate limit and single-process nonce coordination are demo
  infrastructure. Production needs durable atomic state, key isolation, stronger
  authentication, rate/abuse controls and public-registry availability/privacy.
- Browser/XSS or OS compromise can alter displayed intent or request signatures.
  Safe WebAuthn verification does not establish banking identity or trustworthy UI.
- Public credential metadata links accounts/guardians. It is not a secret backup
  or privacy-preserving directory. Its signatures prevent silent metadata alteration.
- Two block confirmations are not Ethereum finality. RPC/provider availability,
  testnet sponsorship budget and externally managed guardian availability remain risks.
- Existing npm audit findings are six low-severity transitive findings. No broad
  SDK migration was performed. This hackathon wallet is not production-certified.

## License and attribution

The compiled module derives from Candide's GPL-3.0 Solidity source. Source URLs,
commit, dependencies and hashes accompany the artifact; compiler instructions
above reproduce it. Preserve upstream notices and review GPL obligations before
distributing a product. Safe SDK, OpenZeppelin and other dependencies retain their
respective licenses. We do not claim authorship of upstream cryptography/contracts.

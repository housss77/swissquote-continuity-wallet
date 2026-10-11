# Security and evidence boundaries

## What is real

Safe 1.4.1, WebAuthn passkey verification, pinned Safe SDKs, ERC-4337 EntryPoint v0.6, Pimlico-sponsored Sepolia NFT transactions and Candide v0.2.0 recovery are real. Human Windows Hello B+C recovery preserved the address and installed a new owner; the recovered passkey subsequently signed a confirmed sponsored NFT mint. Public hashes are in [recovery evidence](recovery-evidence.md) and the auditable [presentation manifest](../lib/demo-evidence.json). Automated virtual authenticator tests are not physical Windows Hello tests.

Gasless test USDC is implemented and automated-tested. Real funding, USDC-method sponsorship and human signing remain unverified. No new live transfer is asserted. Two confirmations establish receipt inclusion, not Ethereum economic finality.

## Threat model

| Threat | Current protection | Remaining limit |
| --- | --- | --- |
| Device loss | Any two distinct registered guardians approve the same owner/nonce/domain-bound intent; actual timelock | Availability and real-world identity need independent verification |
| One compromised guardian | 2-of-3 contract threshold | Two compromised/colluding guardians can take over |
| Stolen usable spending passkey | Required WebAuthn user verification | Threshold one allows unrestricted authorized spending; advisory UI can be bypassed |
| Malicious recovery payload | Canonical intent, chain/module/Safe/nonce binding, contract signature validation | XSS/UI compromise can trick users into authorizing displayed intent |
| Paymaster/bundler failure | Strict sponsorship fields/code/EntryPoint checks, gas allowance/budget checks, exact acknowledgement | Provider availability/quota and actual signature acceptance remain external |
| Duplicate transfer | One POST, persistent attempt slot, browser Web Lock, explicit manual archive | Coordination is browser-local; another device can act concurrently |
| False success | Independent receipt, exact UserOperation event, deployed code; USDC matching event scoped to operation | RPC trust, reorgs and issuer/admin contract risks remain |

Onchain guardian registration, a validated cryptographic approval and an independently reachable person/organization are **three different facts**. Neither registration nor a successful signature proves current organizational independence, human identity or future availability.

## Custody and operational limitations

- Spending threshold is one. Swissquote cannot sign ordinary spending alone. Two guardians together can rotate control; do not describe the model as exclusive customer control under every condition.
- Bank identity verification and its guardian service are simulated. The server-side operator token, origin checks, allowlist and rate limits remain enforced. No frontend token autofill or unauthenticated bank signing endpoint was added.
- The independent third-party signature is real; a production third-party organization's controls/availability are not implemented. Keep its key separate from the customer and demo bank.
- 180 seconds is test-only. Production alerts, staffed verification, HSM isolation, fraud monitoring, durable server coordination and escalation are absent.
- The backup passkey remains a guardian after recovery. Check its actual ERC-1271 access. Rotate it only if lost/compromised or its failure domain is unsuitable, using the existing atomic backup-guardian replacement workflow with current spending authorization. These accepted Safes are configuration-locked in this build; rotation requires a separately approved maintenance change. No guardian was rotated during polish.
- Owner removal does not erase OS-synchronized credentials or prove an old physical device inaccessible. The chain revokes the old spending authority on this Safe.
- Public credential metadata can link accounts and needs privacy/availability design. It is not a private-key backup. No raw passkey identifiers or coordinates are embedded in presentation evidence.
- Upstream recovery review includes **L-04**: future-round confirmations after finalization and no individual signature expiry/revocation. Do not market the demo as resolving that audit issue. Reassess module and operating design before production; no unaudited workaround was added. See [the existing design and review](recovery-design.md).
- Circle USDC includes issuer/admin powers; a customer-controlled Safe does not remove token issuer freezing/upgrade risk. Test USDC has no financial value.
- Provider credentials now stay server-side behind the same-origin sponsorship gateway. Legacy local configuration remains compatible; no provider key belongs in a new `NEXT_PUBLIC_*` variable. Use Sepolia-only policies, quotas and budgets. Configuration presence does not establish eligibility. Server keys/tokens remain ignored and absent from client bundles.
- Both accepted Safes' security configuration is blocked by this application's UI/server. This is a repository safety restriction, **not** a new onchain firewall. No owners, guardians, thresholds or modules were modified.

## Advisory review and future controls

The review decodes supported transfer/approval/NFT calls, flags unknown contracts, unlimited/large allowances and demo high-value transfers, and distinguishes contract simulation from sponsorship and inclusion. Sanctions are **Not checked**. No claim of a safe transaction or legal approval is made. Thresholds are configurable pure policy inputs; defaults (100 USDC transfer, 1,000 USDC allowance) are demo illustrations.

Future proposals only: audited capped low-risk allowance modules and stronger independent **customer** authorization for high-value actions. Swissquote must not become mandatory for spending. No guard/module or mandatory bank cosigner was deployed here.

## Dependencies

Mobile sign-in adds pinned SimpleWebAuthn verification of origin, RP, challenge,
user verification and assertions. It grants a server session, never a spending
signature. Account data needs one persistent server volume; serverless/multiple
replicas and production bank identity services are not implemented. Localhost
credentials cannot migrate to a new HTTPS domain. See [phone deployment](phone-deployment.md)
and [the sponsorship boundary](sponsorship-adapter.md). Physical iPhone signing
remains unverified until performed on that domain.

No SDK or architecture migration. Audit on 11 October 2026: six low-severity findings in the legacy elliptic/secp256k1 dependency chain (including propagated Protocol/Relay Kit findings); zero moderate, high or critical findings. SDK upgrade suggestions require separate compatibility/security work. Build retains an ox dynamic import warning and transitive Gelato deprecation warning. The unchanged GPL-3.0 recovery module/source/compiler obligations remain documented in third-party notices.

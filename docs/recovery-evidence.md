# Task 02: verified Sepolia recovery evidence

Two separate evidence sets are recorded here: the earlier automated three-pair
test and the later human-operated Windows Hello recovery. They use different
disposable Safes. The human B+C result and its independently checked postconditions
are documented below; neither test authorizes changes to the accepted Step 1 Safe.

The core create → sign → lose access → recover → sign lifecycle passed on a
**disposable Ethereum Sepolia Safe**, chain ID **11155111**, on 2026-10-11.
All three guardian pairs used real cryptographic approvals and real onchain
initiation/finalization. All twelve Task 02 acceptance conditions passed within
this automated test. No local-fork hash is presented here as Sepolia evidence.

**The automated run is not human-hardware acceptance or production readiness.** Chrome virtual
authenticators generated real WebAuthn ES256 assertions, validated by deployed
Safe passkey contracts and the recovery module. One developer operated isolated
test actors; organizational independence and institutional identity checking are
simulated. The test closes its isolated authenticators and third-party worker on
completion. These credentials cannot be used for a future human demo; never fund
this disposable Safe with valuable assets.

See the [design, setup, human demo and threat model](recovery-design.md).

## Human Windows Hello acceptance

**PASS for the observed human spending, B+C recovery and recovered spending
lifecycle on Ethereum Sepolia.** The user reports real Windows Hello approvals
for the spending, separate backup and replacement credentials, and a real
MetaMask independent guardian. Read-only RPC verification at block **11889069**,
`2026-10-11T03:38:35.658Z`, independently established the receipts, signatures,
contract configuration and NFT ownership below. This verification did not sign,
broadcast, replace credentials or rotate any guardian.

| Item | Verified public value |
| --- | --- |
| Same disposable Safe throughout | [0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06](https://sepolia.etherscan.io/address/0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06) |
| Old spending owner, now `isOwner = false` | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` |
| New spending owner, `isOwner = true` | `0x1195F0aCdBf59F45c2C0E6FF4Bc40BF58821fBE1` |
| Spending threshold | 1; exactly one current owner |
| Backup guardian A, still registered | `0xEb46B6f8BEeAE07A42fbB1a772c1Bc892ebB8fA3` |
| Swissquote mock guardian B | `0xbED556C6B6F68815B506EC7cF962C8C483602aC1` |
| Independently selected MetaMask guardian C | `0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86` |
| Recovery configuration | Exactly three distinct non-owner guardians; threshold 2 |
| Recovery module | `0xDC07dEa53aE572EeF2Af0c553b470E6BE388adBC`; exact reviewed v0.2.0 runtime and 180-second immutable verified |
| Existing ERC-4337 module and fallback handler | `0xa581c4A4DB7175302464fF3C06380BC3270b4037`; remains enabled |
| New passkey proxy | 236 bytes of deployed code; factory binding and existing possession signature verified |
| Final recovery state | Nonce 4; executable timestamp 0; no proposed owners or pending onchain request |
| Recovered spending sponsor | `0x6666666666667849c56f2850848cE1C4da65c68b` |

### Confirmed human-device transactions

All seven listed receipts succeeded on Sepolia with at least two confirmations.
The recovered transaction had **29 confirmations** and finalization had **38**
at the first acceptance read. These confirmation counts are evidence at that
time, not a claim of Ethereum finality.

| Action | Verified transaction | Block |
| --- | --- | ---: |
| Original Windows Hello spending; sponsored Safe deployment and NFT mint | [0x512f35b9d95d590aa0076a9331ba47313e7f6e1349113649f2f357b168fe6050](https://sepolia.etherscan.io/tx/0x512f35b9d95d590aa0076a9331ba47313e7f6e1349113649f2f357b168fe6050) | 11888510 |
| Separate backup passkey identity deployment | [0x76e3140a75eec485595686b4e8dda782c7d518d065a08caafdabcf4463253461](https://sepolia.etherscan.io/tx/0x76e3140a75eec485595686b4e8dda782c7d518d065a08caafdabcf4463253461) | 11888654 |
| Atomic sponsored 2-of-3 enrollment | [0x52b695e1c6efc91daecbe61054265bf4a049924d8711b5aa8b535ecd8009c6be](https://sepolia.etherscan.io/tx/0x52b695e1c6efc91daecbe61054265bf4a049924d8711b5aa8b535ecd8009c6be) | 11888940 |
| Replacement Windows Hello identity deployment | [0x5dcfbb4e7c5240da35f5b5495d6516d30a7b8b2ab6e8fe725ea92d0f6603ae1a](https://sepolia.etherscan.io/tx/0x5dcfbb4e7c5240da35f5b5495d6516d30a7b8b2ab6e8fe725ea92d0f6603ae1a) | 11888972 |
| B+C recovery initiation, two approvals | [0x0279e44352fe80bec8c3a3372e9d5acc40ce0d7cc133e554404a6d6d28876c21](https://sepolia.etherscan.io/tx/0x0279e44352fe80bec8c3a3372e9d5acc40ce0d7cc133e554404a6d6d28876c21) | 11889011 |
| Confirmed owner rotation after the delay | [0x46632998eeaccb86aa4ede0819933ef553973a2ef9ee3f1b706efafc4a97d6bc](https://sepolia.etherscan.io/tx/0x46632998eeaccb86aa4ede0819933ef553973a2ef9ee3f1b706efafc4a97d6bc) | 11889032 |
| Sponsored NFT mint with the recovered spending passkey | [0x2c48f3936c4c04f36a073476f2e194ddc71f1514456e38906ed35c3bbc08c579](https://sepolia.etherscan.io/tx/0x2c48f3936c4c04f36a073476f2e194ddc71f1514456e38906ed35c3bbc08c579) | 11889041 |

The initiation calldata contains exactly B and C signatures for the same
chain/module/Safe/new-owner/threshold/nonce-bound intent, nonce **3**. Both
signatures were revalidated read-only by `validateGuardianSignature`. No original
spending or backup approval is present in that request. Matching `RecoveryExecuted`
and `RecoveryFinalized` events identify the same intent. Earliest finalization was
`2026-10-11T03:29:48.000Z`; **252 seconds** of actual block time elapsed between
initiation and finalization, exceeding the immutable 180-second delay.

The recovered spend contains a matching successful EntryPoint v0.6
`UserOperationEvent`, sender equal to this Safe, and the nonzero deployed Pimlico
paymaster. Its UserOperation hash is
`0xc39cf6ef3804a6de4d92e797a5ab4aff1f45cd01176b8acd1b2789c354c6db5b`.
It minted tutorial NFT
`71765649581188723636853532248003429882839880648380288841215969319976963251148`
at `0xBb9ebb7b8Ee75CDBf64e5cE124731A89c2BC4A07`.
`ownerOf` returns the same Safe. The original NFT
`819036034709413038677735376528191856445765867659622664479471129425567523649`
also remains owned by that Safe. Both mints transferred **zero ETH**.

Read-only ordinary module-spending calls from the old owner and each registered
guardian reverted with **GS104**. Together with the owner-list and `isOwner`
checks, these establish current authorization removal; they do not delete or
make the old Windows Hello credential inaccessible on its device.

### Original wallet and evidence limits

The accepted Safe `0x6f7c9faba9B6039255f2301935D891ffE6065e8C` retains its original
owner, spending threshold one, ordinary Safe nonce zero, EntryPoint nonce one,
and only its original Safe4337Module. Recovery remains disabled with zero
guardians, threshold zero and no request. Its account-specific shared-passkey
configuration and fallback handler match the pre-enrollment read at block
**11888926**. No UserOperation for that Safe appeared between the preflight and
the final read. Recovery writes remain blocked by the application.

A full historical `eth_getProof` comparison was unavailable: the provider returned
JSON-RPC **-32602**, `distance to target block exceeds maximum proof window`.
The unchanged-state claim above is based on the explicit configuration, nonce,
passkey-storage and event reads, not an unavailable complete storage proof.

The authenticator's Windows Hello origin is reported by the human; blockchain
receipts establish cryptographic authorization but cannot attest a physical
device or prove OS-synchronized credentials are unavailable. This human onchain
recovery demonstrates **B+C**. A+B and A+C are covered by the separate automated
real-Sepolia run below, not claimed as human-device rounds. The saved backup
possession proof validates through ERC-1271, but this human B+C recovery did not
exercise a backup-passkey approval of a recovery intent.

### Backup guardian after recovery

Owner rotation does **not** revoke backup A. Its old passkey remains an authorized
recovery guardian. If it is trusted and still accessible, recovery alone does not
require replacing it; **Verify backup access** establishes fresh access without
broadcasting. If it was lost, possibly compromised, or shares the failed device,
replace it before relying on full recovery resilience. Prefer a separate physical
device or security key rather than another credential in the same Windows Hello
failure domain.

After explicit approval, the existing `/recovery` workflow is: verify the preserved
finalization receipt to select the current replacement spending passkey; preserve
the completed sponsored attempt using the explicit history control; create a new
distinct recovery passkey and deploy its identity; then **Sign replacement of
backup guardian**. That last button simulates, signs and broadcasts one atomic
revoke-old/add-new batch with threshold two throughout, leaving B/C and the spending
owner unchanged. Confirm the receipt, three guardians, old A removal and new
backup access before claiming readiness. Guardian changes invalidate earlier
recovery approvals. No part of this rotation was performed during acceptance.

Public acceptance records remain ignored in
`.recovery-data/human-windows-hello-acceptance-readonly.json`. No credential IDs,
public-key coordinate payloads, raw signatures, private keys or credential-bearing
URLs are included in this document.

### Final human-acceptance regression checks

Rechecked on 2026-10-11 with Node **24.16.0**, npm **11.13.0**. No live sending
harness was run. Browser checks used isolated test profiles against the production
server; the fork used only a local Anvil instance with its own test credentials.
The real user's browser profile and Windows Hello credentials were not accessed.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | 64 passed |
| `npm run test:recovery:server` | 4 passed |
| `npm run test:recovery` | 29 isolated-fork security checks passed |
| `npm run build` | Pass; existing viem/ox dynamic-dependency and Gelato deprecation warnings |
| `npm run test:browser` | 14 passed against the production build |
| `npm run check:secrets` | No findings; source/index and private server credentials in client bundles checked |
| `npm audit --json` | 6 low findings; 0 moderate, high or critical |
| `/recovery` startup | HTTP 200 after rebuilding and restarting |
| Git review | Documentation only; local env, public raw evidence and diagnostic tooling ignored/untracked |

Manual setup exposed missing/mismatched demo operator credentials, an invalid
checksum in the local Safe allowlist, wallet-provider/account/network ambiguity,
and missing successful enrollment-import feedback. The existing fixes provide
actionable errors, explicit wallet selection, normalized account comparison,
configuration-bound cryptographic proof checks, and **Independent guardian
verified** feedback. Focused regressions are included in the passing suites above.
The original wrong-third-party-account error did not preserve the wallet's
account/network response; its exact underlying cause is not inferred from the
successful retry.

## Automated three-pair configuration

| Item | Public value |
| --- | --- |
| Disposable Safe | [0xc6eFE07F9d421C0dae6d4E198767425612C8Ec22](https://sepolia.etherscan.io/address/0xc6eFE07F9d421C0dae6d4E198767425612C8Ec22) |
| Recovery module | [0xdc07dea53ae572eef2af0c553b470e6be388adbc](https://sepolia.etherscan.io/address/0xdc07dea53ae572eef2af0c553b470e6be388adbc) |
| Module version | Candide SocialRecoveryModule 0.2.0 |
| Module deployment | [0x37fb01a8c90587f69edae3eaa66258f655fba2d91fb28921d79fef81ca197842](https://sepolia.etherscan.io/tx/0x37fb01a8c90587f69edae3eaa66258f655fba2d91fb28921d79fef81ca197842) |
| Exact runtime hash | `0xe1fbc4718e2971cb0cfa8cc82d091b85b3616cdfc3da832345daab4b016506e8` |
| Immutable recovery delay | 180 seconds; disposable tests only |
| Relayer, separate from every owner/guardian | [0x9D016E6DbDB7A57877A4d95d2898adBE1D9A67bA](https://sepolia.etherscan.io/address/0x9D016E6DbDB7A57877A4d95d2898adBE1D9A67bA) |
| Original backup WebAuthn guardian A | [0x08B5BE7C3b76Fae3C90FfC33d4bC0df57326e8D5](https://sepolia.etherscan.io/address/0x08B5BE7C3b76Fae3C90FfC33d4bC0df57326e8D5) |
| Mock institutional guardian B | [0xbED556C6B6F68815B506EC7cF962C8C483602aC1](https://sepolia.etherscan.io/address/0xbED556C6B6F68815B506EC7cF962C8C483602aC1) |
| Independent signing-process guardian C | [0x9ff1AF9F2518c3B354Eb0Af212f6ecE63B1654Ae](https://sepolia.etherscan.io/address/0x9ff1AF9F2518c3B354Eb0Af212f6ecE63B1654Ae) |
| Re-enrolled backup guardian A after loss | [0x2931d9fe0F0dFb0a99588Eb0C6D9b9428F3f278e](https://sepolia.etherscan.io/address/0x2931d9fe0F0dFb0a99588Eb0C6D9b9428F3f278e) |
| Final spending owner | [0xEa9cDedA6edA86CdABa8D15C159f84CC4B808cC6](https://sepolia.etherscan.io/address/0xEa9cDedA6edA86CdABa8D15C159f84CC4B808cC6) |
| Spending threshold | 1 |
| Guardians / threshold | 3 distinct non-owner guardians / 2 |
| Final recovery nonce | 8 |
| Recovery module remains enabled | Yes |
| Pimlico paymaster for sponsored operations | [0x6666666666667849c56f2850848cE1C4da65c68b](https://sepolia.etherscan.io/address/0x6666666666667849c56f2850848cE1C4da65c68b) |
| EntryPoint | v0.6: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |

The unmodified upstream source is pinned at
`d0959d28ae084a7d549bb2c12d04482653456c2c`. Exact compiler/source/runtime
checks and custody boundaries are documented in the design. The existing Protocol
Kit 4.1.0 / Relay Kit 3.1.0 / Safe 1.4.1 stack was retained.

Relayer balance was independently read before deployment as **0.05 Sepolia ETH**.
After this run it was **0.04996170061519147 Sepolia ETH**, checked at
`2026-10-11T01:20:54.536Z`. Recovery initiation/finalization and proxy deployment pay native
gas from this relayer. Enrollment, repair and NFT spending are Pimlico-sponsored
UserOperations. Zero ETH is transferred by these NFT mints.

## Three successful guardian combinations

Each initiation event records two approvals. Its executable timestamp equals
the initiation block timestamp plus 180 seconds. Each corresponding finalization
event matches the Safe, nonce, recovery hash, new owner and threshold one.
The actual block-time interval was 192 seconds in each round. Early finalization
was rejected by contract simulation before waiting.

| Pair | Initiation transaction | Finalization transaction | New-passkey sponsored transaction | Recovery nonce | Approvals | Actual elapsed time |
| --- | --- | --- | --- | ---: | ---: | ---: |
| A+B | [0xc4db6b2cfaafd20cf6b9f39e9e432846de098e6440541254202eba9d99abc0a6](https://sepolia.etherscan.io/tx/0xc4db6b2cfaafd20cf6b9f39e9e432846de098e6440541254202eba9d99abc0a6) | [0xc3f6cabd88ed1a57edaa305a3bdd02e9f3c5fb533d3b7281cef8d7b905b0d987](https://sepolia.etherscan.io/tx/0xc3f6cabd88ed1a57edaa305a3bdd02e9f3c5fb533d3b7281cef8d7b905b0d987) | [0xcb101358cba051bd491f704152c8a2d0bb0cb26c5c614261431c766ee5a70a52](https://sepolia.etherscan.io/tx/0xcb101358cba051bd491f704152c8a2d0bb0cb26c5c614261431c766ee5a70a52) | 3 | 2 | 192 s |
| A+C | [0x487ac97d1d6c60ad8962b6ff2a459f1cc4aa5c858c777eabade90e8d7cc1fe0a](https://sepolia.etherscan.io/tx/0x487ac97d1d6c60ad8962b6ff2a459f1cc4aa5c858c777eabade90e8d7cc1fe0a) | [0x526e9c4e88e2dae212fcfce090a244f12342e53ec12a5764abb1899f428a037a](https://sepolia.etherscan.io/tx/0x526e9c4e88e2dae212fcfce090a244f12342e53ec12a5764abb1899f428a037a) | [0x6237d11e9fd41d94ffb1baedc7412558e9edae7f668939253603416c42f8a1ad](https://sepolia.etherscan.io/tx/0x6237d11e9fd41d94ffb1baedc7412558e9edae7f668939253603416c42f8a1ad) | 4 | 2 | 192 s |
| B+C | [0x389620583bc8105b774deb067f39905d29f839940410ff5fb4fe4da94a87ee46](https://sepolia.etherscan.io/tx/0x389620583bc8105b774deb067f39905d29f839940410ff5fb4fe4da94a87ee46) | [0x9c1647270baaae4f7607996ed617e1a9de9806958000ce04962e36e420bf9654](https://sepolia.etherscan.io/tx/0x9c1647270baaae4f7607996ed617e1a9de9806958000ce04962e36e420bf9654) | [0x8cb207e0ffeb9227479579fab464cd4f1e67899c8f1a3aef73cf217ab876dab0](https://sepolia.etherscan.io/tx/0x8cb207e0ffeb9227479579fab464cd4f1e67899c8f1a3aef73cf217ab876dab0) | 5 | 2 | 192 s |

A is an actual WebAuthn-backed ERC-1271 proxy, not an EOA labeled as a passkey.
A+B and A+C signatures were verified against the actual module recovery digest.
B and C each supplied a distinct real ECDSA signature on that same canonical intent.

Before B+C, both original customer authenticator contexts were closed: the
original spending/backup device and the A+C replacement device. The B+C browser
started with empty localStorage and a fresh authenticator. No original customer
private credential was exported, imported or available for its recovery.
Public registry/event data restored the Safe configuration.

For every round, a previously valid old-owner signature was rejected after
rotation; owner reads confirmed its removal. Each new passkey then authorized the
successful sponsored transaction linked above. All four minted NFTs still belong
to the same Safe. The unavailable backup was subsequently replaced in one
owner-authorized sponsored batch, preserving guardian threshold two; new backup
access was cryptographically verified.

## Independent receipt and state verification

A separate read-only client checked all 17 transaction receipts for success and
at least two confirmations. For each sponsored operation, it verified a matching
successful EntryPoint UserOperationEvent with the correct Safe, hash and paymaster.
It checked NFT ownership, paired module events, chain-time delays, current
owners/threshold/guardians and exact module runtime. It did not sign or broadcast.

After backup repair, read-only calls from each of the three current guardians
to ordinary Safe module spending reverted with **GS104**. None is an enabled
spending module or Safe owner. Negative calls sent no transactions.

The accepted Safe `0x6f7c9faba9B6039255f2301935D891ffE6065e8C`
was not modified. Before/after/final independent reads match:
owner `0x94a4F6affBd8975951142c3999aEAB7ecee555c2`, threshold one,
Safe transaction nonce zero, and only Safe4337Module
`0xa581c4A4DB7175302464fF3C06380BC3270b4037` enabled.
**Recovery is not installed on that accepted Safe.**

Public raw run/state records remain ignored in:
`.recovery-data/live-recovery-test-verified-guardian-preview.json`,
`.recovery-data/verified-guardian-preview-independent-evidence.json` and
`.recovery-data/verified-guardian-preview-guardian-negative-tests.json`.
No raw signatures, credential IDs, private keys or credential-bearing URLs are
included in this committed evidence.

## Task 02 acceptance conditions

| # | Condition | Evidence |
| ---: | --- | --- |
| 1 | Safe with authenticated spending passkey | Real sponsored initial NFT/deployment; virtual WebAuthn assertion |
| 2 | A/B/C onchain, threshold two | Atomic enrollment receipt and guardian/threshold reads |
| 3 | Complete loss of old spending and backup credentials | Both prior customer contexts destroyed before B+C; empty new browser |
| 4 | Institutional guardian signs real intent | Real B signature validated in B+C initiation; identity process mocked |
| 5 | Third party separately signs same intent | Isolated C worker; canonical digest and module signature validation |
| 6 | Module validates two approvals and initiates | Matching RecoveryExecuted events, approval count two |
| 7 | Real grace period elapses | Block timestamps; 180-second immutable; 192 seconds observed |
| 8 | Finalization installs a new passkey owner | Matching RecoveryFinalized event and one-owner/threshold-one reads |
| 9 | Wallet address unchanged | Same Safe throughout all three rounds |
| 10 | New passkey executes real transaction | Successful sponsored NFT after every round |
| 11 | Old spending signer loses authority | Owner removal and rejection of previously valid signature |
| 12 | Inspectable evidence and demo script | Public hashes below, state reads above, checks below and linked design |

## All successful live transactions

| Action | Transaction hash | Sepolia block |
| --- | --- | ---: |
| initial sponsored NFT deployment | [0xfc283ddc7ed63b545f64ad6768a4673c924501f2f25ab7c79ba16520dff3b193](https://sepolia.etherscan.io/tx/0xfc283ddc7ed63b545f64ad6768a4673c924501f2f25ab7c79ba16520dff3b193) | 11888302 |
| backup guardian proxy deployment | [0x18d7f70d12c9bd21145dac717e86c2393530f4abce0c5afd15cadf9aef77051a](https://sepolia.etherscan.io/tx/0x18d7f70d12c9bd21145dac717e86c2393530f4abce0c5afd15cadf9aef77051a) | 11888305 |
| atomic sponsored guardian enrollment | [0x7cb6c9fb97d4c0e4021eda10ac278f075ac7cfeb5b27ec9b0329750f60a79ae8](https://sepolia.etherscan.io/tx/0x7cb6c9fb97d4c0e4021eda10ac278f075ac7cfeb5b27ec9b0329750f60a79ae8) | 11888307 |
| A+B replacement proxy deployment | [0xfd6cbf3af768c1612e681d0fd1f92482b562e8aa5b009b033105c2f7e389488a](https://sepolia.etherscan.io/tx/0xfd6cbf3af768c1612e681d0fd1f92482b562e8aa5b009b033105c2f7e389488a) | 11888309 |
| A+B recovery initiation | [0xc4db6b2cfaafd20cf6b9f39e9e432846de098e6440541254202eba9d99abc0a6](https://sepolia.etherscan.io/tx/0xc4db6b2cfaafd20cf6b9f39e9e432846de098e6440541254202eba9d99abc0a6) | 11888311 |
| A+B recovery finalization | [0xc3f6cabd88ed1a57edaa305a3bdd02e9f3c5fb533d3b7281cef8d7b905b0d987](https://sepolia.etherscan.io/tx/0xc3f6cabd88ed1a57edaa305a3bdd02e9f3c5fb533d3b7281cef8d7b905b0d987) | 11888327 |
| A+B post-recovery sponsored NFT | [0xcb101358cba051bd491f704152c8a2d0bb0cb26c5c614261431c766ee5a70a52](https://sepolia.etherscan.io/tx/0xcb101358cba051bd491f704152c8a2d0bb0cb26c5c614261431c766ee5a70a52) | 11888330 |
| A+C replacement proxy deployment | [0x31dfccccdd6f91871321b2af263e8508dd7321fb4b703ef41b5a5d4e8b1e7df1](https://sepolia.etherscan.io/tx/0x31dfccccdd6f91871321b2af263e8508dd7321fb4b703ef41b5a5d4e8b1e7df1) | 11888332 |
| A+C recovery initiation | [0x487ac97d1d6c60ad8962b6ff2a459f1cc4aa5c858c777eabade90e8d7cc1fe0a](https://sepolia.etherscan.io/tx/0x487ac97d1d6c60ad8962b6ff2a459f1cc4aa5c858c777eabade90e8d7cc1fe0a) | 11888334 |
| A+C recovery finalization | [0x526e9c4e88e2dae212fcfce090a244f12342e53ec12a5764abb1899f428a037a](https://sepolia.etherscan.io/tx/0x526e9c4e88e2dae212fcfce090a244f12342e53ec12a5764abb1899f428a037a) | 11888350 |
| A+C post-recovery sponsored NFT | [0x6237d11e9fd41d94ffb1baedc7412558e9edae7f668939253603416c42f8a1ad](https://sepolia.etherscan.io/tx/0x6237d11e9fd41d94ffb1baedc7412558e9edae7f668939253603416c42f8a1ad) | 11888353 |
| B+C replacement proxy deployment | [0xc88136bb2d1c655006771424f8d3e2c0768a16587b965257dd75287994a16f3f](https://sepolia.etherscan.io/tx/0xc88136bb2d1c655006771424f8d3e2c0768a16587b965257dd75287994a16f3f) | 11888355 |
| B+C recovery initiation | [0x389620583bc8105b774deb067f39905d29f839940410ff5fb4fe4da94a87ee46](https://sepolia.etherscan.io/tx/0x389620583bc8105b774deb067f39905d29f839940410ff5fb4fe4da94a87ee46) | 11888357 |
| B+C recovery finalization | [0x9c1647270baaae4f7607996ed617e1a9de9806958000ce04962e36e420bf9654](https://sepolia.etherscan.io/tx/0x9c1647270baaae4f7607996ed617e1a9de9806958000ce04962e36e420bf9654) | 11888373 |
| B+C post-recovery sponsored NFT | [0x8cb207e0ffeb9227479579fab464cd4f1e67899c8f1a3aef73cf217ab876dab0](https://sepolia.etherscan.io/tx/0x8cb207e0ffeb9227479579fab464cd4f1e67899c8f1a3aef73cf217ab876dab0) | 11888376 |
| replacement backup proxy deployment | [0xd6b51e5b794bdae3f25f092762d2a1a424bce9132dc8f3ec9a255a95a384f231](https://sepolia.etherscan.io/tx/0xd6b51e5b794bdae3f25f092762d2a1a424bce9132dc8f3ec9a255a95a384f231) | 11888378 |
| atomic sponsored backup guardian repair | [0xba8a337ce2f8f2875bbf03cf64852ec01d567a163e5e54b82b12c5d20be3fe8f](https://sepolia.etherscan.io/tx/0xba8a337ce2f8f2875bbf03cf64852ec01d567a163e5e54b82b12c5d20be3fe8f) | 11888380 |

These are actual transaction hashes, not locally computed UserOperation hashes.
The separate UserOperation hashes are:

| Sponsored action | UserOperation hash |
| --- | --- |
| initial sponsored NFT deployment | `0xe7a04d9ee22a431593327d3a71fd23141a2617de7bc41426af0139d5ee688ee1` |
| atomic sponsored guardian enrollment | `0xbd5f0342b95f41b45e407b3a144cad1f70d0ee2464f3290699878a029d319fff` |
| A+B post-recovery sponsored NFT | `0x0f96431d60125a309728f3b2c2191e9e141d0d5ab1a927ac1c70bdf101c46094` |
| A+C post-recovery sponsored NFT | `0xa476ffb6c9d7566d57e86ce47758c57982720425e5742d6b4be3b3d537ddcfca` |
| B+C post-recovery sponsored NFT | `0x4b2857774129635df5c8eadf393f3c8853b680c04dffb5948ab7bec8abc8c578` |
| atomic sponsored backup guardian repair | `0xc9780164e3697d44a8a0984d7baadaa446994a404f9dfc8123865615d4b4875d` |

## Earlier automated run checks

Tested with Node **24.16.0** and npm **11.13.0**.

| Check | Result |
| --- | --- |
| TypeScript | Pass: `npm run typecheck` |
| Unit tests | 56 passed: `npm test` |
| Server security tests | 3 passed: `npm run test:recovery:server` |
| Browser tests against production build | 11 passed: `npm run test:browser` |
| Local Sepolia fork | 29 checks passed: `npm run test:recovery` |
| Production build | Pass: `npm run build` |
| Live disposable Sepolia | All three pairs, post-recovery spending and backup repair passed |
| Secret review | Source/index/client bundle scan clean; local env ignored/untracked |
| Dependency audit | 6 low; 0 moderate, high or critical |

The fork exercises single/duplicate/unregistered guardians, incorrect
Safe/owner/domain, invalid signatures, stale nonce, early finalization, actual
owner cancellation, actual WebAuthn ERC-1271 validation and old-owner revocation.
It accelerates EVM time only on the isolated fork. Cancellation and the full
negative matrix were not broadcast on Sepolia.

Production emits existing transitive viem/ox dynamic-dependency and deprecated
Gelato SDK warnings; they do not fail the build. No speculative dependency
migration was performed.

## Corrections and earlier failed test runs

Earlier disposable public records remain preserved. Fixes addressed the pinned
viem domain API, Relay Kit's unset estimation signature owner for an existing Safe,
a refresh overwriting the newly prepared replacement, stale guardian previews,
and public-metadata registration after a confirmed enrollment. The harness now
waits for verified file imports, uses separate virtual replacement devices, and
retains sanitized failure/acknowledgement evidence. No operation is automatically
resent.

Some early transient confirmation/RPC and approval-import failures did not retain
the original diagnostic. Their exact provider errors cannot be recovered and are
not invented here. Chromium's three-resident-credential fixture limit and CDP
detachment behavior are documented separately in the design. This was a fresh,
complete run of the final production build, with no resubmission or resumed round.

## Remaining security limits and next demonstration

Any two compromised/colluding guardians can replace the owner after the delay.
A three-minute delay is test-only. There are no operational alerts, real bank
identity verification, HSM custody, staffed review or production incident response.
Upstream L-04 (future-round confirmations) and three informational findings remain.
Approvals have no individual expiry/revocation, and synchronized passkeys may
share a failure domain. Public metadata, frontend integrity, registry availability,
single-process relay coordination and exposed testnet provider quotas remain risks.
Two confirmations are not Ethereum finality. Six low dependency findings remain.

The human Windows Hello B+C recovery and subsequent sponsored transaction now
passed on the separate disposable Safe documented above. Physical loss of all
customer authenticators, independent backup-device availability and human A+B/A+C
recovery rounds remain outside that evidence. Existing automated actors are
destroyed and cannot be reused. Installation on the accepted Safe needs a
separately approved concrete proposal with a production-appropriate delay and
proven real guardians. This acceptance does not authorize that installation.

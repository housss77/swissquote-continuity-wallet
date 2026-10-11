# Continuity presenter script

Open `http://localhost:3000/demo`. Six scenes, approximately 3 minutes 45 seconds.
Use the **Continuity Replacement** Chrome context for a real spending signature.
The presentation itself needs no passkey, operator credential or bank access.

## Thirty-second pitch

Continuity is a self-custody companion to Swissquote's existing crypto offering.
Customers approve spending with a passkey. If spending access is lost, two of
three guardians can install new access after an onchain delay, keeping the same
wallet and assets. We have demonstrated that lifecycle on Sepolia, including a
sponsored transaction after real human-operated recovery. Bank identity checks
are simulated; the underlying signatures and transactions are real.

## Main pitch: 3–4 minutes

| Scene | Time | Narration and action |
| --- | --- | --- |
| The problem | 20 sec | “Self-custody should not mean permanent loss. We bring customer control and a way back into one coherent banking-style experience.” Show the public wallet. |
| Customer control | 35 sec | “This is a genuine Safe account. A customer passkey approves spending, with threshold one. Swissquote is not a required daily spending signer.” Explain the separate collective recovery power. |
| Gasless spending | 55 sec | “The customer sends official test USDC. Pimlico pays network fees; the Safe does not need ETH.” If funded and ready, open Send, review one transfer and approve with Windows Hello. Until confirmed, say submitted or unresolved. If unavailable, show the historical NFT receipt and explicitly distinguish it from USDC. |
| A way back | 65 sec | “This recovery was verified earlier on Sepolia.” Show enrollment, B+C initiation, the actual 252-second wait, finalization and new-owner spending. The address stayed the same. Opening these scenes does not start another recovery. |
| Safety and Swissquote | 35 sec | “Our review decodes the action and warns about approvals or unfamiliar destinations. It is advisory, and sanctions are not checked. Swissquote could retain self-custody customers through optional recovery, security and brokerage services.” |
| Your control | 15 sec | “Your crypto. Your control. Recovery when it matters.” Disclose simulated institutional operation and the test-only delay. |

## Technical version: six minutes

1. **0:00–0:45 — Custody:** customer spending threshold one, authenticator-retained
   P-256 secret, public metadata only in the app; two guardians can collectively
   change control. No unconditional claim about legal custody classification.
2. **0:45–1:45 — Spending:** Safe 1.4.1, pinned Protocol Kit 4.1.0 and Relay Kit
   3.1.0, EntryPoint v0.6. Explain estimation, validated sponsorship, WebAuthn
   signing, one broadcast and independent receipt/event checks as separate stages.
3. **1:45–2:30 — Gasless USDC:** six-decimal integer accounting, exact transfer
   calldata and token evidence. A simulation or HTTP 200 is not chain success.
4. **2:30–4:00 — Recovery:** reviewed Candide v0.2.0, three distinct guardians,
   canonical Safe/chain/module/new-owner/threshold/nonce-bound approvals. B+C
   worked without an original customer approval. The real test wait was 252
   seconds. Show explorer receipts; do not shorten the contract delay.
5. **4:00–5:00 — Security:** revoked owner versus credential deletion, guardian
   collusion, shared device failure domain, absent alerts and production controls.
   UI warnings are bypassable by a usable spending passkey.
6. **5:00–6:00 — Bank fit:** optional ecosystem services, hypothetical economics,
   AML identity versus cryptographic control, production audit and legal review.

## Emergency fallback

- **Passkey unavailable:** do not create another key or retry repeatedly. Continue
  through historical evidence. No new transfer is claimed.
- **RPC unavailable:** say “Live refresh unavailable; this is previously verified
  evidence.” Stored receipt links and facts remain visible.
- **Paymaster denies:** no unsponsored fallback and no ETH purchase. Show the
  preserved error and historical sponsored NFT receipt.
- **Accepted but unconfirmed:** keep the operation pending, do not resend, and
  return after the pitch to check its exact hash.
- **Unexpected ownership/configuration:** stop live signing and use documented
  historical evidence with an explicit current-state warning.

Never call a historical action “just submitted,” claim a live USDC transfer
without its matching receipt/logs, or equate a new browser profile with actual
loss of synced passkeys.
# Jury questions: precise answers

**Why is this self-custody?** Daily spending needs the customer passkey, not a Swissquote spending key. Explain the qualification: any two recovery guardians can replace that owner after the delay. This is customer spending control with collective social recovery, not unconditional exclusive control forever.

**Can Swissquote freeze or steal funds?** The bank guardian alone cannot spend or recover, and there is no bank spending guard. Two guardians colluding can take over after the delay. Separately, USDC issuer powers can affect transfers. The local demo UI's safety locks are not onchain permissions.

**What if two guardians collude?** They can replace the owner. Real independent operations, a much longer delay, alerts and customer cancellation are required production defenses; several are absent here. Say the limitation plainly.

**What if my phone is stolen?** WebAuthn requires user verification. If the attacker also has usable spending access, the threshold-one Safe can spend without our advisory UI. Recovery does not freeze those spends. Stronger independent customer authorization is a future proposal.

**Why not MPC?** Safe/passkeys and an established recovery module allowed a verifiable solo implementation without new share servers or custom cryptography. MPC is a different trust/availability model, not something we implemented or universally rejected.

**What if every customer device is lost?** The verified B+C path used the bank mock and independent third party to install a new customer passkey after the actual delay. Neither original customer credential was required. Human identity verification and organizational independence still need production implementation.

**How do you prove actual ownership?** Onchain signatures prove control and approvals for specific intents. They do not prove beneficial ownership. A bank-session-bound Safe ERC-1271 challenge plus separately verified legal identity is proposed, not implemented.

**What is genuine and what is mocked?** Real: contracts, signatures, timelock, owner rotation, same address, sponsored NFT receipts. Automated: virtual authenticators/fork tests and USDC transfer validation. Simulated: institutional identity checks and organizational services. No real USDC receipt yet. The presentation labels completed proof as historical.

**Who funds gas and how does Swissquote profit?** Pimlico sponsors this testnet flow. A future bank subsidy could be an acquisition/retention cost; optional premium services and brokerage could contribute revenue. Our economics are explicitly hypothetical and exclude significant costs.

**Is it compliant with Swiss law?** No certification or legal approval is claimed. We distinguish spending and recovery power, control proof and beneficial ownership, and propose review against FINMA's AML/custody guidance. Sanctions screening and bank infrastructure are absent.
